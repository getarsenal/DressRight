"""
Fit the purchased uniform model (see asset_load.py) as the DressRight coat, keeping its detail.

The model is a women's-cut belted service coat in a T-pose. Two outputs:

- male: the coat's detail (lapels, collar, pocket flaps, belt, buttons, seams, folds) is kept,
  but its overall shape is re-laid onto the male block coat that fits our mannequin
  (block_coat.py): no bust, square shoulders, straight hips, our verified silhouette.
- female: the model's own shape.

Both get the arms dropped: each sleeve becomes a straight sleeve from the armhole to the cuff.

How the detail survives: every piece is smoothed (Taubin, no shrinkage); detail = original -
smoothed. The smooth shape is mapped to the new body (torso: by height and around-the-body
angle; sleeves: by distance down the sleeve and angle around it), then the detail is added back
(rotated with the sleeve). Small pieces (collar, lapels, flaps, buttons, belt, shirt, tie) keep
their height above the coat body.

Run:  python tools/blender/asset_coat.py --obj <uniform.obj> --sex male --export public/models/coat-agsu-male.glb
"""
import argparse
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import block_coat as bc  # noqa: E402
import body as body_mod  # noqa: E402
import asset_load as al  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--obj", required=True)
ap.add_argument("--sex", default="male", choices=["male", "female"])
ap.add_argument("--out", default=os.path.join(HERE, "out"))
ap.add_argument("--stage", default="asset")
ap.add_argument("--samples", type=int, default=16)
ap.add_argument("--res", type=int, default=600)
ap.add_argument("--export", default="")
A, _ = ap.parse_known_args(sys.argv[1:])
bc.args.samples, bc.args.res, bc.args.out, bc.args.stage = A.samples, A.res, A.out, A.stage

# landmarks measured on the model (inches, after asset_load normalisation)
ASSET = dict(collar_top=66.6, shoulder=64.54, seam_top=64.1, armpit=58.1, belt=48.5, hem=38.31, x_arm=8.6)
TILT = math.radians(8.0)  # sleeves hang a little away from the body


# ------------------------------------------------------------------ mesh helpers


def taubin(P, nbrs, iters=60, lam=0.6, mu=-0.63):
    S = P.copy()
    for _ in range(iters):
        for k in (lam, mu):
            avg = np.array([S[n].mean(axis=0) if len(n) else S[i] for i, n in enumerate(nbrs)])
            S = S + k * (avg - S)
    return S


def neighbours(me):
    nb = [set() for _ in range(len(me.vertices))]
    for e in me.edges:
        a, b = e.vertices
        nb[a].add(b)
        nb[b].add(a)
    return [np.array(sorted(s), dtype=np.int64) for s in nb]


def smoothstep(a, b, t):
    k = np.clip((t - a) / (b - a), 0.0, 1.0)
    return k * k * (3 - 2 * k)


# ------------------------------------------------------------------ build


def roles(me, isl):
    """Material role per face: coat, shirt, tie, brass. Pieces are told apart by where they sit."""
    names = [m.name for m in me.materials]
    role = ["coat"] * len(me.polygons)
    co = np.array([v.co for v in me.vertices])
    for k, (faces, verts) in enumerate(isl):
        mats = {names[me.polygons[f].material_index] for f in faces}
        mn, mx = co[verts].min(axis=0), co[verts].max(axis=0)
        r = "coat"
        if mats & {"boton", "boton_1"}:
            r = "brass"
        elif k > 0 and mats == {"traje_militar_1"}:
            w = mx[0] - mn[0]
            if w < 3.2 and mx[1] < 0 and mn[2] > 49:  # tie knot, tie blade and the collar points under the knot
                r = "tie" if len(faces) > 500 else "shirt"
            elif mx[2] > 66.8 or (mn[1] < -4 and mx[1] > 5 and mn[2] < 53):  # shirt collar band; shirt front/back
                r = "shirt"
        for f in faces:
            role[f] = r
    for f, p in enumerate(me.polygons):
        if names[p.material_index] == "cinto_1":
            role[f] = "brass"
    return role


