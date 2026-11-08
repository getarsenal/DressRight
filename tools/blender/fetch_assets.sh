#!/usr/bin/env bash
# Downloads the CC0 assets the coat builder uses into tools/blender/assets (git-ignored).
#  - Blender Foundation "Human Base Meshes" bundle (CC0; realistic male body by Dan Ulrich)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p assets
if [ ! -f assets/human_base_meshes_bundle.blend ]; then
  curl -fsSL -o assets/hbm.zip https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
  unzip -o -q -j assets/hbm.zip 'human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend' -d assets
  rm assets/hbm.zip
fi
echo "assets ready"
