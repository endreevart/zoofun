import type { ArcadeQuest } from './arcadeQuest';

export const ARCADE_QUEST_KEY = 'chudiki.arcadeQuest.v2';

type Store = Record<string, ArcadeQuest>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(ARCADE_QUEST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(ARCADE_QUEST_KEY, JSON.stringify(store));
  } catch {
    /* private mode */
  }
}

export function loadArcadeQuest(worldId: string): ArcadeQuest | null {
  const row = readStore()[worldId];
  if (!row || row.worldId !== worldId) return null;
  if (!row.step) return null;
  return {
    worldId,
    step: row.step,
    count: Number.isFinite(row.count) ? row.count : 0,
    greeted: Boolean(row.greeted),
  };
}

export function saveArcadeQuest(quest: ArcadeQuest): void {
  const store = readStore();
  store[quest.worldId] = quest;
  writeStore(store);
}

export function loadOrStartArcadeQuest(worldId: string): ArcadeQuest {
  const existing = loadArcadeQuest(worldId);
  if (existing) return existing;
  const quest: ArcadeQuest = { worldId, step: 'trees', count: 0, greeted: false };
  saveArcadeQuest(quest);
  return quest;
}

/** Start or resume. A finished quest on an empty lawn starts again. */
export function ensurePlayableArcadeQuest(worldId: string, planted = false): ArcadeQuest {
  const existing = loadArcadeQuest(worldId);
  if (existing && existing.step !== 'done') return existing;
  if (existing?.step === 'done' && planted) return existing;
  const quest: ArcadeQuest = { worldId, step: 'trees', count: 0, greeted: false };
  saveArcadeQuest(quest);
  return quest;
}