def main():
    os.makedirs(A.out, exist_ok=True)
    bc.reset()
    bc.mats()
    male = A.sex == "male"
    if male:
        man = body_mod.load_body(bc.args.body, bc.SH, arm_hang_deg=8.0, neck_cut=1.8)
        man.data.materials.clear()
        man.data.materials.append(bc.MATS["man"])
        body_torso, arm, delt = bc.measure_body(man)
        body_full = bc.smooth_series([(dz, v[0]) for dz, v in sorted(body_torso.items()) if dz > -4.5], 0.5)
        torso = bc.Torso(body_torso, [v.co.copy() for v in man.data.vertices])
        sleeve_ref = bc.Sleeve(arm, body_full, delt, torso, [v.co.copy() for v in man.data.vertices])
        man_arm = np.array([v.co[:] for v in man.data.vertices if abs(v.co.x) > 7.6 and v.co.z < bc.Z(-1.5)])
    coat = al.load_asset(A.obj)
    me = coat.data
    isl = al.islands(me)
    role = roles(me, isl)
    P = np.array([v.co[:] for v in me.vertices])
    N = len(P)
    nb = neighbours(me)
    S = taubin(P, nb)
    D = P - S
    island_of = np.zeros(N, dtype=np.int64)
    for k, (_, verts) in enumerate(isl):
        island_of[verts] = k
    main_v = island_of == 0

    Q = S  # the smoothed shape each vertex is placed from
    xa = ASSET["x_arm"]
    ax = np.abs(Q[:, 0])
    # which part of the coat each vertex belongs to: small pieces go with their centre
    cen_x = np.zeros(N)
    for _, verts in isl:
        cen_x[verts] = np.abs(S[verts, 0]).mean()
    in_sleeve = np.where(main_v, ax > xa, cen_x > xa)
    w_sleeve = in_sleeve.astype(float)

    # --- the model's torso: extents by height (smoothed body, torso part only)
    tor = main_v & (ax < xa - 0.4)
    zs = np.arange(36.0, 67.6, 0.25)
    ext = []
    for z in zs:
        sel = tor & (np.abs(S[:, 2] - z) < 0.3)
        if sel.sum() < 6:
            ext.append(ext[-1] if ext else (6.0, -4.0, 4.0))
            continue
        pts = S[sel]
        ext.append((np.abs(pts[:, 0]).max(), pts[:, 1].min(), pts[:, 1].max()))
    ext = np.array(ext)
    for c in range(3):  # smooth over ~1 in
        ext[:, c] = np.convolve(np.pad(ext[:, c], 4, mode="edge"), np.ones(9) / 9, mode="valid")

    def asset_ext(z):
        i = np.clip((z - zs[0]) / 0.25, 0, len(zs) - 1)
        i0 = np.floor(i).astype(int)
        i1 = np.minimum(i0 + 1, len(zs) - 1)
        f = (i - i0)[..., None]
        return ext[i0] * (1 - f) + ext[i1] * f

    # --- height map: model landmarks -> block coat heights
    keys_a = [ASSET["hem"], ASSET["belt"], ASSET["armpit"], ASSET["seam_top"], ASSET["shoulder"], ASSET["collar_top"]]
    # above the shoulder the collar keeps its own height (no stretching)
    keys_m = [bc.HEM_DZ, bc.dz_of((bc.BELT["top_c"] + bc.BELT["bot_c"]) / 2), bc.SEAM_BOT, bc.SEAM_TOP, 0.35,
              0.35 + ASSET["collar_top"] - ASSET["shoulder"]]

    def height(z):
        return np.interp(z, keys_a, keys_m, left=None, right=None) + np.where(
            z > keys_a[-1], (z - keys_a[-1]) * 1.0, 0.0) + np.where(z < keys_a[0], (z - keys_a[0]) * 1.0, 0.0)

    # --- torso placement
    def torso_place(q, off):
        e = asset_ext(q[:, 2])
        hw, f, b = e[:, 0], e[:, 1], e[:, 2]
        cy = (f + b) / 2
        u = np.clip(q[:, 0] / hw, -1.0, 1.0)
        v = np.clip((q[:, 1] - cy) / np.where(q[:, 1] < cy, cy - f, b - cy), -1.0, 1.0)
        out = np.zeros_like(q)
        nrm = np.zeros_like(q)
        dz = height(q[:, 2])
        for i in range(len(q)):
            n = torso.section(dz[i])[3]
            t = math.atan2(math.copysign(abs(v[i]) ** (n / 2), v[i]), math.copysign(abs(u[i]) ** (n / 2), u[i]))
            p = torso.point(t, dz[i])
            nn = bc.surface_normal(torso, t, dz[i])
            out[i] = p[:]
            nrm[i] = nn[:]
        return out + nrm * off[:, None], nrm

    # --- sleeves: the model's arm frame
    arm = main_v & (ax > xa + 0.2)
    xs_bins = np.arange(xa, 29.5, 0.5)
    centre = {}
    for s in (1, -1):
        sel = arm & (np.sign(S[:, 0]) == s)
        rows = []
        for x in xs_bins:
            m = sel & (np.abs(np.abs(S[:, 0]) - x) < 0.3)
            if m.sum() > 5:
                pts = S[m]
                rows.append((x, (pts[:, 1].min() + pts[:, 1].max()) / 2, (pts[:, 2].min() + pts[:, 2].max()) / 2,
                             (pts[:, 1].max() - pts[:, 1].min()) / 2, (pts[:, 2].max() - pts[:, 2].min()) / 2))
        centre[s] = np.array(rows)
    x_end = {s: np.abs(S[arm & (np.sign(S[:, 0]) == s), 0]).max() for s in (1, -1)}

    def arm_frame(s, x):
        r = centre[s]
        return [np.interp(x, r[:, 0], r[:, k]) for k in (1, 2, 3, 4)]

    # armhole loop: the smoothed body's points at the armhole, placed on the new torso
    loops = {}
    for s in (1, -1):
        m = main_v & (np.sign(S[:, 0]) == s) & (np.abs(ax - xa) < 0.35)
        q = S[m].copy()
        q[:, 0] = s * xa
        yc, zc, ry, rz = arm_frame(s, xa)
        ang = np.arctan2((q[:, 2] - zc) / rz, (q[:, 1] - yc) / ry)
        placed = torso_place(q, np.zeros(len(q)))[0] if male else q
        order = np.argsort(ang)
        loops[s] = (ang[order], placed[order])

    def loop_at(s, ang):
        a, p = loops[s]
        a2 = np.concatenate([a - 2 * np.pi, a, a + 2 * np.pi])
        p2 = np.concatenate([p, p, p])
        return np.stack([np.interp(ang, a2, p2[:, k]) for k in range(3)], axis=1)

    def cuff_at(s, a_, b_):
        """Cuff ring point for a direction (a_ = front/back, b_ = up in the T-pose = outward when dropped)."""
        if male:
            cx, cy, rx, ry = sleeve_ref.ring(bc.CUFF_DZ)
            return np.stack([s * (cx + rx * b_), cy + ry * a_, np.full_like(a_, bc.Z(bc.CUFF_DZ))], axis=1)
        yc, zc, ry, rz = arm_frame(s, x_end[s])
        pts = np.stack([np.full_like(a_, s * x_end[s]), yc + ry * a_, zc + rz * b_], axis=1)
        return drop_rotate(s, pts)

    def drop_rotate(s, pts):
        yc, zc, _, _ = arm_frame(s, xa)
        piv = np.array([s * xa, yc, zc])
        al_ = s * (math.pi / 2 - TILT)
        R = np.array(Matrix.Rotation(al_, 3, "Y"))
        return (pts - piv) @ R.T + piv

    # rotation that carries detail from the T-pose arm to the dropped sleeve
    Rd = {s: np.array(Matrix.Rotation(s * (math.pi / 2 - TILT), 3, "Y")) for s in (1, -1)}

    # --- small pieces keep their height above the coat body
    OFF = np.zeros(N)
    nt = 2.4
    e = asset_ext(S[:, 2])
    cy_a = (e[:, 1] + e[:, 2]) / 2
    u_a = S[:, 0] / e[:, 0]
    v_a = (S[:, 1] - cy_a) / np.where(S[:, 1] < cy_a, cy_a - e[:, 1], e[:, 2] - cy_a)
    rho = (np.abs(u_a) ** nt + np.abs(v_a) ** nt) ** (1 / nt)
    r_loc = np.hypot(u_a / np.maximum(rho, 1e-6) * e[:, 0], v_a / np.maximum(rho, 1e-6) * (e[:, 2] - e[:, 1]) / 2)
    piece = ~main_v
    OFF[piece & ~in_sleeve] = ((rho - 1) * r_loc)[piece & ~in_sleeve]
    # pieces on the torso (collar, lapels, shirt, tie, flaps, loops, belt, buttons): each point keeps its
    # offset from the coat body in the body's local frame (out along the normal, up, around), so a collar
    # standing above the neckline stays standing, and a loop on the shoulder stays on the shoulder
    main_faces = [tuple(me.polygons[f].vertices) for f in isl[0][0]]
    bvh = BVHTree.FromPolygons([Vector(p) for p in S], main_faces)
    ONB = S.copy()
    LOC = np.zeros((N, 3))
    proj = np.zeros(N, dtype=bool)
    for i in np.where(piece & ~in_sleeve)[0]:
        loc, nrm, _, _ = bvh.find_nearest(Vector(S[i]))
        if loc is None:
            continue
        n = Vector(nrm)
        if n.dot(Vector((loc.x, loc.y - cy_a[i], 0))) < 0:
            n = -n
        t = Vector((0, 0, 1)) - n * n.z
        t = t.normalized() if t.length > 1e-6 else Vector((0, 1, 0))
        b = n.cross(t)
        d = Vector(S[i]) - loc
        ONB[i] = loc[:]
        LOC[i] = (d.dot(n), d.dot(t), d.dot(b))
        proj[i] = True
    for s in (1, -1):
        m = piece & in_sleeve & (np.sign(S[:, 0]) == s)
        if m.any():
            yc, zc, ry, rz = [np.array(v) for v in arm_frame(s, np.abs(S[m, 0]))]
            rr = np.hypot((S[m, 1] - yc) / ry, (S[m, 2] - zc) / rz)
            OFF[m] = (rr - 1) * (ry + rz) / 2

    # --- place every vertex
    NEW = np.zeros_like(P)
    if male:
        # pieces lying on the body are placed from the point beneath them
        e2 = asset_ext(ONB[:, 2])
        cy2 = (e2[:, 1] + e2[:, 2]) / 2
        u2 = ONB[:, 0] / e2[:, 0]
        v2 = (ONB[:, 1] - cy2) / np.where(ONB[:, 1] < cy2, cy2 - e2[:, 1], e2[:, 2] - cy2)
        r2 = (np.abs(u2) ** nt + np.abs(v2) ** nt) ** (1 / nt)
        u_a = np.where(proj, u2, u_a)
        v_a = np.where(proj, v2, v_a)
        rho = np.where(proj, r2, rho)
        e = np.where(proj[:, None], e2, e)
        cy_a = np.where(proj, cy2, cy_a)
        S_z = np.where(proj, ONB[:, 2], S[:, 2])
        on = np.stack([np.clip(u_a / np.maximum(rho, 1e-6), -1, 1) * e[:, 0],
                       cy_a + np.clip(v_a / np.maximum(rho, 1e-6), -1, 1) * np.where(v_a < 0, cy_a - e[:, 1], e[:, 2] - cy_a),
                       S_z], axis=1)
        # the coat body: mapped exactly onto the male block coat, detail added back
        body = main_v & ~in_sleeve
        tor_pos, _ = torso_place(on[body], np.zeros(body.sum()))
        NEW[:] = P
        NEW[body] = tor_pos + D[body]
        # everything else on the torso moves with the body around it: a smooth displacement field
        # (nearest body points, gaussian weights), so collar, lapels, flaps, shirt and tie keep their shape
        from mathutils.kdtree import KDTree
        bidx = np.where(body)[0]
        disp = NEW[bidx] - P[bidx]
        kd = KDTree(len(bidx))
        for j, i in enumerate(bidx):
            kd.insert(Vector(P[i]), j)
        kd.balance()
        rest = np.where(~main_v & ~in_sleeve)[0]
        for i in rest:
            near = kd.find_n(Vector(P[i]), 24)
            d0 = near[0][2]
            sig = max(0.6, d0)
            w = np.array([math.exp(-0.5 * ((d - d0) / sig) ** 2) for _, _, d in near])
            js = np.array([j for _, j, _ in near])
            NEW[i] = P[i] + (disp[js] * w[:, None]).sum(axis=0) / w.sum()
    else:
        NEW[:] = P
    idx = np.where(w_sleeve > 0)[0]
    for s in (1, -1):
        ii = idx[np.sign(Q[idx, 0]) == s]
        if not len(ii):
            continue
        q = Q[ii]
        yc, zc, ry, rz = [np.array(v) for v in arm_frame(s, np.abs(q[:, 0]))]
        a_ = (q[:, 1] - yc) / ry
        b_ = (q[:, 2] - zc) / rz
        nl = np.maximum(np.hypot(a_, b_), 1e-6)
        a_, b_ = a_ / nl, b_ / nl
        f = np.clip((np.abs(q[:, 0]) - xa) / (x_end[s] - xa), 0, 1)
        if male:
            # the model's own sleeve, laid onto the straight sleeve shape. It stays one piece with the
            # body: its armhole edge starts on the armhole arch (high at the shoulder point, down
            # at the armpit), so the shoulder rolls straight into the sleeve with no ridge
            outer = np.clip((b_ + 1) / 2, 0, 1)
            seam_dz = bc.SEAM_BOT + (bc.SEAM_TOP - bc.SEAM_BOT) * outer ** 1.4
            dz = seam_dz + f * (bc.CUFF_DZ - seam_dz)
            base = np.zeros((len(ii), 3))
            radial = np.zeros((len(ii), 3))
            for j in range(len(ii)):
                cx, cy, rx, ry2 = sleeve_ref.ring(dz[j])
                px = cx + rx * bc.Torso.sp(b_[j], 3.2)
                py = cy + ry2 * bc.Torso.sp(a_[j], 3.2)
                base[j] = (s * px, py, bc.Z(dz[j]))
                rv = np.array([s * (px - cx), py - cy, 0.0])
                radial[j] = rv / max(np.linalg.norm(rv), 1e-6)
            sleeve_pos = base + radial * OFF[ii, None] + D[ii] @ Rd[s].T
            NEW[ii] = sleeve_pos
            continue
        # female: the model's own arm, bent down at the shoulder (rotation grows over the first
        # few inches past the armhole, then the arm is rigid), so its sections stay round
        yc0, zc0, _, rz0 = arm_frame(s, xa)
        piv = np.array([s * xa, yc0, zc0 - 0.35 * rz0])
        d_along = np.abs(P[ii, 0]) - xa
        th = s * (math.pi / 2 - TILT) * smoothstep(0.0, 3.5, d_along)
        rel = P[ii] - piv
        cth, sth = np.cos(th), np.sin(th)
        rx = rel[:, 0] * cth + rel[:, 2] * sth
        rz = -rel[:, 0] * sth + rel[:, 2] * cth
        NEW[ii] = np.stack([piv[0] + rx, piv[1] + rel[:, 1], piv[2] + rz], axis=1)

    if not male:
        # into the app frame: shoulder line at the same height as the male coat, centred front to back
        NEW[:, 2] += bc.Z(0.35) - ASSET["shoulder"]
        NEW[:, 1] -= np.median(S[main_v & (np.abs(S[:, 0]) < 3), 1])
    # a narrower tie (the model's is oversized): scale its width about its centre line
    tie_v = sorted({v for f, p in enumerate(me.polygons) if role[f] == "tie" for v in p.vertices})
    if tie_v:
        cx = NEW[tie_v, 0].mean()
        NEW[tie_v, 0] = cx + (NEW[tie_v, 0] - cx) * 0.72
    # the model's shoulder loops are short pads near the shoulder point: replaced below (male)
    names = [m.name for m in me.materials]
    loop_face = np.array([names[p.material_index] in ("bordado", "bordado_1", "boton") for p in me.polygons])
    for i, v in enumerate(me.vertices):
        v.co = NEW[i]
    me.update()

    # materials
    me.materials.clear()
    for key in ("coat", "shirt", "tie", "brass"):
        me.materials.append(bc.MATS[key])
    slot = {"coat": 0, "shirt": 1, "tie": 2, "brass": 3}
    for f, p in enumerate(me.polygons):
        p.material_index = slot[role[f]]
        p.use_smooth = True
    coat.name = "Coat"
    # the AGSU has no buttons on the cuffs: drop the model's sleeve buttons
    bm = bmesh.new()
    bm.from_mesh(me)
    dead = [f for f in bm.faces if (role[f.index] == "brass" and all(in_sleeve[v.index] for v in f.verts))
            or (male and loop_face[f.index])]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    in_sleeve = np.zeros(len(me.vertices), dtype=bool)  # indices changed; not needed past this point
    if male:
        relax_underarm(coat)
        clear_body(coat, man)
        bc.smooth_by_angle(coat, 40)
        bc.armhole_seams(sleeve_ref, [coat])  # keeps the shoulder-seam anchors
        for ob in list(bpy.data.objects):  # no drawn seam line on the shoulder
            if ob.name.startswith("ArmholeSeam"):
                bpy.data.objects.remove(ob)
        shoulder_loops(coat, sleeve_ref)
        neck_stub()
        export_ctx.update(sleeve=sleeve_ref, man=man)
    else:
        bc.smooth_by_angle(coat, 40)

    bc.lights()
    cam = bc.camera()
    for n, az in (("front", 0), ("q34", 35), ("side", 90), ("back", 180)):
        bc.shoot(cam, n, az)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(A.out, f"coat_{A.stage}.blend")))
    if A.export:
        export(coat, male)


