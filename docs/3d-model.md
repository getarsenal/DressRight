# Building a real coat model in Blender

## Current pipeline (male AGSU and ASU coats)

The male coats are built in Blender by `tools/blender/block_coat.py` from a front-view reference drawing. It replaces the
cloth-simulated `coat.py`, which produced bunched, overlapping cloth.

```sh
tools/blender/fetch_assets.sh                     # CC0 Human Base Meshes body (Blender Foundation)
python tools/blender/block_coat.py --stage agsu --export public/models/coat-agsu-male.glb --ref <drawing.png>
python tools/blender/block_coat.py --uniform ASU --stage asu --export public/models/coat-asu-male.glb
tools/blender/compress.sh public/models/coat-*.glb   # meshopt, about 5x smaller
```

How the builder works (no cloth simulation):
- **Torso:** a stack of rounded-box sections. The width at each height is measured off the drawing (44.6 px/in, center
  x = 603 px, collar top y = 610 px). Depth comes from the mannequin plus ease, and every section keeps clearance over the body.
- **Sleeves:** straight tubes on the drawing's outer and inner edge lines, kept clear of the mannequin's arm and smoothed
  along their length.
- **Details:** the collar band, shirt collar, lapels, tie, pockets, flaps, belt (V-dip in front), keeper, buckle,
  buttons and loops are cut from outlines measured on the drawing, laid onto those surfaces and given thickness.
- **Comparison render:** `--ref` also renders an orthographic front view in the drawing's frame, for side-by-side
  comparison.

The GLB keeps the same contract: origin at the top button, inches, and `dr_arm_*` anchors along each sleeve axis.

In the app, `src/three/glbCoat.ts` loads the model and implements `BodySurface` by BVH ray-casting. While the block coat is
being refined, insignia are switched off on the sculpted coat (`SCULPTED_INSIGNIA` in `src/three/Coat.tsx`). Female coats still
use the procedural body.


## Purchased base model (current male and female AGSU)

The AGSU coats now start from a purchased model: CGTrader's "Uniform of the United States army", in OBJ format. It's a
women's-cut belted service coat in a T-pose. The raw files are licensed for use, not redistribution, so they never enter the
repo; only the processed, compressed GLBs ship.

```sh
python tools/blender/asset_coat.py --obj <uniform.obj> --sex male   --export public/models/coat-agsu-male.glb
python tools/blender/asset_coat.py --obj <uniform.obj> --sex female --export public/models/coat-agsu-female.glb
tools/blender/compress.sh public/models/coat-agsu-*.glb
```

- **`asset_load.py`:** normalises the model to our frame (inches, front -Y) and drops the trousers, boots, cap and placeholder insignia.
- **Male:**
  - The model's detail is kept: lapels, collar, shirt and tie, flaps, belt, buttons and folds. Each surface is split into
    a smooth shape plus the detail on top of it. The smooth shape is mapped onto the verified block coat
    (`block_coat.py`), and the detail is added back.
  - The sleeves are the block coat's straight sleeves, ending in a square cuff. The armhole seam is drawn at the
    shoulder seam, and its top is exported as `dr_seam_L/R`.
- **Female:** the model's own shape, with the arms bent down at the shoulder.

The full contract below is the target for hand-built models.

DressRight currently draws the coat procedurally (`src/three/body.ts`): the torso is built from mathematical cross-sections, with sloped
shoulders, waist suppression and curved sleeves. That's good enough to place insignia correctly and wrap them onto the cloth. It will
never look like a tailored garment, though. This guide covers how to build a sculpted model that drops into the app.

There's no free, accurately tailored AGSU/ASU model available, so the plan below is to build one.

## How the app uses a model

All insignia placement is computed by `src/regs/layout.ts` in **inches**, from the regulation's measurements, relative to a few reference
points: pocket tops, lapel notch, shoulder seams and sleeve bottoms. The 3D code then asks a `BodySurface` where the cloth is at a given
point and wraps each decal onto it (`src/three/body.ts`):

```ts
interface BodySurface {
  front(x, y): { pos, normal }               // coat front at (x, y)
  sleeve(side, along, around): { pos, normal } // `along` inches below the shoulder seam
  shoulder(side, t): { pos, normal }          // top of the shoulder loop
}
```

A Blender model replaces the procedural body by implementing this interface with ray casts against the mesh, plus the anchor points
below. The regulation logic doesn't change, so swapping models can't break the rules.

