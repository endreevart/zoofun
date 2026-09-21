import assert from 'node:assert/strict';
import {
  appendVitrine,
  arrangeVitrine,
  isMineCard,
  matchVitrineQuery,
  mergeVitrinePage,
  ownVitrineRemountsGarden,
  sortVitrine,
  vitrineCoversWorlds,
} from './vitrineSort.ts';

const order = sortVitrine([
  { title: 'мало зверей', joy: 0, creatures: 1 },
  { title: 'много зверей', joy: 0, creatures: 5 },
  { title: 'любимый', joy: 4, creatures: 1 },
  { title: 'почти', joy: 4, creatures: 3 },
]).map((item) => item.title);

assert.deepEqual(order, ['почти', 'любимый', 'много зверей', 'мало зверей']);

const first = mergeVitrinePage(
  [{ id: 'mine', title: 'свой', joy: 0, creatures: 2 }],
  [
    { id: 'mine', title: 'свой', joy: 9, creatures: 2 },
    { id: 'far', title: 'далекий', joy: 3, creatures: 1 },
  ],
);
assert.deepEqual(
  first.map((item) => item.id),
  ['far', 'mine'],
);

const next = appendVitrine(first, [
  { id: 'far', title: 'далекий', joy: 3, creatures: 1 },
  { id: 'later', title: 'позже', joy: 1, creatures: 4 },
]);
assert.deepEqual(
  next.map((item) => item.id),
  ['far', 'mine', 'later'],
);

assert.equal(matchVitrineQuery('Сад 1', ''), true);
assert.equal(matchVitrineQuery('Сад 1', 'сад'), true);
assert.equal(matchVitrineQuery('Луг', 'сад'), false);
assert.equal(matchVitrineQuery('Сад 1', '1042', { code: 1042 }), true);
assert.equal(matchVitrineQuery('Сад 1', '№ 1042', { code: 1042 }), true);
assert.equal(matchVitrineQuery('Сад 1', '2000', { code: 1042 }), false);
assert.equal(isMineCard({ id: 'a', mine: true }, 'b'), true);
assert.equal(isMineCard({ id: 'a' }, 'a'), true);
assert.equal(isMineCard({ id: 'a' }, 'b'), false);

const cards = [
  { id: 'old', title: 'Старый', joy: 8, creatures: 2, created: 10 },
  { id: 'mine', title: 'Сад 1', joy: 1, creatures: 0, created: 20, mine: true },
  { id: 'empty', title: 'Пустой', joy: 3, creatures: 0, created: 40 },
  { id: 'fresh', title: 'Новый луг', joy: 2, creatures: 4, created: 50 },
];

assert.deepEqual(
  arrangeVitrine(cards, '', 'all').map((item) => item.id),
  ['mine', 'old', 'empty', 'fresh'],
);
assert.deepEqual(
  arrangeVitrine(cards, '', 'living').map((item) => item.id),
  ['old', 'fresh'],
);
assert.deepEqual(
  arrangeVitrine(cards, '', 'new').map((item) => item.id),
  ['mine', 'fresh', 'empty', 'old'],
);
assert.deepEqual(
  arrangeVitrine(cards, 'луг', 'all').map((item) => item.id),
  ['fresh'],
);
assert.deepEqual(
  arrangeVitrine(cards, '', 'all', null, 'fresh').map((item) => item.id),
  ['mine', 'fresh', 'old', 'empty'],
);

assert.equal(vitrineCoversWorlds('vitrine'), true);
assert.equal(vitrineCoversWorlds('zoo'), false);
assert.equal(vitrineCoversWorlds('plaza'), false);
assert.equal(ownVitrineRemountsGarden(null, 'world_diy_garden', false), true);
assert.equal(ownVitrineRemountsGarden('world_diy_garden', 'world_diy_garden', false), false);
assert.equal(ownVitrineRemountsGarden('world_diy_garden', 'world_diy_garden', true), true);
assert.equal(ownVitrineRemountsGarden('world_diy_garden', 'world_diy_meadow', false), true);
