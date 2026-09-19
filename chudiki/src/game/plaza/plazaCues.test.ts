import assert from 'node:assert/strict';
import { UI_CUES } from '../audio/cues.ts';
import {
  PLAZA_CUE_IDS,
  PLAZA_TOY_WAIT_MS,
  plazaCoversWorlds,
  plazaEnterCues,
  plazaHidesHome,
  plazaIntroSpec,
  plazaKeepsGardenBed,
  plazaToyWaitLocked,
} from './plazaCues.ts';
import { PLAZA_EMOTE_SFX, PLAZA_SFX } from './plazaSfx.ts';

assert.deepEqual(plazaEnterCues(), ['plaza_hello', 'plaza_look', 'plaza_friends', 'plaza_walk']);
assert.equal(plazaIntroSpec('plaza_look')?.title, 'Свободная прогулка');
assert.equal(plazaIntroSpec('plaza_look')?.titleArt, '/ui/walk-hint/title-free-walk.png');
assert.equal(plazaIntroSpec('plaza_hello')?.title, 'Общий зоопарк');
assert.equal(plazaIntroSpec('plaza_friends')?.title, 'Друзья');
assert.equal(plazaIntroSpec('plaza_walk')?.title, 'Как ходить');
assert.equal(plazaIntroSpec('plaza_dig'), null);
assert.equal(plazaKeepsGardenBed('plaza', null), true);
assert.equal(plazaKeepsGardenBed('zoo', null), false);
assert.equal(plazaKeepsGardenBed('zoo', 'authored'), true);
assert.equal(plazaCoversWorlds('plaza'), true);
assert.equal(plazaCoversWorlds('draw'), false);
assert.equal(plazaCoversWorlds('draw', true), true);
assert.equal(plazaCoversWorlds('zoo', true), true);
assert.equal(plazaCoversWorlds('zoo', false, true), true);
assert.equal(UI_CUES.plaza_hello.line, 'Это общий зоопарк. Сюда приходят зуфики из разных садов.');
assert.equal(UI_CUES.plaza_friends.line, 'Тут могут быть другие зуфики. Помаши им.');
assert.equal(PLAZA_CUE_IDS.length, 16);
assert.ok(PLAZA_CUE_IDS.includes('plaza_need'));
assert.equal(new Set(PLAZA_CUE_IDS).size, PLAZA_CUE_IDS.length);
assert.ok(PLAZA_CUE_IDS.includes('plaza_jump'));
assert.ok(PLAZA_CUE_IDS.includes('plaza_emote'));
assert.ok(PLAZA_CUE_IDS.includes('plaza_build'));
assert.ok(PLAZA_CUE_IDS.includes('plaza_found'));
assert.ok(PLAZA_CUE_IDS.includes('plaza_draw'));
assert.ok(PLAZA_CUE_IDS.includes('plaza_toy_wait'));
assert.equal(plazaIntroSpec('plaza_toy_wait')?.title, 'Скоро штука');
assert.equal(plazaIntroSpec('plaza_toy_wait')?.icon, false);
assert.equal(plazaHidesHome(null), false);
assert.equal(plazaHidesHome('plaza_draw'), false);
assert.equal(plazaHidesHome('plaza_build'), false);
assert.equal(plazaHidesHome('plaza_things'), false);
assert.equal(plazaHidesHome('plaza_hello'), true);
assert.equal(plazaHidesHome('plaza_toy_wait'), true);
assert.equal(PLAZA_TOY_WAIT_MS, 5500);
assert.equal(plazaToyWaitLocked(true, false), false);
assert.equal(plazaToyWaitLocked(true, true), true);
assert.equal(plazaToyWaitLocked(false, true), false);
assert.equal(
  UI_CUES.plaza_draw.line,
  'Нарисуем дерево или штуку для этого зоопарка.',
);
assert.equal(
  UI_CUES.plaza_toy_wait.line,
  'Поставь картинку на поляну. Подожди чуть-чуть — и тут будет настоящая штука.',
);

assert.equal(new Set(PLAZA_SFX).size, PLAZA_SFX.length);
assert.deepEqual([...PLAZA_EMOTE_SFX], ['hello', 'hooray', 'wow', 'love', 'laugh', 'play']);
for (const kind of ['step', 'jump', 'land', 'place', 'lift', 'nudge', 'trash', 'save', 'smash'] as const) {
  assert.ok(PLAZA_SFX.includes(kind), kind);
}
