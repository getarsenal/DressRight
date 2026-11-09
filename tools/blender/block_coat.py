"""
Block coat: a clean, tailored-block AGSU/ASU coat built from a front-view drawing.

No cloth simulation. The coat is a set of analytic surfaces:
- the torso is a stack of rounded-box cross-sections. The width at each height
  comes from the reference drawing; depth comes from the mannequin plus ease.
  Every section keeps a little clearance over the body.
- the sleeves are straight, slightly tapered tubes around the mannequin's arms,
  with a rounded sleeve head at the shoulder point.
- the collar band, shirt collar, lapels, tie, pockets, flaps, belt, keeper,
  buckle, buttons and shoulder loops are cut from outlines measured on the
  drawing, then laid onto those surfaces and given thickness.

Reference: a front view at 44.6 px/in. The center line is at x = 603 px and
the collar top at y = 610 px. Drawing coordinates are (x_in, y_in): inches
right of center and inches down from the collar top.

Blender frame: inches, Z up, front = -Y, +X = wearer's left (viewer's right
in a front view). `SH` is the mannequin's shoulder line.

Run:  python tools/blender/block_coat.py --out tools/blender/out [--uniform ASU] [--export public/models/coat-agsu-male.glb]
"""
import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import body as body_mod  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--uniform", default="AGSU", choices=["AGSU", "ASU"])
ap.add_argument("--out", default=os.path.join(HERE, "out"))
ap.add_argument("--stage", default="block")
ap.add_argument("--samples", type=int, default=24)
ap.add_argument("--res", type=int, default=700)
ap.add_argument("--export", default="")
ap.add_argument("--body", default=os.path.join(HERE, "assets", "human_base_meshes_bundle.blend"))
ap.add_argument("--ref", default="", help="reference drawing, for a side-by-side comparison render")
args = ap.parse_args(sys.argv[1:])
AGSU = args.uniform == "AGSU"

SH = 14.5  # mannequin shoulder line (inches)
ZTOP = SH + 3.36  # collar top at the back
PXIN, CX, CY, IMG_W, IMG_H = 44.6, 603, 610, 1206, 2622  # reference drawing frame


def dz_of(y_in):
    return ZTOP - y_in - SH


def Z(dz):
    return SH + dz


# ------------------------------------------------------------------ drawing measurements

# torso half-width (front view) by height (dz from the shoulder line)
HW_KEYS = [(1.90, 3.25), (1.36, 4.70), (0.46, 6.30), (-0.44, 8.00), (-0.90, 8.40), (-1.57, 8.23), (-4.0, 7.95),
           (-7.64, 7.45), (-12.1, 7.08), (-14.1, 6.90), (-16.6, 7.17), (-18.8, 7.42), (-25.6, 7.49), (-29.8, 7.50)]
# sleeve outer edge (front view)
SLEEVE_OUT = [(-0.9, 8.68), (-5.38, 9.66), (-12.14, 11.19), (-16.64, 11.5), (-25.14, 12.13)]
HEM_DZ = dz_of(32.85)
CUFF_DZ = -23.5  # just past the mannequin's wrist (the drawing's arms run longer)
NECK_DZ = 1.9

# outlines, (x_in, y_in), wearer's left (+x); mirrored for the right
LAPEL = [(2.74, 0.55), (4.42, 4.26), (3.07, 4.44), (5.20, 4.60), (4.44, 5.83), (3.86, 6.50), (3.23, 7.17), (2.56, 7.85),
         (1.88, 8.52), (1.17, 9.19), (0.43, 9.87), (-0.07, 10.2), (0.0, 9.64), (0.25, 8.74), (0.70, 7.40), (1.10, 6.05),
         (1.52, 4.70), (1.93, 3.36), (2.35, 2.00)]
V_EDGE = [(2.74, 0.6), (2.35, 2.0), (1.93, 3.36), (1.52, 4.7), (1.1, 6.05), (0.7, 7.4), (0.25, 8.74), (0.0, 9.64)]
SHIRT_LEAF = [(2.74, 0.55), (0.16, 2.80), (0.62, 4.75), (1.28, 5.95), (1.60, 4.50), (2.05, 3.0), (2.45, 1.8)]
TIE = [(-0.55, 2.55), (0.55, 2.55), (0.38, 4.75), (0.95, 6.7), (0.0, 9.7), (-0.95, 6.7), (-0.38, 4.75)]
POCKET = dict(cx=4.4, w=5.0, top=9.1, bottom=16.0, flap=2.05, point=0.43, pleat=1.6, button_y=10.05)
LOWER_FLAP = [(6.88, 19.2), (3.66, 19.9), (4.08, 23.5), (7.33, 22.8)]
LOWER_BUTTON = (6.66, 21.95)
BUTTONS_Y = [11.37, 14.33, 17.33] + ([] if AGSU else [20.3])
BUTTON_X = 0.47
BELT = dict(top_c=18.4, top_s=17.7, bot_c=20.0, bot_s=19.2, side_x=6.76)
BUCKLE = dict(w=1.12, h=1.75, bar=0.2, y=19.25)
KEEPER = [(2.2, 18.3), (2.8, 18.3), (2.8, 20.0), (2.2, 20.0)]
FRONT_EDGE = [(-0.32, 10.2), (-0.08, 10.2), (-0.08, 32.6), (-0.32, 32.6)]
LOOP = dict(x0=3.9, x1=8.35, w=0.8, button_x=4.5)

