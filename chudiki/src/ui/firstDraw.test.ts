import assert from 'node:assert/strict';
import {
  firstDrawCopy,
  plazaNeedCopy,
  shouldAskAnotherDraw,
  shouldKeepFriendLawn,
  shouldOfferFirstDraw,
  shouldOfferFriendInvite,
} from './firstDraw.ts';

assert.equal(firstDrawCopy(false).label, 'Создай зуфуньчика');
assert.equal(firstDrawCopy(false).draw, 'Нарисовать зуфуньчика');
assert.equal(firstDrawCopy(true).label, 'Нарисуй ещё зуфуньчика');
assert.equal(firstDrawCopy(true).draw, 'Нарисовать ещё');
assert.equal(firstDrawCopy(false).photo, 'Фото рисунка или зверя');
assert.equal(firstDrawCopy(true).photo, firstDrawCopy(false).photo);
assert.equal(firstDrawCopy(false, true).label, 'Заселить остров');
assert.equal(firstDrawCopy(true, true).draw, 'Нарисовать зуфика');
assert.equal(plazaNeedCopy().label, 'Нужен зуфик');
assert.equal(plazaNeedCopy().draw, 'Нарисовать');
assert.equal(plazaNeedCopy().photo, 'Сфотографировать');

assert.equal(shouldOfferFirstDraw('authored'), true);
assert.equal(shouldOfferFirstDraw('authored_meadow'), true);
assert.equal(shouldOfferFirstDraw('authored_grove'), true);
assert.equal(shouldOfferFirstDraw('world_diy_garden_1'), true);
assert.equal(shouldOfferFirstDraw(null), false);
assert.equal(shouldOfferFirstDraw(undefined), false);

assert.equal(shouldAskAnotherDraw(0), true);
assert.equal(shouldAskAnotherDraw(-1), true);
assert.equal(shouldAskAnotherDraw(1), false);
assert.equal(shouldAskAnotherDraw(5), false);
assert.equal(shouldAskAnotherDraw(null), false);
assert.equal(shouldAskAnotherDraw(undefined), false);

assert.equal(shouldOfferFriendInvite(0, false), true);
assert.equal(shouldOfferFriendInvite(0, true), false);
assert.equal(shouldOfferFriendInvite(1, false), false);
assert.equal(shouldOfferFriendInvite(null, false), false);

assert.equal(shouldKeepFriendLawn(0, true, false), true);
assert.equal(shouldKeepFriendLawn(0, true, true), false);
assert.equal(shouldKeepFriendLawn(0, false, false), false);
assert.equal(shouldKeepFriendLawn(1, true, false), false);
assert.equal(shouldKeepFriendLawn(null, true, false), false);
