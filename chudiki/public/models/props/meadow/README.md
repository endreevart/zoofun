Local Meshy pack for the hanging meadow (`meadow` kind: free «Висячий луг»,
paid `world_diy_meadow`). Studio still opens `?studio=1&kind=meadow`.

The hanging isle is the raw Meshy dump (~94 MB, gitignored). Copy it onto the
island Docker build host; git will not carry it. Its lawn is thin discs:
COLLAPSE and even PLANAR punch sky through the grass. Stamps (trees, beds,
houses) still go through `scripts/optimize-prop-glb.py` from iCloud originals.

```text
whimsy-isle.glb            Meshy_AI_Whimsy_Meadow_Isle_*   raw (no decimate)
whimsywood-tree.glb        Meshy_AI_Whimsywood_Tree_*      --ratio 0.028
blossom-tree.glb           Meshy_AI_Whimsical_Blossom_Tre_* --ratio 0.028
lantern-leaf-tree.glb      Meshy_AI_Lantern_Leaf_Tree_*    --ratio 0.028
luminous-canopy.glb        Meshy_AI_Luminous_Canopy_*      --ratio 0.08 (petals)
whimsy-bloom-coral.glb     Meshy_AI_Whimsy_Bloom_Coral_*    --ratio 0.08 (petals)
blossomback-tortoise.glb   Meshy_AI_Blossomback_Tortoise_*  --ratio 0.08 (petals)
pebble-blossom.glb         Meshy_AI_Pebble_Blossom_Garden_* --ratio 0.08 (beds)
moonlit-glow.glb           Meshy_AI_Moonlit_Glow_Garden_*   --ratio 0.08 (beds)
spiral-garden.glb          Meshy_AI_Spiral_Garden_Path_*    --ratio 0.08 (beds)
acorn-cottage.glb          Meshy_AI_Acorn_Cottage_*         --ratio 0.025
mushroom-lantern.glb       Meshy_AI_Mushroom_Lantern_Cott_* --ratio 0.025
```

`--max-image 1024`. `--no-recalc-normals`. Do not run a second collapse
on the output. Flower beds at `--ratio 0.01` turn into triangle shards;
0.08 is the same ballpark as the trees.

Phone builds use `whimsy-isle-mobile.glb` plus the files in `mobile/`.
The geometry is identical to the reviewed files. Stamp textures are resized to
512 px; the hero isle keeps 1024 px textures. Lower-poly isle candidates were
rejected because visual QA exposed lawn facets or holes. Desktop keeps every
reviewed file above; development can force it with
`?quality=low&assetLod=full` for A/B screenshots.