def top_button_z(coat):
    """Height of the highest front button (the layout's origin)."""
    me = coat.data
    brass = [i for i, m in enumerate(me.materials) if m and m.name.startswith("Brass")]
    best = None
    for p in me.polygons:
        if p.material_index in brass:
            c = p.center
            if abs(c.x) < 1.2 and c.y < 0 and (best is None or c.z > best):
                best = c.z
    return best


def export(coat, male):
    zb = top_button_z(coat)
    print("top button z", zb)
    if male:
        bc.BUTTONS_Y[0] = bc.ZTOP - zb  # export_glb puts the origin at this button
        bc.export_glb(coat, export_ctx["man"], export_ctx["sleeve"], A.export)
        return
    # female: anchors from the dropped sleeves, then the same GLB contract
    root = bpy.data.objects.new("DressRightCoat", None)
    bpy.context.collection.objects.link(root)
    V = np.array([v.co[:] for v in coat.data.vertices])
    for side in (1, -1):
        sv = V[(np.sign(V[:, 0]) == side) & (np.abs(V[:, 0]) > 6.0)]
        ztop, zbot = sv[:, 2].max() - 1.0, sv[:, 2].min() + 0.4
        for i in range(13):
            z = ztop + (zbot - ztop) * i / 12
            ring = sv[np.abs(sv[:, 2] - z) < 0.3]
            ring = ring[np.abs(ring[:, 0]) > np.abs(ring[:, 0]).max() - 4.5]
            c = ring.mean(axis=0) if len(ring) else sv.mean(axis=0)
            e = bpy.data.objects.new(f"dr_arm_{'L' if side > 0 else 'R'}_{i:02d}", None)
            e.location = (c[0], c[1], z)
            bpy.context.collection.objects.link(e)
        top = sv[np.argmax(sv[:, 2])]
        e = bpy.data.objects.new(f"dr_seam_{'L' if side > 0 else 'R'}", None)
        e.location = tuple(top)
        bpy.context.collection.objects.link(e)
    for ob in list(bpy.data.objects):
        if ob.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(ob)
    for ob in bpy.data.objects:
        if ob is not root:
            ob.location.z -= zb
            if ob.parent is None:
                ob.parent = root
    root["dr_version"] = 2
    root["dr_uniform"] = "AGSU"
    root["dr_units"] = "inch"
    root["dr_sex"] = "female"
    root["dr_sleeve_length"] = 22.0
    root["dr_shoulder_line_y"] = bc.Z(0.35) - zb
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(A.export), export_format="GLB", export_yup=True, export_apply=True,
                              export_extras=True, export_cameras=False, export_lights=False, export_animations=False,
                              export_skins=False)


