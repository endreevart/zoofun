#!/usr/bin/env bash
# Copies the subset of Kenney's CC0 Nature Kit that this game actually uses.
# Source pack: https://kenney.nl/assets/nature-kit (Creative Commons Zero).
set -euo pipefail

SRC="${1:-/tmp/kenney/unpacked/Models/GLTF format}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/models/nature"
mkdir -p "$DEST"

MODELS=(
  tree_default tree_default_dark tree_fat tree_fat_darkh tree_oak tree_oak_dark
  tree_detailed tree_detailed_dark tree_tall tree_tall_dark tree_small
  tree_small_dark tree_plateau tree_thin tree_blocks
  plant_bush plant_bushDetailed plant_bushLarge plant_bushSmall
  plant_bushTriangle plant_bushLargeTriangle plant_flatShort plant_flatTall
  flower_purpleA flower_purpleB flower_purpleC
  flower_redA flower_redB flower_redC
  flower_yellowA flower_yellowB flower_yellowC
  grass grass_large grass_leafs grass_leafsLarge
  rock_largeA rock_largeB rock_largeC rock_largeD
  rock_smallA rock_smallB rock_smallC rock_smallFlatA rock_smallFlatB
  rock_tallA rock_tallB rock_tallC
  stone_largeA stone_largeB stone_smallA stone_smallB stone_smallFlatA
  stone_tallA stone_tallB
  mushroom_red mushroom_redGroup mushroom_tan mushroom_tanGroup
  log log_large log_stack
  fence_simple fence_simpleCenter fence_simpleLow fence_gate fence_planks
  fence_bend fence_corner
  bridge_wood bridge_center_wood bridge_side_wood
  path_stone path_stoneCircle path_wood
  sign tent_smallOpen statue_column crops_cornStageC hanging_moss
  campfire_logs canoe
)

missing=0
for name in "${MODELS[@]}"; do
  if [ -f "$SRC/$name.glb" ]; then
    cp "$SRC/$name.glb" "$DEST/"
  else
    echo "missing: $name"
    missing=$((missing + 1))
  fi
done

if [ -f "$(dirname "$SRC")/../License.txt" ]; then
  cp "$(dirname "$SRC")/../License.txt" "$DEST/KENNEY-LICENSE.txt"
fi

echo "copied $(ls -1 "$DEST"/*.glb | wc -l | tr -d ' ') models, $missing missing"
du -sh "$DEST"
