"""
Load the purchased uniform model (CGTrader "Uniform of the United States army", OBJ) and
normalise it into the coat builder's frame: inches, Z up, front = -Y, wearer's left = +X.

The source files are licensed for use, not redistribution: keep them out of the repository
(tools/blender/assets/ is git-ignored) and ship only the processed, compressed coat.
"""
import math
import bmesh
import bpy
from mathutils import Matrix

MM_TO_IN = 1 / 25.4
COAT_OBJECTS = ("Military_uniform", "cinto", "bordado_R", "bordado_L", "boton_R", "boton_L")
DROP_OBJECTS = ("pants", "Boots", "gorra_militar", "insignia")
DROP_MATERIALS = ("insignia_1", "insignia_2")  # ribbon / badge placeholders


def load_asset(path):
    bpy.ops.wm.obj_import(filepath=path, forward_axis="NEGATIVE_Z", up_axis="Y")
    for n in DROP_OBJECTS:
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    obs = [bpy.data.objects[n] for n in COAT_OBJECTS if n in bpy.data.objects]
    # bake the importer's rotation, turn to face -Y, millimetres -> inches
    fix = Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Scale(MM_TO_IN, 4)
    for ob in obs:
        ob.data.transform(fix @ ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    coat = bpy.context.active_object
    coat.name = "AssetCoat"
    bm = bmesh.new()
    bm.from_mesh(coat.data)
    names = [m.name for m in coat.data.materials]
    dead = [f for f in bm.faces if names[f.material_index] in DROP_MATERIALS]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(coat.data)
    bm.free()
    return coat


def islands(me):
    """Connected pieces: list of (face indices, vertex indices), largest first."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        verts = sorted({v.index for fi in comp for v in bm.faces[fi].verts})
        out.append((comp, verts))
    bm.free()
    out.sort(key=lambda c: -len(c[0]))
    return out