def junction_welt(sleeves, bodies, radius=0.17):
    """Where the sleeve comes out of the body: march down the sleeve from its top at each angle
    until it is outside the body cloth; join those points into a smooth welt (the armhole seam),
    which also covers the line where the surfaces meet. Returns the seam's top point per side."""
    bpy.context.view_layer.update()
    bvh = bc.bvh_of(bodies)
    sv = np.array([v.co[:] for v in sleeves.data.vertices])
    tops = {}
    for s in (1, -1):
        pts = sv[np.sign(sv[:, 0]) == s]
        zmax = pts[:, 2].max()
        ring = []
        for k in range(96):
            th = 2 * math.pi * k / 96
            # sleeve points near this angle (about the sleeve's own axis near the top)
            top_band = pts[pts[:, 2] > zmax - 7.0]
            c = top_band[:, :2].mean(axis=0)
            ang = np.arctan2(top_band[:, 1] - c[1], (top_band[:, 0] - c[0]) * s)
            sel = top_band[np.abs((ang - (th - math.pi) + math.pi) % (2 * math.pi) - math.pi) < 0.07]
            if not len(sel):
                continue
            sel = sel[np.argsort(-sel[:, 2])]
            hit = None
            for p in sel:
                loc, nrm, _, d = bvh.find_nearest(Vector(p))
                if loc is None:
                    hit = p
                    break
                n = Vector(nrm)
                if n.dot(Vector((loc.x, loc.y, 0))) < 0:
                    n = -n
                if (Vector(p) - loc).dot(n) > 0.02:
                    hit = p
                    break
            if hit is not None:
                ring.append(hit)
        ring = np.array(ring)
        if len(ring) < 12:
            continue
        for _ in range(6):
            ring = (np.roll(ring, 1, 0) + 2 * ring + np.roll(ring, -1, 0)) / 4
        tops[s] = Vector(ring[np.argmax(ring[:, 2])])
        # tube
        m, segs = len(ring), 10
        vs, fs = [], []
        for j in range(m):
            p = Vector(ring[j])
            t = (Vector(ring[(j + 1) % m]) - Vector(ring[j - 1])).normalized()
            a = t.cross(Vector((0, 0, 1)))
            if a.length < 1e-3:
                a = t.cross(Vector((1, 0, 0)))
            a.normalize()
            b = t.cross(a)
            for q in range(segs):
                ph = 2 * math.pi * q / segs
                vs.append(p + (a * math.cos(ph) + b * math.sin(ph)) * radius)
        for j in range(m):
            for q in range(segs):
                a0 = j * segs + q
                a1 = j * segs + (q + 1) % segs
                b0 = ((j + 1) % m) * segs + q
                b1 = ((j + 1) % m) * segs + (q + 1) % segs
                fs.append((a0, a1, b1, b0))
        bc.mesh_object(f"ArmholeWelt{s}", vs, fs, "coat")
    return tops


