export type WalkStamp = {
  model: string;
  height: number;
  fit?: 'height' | 'width';
};

/** Trunk-only. Canopies are visual; walking under them must stay open. */
export const TREE_TRUNK_RADIUS = 0.4;

/** Bushes, flowers, grass: walk through. Trees stay solid at the trunk. */
export function isWalkFoliage(model: string): boolean {
  if (model === 'grass_a' || model === 'grass_b' || model.startsWith('lp_bush')) return true;
  return (
    model === 'verdant-glow' ||
    model === 'garden-blooms' ||
    model === 'neon-leaves' ||
    model === 'vibrant-bloom' ||
    model === 'neon-bloom' ||
    model === 'blooming-bush' ||
    model === 'emerald-cascade' ||
    model === 'red-mushroom' ||
    model === 'luminous-canopy' ||
    model === 'whimsy-bloom-coral' ||
    model === 'blossomback-tortoise' ||
    model === 'pebble-blossom' ||
    model === 'moonlit-glow' ||
    model === 'spiral-garden' ||
    model === 'voxel-bloom-garden' ||
    model === 'voxel-verdant-garden'
  );
}

export function isWalkTree(model: string): boolean {
  return (
    model === 'giant-tree' ||
    model === 'sunlit-canopy' ||
    model === 'whimsywood-tree' ||
    model === 'blossom-tree' ||
    model === 'lantern-leaf-tree' ||
    model === 'voxel-tree' ||
    model === 'voxel-blossom-tree' ||
    model === 'voxel-evergreen' ||
    model === 'voxel-blossom-canopy' ||
    model.startsWith('lp_tree') ||
    model.startsWith('lp_pine')
  );
}

export function isWalkHouse(model: string): boolean {
  return (
    model === 'mossy-burrow' ||
    model === 'mossflower-hollow' ||
    model === 'acorn-cottage' ||
    model === 'mushroom-lantern'
  );
}

/** Sit trees and houses on the lawn, not in the grass texture. */
export function stampGroundLift(model: string): number {
  if (model === 'timber-bridge') return 0.07;
  if (isWalkTree(model) || isWalkHouse(model)) return 0.12;
  return 0.04;
}

/** Click-Y from the lawn. Skip a live mesh ray if the stamp already stored it. */
export function authoredGroundY(
  prop: { y?: number },
  fallback: () => number,
): number {
  return Number.isFinite(prop.y) ? prop.y! : fallback();
}

/**
 * Only trunks and houses stamp the walk grid. Ponds still block via
 * `pondRadius`. Rocks, bushes, flowers, fences and benches are open.
 */
export function walkThrough(model: string): boolean {
  return !isWalkTree(model) && !isWalkHouse(model);
}

/**
 * Fallback radius when the mesh is not loaded. Prefer `placedWalkRadius`
 * so a burrow uses its real footprint, not a guess.
 */
export function walkFootprint(prop: WalkStamp): number {
  if (walkThrough(prop.model)) return 0;
  if (isWalkTree(prop.model)) return TREE_TRUNK_RADIUS;
  if (isWalkHouse(prop.model)) return 1.1;
  return 0;
}

/** Trunk disc for trees. Houses use a modest disc, never the full canopy. */
export function placedWalkRadius(
  prop: WalkStamp,
  modelSize: { x: number; y: number; z: number },
): number {
  if (walkThrough(prop.model)) return 0;
  if (isWalkTree(prop.model)) return TREE_TRUNK_RADIUS;
  const modelWidth = Math.max(modelSize.x, modelSize.z);
  const unit =
    prop.fit === 'width'
      ? modelWidth > 1e-4
        ? 1 / modelWidth
        : 1
      : modelSize.y > 1e-4
        ? 1 / modelSize.y
        : 1;
  const scale = prop.height * unit;
  const span = modelWidth * scale;
  return Math.min(1.2, Math.max(0.7, span * 0.34));
}

/** Collision disc for a lotus pond: water plus a thin rim. */
export function pondRadius(prop: WalkStamp): number {
  return prop.height * 0.55;
}

/** Extra blocked lawn around the water so feet do not clip the surface. */
export const POND_WALK_MARGIN = 0.2;
