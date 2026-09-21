export const ROSTER_TITLE = 'Мои Зуфики';
export const ROSTER_ALL = 'all';
export const ROSTER_DOWNLOAD_GLB = 'Скачать 3D';
export const ROSTER_GO_GARDEN = 'В сад';

export type RosterEntry = {
  id: string;
  name: string;
  face: string | null;
  garden: string | null;
  still: string | null;
  hasPostcard: boolean;
};

export function ownRoster<T extends { id: string; origin?: string }>(specs: T[]): T[] {
  return specs.filter((spec) => !spec.id.startsWith('resident_') && spec.origin !== 'resident');
}

export function rosterEntry(input: {
  id: string;
  name: string;
  postcard: string | null;
  still: string | null;
}): RosterEntry {
  return {
    id: input.id,
    name: input.name,
    face: input.still,
    garden: input.postcard ?? input.still,
    still: input.still,
    hasPostcard: Boolean(input.postcard),
  };
}

export function photosInView(entries: RosterEntry[], filterId: string): RosterEntry[] {
  const withPic = entries.filter((entry) => entry.garden);
  if (filterId === ROSTER_ALL) return withPic;
  return withPic.filter((entry) => entry.id === filterId);
}

export function collageFaces(entries: RosterEntry[], count = 2): string[] {
  const faces: string[] = [];
  for (const entry of entries) {
    if (!entry.face || faces.includes(entry.face)) continue;
    faces.push(entry.face);
    if (faces.length >= count) break;
  }
  return faces;
}

/** Garden postcard when we have one; otherwise a composed meadow or the still. */
export function albumSrc(entry: RosterEntry, composed?: string | null): string | null {
  if (entry.hasPostcard) return entry.garden;
  return composed || entry.garden;
}

/** Roster «В сад» on an album postcard starts leftover 3D (D-031). */
export function rosterGardenStartsMesh(spec: {
  drawing?: { modelUrl?: string | null; meshDeferred?: boolean } | null;
}): boolean {
  return Boolean(spec.drawing?.meshDeferred) && !spec.drawing?.modelUrl?.trim();
}
