#!/usr/bin/env bash
# Pack Meshy GLBs for GPU memory: quantization, Meshopt, optional KTX2.
# Does NOT decimate. Meadow lawn holes are why collapse is forbidden.
#
#   scripts/pack-gpu-glb.sh meadow-q      # quantization only (A/B)
#   scripts/pack-gpu-glb.sh meadow-qm     # quantization + Meshopt
#   scripts/pack-gpu-glb.sh meadow-gpu    # + UASTC on the isle
#   scripts/pack-gpu-glb.sh garden        # ETC1S KTX2 on garden mobile props
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK="${GLTFPACK:-gltfpack}"
if ! command -v "$PACK" >/dev/null 2>&1; then
  echo "gltfpack not found. Install meshoptimizer (brew install meshoptimizer) or set GLTFPACK." >&2
  exit 1
fi

meadow_isle="$ROOT/public/models/props/meadow/whimsy-isle-mobile.glb"
cmd="${1:-}"

pack() {
  local src="$1" dest="$2"
  shift 2
  echo "pack $src -> $dest $*"
  "$PACK" -i "$src" -o "$dest" "$@"
}

case "$cmd" in
  meadow-q)
    # Default gltfpack already quantizes (int positions). No Meshopt.
    pack "$meadow_isle" "$ROOT/public/models/props/meadow/whimsy-isle-mobile-q.glb" -vpi
    ;;
  meadow-qm)
    pack "$meadow_isle" "$ROOT/public/models/props/meadow/whimsy-isle-mobile-qm.glb" -vpi -cc
    ;;
  meadow-gpu)
    pack "$meadow_isle" "$ROOT/public/models/props/meadow/whimsy-isle-mobile-gpu.glb" -vpi -cc -tc -tu
    ;;
  garden)
    garden_dir="$ROOT/public/models/props"
    for src in \
      "$garden_dir/floating-island.glb" \
      "$garden_dir/mobile/"*.glb
    do
      [ -f "$src" ] || continue
      dest="${src%.glb}-gpu.glb"
      pack "$src" "$dest" -tc -cc
    done
    ;;
  *)
    echo "usage: $0 meadow-q|meadow-qm|meadow-gpu|garden" >&2
    exit 2
    ;;
esac