## The contract

### Units, orientation, origin
- **1 Blender unit = 1 inch.** In Blender, set Scene Properties › Units › Unit Scale to `0.0254` with Length set to Inches, or simply model at
  inch scale and export with "+Y up".
- **Front of the coat faces +Y in Blender** (exported as +Z in glTF). The **wearer's left is +X**.
- **Origin**: on the coat's centerline, at the height of the **top button**.
- Model a size-40-regular (male) / 12-regular (female) coat on a neutral mannequin, neck stub only.

### Required anchor points (Empties)
Add these as Empties (Add › Empty › Plain Axes) parented to the coat. The app reads them by name. `_L` = wearer's left (+X), `_R` = wearer's right.

| Empty name | Where to put it |
| --- | --- |
| `dr_pocket_top_L`, `dr_pocket_top_R` | Center of the top edge of each breast pocket (on the cloth surface) |
| `dr_pocket_flap_button_L/_R` | Center of each breast-pocket flap button |
| `dr_pocket_bottom_L/_R` | Center of the bottom edge of each breast pocket |
| `dr_notch_L`, `dr_notch_R` | The lapel notch point (where collar meets lapel) |
| `dr_button_top` | Center of the top front button |
| `dr_shoulder_seam_L/_R` | Top of each shoulder seam (where the SSI is measured from) |
| `dr_loop_neck_L/_R`, `dr_loop_seam_L/_R` | Each shoulder loop's button end and seam end |
| `dr_elbow_L/_R` | Sleeve elbow, on the outer surface |
| `dr_cuff_L/_R` | Bottom edge of each sleeve, outer surface center |
| `dr_waist` | Front waistline at center (female ASU ID-badge rule) |

The female ASU coat has no breast pockets. Omit the pocket Empties and add `dr_nameplate_center_R` instead, 1 to 2 inches above the top button.

### Mesh and materials
- Separate objects named `coat_body`, `coat_sleeve_L`, `coat_sleeve_R`, `coat_lapels`, `pocket_flaps`, `buttons`, `shirt_tie` (shirt and tie visible in the V).
- Keep `coat_body`, the sleeves and the lapels **manifold, quad-based and evenly spaced**. Insignia are ray-cast onto these, so avoid
  thin overlapping shells right where insignia go (pocket flaps, lapels, upper sleeves).
- Materials: `fabric` (one material; the app tints it AGSU green or ASU blue), `brass` (buttons), `shirt`, `tie`. Use PBR (Principled BSDF)
  with a tileable twill normal map. Keep textures ≤ 2048 px.
- Budget: ≤ 60k triangles total; it needs to run on phones.
- Build both the **AGSU** coat (bellows breast pockets with pointed flaps, lower flapped pockets, belt with buckle) and the **ASU** coat
  (flapped breast pockets, lower flapped pockets, no belt). Male and female cuts differ, so that's four models in total. Start with the male AGSU.

### Export
File › Export › glTF 2.0 (`.glb`):
- Format: glTF Binary; Include: Selected Objects + **Custom Properties**; Transform: **+Y Up**.
- Mesh: Apply Modifiers, UVs, Normals; Compression: **Draco** on.
- Save to `public/models/coat-agsu-male.glb` (also `coat-agsu-female.glb`, `coat-asu-male.glb`, `coat-asu-female.glb`).

## Suggested workflow

1. **Base mesh**: start from a mannequin torso, or a CC0 base mesh such as those on Poly Haven or Blender's own human base meshes
   (check the license). Scale it to inches.
2. **Garment**: Marvelous Designer or Blender's cloth simulation works well. Draw the coat pattern pieces (front, back, side panels,
   two-piece sleeve, collar, lapel facing), sew them, simulate onto the mannequin, then retopologize to clean quads.
3. **Tailoring details**: pockets, flaps, belt, buttons and seams as separate geometry; shrink-wrap the flaps to the body with a small offset.
4. **Reference**: DA PAM 670-1 figures and photos of real coats. Pocket and button positions matter, because the regulation measures from them.
5. **Anchors**: add the Empties above. Check them against a ruler: e.g. the breast pocket top on a size 40R is about 4–5 inches above the top button.
6. Export and drop the files into `public/models/`.

When a `.glb` is present, the next step is a `glbSurface()` that implements `BodySurface` by ray casting, with anchors overriding
`coatGeometry()`. It isn't written yet, because it needs a real model to test against.
