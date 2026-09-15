Mobile texture variants for the authored garden props.

Geometry is unchanged from the sibling GLB in `../`. Embedded textures are
resized to 512 px, except `giant-tree.glb` at 1024 px because it is a hero prop.
The low quality tier selects the `*-gpu.glb` siblings (KTX2 ETC1S + Meshopt)
from `scripts/pack-gpu-glb.sh garden`. Desktop keeps the reviewed originals.
Use `?quality=low&assetLod=full` in development for A/B screenshots.
