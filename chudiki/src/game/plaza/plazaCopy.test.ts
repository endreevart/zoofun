import assert from 'node:assert/strict';
import {
  isPlazaReadySpec,
  mergePlazaToys,
  plazaToyStill,
  PLAZA_EMOTES,
  PLAZA_FOG,
  PLAZA_LOAD_R,
  PLAZA_LOAD_R_PAD,
  PLAZA_SHADOW_R,
  PLAZA_STAMP_CAP,
  PLAZA_PICK_HINT,
  PLAZA_PICK_HINT_ART,
  PLAZA_PICK_NEXT,
  PLAZA_PICK_PREV,
  PLAZA_PICK_SIGN,
  PLAZA_PICK_TITLE,
  PLAZA_PLANE,
  PLAZA_GIFT_ASK,
  PLAZA_GIFT_HINT,
  PLAZA_GIFT_PANEL,
  PLAZA_TOY_BAKE,
  PLAZA_TOY_FAIL,
  PLAZA_TOY_NEXT,
  PLAZA_TOY_PLACE,
  PLAZA_TOY_READY,
  PLAZA_TOY_PUT,
  PLAZA_TOY_REDRAW,
  PLAZA_TOY_WAIT,
  PLAZA_WALK,
  plazaEnterLabel,
  plazaEmoteSrc,
  plazaLoadRadius,
  plazaOnlineLabel,
  plazaPickMode,
  plazaPickWindow,
  plazaViewCellSize,
  plazaWalkSpeed,
  soloPlazaRoom,
} from './plazaCopy.ts';
import { PLAZA_CRYSTAL_COUNT, PLAZA_CRYSTAL_OUTER } from './plazaDig.ts';

assert.equal(plazaOnlineLabel(0), 'Пока тихо');
assert.equal(plazaOnlineLabel(1), '1 игрок сейчас');
assert.equal(plazaOnlineLabel(2), '2 игрока сейчас');
assert.equal(plazaOnlineLabel(4), '4 игрока сейчас');
assert.equal(plazaOnlineLabel(5), '5 игроков сейчас');
assert.equal(plazaOnlineLabel(11), '11 игроков сейчас');
assert.equal(plazaOnlineLabel(21), '21 игрок сейчас');
assert.equal(plazaOnlineLabel(22), '22 игрока сейчас');
assert.equal(plazaPickMode(0), 'none');
assert.equal(plazaPickMode(1), 'one');
assert.equal(plazaPickMode(3), 'many');
assert.equal(plazaEnterLabel('Зюзя'), 'Войти с Зюзей');
assert.equal(plazaEnterLabel('Корона'), 'Войти с Короной');
assert.equal(plazaEnterLabel('Плюш'), 'Войти с Плюшем');
assert.equal(plazaEnterLabel('Клювик'), 'Войти с Клювиком');
assert.equal(plazaPickWindow(0, 4), 0);
assert.equal(plazaPickWindow(3, 6), 0);
assert.equal(plazaPickWindow(4, 6), 1);
assert.equal(plazaPickWindow(5, 6), 2);

const still = `data:image/png;base64,${'A'.repeat(800)}`;
assert.equal(isPlazaReadySpec({ id: 'ch_1', drawing: { portraitUrl: still } }), true);
assert.equal(isPlazaReadySpec({ id: 'ch_1', drawing: { placeholder: true, portraitUrl: still } }), false);
assert.equal(isPlazaReadySpec({ id: 'ch_1', hatching: true, drawing: { portraitUrl: still } }), false);
assert.equal(isPlazaReadySpec({ id: 'ch_1', drawing: { meshDeferred: true, portraitUrl: still } }), false);
assert.equal(isPlazaReadySpec({ id: 'resident_0', drawing: { portraitUrl: still } }), false);
assert.equal(isPlazaReadySpec({ id: 'ch_mesh', drawing: { modelUrl: '/v1/generation/stylize/j/model.glb' } }), true);

