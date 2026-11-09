#!/usr/bin/env bash
# Meshopt-compress exported coats for the web (~4x smaller). The app's loader
# registers the meshopt decoder. Usage: tools/blender/compress.sh public/models/coat-*.glb
set -euo pipefail
for f in "$@"; do
  tmp="$(mktemp --suffix=.glb)"
  # 16-bit positions and normals: coarser grids show as banding on the large smooth panels
  npx --yes @gltf-transform/cli@4.1.1 meshopt "$f" "$tmp" --quantize-position 16 --quantize-normal 16
  mv "$tmp" "$f"
done
