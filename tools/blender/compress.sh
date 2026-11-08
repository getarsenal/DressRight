#!/usr/bin/env bash
# Meshopt-compress exported coats for the web (~4x smaller). The app's loader
# registers the meshopt decoder. Usage: tools/blender/compress.sh public/models/coat-*.glb
set -euo pipefail
for f in "$@"; do
  tmp="$(mktemp --suffix=.glb)"
  npx --yes @gltf-transform/cli@4.1.1 meshopt "$f" "$tmp"
  mv "$tmp" "$f"
done