def junction_seam(coat, loops):
    """The armhole seam, drawn where sleeve and body meet (the mapped armhole ring); returns the
    shoulder-seam point (top of the ring) per side."""
    bvh = bc.bvh_of([coat])
    tops = {}
    for s, (ang, pts) in loops.items():
        order = np.argsort(ang)
        P = pts[order]
        # resample evenly round the ring and smooth
        k = np.linspace(-np.pi, np.pi, 97)[:-1]
        A = ang[order]
        ring = np.stack([np.interp(k, A, P[:, j], period=2 * np.pi) for j in range(3)], axis=1)
        for _ in range(4):
            ring = (np.roll(ring, 1, 0) + 2 * ring + np.roll(ring, -1, 0)) / 4
        vs, fs = [], []
        prev = None
        hits = []
        for p in ring:
            loc, nrm, _, _ = bvh.find_nearest(Vector(p))
            if loc is None:
                continue
            n = Vector(nrm)
            if n.x * s < 0:
                n = -n
            hits.append((loc + n * 0.025, n))
        m = len(hits)
        for j in range(m):
            p, n = hits[j]
            q = hits[(j + 1) % m][0]
            tan = (q - p).normalized()
            w = n.cross(tan).normalized() * 0.04
            vs += [p - w, p + w]
        for j in range(m):
            a_, b_ = 2 * j, 2 * ((j + 1) % m)
            fs.append((a_, a_ + 1, b_ + 1, b_))
        ob = bc.mesh_object(f"ArmholeSeam{s}", vs, fs, "seam")
        bc.fix_normals(ob, outward=True)
        tops[s] = max((h[0] for h in hits), key=lambda v: v.z)
    return tops


