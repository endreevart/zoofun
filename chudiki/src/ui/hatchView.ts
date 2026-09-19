/** Which picture the hatch screen should show: studio toy vs generated garden. */

export const HATCH_DRAW_ANOTHER = 'Нарисовать ещё';
export const HATCH_GO_GARDEN = 'В сад!';
export const HATCH_MESH_WAIT = 'Объём ещё лепится — можно не ждать';

export function hatchPreviewSrc(
  still: string | null,
  postcard: string | null,
  wantGarden: boolean,
): string | null {
  if (wantGarden && postcard) return postcard;
  return still;
}

export function hatchPreviewMode(
  still: string | null,
  postcard: string | null,
  wantGarden: boolean,
): 'empty' | 'toy' | 'garden' {
  if (wantGarden && postcard) return 'garden';
  if (still) return 'toy';
  return 'empty';
}

/** Stills left (or unsigned play): the child can start another drawing. */
export function hatchCanDrawAnother(
  stillRemaining: number | null | undefined,
  _remaining?: number | null,
): boolean {
  return stillRemaining == null || stillRemaining > 0;
}

/** 3D credits gone: «В сад!» opens pack_1 / pack_5 (10–20 behind expand). */
export function hatchGardenOpensShop(
  _stillRemaining: number | null | undefined,
  remaining: number | null | undefined,
): boolean {
  return remaining != null && remaining <= 0;
}

/** Leftover paid 3D: «В сад!» spends one credit and starts Tripo. */
export function hatchGardenStartsPaidMesh(remaining: number | null | undefined): boolean {
  return remaining != null && remaining > 0;
}

/** Wait line only while a mesh job is actually in flight. */
export function hatchMeshCooking(mesh?: string | null, modelUrl?: string | null): boolean {
  if (modelUrl) return false;
  if (!mesh || mesh === 'pending') return true;
  return false;
}