const merged = mergePlazaToys(
  [{ spec_id: 'a', name: 'Локальный', portrait: 'data:local' }],
  [{ spec_id: 'a', name: 'Облако', portrait: '/v1/plaza/portraits/a' }],
);
assert.equal(merged[0].name, 'Облако');
assert.equal(merged[0].portrait, '/v1/plaza/portraits/a');

assert.equal(
  plazaToyStill({ id: 'ch_1', drawing: { postcardUrl: 'https://s3.example/postcards/x.png' } }),
  'https://s3.example/postcards/x.png',
);
assert.equal(
  plazaToyStill({ id: 'ch_1', drawing: { portraitUrl: still } }),
  '/v1/zoo/creatures/ch_1/postcard',
);

const solo = soloPlazaRoom({ spec_id: 'a', name: 'Пятнышко', portrait: still });
assert.equal(solo.peers[0].self, true);
assert.equal(solo.peers.length, 1);
assert.equal(solo.stamps_rev, 0);
assert.equal(solo.mounds.length, PLAZA_CRYSTAL_COUNT);
assert.deepEqual(solo.tickets, []);

assert.ok(PLAZA_PLANE > PLAZA_WALK * 2);
assert.ok(PLAZA_WALK >= 250);
assert.ok(PLAZA_CRYSTAL_OUTER < PLAZA_WALK);
assert.ok(PLAZA_FOG > 0);
assert.equal(PLAZA_STAMP_CAP, 400);
assert.ok(PLAZA_LOAD_R < PLAZA_WALK);
assert.ok(PLAZA_LOAD_R_PAD > PLAZA_LOAD_R);
assert.ok(PLAZA_LOAD_R_PAD < PLAZA_WALK);
assert.ok(PLAZA_SHADOW_R < PLAZA_LOAD_R);
assert.equal(plazaLoadRadius(false), PLAZA_LOAD_R);
assert.equal(plazaLoadRadius(true), PLAZA_LOAD_R_PAD);
assert.ok(plazaWalkSpeed(true) > plazaWalkSpeed(false));
assert.ok(plazaViewCellSize(true) > plazaViewCellSize(false));

assert.deepEqual(
  PLAZA_EMOTES.map((item) => item.id),
  ['hello', 'hooray', 'wow', 'love', 'laugh', 'play'],
);
assert.equal(plazaEmoteSrc('love'), '/plaza/reactions/love.png');
assert.equal(plazaEmoteSrc('nope'), PLAZA_EMOTES[0].src);

assert.equal(PLAZA_PICK_TITLE, 'С кем пойдёшь гулять?');
assert.equal(PLAZA_TOY_WAIT, 'Красим штуку');
assert.equal(PLAZA_TOY_BAKE, 'Готовим штуку');
assert.equal(PLAZA_TOY_PUT, 'Тапни сад — поставь штуку.');
assert.equal(PLAZA_TOY_READY, 'Вот что получилось');
assert.equal(PLAZA_TOY_PLACE, 'На поляну');
assert.equal(PLAZA_TOY_FAIL, 'Не получилось покрасить.');
assert.equal(PLAZA_TOY_REDRAW, 'Перерисовать');
assert.equal(PLAZA_TOY_NEXT, 'Далее');
assert.equal(PLAZA_GIFT_ASK, 'Посадить на общей поляне?');
assert.equal(PLAZA_GIFT_HINT, 'Рисунок станет объёмной штукой на общей поляне.');
assert.equal(PLAZA_GIFT_PANEL, '/ui/meadow-gift/modal-panel.png');
assert.equal(PLAZA_PICK_HINT, 'Выбери Зуфика');
assert.equal(PLAZA_PICK_SIGN, '/plaza/pick-sign.png');
assert.equal(PLAZA_PICK_HINT_ART, '/plaza/pick-hint.png');
assert.equal(PLAZA_PICK_PREV, '/plaza/pick-prev.png');
assert.equal(PLAZA_PICK_NEXT, '/plaza/pick-next.png');
