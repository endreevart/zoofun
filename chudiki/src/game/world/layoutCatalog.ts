/** Stamp models for the garden island kind. A later kind brings its own list. */
export const CATALOG_MODELS = [
  'sunlit-canopy',
  'verdant-glow',
  'garden-blooms',
  'neon-leaves',
  'vibrant-bloom',
  'neon-bloom',
  'blooming-bush',
  'harvest-cradle',
  'emerald-cascade',
  'grass_a',
  'grass_b',
  'mosslit-stones',
  'wooden-fence',
  'red-mushroom',
  'rustic-bench',
  'lotus-pond',
  'timber-bridge',
  'mossy-burrow',
  'garden-gate',
  'mossflower-hollow',
  'wooden-lantern',
  'giant-tree',
  'lp_tree_01',
  'lp_tree_02',
  'lp_tree_03',
  'lp_tree_04',
  'lp_pine_01',
  'lp_pine_02',
  'lp_bush_01',
  'lp_bush_02',
  'lp_bush_bloom_01',
  'rock_medium_01',
  'rock_small_01',
];

export const GRASS_MODELS = new Set(['grass_a', 'grass_b']);

/**
 * Studio catalog for the hanging meadow. Shop still uses the garden list
 * until this kind is a product decision.
 */
export const MEADOW_CATALOG_MODELS = [
  'whimsywood-tree',
  'blossom-tree',
  'lantern-leaf-tree',
  'luminous-canopy',
  'whimsy-bloom-coral',
  'blossomback-tortoise',
  'pebble-blossom',
  'moonlit-glow',
  'spiral-garden',
  'acorn-cottage',
  'mushroom-lantern',
  'mosslit-stones',
  'rock_medium_01',
  'rock_small_01',
  'lp_tree_01',
  'lp_tree_02',
  'lp_tree_03',
  'lp_tree_04',
  'lp_pine_01',
  'lp_pine_02',
  'lp_bush_01',
  'lp_bush_02',
  'lp_bush_bloom_01',
];

/** Stamp list for Куболесье (`grove` / `world_diy_grove`). */
export const GROVE_CATALOG_MODELS = [
  'voxel-tree',
  'voxel-blossom-tree',
  'voxel-evergreen',
  'voxel-blossom-canopy',
  'voxel-bloom-garden',
  'voxel-verdant-garden',
  'lp_tree_01',
  'lp_tree_02',
  'lp_tree_03',
  'lp_tree_04',
  'lp_pine_01',
  'lp_pine_02',
  'lp_bush_01',
  'lp_bush_02',
  'lp_bush_bloom_01',
  'mosslit-stones',
  'rock_medium_01',
  'rock_small_01',
  'wooden-lantern',
  'rustic-bench',
  'red-mushroom',
];

export function catalogForShell(shell: string): readonly string[] {
  if (shell === 'meadow') return MEADOW_CATALOG_MODELS;
  if (shell === 'grove') return GROVE_CATALOG_MODELS;
  return CATALOG_MODELS;
}

/** Child DIY catalog: plants, houses, objects. The lawn is already on the island. */
export function childCatalogForShell(shell: string): readonly string[] {
  return catalogForShell(shell).filter((name) => !GRASS_MODELS.has(name));
}

export const CHILD_CATALOG_MODELS = childCatalogForShell('garden');

export const DIY_PROP_CAP = 258;

export type CatalogGroupId = 'plants' | 'houses' | 'objects';

const HOUSE_MODELS = new Set([
  'mossy-burrow',
  'mossflower-hollow',
  'garden-gate',
  'acorn-cottage',
  'mushroom-lantern',
]);
const OBJECT_MODELS = new Set([
  'harvest-cradle',
  'mosslit-stones',
  'wooden-fence',
  'rustic-bench',
  'lotus-pond',
  'timber-bridge',
  'wooden-lantern',
  'rock_medium_01',
  'rock_small_01',
]);

export function catalogGroup(model: string): CatalogGroupId {
  if (HOUSE_MODELS.has(model)) return 'houses';
  if (OBJECT_MODELS.has(model)) return 'objects';
  return 'plants';
}
