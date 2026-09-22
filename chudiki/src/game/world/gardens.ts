export const WORLD_AUTHORED = 'authored';
export const WORLD_DIY_SKU = 'world_diy_garden';
export const AUTHORED_TITLE = 'Волшебный остров';
export const WORLD_AUTHORED_MEADOW = 'authored_meadow';
export const AUTHORED_MEADOW_TITLE = 'Висячий луг';
export const WORLD_AUTHORED_GROVE = 'authored_grove';
export const AUTHORED_GROVE_TITLE = 'Куболесье';
/** Child-made creatures on one lawn. Park animals do not count. */
export const WORLD_CREATURE_CAP = 20;

export type GardenWorld = {
  id: string;
  title: string;
  sku?: string;
};

export function isDiyWorld(id: string | null | undefined): boolean {
  return Boolean(id && id !== WORLD_AUTHORED && (id === WORLD_DIY_SKU || id.startsWith('world_diy_')));
}

function isHiddenAuthoredLawn(id: string): boolean {
  return id === WORLD_AUTHORED_MEADOW || id === WORLD_AUTHORED_GROVE;
}

/** Owned copies. Free hanging meadow/grove never appear as move targets. */
export function publicGardens(gardens: readonly GardenWorld[]): GardenWorld[] {
  return gardens.filter((item) => !isHiddenAuthoredLawn(item.id));
}

export function creatureWorldId(worldId: string | null | undefined): string {
  if (!worldId || worldId === WORLD_AUTHORED) return WORLD_AUTHORED;
  return worldId;
}

/** A drawing appears on the lawn that is its home. */
export function creatureVisibleOnWorld(
  recordWorldId: string | null | undefined,
  openWorldId: string | null | undefined,
): boolean {
  return creatureWorldId(recordWorldId) === creatureWorldId(openWorldId);
}

export function nextGardenTitle(existing: readonly string[]): string {
  const taken = new Set(existing);
  let n = 1;
  while (taken.has(`Сад ${n}`)) n += 1;
  return `Сад ${n}`;
}

export function countOnWorld(
  records: Array<{ spec: { id: string; worldId?: string } }>,
  worldId: string,
): number {
  const home = creatureWorldId(worldId);
  return records.filter((record) => {
    if (record.spec.id.startsWith('resident_')) return false;
    return creatureWorldId(record.spec.worldId) === home;
  }).length;
}

export function worldIsFull(count: number): boolean {
  return count >= WORLD_CREATURE_CAP;
}

const FREE_LAWNS: GardenWorld[] = [{ id: WORLD_AUTHORED, title: AUTHORED_TITLE }];

/** Lawns a creature can move to from the open world. Free hanging lawns stay out. */
export function moveDestinations(
  current: string | null | undefined,
  gardens: readonly GardenWorld[],
): GardenWorld[] {
  const here = creatureWorldId(current);
  const dests: GardenWorld[] = FREE_LAWNS.filter((item) => item.id !== here);
  const seen = new Set(dests.map((item) => item.id));
  for (const garden of publicGardens(gardens)) {
    if (garden.id === here || seen.has(garden.id)) continue;
    seen.add(garden.id);
    dests.push(garden);
  }
  return dests;
}

export function gardenTitle(id: string, gardens: readonly GardenWorld[]): string {
  const home = creatureWorldId(id);
  const authored = FREE_LAWNS.find((item) => item.id === home);
  if (authored) return authored.title;
  return gardens.find((item) => item.id === home)?.title ?? 'Сад';
}

/** The lawn a creature lives on now, including a free authored lawn. */
export function gardenById(id: string, gardens: readonly GardenWorld[]): GardenWorld {
  const home = creatureWorldId(id);
  const authored = FREE_LAWNS.find((item) => item.id === home);
  if (authored) return { id: authored.id, title: authored.title };
  return gardens.find((item) => item.id === home) ?? { id: home, title: gardenTitle(home, gardens) };
}

/** Keep a move inside the dest cap. Already-resident dest creatures stay counted. */
export function idsThatFit(
  ids: readonly string[],
  records: Array<{ spec: { id: string; worldId?: string } }>,
  dest: string,
): string[] {
  const room = Math.max(0, WORLD_CREATURE_CAP - countOnWorld(records, dest));
  return ids.filter((id) => !id.startsWith('resident_')).slice(0, room);
}
