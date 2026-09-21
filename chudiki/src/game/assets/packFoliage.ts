/** Packed extras whose mesh is foliage, not bark, dirt or a hanging lawn. */
const PACKED_FOLIAGE = new Set([
  'giant-tree',
  'sunlit-canopy',
  'verdant-glow',
  'garden-blooms',
  'neon-leaves',
  'vibrant-bloom',
  'neon-bloom',
  'blooming-bush',
  'emerald-cascade',
  'mossflower-hollow',
  'red-mushroom',
  'whimsywood-tree',
  'blossom-tree',
  'lantern-leaf-tree',
  'luminous-canopy',
  'whimsy-bloom-coral',
  'blossomback-tortoise',
  'pebble-blossom',
  'moonlit-glow',
  'spiral-garden',
]);

export function isPackedFoliage(name: string): boolean {
  return PACKED_FOLIAGE.has(name);
}

/** Hanging worlds: desktop high still cannot swallow the raw Meshy dumps. */
const HEAVY_PACKED = new Set([
  'whimsy-isle',
  'floating-grassland',
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
  'voxel-tree',
  'voxel-blossom-tree',
  'voxel-evergreen',
  'voxel-blossom-canopy',
  'voxel-bloom-garden',
  'voxel-verdant-garden',
  'blockstone-peaks',
]);

export function usePackedExtra(name: string, tier: 'high' | 'low'): boolean {
  return tier === 'low' || HEAVY_PACKED.has(name);
}
