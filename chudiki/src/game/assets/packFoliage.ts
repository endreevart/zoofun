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