COLORS = {
    "AGSU": dict(coat=(75, 70, 53), shirt=(181, 161, 140), tie=(76, 71, 53)),
    "ASU": dict(coat=(29, 39, 71), shirt=(243, 243, 241), tie=(18, 18, 18)),
}[args.uniform]


def lerp_keys(keys, x):
    """Piecewise-linear lookup; keys sorted by the first element (either order)."""
    ks = sorted(keys)
    if x <= ks[0][0]:
        return ks[0][1]
    for (x0, y0), (x1, y1) in zip(ks, ks[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return ks[-1][1]


def smoothstep(a, b, t):
    k = min(1.0, max(0.0, (t - a) / (b - a)))
    return k * k * (3 - 2 * k)


# ------------------------------------------------------------------ scene, materials


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = args.samples
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("World")
    sc.world = w
    w.color = (0.12, 0.13, 0.12)


def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, rgb, rough=0.85, metal=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (lin(rgb[0]), lin(rgb[1]), lin(rgb[2]), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Sheen Weight"].default_value = sheen
    return m


MATS = {}


def mats():
    MATS["coat"] = material("Fabric", COLORS["coat"], 0.88, sheen=0.2)
    MATS["shirt"] = material("Shirt", COLORS["shirt"], 0.8)
    MATS["tie"] = material("Tie", COLORS["tie"], 0.7)
    MATS["brass"] = material("Brass", (168, 132, 63), 0.38, metal=1.0)
    MATS["man"] = material("Mannequin", (150, 152, 156), 0.6)


def mesh_object(name, verts, faces, material_key, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(MATS[material_key])
    for p in me.polygons:
        p.use_smooth = smooth
    return ob


def apply_modifiers(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def solidify(ob, thickness, offset=-1.0, rim=True, even=True):
    s = ob.modifiers.new("Solidify", "SOLIDIFY")
    s.thickness = thickness
    s.offset = offset
    s.use_even_offset = even
    s.use_rim = rim
    apply_modifiers(ob)


def bevel(ob, width=0.03, segments=2):
    b = ob.modifiers.new("Bevel", "BEVEL")
    b.width = width
    b.segments = segments
    b.limit_method = "ANGLE"
    b.angle_limit = math.radians(40)
    apply_modifiers(ob)


def smooth_by_angle(ob, deg=35):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))


# ------------------------------------------------------------------ mannequin measurements


def measure_body(man):
    """Per height (dz): torso x-extent and depth, and the arm's bounding box."""
    vs = [v.co.copy() for v in man.data.vertices if v.co.x > 0]
    torso, arm, delt = {}, {}, {}
    for k in range(-62, 9):
        dz = k * 0.5
        slab = [v for v in vs if abs(v.z - Z(dz)) < 0.3]
        if len(slab) < 8:
            continue
        if -9.0 <= dz <= -0.5:
            d = [v for v in slab if v.x > 7.9]
            if d:
                delt[dz] = (min(v.y for v in d), max(v.y for v in d))
        xs = sorted(v.x for v in slab)
        ax0 = None
        if -23.0 < dz < -5.0:
            for i in range(len(xs) - 1, 0, -1):
                if xs[i] - xs[i - 1] > 0.35 and xs[i] > 6.3:
                    ax0 = xs[i]
                    break
        if ax0 is not None:
            a = [v for v in slab if v.x >= ax0]
            arm[dz] = (min(v.x for v in a), max(v.x for v in a), min(v.y for v in a), max(v.y for v in a))
            t = [v for v in slab if v.x < ax0]
        elif dz < -4.0:
            continue  # arm merged with the torso: no clean torso reading at this height
        else:
            t = slab
        torso[dz] = (max(v.x for v in t), min(v.y for v in t), max(v.y for v in t))
    return torso, arm, delt


def series(d, idx):
    return sorted((k, v[idx]) for k, v in d.items())


def smooth_series(pts, radius=1.0):
    out = []
    for z, _ in pts:
        near = [v for zz, v in pts if abs(zz - z) <= radius]
        out.append((z, sum(near) / len(near)))
    return out


# ------------------------------------------------------------------ torso surface


class Torso:
    """Rounded-box sections: half-width hw (front view), center cy and half-depth ry, roundness n."""

    def __init__(self, body_torso):
        x1 = smooth_series(series(body_torso, 0), 0.75)
        yf = smooth_series(series(body_torso, 1), 1.0)
        yb = smooth_series(series(body_torso, 2), 1.0)
        self.dzs = [HEM_DZ - 0.1 + i * 0.125 for i in range(int((NECK_DZ - HEM_DZ + 0.2) / 0.125) + 1)]
        belt_dz = dz_of(BELT["top_c"])
        seat_dz = -23.0
        rows = []
        front_belt = lerp_keys(yf, belt_dz) - 0.75
        back_seat = max(lerp_keys(yb, z) for z in (seat_dz - 1, seat_dz, seat_dz + 1)) + 0.6
        for dz in self.dzs:
            hw = lerp_keys(HW_KEYS, dz)
            if dz < -4.5:  # clearance over the body (above this the sleeve head covers the shoulder)
                hw = max(hw, lerp_keys(x1, dz) + 0.45)
            f = lerp_keys(yf, dz) - (0.75 if dz < 0 else 0.45)
            b = lerp_keys(yb, dz) + (0.6 if dz < 0 else 0.45)
            if dz < belt_dz:
                f = min(f, front_belt)  # the skirt hangs straight from the waist in front
            if dz < seat_dz:
                b = max(b, back_seat)  # ... and from the seat at the back
            n = 2.0 + 1.6 * smoothstep(1.6, -1.6, dz)
            rows.append([dz, hw, (f + b) / 2, (b - f) / 2, n])
        # soften the section changes
        for col in (1, 2, 3):
            vals = [r[col] for r in rows]
            for i in range(len(rows)):
                lo, hi = max(0, i - 4), min(len(rows), i + 5)
                rows[i][col] = sum(vals[lo:hi]) / (hi - lo)
        self.rows = rows

    def section(self, dz):
        rows = self.rows
        if dz <= rows[0][0]:
            return rows[0][1:]
        if dz >= rows[-1][0]:
            return rows[-1][1:]
        i = int((dz - rows[0][0]) / 0.125)
        i = max(0, min(len(rows) - 2, i))
        a, b = rows[i], rows[i + 1]
        t = (dz - a[0]) / (b[0] - a[0])
        return [a[k] + (b[k] - a[k]) * t for k in range(1, 5)]

    @staticmethod
    def sp(u, n):
        return math.copysign(abs(u) ** (2.0 / n), u)

    def point(self, t, dz):
        hw, cy, ry, n = self.section(dz)
        return Vector((hw * self.sp(math.cos(t), n), cy + ry * self.sp(math.sin(t), n), Z(dz)))

    def hw(self, dz):
        return self.section(dz)[0]

    def build(self, cols=160):
        verts, faces = [], []
        top = len(self.dzs)
        for r, dz in enumerate(self.dzs):
            for c in range(cols):
                t = 2 * math.pi * c / cols
                p = self.point(t, dz)
                # rounded front corners at the hem
                w = 1 - smoothstep(HEM_DZ, HEM_DZ + 4.0, dz)
                p.z += 1.2 * smoothstep(5.4, 7.6, abs(p.x)) ** 1.5 * w * (1.0 if p.y < self.section(dz)[1] else 0.0)
                verts.append(p)
        for r in range(top - 1):
            for c in range(cols):
                a = r * cols + c
                b = r * cols + (c + 1) % cols
                faces.append((a, b, b + cols, a + cols))
        ob = mesh_object("Coat", verts, faces, "coat")
        return ob


# ------------------------------------------------------------------ sleeves


def linfit(pts):
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - mx) ** 2 for p in pts) or 1e-9
    k = sum((p[0] - mx) * (p[1] - my) for p in pts) / sxx
    return k, my - k * mx


# sleeve inner edge where the drawing shows it (below the torso), as a straight line
SLEEVE_IN = [(dz_of(15.5), 7.13), (dz_of(28.5), 8.36)]


class Sleeve:
    """A straight sleeve on the drawing's lines: the outer edge follows the drawing into the
    shoulder point, the inner edge is a straight line, both kept clear of the mannequin's arm.
    Depth comes from the arm plus ease. Sections are rounded and off-center (outer/inner radii)."""

    def __init__(self, arm, body_full, delt, torso=None):
        self.torso = torso
        self.delt = delt
        self.arm = arm
        self.body_full = body_full
        # depth from the forearm/elbow (higher up the slab also catches the armpit)
        ys = [(dz, (a[2] + a[3]) / 2) for dz, a in arm.items() if CUFF_DZ - 0.5 <= dz <= -9.0]
        rs = [(dz, (a[3] - a[2]) / 2 + 0.4) for dz, a in arm.items() if CUFF_DZ - 0.5 <= dz <= -9.0]
        self.kcy, self.bcy = linfit(ys)
        self.kry, self.bry = linfit(rs)
        self.bry += max(0.0, max(r - (self.kry * d + self.bry) + abs((self.kcy * d + self.bcy) - c) for (d, r), (_, c) in zip(sorted(rs), sorted(ys))))

    def edges(self, dz):
        out = lerp_keys(SLEEVE_OUT, dz)
        k = (SLEEVE_IN[1][1] - SLEEVE_IN[0][1]) / (SLEEVE_IN[1][0] - SLEEVE_IN[0][0])
        inn = SLEEVE_IN[0][1] + k * (dz - SLEEVE_IN[0][0])
        near = [a for d, a in self.arm.items() if abs(d - dz) <= 0.75]
        if near:
            out = max(out, max(a[1] for a in near) + 0.3)
            inn = min(inn, min(a[0] for a in near) - 0.3)
        if dz > -4.5:  # shoulder: clear the deltoid
            out = max(out, lerp_keys(self.body_full, dz) + 0.3)
        if self.torso is not None and dz < -1.5:  # tuck the inside of the sleeve under the torso's side
            inn = min(inn, self.torso.hw(dz) - 0.6)
        return inn, out

    def ring(self, dz):
        """Smoothed along the sleeve, so no ledges where the arm readings start or stop."""
        if not hasattr(self, "_tab"):
            self._dzs = [CUFF_DZ - 1 + i * 0.1 for i in range(int((1.0 - CUFF_DZ) / 0.1) + 1)]
            raw = [self.raw_ring(d) for d in self._dzs]
            tab = []
            for i in range(len(raw)):
                lo, hi = max(0, i - 8), min(len(raw), i + 9)
                win = raw[lo:hi]
                tab.append(tuple(sum(w[k] for w in win) / len(win) for k in range(4)))
            self._tab = tab
        i = (dz - self._dzs[0]) / 0.1
        i0 = max(0, min(len(self._tab) - 2, int(i)))
        f = min(1.0, max(0.0, i - i0))
        a, b = self._tab[i0], self._tab[i0 + 1]
        return tuple(a[k] + (b[k] - a[k]) * f for k in range(4))

    def raw_ring(self, dz):
        inn, out = self.edges(dz)
        cy = self.kcy * dz + self.bcy
        ry = min(2.7, self.kry * dz + self.bry)
        lo, hi = cy - ry, cy + ry
        near = [a for d, a in self.delt.items() if abs(d - dz) <= 0.5]
        if near:  # contain the deltoid and upper arm front to back
            lo = min(lo, min(a[0] for a in near) - 0.35)
            hi = max(hi, max(a[1] for a in near) + 0.35)
        near = [a for d, a in self.arm.items() if abs(d - dz) <= 0.5]
        if near:  # the arm's front (its back reading includes the armpit)
            lo = min(lo, min(a[2] for a in near) - 0.35)
        cy, ry = (lo + hi) / 2, (hi - lo) / 2
        if dz > -2.0:  # sleeve head: close up toward the shoulder point (inside the torso's shoulder)
            f = min(1.0, (dz + 2.0) / 1.4)
            g = math.sqrt(max(0.0, 1 - f * f))
            ry *= 0.45 + 0.55 * g
            inn = out - (out - inn) * (0.5 + 0.5 * g)
        cx = (inn + out) / 2
        return cx, cy, out - cx, ry

    def axis(self, dz):
        cx, cy, _, _ = self.ring(dz)
        return Vector((cx, cy, Z(dz)))

    def build(self, side, cols=72):
        n = 2.4
        dzs = [CUFF_DZ + i * 0.2 for i in range(int((-0.6 - CUFF_DZ) / 0.2) + 1)]
        verts, faces = [], []
        for dz in dzs:
            cx, cy, rx, ry = self.ring(dz)
            for c in range(cols):
                t = 2 * math.pi * c / cols
                x = cx + rx * Torso.sp(math.cos(t), n)
                y = cy + ry * Torso.sp(math.sin(t), n)
                verts.append(Vector((x * side, y, Z(dz))))
        rows = len(dzs)
        for r in range(rows - 1):
            for c in range(cols):
                a = r * cols + c
                b = r * cols + (c + 1) % cols
                faces.append((a, b, b + cols, a + cols) if side > 0 else (a, a + cols, b + cols, b))
        cx, cy, _, _ = self.ring(dzs[-1])
        verts.append(Vector((cx * side, cy, Z(dzs[-1] + 0.1))))
        top = len(verts) - 1
        base = (rows - 1) * cols
        for c in range(cols):
            a, b = base + c, base + (c + 1) % cols
            faces.append((a, b, top) if side > 0 else (a, top, b))
        return mesh_object(f"Sleeve{'L' if side > 0 else 'R'}", verts, faces, "coat")


# ------------------------------------------------------------------ bands (collar, shirt collar, belt)


def band(name, rx0, ry0, rx1, ry1, cy, dz0, top_fn, t0, t1, material_key, cols=96, rows=6, thickness=0.1):
    verts, faces = [], []
    for r in range(rows + 1):
        h = r / rows
        for c in range(cols + 1):
            t = t0 + (t1 - t0) * c / cols
            dz = dz0 + h * (top_fn(t) - dz0)
            rx = rx0 + (rx1 - rx0) * h
            ry = ry0 + (ry1 - ry0) * h
            verts.append(Vector((rx * math.cos(t), cy + ry * math.sin(t), Z(dz))))
    w = cols + 1
    for r in range(rows):
        for c in range(cols):
            a = r * w + c
            faces.append((a, a + 1, a + 1 + w, a + w))
    ob = mesh_object(name, verts, faces, material_key)
    fix_normals(ob, outward=True)
    if thickness:
        solidify(ob, thickness)
    return ob


def fix_normals(ob, outward=True):
    """Point faces away from the body axis (or toward the viewer for flat panels)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    score = 0.0
    for f in bm.faces:
        c = f.calc_center_median()
        d = Vector((c.x, c.y - 0.5, 0)) if outward else Vector((0, -1, 0))
        if d.length > 1e-6:
            score += f.normal.dot(d.normalized()) * f.calc_area()
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def belt(torso):
    cols, rows = 160, 6
    verts, faces = [], []
    cy_of = lambda dz: torso.section(dz)[1]
    for r in range(rows + 1):
        h = r / rows
        for c in range(cols):
            t = 2 * math.pi * c / cols
            # V in front: the belt dips toward the buckle
            probe = torso.point(t, dz_of(BELT["top_c"]))
            front = probe.y < cy_of(dz_of(BELT["top_c"]))
            s = smoothstep(0.0, BELT["side_x"], abs(probe.x)) if front else 1.0
            top = BELT["top_c"] + (BELT["top_s"] - BELT["top_c"]) * s
            bot = BELT["bot_c"] + (BELT["bot_s"] - BELT["bot_c"]) * s
            dz = dz_of(bot + (top - bot) * h)
            p = torso.point(t, dz)
            nrm = surface_normal(torso, t, dz)
            verts.append(p + nrm * 0.28)
    for r in range(rows):
        for c in range(cols):
            a = r * cols + c
            b = r * cols + (c + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    ob = mesh_object("Belt", verts, faces, "coat")
    fix_normals(ob)
    solidify(ob, 0.16)
    bevel(ob, 0.03)
    smooth_by_angle(ob)
    return ob


def surface_normal(torso, t, dz, e=1e-3):
    p = torso.point(t, dz)
    du = torso.point(t + e, dz) - p
    dv = torso.point(t, dz + e * 10) - p
    n = du.cross(dv)
    if n.length < 1e-9:
        return Vector((math.cos(t), math.sin(t), 0))
    n.normalize()
    radial = Vector((p.x, p.y - torso.section(dz)[1], 0))
    if radial.length > 1e-6 and n.dot(radial) < 0:
        n = -n
    return n


# ------------------------------------------------------------------ flat panels laid onto the coat


def outline_to_xz(outline, mirror=False):
    return [((-x if mirror else x), Z(dz_of(y))) for x, y in outline]


def panel(name, outline_xz, targets, offset, thickness, material_key, step=0.12, from_above=False, torso=None, bev=0.025):
    """Triangulate a 2D outline (x, z) -- or (x, y) when laid from above -- project it and give it thickness."""
    xs = [p[0] for p in outline_xz]
    zs = [p[1] for p in outline_xz]
    pts = [Vector((x, z)) for x, z in outline_xz]
    extra = []
    x = min(xs) + step / 2
    while x < max(xs):
        z = min(zs) + step / 2
        while z < max(zs):
            if inside(x, z, outline_xz) and min_dist(x, z, outline_xz) > step * 0.4:
                extra.append(Vector((x, z)))
            z += step
        x += step
    # densify the outline so edges follow the surface
    ring = []
    for a, b in zip(pts, pts[1:] + pts[:1]):
        n = max(1, int((b - a).length / step))
        for i in range(n):
            ring.append(a.lerp(b, i / n))
    allp = ring + extra
    vcos, _, faces, _, _, _ = delaunay_2d_cdt(allp, [(i, (i + 1) % len(ring)) for i in range(len(ring))], [], 0, 1e-5)
    # keep triangles inside the outline
    faces = [f for f in faces if inside(*(sum((vcos[i] for i in f), Vector((0, 0))) / 3), outline_xz)]
    verts = []
    bvh = targets
    for v in vcos:
        if from_above:
            x, y = v.x, v.y
            hit = cast(bvh, Vector((x, y, 80.0)), Vector((0, 0, -1)))
            p, nrm = hit if hit else (Vector((x, y, Z(0))), Vector((0, 0, 1)))
            if nrm.z < 0:
                nrm = -nrm
        else:
            x, z = v.x, v.y
            if torso is not None and z < Z(1.6):
                lim = torso.hw(z - SH) - 0.3
                x = max(-lim, min(lim, x))
            hit = cast(bvh, Vector((x, -60.0, z)), Vector((0, 1, 0)))
            p, nrm = hit if hit else (Vector((x, -6.0, z)), Vector((0, -1, 0)))
            if nrm.y > 0:
                nrm = -nrm
        verts.append(p + nrm * offset)
    ob = mesh_object(name, verts, [tuple(f) for f in faces], material_key)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-3)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-3)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    want = Vector((0, 0, 1)) if from_above else Vector((0, -1, 0))
    if sum(f.normal.dot(want) * f.calc_area() for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    if thickness:
        solidify(ob, thickness, offset=-1.0, even=False)
    if bev:
        bevel(ob, bev)
    smooth_by_angle(ob)
    return ob


def inside(x, z, poly):
    c = False
    n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            c = not c
    return c


def min_dist(x, z, poly):
    best = 1e9
    p = Vector((x, z))
    for a, b in zip(poly, poly[1:] + poly[:1]):
        a, b = Vector(a), Vector(b)
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
        best = min(best, (p - (a + ab * t)).length)
    return best


def bvh_of(objs):
    bpy.context.view_layer.update()
    verts, polys = [], []
    for ob in objs:
        mw = ob.matrix_world
        base = len(verts)
        verts += [mw @ v.co for v in ob.data.vertices]
        polys += [[base + i for i in p.vertices] for p in ob.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def cast(bvh, origin, direction):
    loc, nrm, _, _ = bvh.ray_cast(origin, direction)
    if loc is None:
        return None
    return loc, nrm.normalized()


def button(name, pos, nrm, d, h=0.16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=d / 2, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (1, 1, (h * 2) / d)
    bpy.ops.object.transform_apply(scale=True)
    q = Vector((0, 0, 1)).rotation_difference(nrm)
    ob.matrix_world = Matrix.Translation(pos) @ q.to_matrix().to_4x4()
    ob.data.materials.append(MATS["brass"])
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def front_hit(bvh, x, y_in):
    hit = cast(bvh, Vector((x, -60, Z(dz_of(y_in)))), Vector((0, 1, 0)))
    if not hit:
        return Vector((x, -5, Z(dz_of(y_in)))), Vector((0, -1, 0))
    p, n = hit
    return p, (n if n.y < 0 else -n)


# ------------------------------------------------------------------ build


def build():
    man = body_mod.load_body(args.body, SH, arm_hang_deg=8.0, neck_cut=1.8)
    man.data.materials.clear()
    man.data.materials.append(MATS["man"])
    body_torso, arm, delt = measure_body(man)
    body_full = smooth_series([(dz, v[0]) for dz, v in sorted(body_torso.items()) if dz > -4.5], 0.5)

    torso = Torso(body_torso)
    coat = torso.build()
    sleeve = Sleeve(arm, body_full, delt, torso)
    sleeves = [sleeve.build(1), sleeve.build(-1)]

    # collar band (open at the front between the lapels) and shirt collar
    top_back, top_front = 3.36, 2.95
    collar_top = lambda t: top_front + (top_back - top_front) * (math.sin(t) + 1) / 2
    collar = band("Collar", 3.30, 3.05, 3.62, 3.35, 0.4, 1.7, collar_top, -0.62, math.pi + 0.62, "coat", thickness=0.12)
    shirt_band = band("ShirtCollar", 3.08, 2.85, 3.10, 2.88, 0.35, 1.45, lambda t: 3.0 + 0.15 * (math.sin(t) + 1) / 2,
                      0, 2 * math.pi, "shirt", thickness=0.06)

    base = bvh_of([coat, collar, shirt_band])
    torso_only = bvh_of([coat])

    # shirt in the V, tie, shirt collar leaves
    shirt_poly = [(min(x + 0.45, 2.85), y) for x, y in V_EDGE]
    shirt_poly = [(x, 0.25) for x, _ in shirt_poly[:1]] + shirt_poly + [(-x, y) for x, y in reversed(shirt_poly)] + [(-shirt_poly[0][0], 0.25)]
    panel("ShirtFront", outline_to_xz(shirt_poly), base, 0.03, 0.0, "shirt", bev=0)
    panel("Tie", outline_to_xz(TIE), base, 0.08, 0.04, "tie", bev=0.012)
    for m in (False, True):
        panel(f"ShirtLeaf{'R' if m else 'L'}", outline_to_xz(SHIRT_LEAF, m), base, 0.13, 0.04, "shirt", bev=0.012)

    # lapels (the wearer's left one on top)
    panel("LapelR", outline_to_xz(LAPEL, True), base, 0.2, 0.12, "coat", torso=torso)
    panel("LapelL", outline_to_xz(LAPEL, False), base, 0.23, 0.12, "coat", torso=torso)

    # breast pockets, flaps, pleats, buttons
    P = POCKET
    for side in (1, -1):
        cx = P["cx"] * side
        x0, x1 = cx - P["w"] / 2, cx + P["w"] / 2
        body = [(x0, P["top"]), (x1, P["top"]), (x1, P["bottom"]), (x0, P["bottom"])]
        panel(f"BreastBody{side}", outline_to_xz(body), torso_only, 0.1, 0.08, "coat", torso=torso)
        if AGSU:
            pl = [(cx - P["pleat"] / 2, P["top"] + P["flap"]), (cx + P["pleat"] / 2, P["top"] + P["flap"]),
                  (cx + P["pleat"] / 2, P["bottom"] - 0.05), (cx - P["pleat"] / 2, P["bottom"] - 0.05)]
            panel(f"BreastPleat{side}", outline_to_xz(pl), torso_only, 0.15, 0.05, "coat", torso=torso, bev=0.015)
        fl = [(x0 - 0.06, P["top"] - 0.05), (x1 + 0.06, P["top"] - 0.05), (x1 + 0.06, P["top"] + P["flap"]),
              (cx, P["top"] + P["flap"] + P["point"]), (x0 - 0.06, P["top"] + P["flap"])]
        panel(f"BreastFlap{side}", outline_to_xz(fl), torso_only, 0.22, 0.09, "coat", torso=torso)
        p, n = front_hit(torso_only, cx, P["button_y"])
        button(f"BreastButton{side}", p + n * 0.3, n, 0.62, h=0.13)
        # lower pocket flaps
        lf = [(x * side, y) for x, y in LOWER_FLAP]
        panel(f"LowerFlap{side}", outline_to_xz(lf), torso_only, 0.1, 0.09, "coat", torso=torso)
        if AGSU:
            p, n = front_hit(torso_only, LOWER_BUTTON[0] * side, LOWER_BUTTON[1])
            button(f"LowerButton{side}", p + n * 0.2, n, 0.62, h=0.13)

    # front edge of the overlapping front
    panel("FrontEdge", outline_to_xz(FRONT_EDGE), torso_only, 0.05, 0.04, "coat", bev=0.015)
    for i, y in enumerate(BUTTONS_Y):
        p, n = front_hit(torso_only, BUTTON_X, y)
        button(f"FrontButton{i}", p + n * 0.14, n, 0.9, h=0.17)

    if AGSU:
        blt = belt(torso)
        belt_bvh = bvh_of([blt])
        panel("BeltKeeper", outline_to_xz(KEEPER), belt_bvh, 0.07, 0.07, "coat", bev=0.015)
        build_buckle(belt_bvh)

    # shoulder loops, laid on from above
    tops = bvh_of([coat] + sleeves)
    for side in (1, -1):
        ridge = lambda x: 0.65 + (abs(x) - LOOP["x0"]) / (LOOP["x1"] - LOOP["x0"]) * (1.8 - 0.65)
        L = LOOP
        w = L["w"] / 2
        pts = [(L["x0"], 0.0), (L["x0"] + 0.35, -w), (L["x1"], -w), (L["x1"], w), (L["x0"] + 0.35, w)]
        outline = [(x * side, ridge(x) + y) for x, y in pts]
        panel(f"Loop{side}", outline, tops, 0.06, 0.1, "coat", from_above=True, step=0.1)
        hit = cast(tops, Vector((L["button_x"] * side, ridge(L["button_x"]), 80)), Vector((0, 0, -1)))
        if hit:
            p, n = hit
            n = n if n.z > 0 else -n
            button(f"LoopButton{side}", p + n * 0.24, n, 0.55, h=0.12)

    # cloth edges with a little thickness
    solidify(coat, 0.1)
    for s in sleeves:
        solidify(s, 0.1)
    return coat, man, sleeve


def build_buckle(belt_bvh):
    B = BUCKLE
    p, n = front_hit(belt_bvh, 0.0, B["y"])
    w, h, b = B["w"], B["h"], B["bar"]
    bm = bmesh.new()
    for cx, cz, sx, sz in ((0, h / 2 - b / 2, w, b), (0, -h / 2 + b / 2, w, b), (w / 2 - b / 2, 0, b, h), (-w / 2 + b / 2, 0, b, h)):
        m = Matrix.Translation((cx, 0, cz)) @ Matrix.Diagonal((sx, 0.09, sz, 1))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    me = bpy.data.meshes.new("Buckle")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Buckle", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(MATS["brass"])
    q = Vector((0, -1, 0)).rotation_difference(-n if n.y > 0 else n)
    ob.matrix_world = Matrix.Translation(p + (n if n.y < 0 else -n) * 0.1) @ q.to_matrix().to_4x4()
    bevel(ob, 0.02)
    smooth_by_angle(ob)


# ------------------------------------------------------------------ renders


def lights():
    def area(name, loc, energy, size):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, Z(-10))) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(o)

    area("Key", (30, -70, 40), 60000, 40)
    area("Fill", (-50, -40, 10), 20000, 50)
    area("Rim", (0, 60, 40), 25000, 40)


def camera():
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def shoot(cam, name, az=0, ortho=False, res=None):
    sc = bpy.context.scene
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = IMG_H / PXIN
        sc.render.resolution_x, sc.render.resolution_y = IMG_W // 2, IMG_H // 2
        cam.location = ((IMG_W / 2 - CX) / PXIN, -120, ZTOP - (IMG_H / 2 - CY) / PXIN)
        cam.rotation_euler = (math.radians(90), 0, 0)
    else:
        cam.data.type = "PERSP"
        cam.data.lens = 60
        r = res or args.res
        sc.render.resolution_x, sc.render.resolution_y = r, int(r * 1.25)
        a = math.radians(az)
        tgt = Vector((0, 0, Z(-12)))
        cam.location = tgt + Vector((math.sin(a) * 105, -math.cos(a) * 105, 8))
        cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.abspath(os.path.join(args.out, f"{args.stage}_{name}.png"))
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


# ------------------------------------------------------------------ export


def export_glb(coat, man, sleeve, path):
    top_button = Z(dz_of(BUTTONS_Y[0]))
    root = bpy.data.objects.new("DressRightCoat", None)
    bpy.context.collection.objects.link(root)
    for side in (1, -1):
        for i in range(13):
            dz = -2.6 + (CUFF_DZ + 0.3 - -2.6) * i / 12
            p = sleeve.axis(dz)
            e = bpy.data.objects.new(f"dr_arm_{'L' if side > 0 else 'R'}_{i:02d}", None)
            e.location = (p.x * side, p.y, p.z)
            bpy.context.collection.objects.link(e)
    for ob in list(bpy.data.objects):
        if ob.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(ob)
    dec = man.modifiers.new("Web", "DECIMATE")
    dec.ratio = 0.35
    apply_modifiers(man)
    for ob in bpy.data.objects:
        if ob is not root:
            ob.location.z -= top_button
            if ob.parent is None:
                ob.parent = root
    root["dr_version"] = 2
    root["dr_uniform"] = args.uniform
    root["dr_units"] = "inch"
    root["dr_sleeve_length"] = round(Z(-0.9) - Z(CUFF_DZ), 2)
    root["dr_shoulder_line_y"] = SH - top_button
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format="GLB", export_yup=True, export_apply=True,
                              export_extras=True, export_cameras=False, export_lights=False, export_animations=False,
                              export_skins=False)


def main():
    os.makedirs(args.out, exist_ok=True)
    reset()
    mats()
    coat, man, sleeve = build()
    lights()
    cam = camera()
    front = shoot(cam, "ortho", ortho=True)
    for n, az in (("front", 0), ("q34", 35), ("side", 90), ("back", 180)):
        shoot(cam, n, az)
    if args.ref:
        try:
            from PIL import Image
            a = Image.open(args.ref).convert("RGB").resize((IMG_W // 2, IMG_H // 2))
            b = Image.open(front).convert("RGB")
            c = Image.new("RGB", (a.width * 2, a.height))
            c.paste(a, (0, 0))
            c.paste(b, (a.width, 0))
            c.save(os.path.join(args.out, f"{args.stage}_compare.png"))
        except ImportError:
            pass
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(args.out, f"coat_{args.stage}.blend")))
    if args.export:
        export_glb(coat, man, sleeve, args.export)


main()
