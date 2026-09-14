Local Meshy pack for Куболесье (`grove` kind: free authored lawn,
paid `world_diy_grove`). Studio still opens `?studio=1&kind=grove`.

The hanging isle is the raw Meshy dump (~114 MB, gitignored). Copy it onto
the island Docker build host as `floating-grassland.glb`; git will not
carry it. Its lawn is thin: COLLAPSE punches sky through the grass.

Voxel stamps are cubes. COLLAPSE at 0.028 tears them apart. `voxel-tree`
used PLANAR 8° (3.0M → 252k). The rest are one COLLAPSE at 0.15 from the
iCloud original (~450k faces).

```text
floating-grassland.glb     Meshy_AI_Floating_Grassland_Is_*   raw (no decimate)
voxel-tree.glb             Meshy_AI_Voxel_Tree_*              --planar 8
voxel-blossom-tree.glb     Meshy_AI_Voxel_Blossom_Tree_*     --ratio 0.15
voxel-evergreen.glb        Meshy_AI_Voxel_Evergreen_*       --ratio 0.15
voxel-blossom-canopy.glb   Meshy_AI_Voxel_Blossom_Canopy_*   --ratio 0.15
voxel-bloom-garden.glb     Meshy_AI_Voxel_Bloom_Garden_*     --ratio 0.15
voxel-verdant-garden.glb   Meshy_AI_Voxel_Verdant_Garden_*   --ratio 0.15
```

`--max-image 1024`. `--no-recalc-normals`. Do not run a second collapse
on the output. After placing stamps in the studio, download JSON into
`public/layout/grove-layout.json`.

Phone builds select the sibling `*-mobile.glb` files. Their geometry was
generated in one pass from the original iCloud Meshy exports at `--ratio 0.05`;
their embedded textures are 512 px. The hanging island uses the more
conservative `--ratio 0.25` and 1024 px textures. Desktop keeps the reviewed
files above. In development `?quality=low&assetLod=full` forces the full files
for repeatable A/B screenshots.
