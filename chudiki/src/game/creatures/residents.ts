/** Leftover bundled park ids. They are no longer spawned. */

export function isParkResidentId(id: string): boolean {
  return id.startsWith('resident_');
}

/** Wash, snack-catch, and puzzle: the child's own toy, once it has hatched. */
export function canCarePlay(spec: {
  id: string;
  origin?: string;
  hatching?: boolean;
}): boolean {
  if (isParkResidentId(spec.id) || spec.origin === 'resident') return false;
  return spec.hatching !== true;
}

/** True once the family has at least one self-made creature. */
export function hasOwnCreature(specs: { id: string; origin?: string }[]): boolean {
  return specs.some((spec) => !isParkResidentId(spec.id) && spec.origin !== 'resident');
}