def drop_sleeves(coat, in_sleeve, sleeve_ref, torso):
    """Remove the model's sleeves, and its body cloth inside the armhole arch."""
    bm = bmesh.new()
    bm.from_mesh(coat.data)
    dead = []
    for f in bm.faces:
        if any(in_sleeve[v.index] for v in f.verts):
            dead.append(f)
            continue
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # cloth inside the armhole arch is drawn out to the arch line (not cut), so the body's edge
    # follows the seam exactly; what lies inside collapses onto it, under the sleeve
    sm = sleeve_ref.seam
    pad = 0.3
    for v in bm.verts:
        c = v.co
        dz = c.z - bc.SH
        if not (bc.SEAM_BOT - 0.6 < dz < bc.SEAM_TOP + 1.2) or abs(c.x) < 0.7 * torso.hw(dz):
            continue
        r = sleeve_ref.seam_r(c.y, dz, pad)
        if r >= 1.0:
            continue
        _, cy, _, ry = sleeve_ref.ring(min(dz, sm["dzc"]))
        u = (c.y - cy) / (ry + pad)
        w = max(0.0, (dz - sm["dzc"]) / (sm["az"] + pad))
        if w <= 0:  # the legs: straight down to the armpit
            u = math.copysign(1.0, u if abs(u) > 1e-6 else 1.0)
        else:
            k = 1.0 / max(math.hypot(u, w), 1e-6)
            u, w = u * k, w * k
        ny = cy + u * (ry + pad)
        ndz = sm["dzc"] + w * (sm["az"] + pad) if w > 0 else dz
        hw, c0, ryf, nn, ryb = torso.section(ndz)
        rr = ryb if ny > c0 else ryf
        uu = min(0.999, abs(ny - c0) / max(rr, 1e-3))
        xt = hw * (1 - uu ** nn) ** (1 / nn)
        v.co = Vector((math.copysign(xt - 0.05, c.x), ny, bc.Z(ndz)))
    bm.to_mesh(coat.data)
    bm.free()


export_ctx = {}


