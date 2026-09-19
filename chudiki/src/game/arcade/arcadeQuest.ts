export type ArcadeStep = 'trees' | 'pond' | 'houses' | 'settle' | 'done';

const GARDEN_SKU = 'world_diy_garden';

/** Pretty park / meadow trees — not the thin `lp_tree_01` sticks. */
export const ARCADE_TREES = [
  'sunlit-canopy',
  'blossom-tree',
  'whimsywood-tree',
  'lantern-leaf-tree',
  'giant-tree',
] as const;

export const ARCADE_HOUSES = ['mossy-burrow', 'acorn-cottage'] as const;

export const ARCADE_TREE_NEED = ARCADE_TREES.length;
export const ARCADE_POND_NEED = 1;
export const ARCADE_HOUSE_NEED = ARCADE_HOUSES.length;

export const ARCADE_MODELS = {
  tree: ARCADE_TREES[0],
  pond: 'lotus-pond',
  house: ARCADE_HOUSES[0],
} as const;

export function arcadeStampModels(): readonly string[] {
  return [...ARCADE_TREES, ARCADE_MODELS.pond, ...ARCADE_HOUSES];
}

export type ArcadeQuest = {
  worldId: string;
  step: ArcadeStep;
  count: number;
  greeted: boolean;
};

export function isArcadeGardenId(worldId: string | null | undefined): boolean {
  if (!worldId) return false;
  return worldId === GARDEN_SKU || worldId.startsWith(`${GARDEN_SKU}_`);
}

/** Only the first granted garden is the one-time training lawn. */
export function isArcadeTrainingWorld(worldId: string | null | undefined): boolean {
  return worldId === GARDEN_SKU;
}

/** Off on prod until the first-visit path is settled. Flip this to show arcade. DEV `?arcade` still forces. */
export const ARCADE_PUBLIC = false;

export function arcadeIsLive(force = false): boolean {
  return Boolean(force || ARCADE_PUBLIC);
}

/** Unfinished training opens the garden. After `done` the picker is enough. Hidden while `ARCADE_PUBLIC` is off. */
export function bootWorldAfterArcade(step?: ArcadeStep | null, force = false): string | null {
  if (!arcadeIsLive(force)) return null;
  if (!step || step !== 'done') return GARDEN_SKU;
  return null;
}

export const FREE_ARCADE_GARDEN = {
  id: GARDEN_SKU,
  title: 'Сад 1',
  sku: GARDEN_SKU,
} as const;

/** First empty garden is free (D-027). Show it in the picker even if /me did not grant yet. */
export function withFreeArcadeGarden<T extends { id: string; title: string; sku?: string }>(
  worlds: T[] | null | undefined,
): T[] {
  const list = worlds ?? [];
  if (list.some((item) => isArcadeGardenId(item.id))) return list;
  return [{ ...(FREE_ARCADE_GARDEN as T) }, ...list];
}

export function arcadePickerLive(
  worldId: string,
  step: ArcadeStep | undefined,
  force = false,
): boolean {
  if (!arcadeIsLive(force)) return false;
  return isArcadeGardenId(worldId) && step !== 'done';
}

export function arcadeLawnPlanted(models: readonly string[]): boolean {
  const stamps = new Set(arcadeStampModels());
  return models.some((model) => stamps.has(model));
}

export function shouldRunArcade(input: {
  worldId: string | null | undefined;
  studio: boolean;
  force?: boolean;
  quest: ArcadeQuest | null;
}): boolean {
  if (input.quest?.step === 'done') return false;
  if (input.force) return Boolean(input.worldId);
  if (!ARCADE_PUBLIC) return false;
  return isArcadeTrainingWorld(input.worldId);
}

export function startArcadeQuest(worldId: string): ArcadeQuest {
  return { worldId, step: 'trees', count: 0, greeted: false };
}

export function modelForStep(step: ArcadeStep, count = 0): string | null {
  if (step === 'trees') return ARCADE_TREES[count] ?? ARCADE_TREES[ARCADE_TREES.length - 1];
  if (step === 'pond') return ARCADE_MODELS.pond;
  if (step === 'houses') return ARCADE_HOUSES[count] ?? ARCADE_HOUSES[ARCADE_HOUSES.length - 1];
  return null;
}

export function needForStep(step: ArcadeStep): number {
  if (step === 'trees') return ARCADE_TREE_NEED;
  if (step === 'pond') return ARCADE_POND_NEED;
  if (step === 'houses') return ARCADE_HOUSE_NEED;
  return 0;
}

export function applyArcadeStamp(quest: ArcadeQuest, model: string): ArcadeQuest {
  const expected = modelForStep(quest.step, quest.count);
  if (!expected || model !== expected) return quest;
  const count = quest.count + 1;
  if (count < needForStep(quest.step)) {
    return { ...quest, count, greeted: true };
  }
  if (quest.step === 'trees') return { ...quest, step: 'pond', count: 0, greeted: true };
  if (quest.step === 'pond') return { ...quest, step: 'houses', count: 0, greeted: true };
  if (quest.step === 'houses') return { ...quest, step: 'settle', count: 0, greeted: true };
  return { ...quest, count, greeted: true };
}

export function markArcadeGreeted(quest: ArcadeQuest): ArcadeQuest {
  return { ...quest, greeted: true };
}

export function finishArcadeQuest(quest: ArcadeQuest): ArcadeQuest {
  return { ...quest, step: 'done', count: 0, greeted: true };
}

export function arcadeCoachLabel(step: ArcadeStep): string {
  if (step === 'trees') return 'Посади дерево';
  if (step === 'pond') return 'Поставь пруд';
  if (step === 'houses') return 'Поставь домик';
  if (step === 'settle') return 'Заселить остров';
  return '';
}

export function arcadeCoachHint(step: ArcadeStep): string {
  if (step === 'trees' || step === 'pond' || step === 'houses') return 'Тапни землю';
  return '';
}
