import assert from 'node:assert/strict';
import {
  applyArcadeStamp,
  ARCADE_HOUSES,
  ARCADE_MODELS,
  ARCADE_TREES,
  arcadePickerLive,
  bootWorldAfterArcade,
  finishArcadeQuest,
  isArcadeGardenId,
  isArcadeTrainingWorld,
  modelForStep,
  shouldRunArcade,
  startArcadeQuest,
  withFreeArcadeGarden,
} from './arcadeQuest.ts';
import { ARCADE_CUE_IDS, arcadeEnterCues, arcadeSettleCue, arcadeStampCues } from './arcadeCues.ts';
import {
  ARCADE_QUEST_KEY,
  ensurePlayableArcadeQuest,
  loadArcadeQuest,
  loadOrStartArcadeQuest,
  saveArcadeQuest,
} from './arcadeStore.ts';

assert.equal(ARCADE_CUE_IDS.length, 20);
assert.equal(isArcadeGardenId('world_diy_garden'), true);
assert.equal(withFreeArcadeGarden([]).length, 1);
assert.equal(withFreeArcadeGarden([]).at(0)?.id, 'world_diy_garden');
assert.equal(withFreeArcadeGarden([{ id: 'world_diy_garden', title: 'Сад 1' }]).length, 1);
assert.equal(arcadePickerLive('world_diy_garden', undefined), false);
assert.equal(arcadePickerLive('world_diy_garden', undefined, true), true);
assert.equal(arcadePickerLive('world_diy_garden', 'done', true), false);
assert.equal(arcadePickerLive('authored', undefined, true), false);
assert.equal(isArcadeTrainingWorld('world_diy_garden'), true);
assert.equal(isArcadeTrainingWorld('world_diy_garden_ab'), false);
assert.equal(bootWorldAfterArcade(undefined), null);
assert.equal(bootWorldAfterArcade('trees', true), 'world_diy_garden');
assert.equal(bootWorldAfterArcade('done', true), null);
assert.equal(isArcadeGardenId('world_diy_garden_ab'), true);
assert.equal(isArcadeGardenId('world_diy_meadow'), false);
assert.equal(isArcadeGardenId('authored'), false);

assert.equal(shouldRunArcade({ worldId: 'world_diy_garden', studio: false, quest: null }), false);
assert.equal(shouldRunArcade({ worldId: 'world_diy_garden', studio: false, force: true, quest: null }), true);
assert.equal(shouldRunArcade({ worldId: 'world_diy_garden', studio: true, force: true, quest: null }), true);
assert.equal(shouldRunArcade({ worldId: 'world_diy_garden_ab', studio: false, quest: null }), false);
assert.equal(shouldRunArcade({ worldId: 'authored', studio: true, quest: null }), false);
assert.equal(
  shouldRunArcade({ worldId: 'authored', studio: true, force: true, quest: null }),
  true,
);
assert.equal(
  shouldRunArcade({
    worldId: 'world_diy_garden',
    studio: false,
    quest: { worldId: 'world_diy_garden', step: 'done', count: 0, greeted: true },
  }),
  false,
);

let quest = startArcadeQuest('world_diy_garden');
assert.equal(quest.step, 'trees');
assert.equal(modelForStep('trees'), ARCADE_TREES[0]);
assert.equal(modelForStep('trees', 1), ARCADE_TREES[1]);
assert.equal(modelForStep('houses', 1), ARCADE_HOUSES[1]);
assert.deepEqual(arcadeEnterCues(quest), [
  'arcade_hello',
  'arcade_look',
  'arcade_tree_give',
  'arcade_tree_why',
]);
assert.deepEqual(
  arcadeEnterCues({ worldId: 'w', step: 'pond', count: 0, greeted: true }),
  ['arcade_pond_give', 'arcade_pond_why'],
);
assert.deepEqual(
  arcadeEnterCues({ worldId: 'w', step: 'trees', count: 1, greeted: true }),
  ['arcade_resume', 'arcade_tree_more'],
);

quest = applyArcadeStamp(quest, ARCADE_TREES[0]);
assert.equal(quest.step, 'trees');
assert.equal(quest.count, 1);
quest = applyArcadeStamp(quest, ARCADE_MODELS.pond);
assert.equal(quest.count, 1);
for (let i = 1; i < ARCADE_TREES.length; i += 1) {
  quest = applyArcadeStamp(quest, ARCADE_TREES[i]);
}
assert.equal(quest.step, 'pond');
assert.equal(quest.count, 0);
assert.deepEqual(arcadeStampCues({ worldId: 'w', step: 'trees', count: 4, greeted: true }, quest), [
  'arcade_tree_done',
  'arcade_pond_give',
  'arcade_pond_why',
]);

quest = applyArcadeStamp(quest, ARCADE_MODELS.pond);
assert.equal(quest.step, 'houses');
quest = applyArcadeStamp(quest, ARCADE_HOUSES[0]);
assert.equal(quest.step, 'houses');
assert.equal(quest.count, 1);
quest = applyArcadeStamp(quest, ARCADE_HOUSES[1]);
assert.equal(quest.step, 'settle');
assert.equal(arcadeSettleCue(true), 'arcade_settle_free');
assert.equal(arcadeSettleCue(false), 'arcade_settle_lonely');
assert.equal(finishArcadeQuest(quest).step, 'done');

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  },
  configurable: true,
});

const started = loadOrStartArcadeQuest('world_diy_garden');
saveArcadeQuest({ ...started, step: 'pond', count: 0, greeted: true });
assert.equal(loadArcadeQuest('world_diy_garden')?.step, 'pond');
assert.ok(store.get(ARCADE_QUEST_KEY));
saveArcadeQuest({ worldId: 'world_diy_garden', step: 'done', count: 0, greeted: true });
assert.equal(ensurePlayableArcadeQuest('world_diy_garden', false).step, 'trees');
saveArcadeQuest({ worldId: 'world_diy_garden', step: 'done', count: 0, greeted: true });
assert.equal(ensurePlayableArcadeQuest('world_diy_garden', true).step, 'done');