def split_sleeves(coat, in_sleeve):
    """Move the sleeves into their own object (faces across the armhole are dropped; the tucks hide the cut)."""
    bm = bmesh.new()
    bm.from_mesh(coat.data)
    bm.verts.ensure_lookup_table()
    sb = bmesh.new()
    sb.from_mesh(coat.data)
    sb.verts.ensure_lookup_table()
    cross = [f for f in bm.faces if len({bool(in_sleeve[v.index]) for v in f.verts}) > 1]
    sleeve_f = [f for f in bm.faces if all(in_sleeve[v.index] for v in f.verts)]
    keep_s = {f.index for f in sleeve_f}
    bmesh.ops.delete(bm, geom=cross + sleeve_f, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(coat.data)
    bm.free()
    sb.faces.ensure_lookup_table()
    bmesh.ops.delete(sb, geom=[f for f in sb.faces if f.index not in keep_s], context="FACES")
    bmesh.ops.delete(sb, geom=[v for v in sb.verts if not v.link_faces], context="VERTS")
    me = bpy.data.meshes.new("Sleeves")
    sb.to_mesh(me)
    sb.free()
    for m in coat.data.materials:
        me.materials.append(m)
    ob = bpy.data.objects.new("Sleeves", me)
    bpy.context.collection.objects.link(ob)
    return ob


def clean_armholes(coat, sleeves, sleeve_ref):
    """Cut sleeve and body along a clean armhole plane (shoulder point to armpit) so neither edge is
    ragged: the sleeve keeps the outside, the body the inside."""
    cx, cy, rx, ry = sleeve_ref.ring(bc.SEAM_BOT)
    x_in = cx - rx + 0.2
    x_top = sleeve_ref.sx
    for side in (1, -1):
        a = Vector((side * x_top, 0, bc.Z(bc.SEAM_TOP)))
        b = Vector((side * x_in, 0, bc.Z(bc.SEAM_BOT)))
        d = (a - b).normalized()
        n = Vector((d.z * side, 0, -d.x * side)).normalized()
        if n.x * side < 0:
            n = -n
        for ob, keep_out, zmin in ((sleeves, True, bc.SEAM_BOT - 2.0), (coat, False, bc.SEAM_BOT - 0.1)):
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            geom_f = [f for f in bm.faces if f.calc_center_median().x * side > 2.0 and f.calc_center_median().z > bc.Z(zmin)]
            vs = {v for f in geom_f for v in f.verts}
            es = {e for f in geom_f for e in f.edges}
            res = bmesh.ops.bisect_plane(bm, geom=list(vs) + list(es) + geom_f, plane_co=a, plane_no=n,
                                         clear_inner=keep_out, clear_outer=not keep_out)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
            bm.to_mesh(ob.data)
            bm.free()


def smooth_boundary(ob, iters=40):
    """Straighten ragged cut edges near the armholes: boundary vertices are smoothed along the
    boundary, and the first rings inside follow, so the cut reads as a clean line."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    near = lambda v: abs(v.co.x) > 4.5 and v.co.z > bc.Z(bc.SEAM_BOT - 2.5) and v.co.z < bc.Z(1.5)
    bnd = [v for v in bm.verts if v.is_boundary and near(v)]
    nb = {v.index: [e.other_vert(v) for e in v.link_edges if e.is_boundary] for v in bnd}
    for _ in range(iters):
        new = {}
        for v in bnd:
            ns = nb[v.index]
            if len(ns) == 2:
                new[v.index] = v.co * 0.5 + (ns[0].co + ns[1].co) * 0.25
        for i, c in new.items():
            bm.verts[i].co = c
    # relax the first rings so the faces next to the edge follow
    ring = {v.index for v in bnd}
    inner = set()
    for v in bnd:
        for e in v.link_edges:
            o = e.other_vert(v)
            if o.index not in ring:
                inner.add(o.index)
    for _ in range(10):
        for i in inner:
            v = bm.verts[i]
            ns = [e.other_vert(v).co for e in v.link_edges]
            v.co = v.co * 0.5 + sum(ns, Vector()) / len(ns) * 0.5
    bm.to_mesh(ob.data)
    bm.free()


def lift_sleeve_head(sleeves, coat, lift=0.12, reach=2.5):
    """Near the armhole the sleeve must lie on top of the body cloth (otherwise the two surfaces cross
    and show a jagged line): push any sleeve point that is under the body out past it."""
    bpy.context.view_layer.update()
    bvh = bc.bvh_of([coat])
    me = sleeves.data
    me.calc_normals_split() if hasattr(me, "calc_normals_split") else None
    for v in me.vertices:
        c = v.co
        if abs(c.x) < 4.5 or c.z < bc.Z(bc.SEAM_BOT - reach):
            continue
        side = 1 if c.x > 0 else -1
        # nearest body point and which side of it we are on
        loc, nrm, _, d = bvh.find_nearest(c)
        if loc is None or d > 1.2:
            continue
        nrm = Vector(nrm)
        if nrm.dot(Vector((loc.x, loc.y, 0))) < 0:
            nrm = -nrm
        depth = (c - loc).dot(nrm)
        if depth < lift:
            v.co = c + nrm * (lift - depth)
    me.update()


def tuck_armhole_edge(coat, torso, rings=8, depth=1.0):
    """Pull the coat body's armhole edge (and a few rings in from it) inward, under the sleeve."""
    bm = bmesh.new()
    bm.from_mesh(coat.data)
    bm.verts.ensure_lookup_table()
    edge = {v.index for v in bm.verts if v.is_boundary and abs(v.co.x) > 4.5
            and bc.SEAM_BOT - 1.5 < v.co.z - bc.SH < 1.5}
    dist = {i: 0 for i in edge}
    front = set(edge)
    for r in range(1, rings + 1):
        nxt = set()
        for i in front:
            for e in bm.verts[i].link_edges:
                j = e.other_vert(bm.verts[i]).index
                if j not in dist:
                    dist[j] = r
                    nxt.add(j)
        front = nxt
    for i, r in dist.items():
        v = bm.verts[i]
        w = 1 - r / (rings + 1)
        cy = torso.section(v.co.z - bc.SH)[1]
        rad = Vector((v.co.x, v.co.y - cy, 0))
        if rad.length > 1e-6:
            v.co -= rad.normalized() * depth * w * w
    bm.to_mesh(coat.data)
    bm.free()


def clear_body(coat, man, gap=0.3, iters=3):
    """Keep the cloth outside the mannequin: points under or too close to the skin are pushed out
    along its normal, then the push is smoothed over the neighbours so nothing dents."""
    bpy.context.view_layer.update()
    bvh = bc.bvh_of([man])
    me = coat.data
    nb = neighbours(me)
    co = np.array([v.co[:] for v in me.vertices])
    for _ in range(iters):
        push = np.zeros_like(co)
        for i, c in enumerate(co):
            loc, nrm, _, d = bvh.find_nearest(Vector(c))
            if loc is None or d > gap + 0.5:
                continue
            n = Vector(nrm)
            depth = (Vector(c) - loc).dot(n)
            if depth < gap:
                push[i] = np.array(n) * (gap - depth)
        for _ in range(4):
            push = np.array([np.maximum(push[i], 0) * 0 + push[i] if np.any(push[i]) else
                             (push[nb[i]].mean(axis=0) * 0.7 if len(nb[i]) else 0) for i in range(len(co))])
        co = co + push
    for i, v in enumerate(me.vertices):
        v.co = co[i]
    me.update()


def relax_underarm(coat, iters=25):
    """Smooth the cloth where sleeve and body meet under the arm (front and back), where the mapped
    surfaces fold over each other."""
    me = coat.data
    nb = neighbours(me)
    co = np.array([v.co[:] for v in me.vertices])
    dz = co[:, 2] - bc.SH
    ax = np.abs(co[:, 0])
    w = smoothstep(4.8, 6.0, ax) * (1 - smoothstep(9.5, 10.5, ax)) * smoothstep(bc.SEAM_BOT - 2.0, bc.SEAM_BOT, dz) \
        * (1 - smoothstep(-2.0, -0.8, dz))
    idx = np.where(w > 0)[0]
    for _ in range(iters):
        avg = np.array([co[nb[i]].mean(axis=0) if len(nb[i]) else co[i] for i in idx])
        co[idx] += (avg - co[idx]) * (0.6 * w[idx, None])
    for i in idx:
        me.vertices[i].co = co[i]
    me.update()


def shoulder_loops(coat, sleeve_ref, width=1.75):
    """AGSU shoulder loops: from the collar edge out to the shoulder seam along the top of the
    shoulder, pointed at the collar end with a button there."""
    bpy.context.view_layer.update()
    bvh = bc.bvh_of([coat])

    def top_at(x):
        """y of the shoulder's ridge (highest cloth) at x, and its height"""
        best = None
        for k in range(61):
            y = -3.0 + 7.0 * k / 60
            hit = bc.cast(bvh, Vector((x, y, 80.0)), Vector((0, 0, -1)))
            if hit and (best is None or hit[0].z > best[1]):
                best = (y, hit[0].z)
        return best

    for side in (1, -1):
        # the collar's outer edge: where the cloth surface steps down from the collar onto the shoulder
        prof = [(x, top_at(side * x)) for x in [3.5 + 0.1 * k for k in range(50)]]
        prof = [(x, t) for x, t in prof if t]
        x0 = 4.6
        for (xa_, ta), (xb_, tb) in zip(prof, prof[1:]):
            if ta[1] - tb[1] > 0.25:  # a step down: the collar edge
                x0 = xb_ + 0.2
        x1 = sleeve_ref.sx - 0.3
        ys = {x: t[0] for x, t in prof}
        # a straight centre line along the top of the shoulder (fit to the ridge)
        px = np.array([p_[0] for p_ in prof if x0 <= p_[0] <= x1])
        py = np.array([p_[1][0] for p_ in prof if x0 <= p_[0] <= x1])
        k_, b_ = np.polyfit(px, py, 1) if len(px) > 2 else (0.0, 0.5)
        ridge = lambda x: k_ * x + b_
        w = width / 2
        xs = np.linspace(x0, x1, 12)
        top = [(x, ridge(x) - w) for x in xs]
        bot = [(x, ridge(x) + w) for x in xs[::-1]]
        outline = [(x0 - 0.45, ridge(x0))] + top + bot  # pointed at the collar end
        outline = [(side * x, y) for x, y in outline]
        if side < 0:
            outline = outline[::-1]
        bc.panel(f"Loop{side}", outline, bvh, 0.12, 0.12, "coat", from_above=True, step=0.1)
        bx = x0 + 0.25
        hit = bc.cast(bvh, Vector((side * bx, ridge(bx), 80.0)), Vector((0, 0, -1)))
        if hit:
            p, n = hit
            n = n if n.z > 0 else -n
            bc.button(f"LoopButton{side}", p + n * 0.3, n, 0.6, h=0.13)
        print("loop", side, "x0", round(x0, 2), "x1", round(x1, 2))


def neck_stub():
    """Dress-form neck filling the shirt collar (the mannequin's own neck is cut below the jaw)."""
    nv, nf, ncols = [], [], 64
    for rx, ry, z in ((2.55, 2.35, 1.4), (2.55, 2.35, 2.75), (2.35, 2.15, 2.9), (0.0, 0.0, 2.92)):
        for c in range(ncols):
            t = 2 * math.pi * c / ncols
            nv.append(Vector((rx * math.cos(t), 0.45 + ry * math.sin(t), bc.Z(z))))
    for r in range(3):
        for c in range(ncols):
            q, q2 = r * ncols + c, r * ncols + (c + 1) % ncols
            nf.append((q, q2, q2 + ncols, q + ncols))
    neck = bc.mesh_object("NeckStub", nv, nf, "man")
    bc.fix_normals(neck, outward=True)


def contain_sleeves(NEW, Q, w_sleeve, man_arm):
    """Grow each sleeve just enough (smoothly, along its length) to clear the mannequin's arm."""
    out = NEW.copy()
    for s in (1, -1):
        sel = (w_sleeve > 0.5) & (np.sign(Q[:, 0]) == s)
        arm = man_arm[np.sign(man_arm[:, 0]) == s]
        zs = np.arange(bc.Z(bc.CUFF_DZ) + 0.6, bc.Z(-1.0), 0.5)
        ks = []
        for z in zs:
            ring = NEW[sel & (np.abs(NEW[:, 2] - z) < 0.3)]
            pts = arm[np.abs(arm[:, 2] - z) < 0.3]
            if len(ring) < 12 or not len(pts):
                ks.append(1.0)
                continue
            c = ring[:, :2].mean(axis=0)
            ra = np.arctan2(ring[:, 1] - c[1], ring[:, 0] - c[0])
            rr = np.linalg.norm(ring[:, :2] - c, axis=1)
            bins = np.zeros(36)
            for a_, r_ in zip(ra, rr):
                k = int((a_ + np.pi) / (2 * np.pi) * 36) % 36
                bins[k] = max(bins[k], r_)
            pa = np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0])
            pr = np.linalg.norm(pts[:, :2] - c, axis=1)
            need = 1.0
            for a_, r_ in zip(pa, pr):
                k = int((a_ + np.pi) / (2 * np.pi) * 36) % 36
                if bins[k] > 0.5:
                    need = max(need, (r_ + 0.3) / bins[k])
            ks.append(min(need, 1.3))
        ks = np.array(ks)
        ks = np.convolve(np.pad(ks, 3, mode="edge"), np.ones(7) / 7, mode="valid")
        print("sleeve growth", s, np.round(ks.max(), 3))
        ii = np.where(sel)[0]
        k_v = np.interp(NEW[ii, 2], zs, ks)
        # scale about each height's ring centre
        for j, i in enumerate(ii):
            z = NEW[i, 2]
            ring = NEW[sel & (np.abs(NEW[:, 2] - z) < 0.3)]
            c = ring[:, :2].mean(axis=0)
            out[i, 0] = c[0] + (NEW[i, 0] - c[0]) * k_v[j]
            out[i, 1] = c[1] + (NEW[i, 1] - c[1]) * k_v[j]
    return out


if __name__ == "__main__":
    main()
