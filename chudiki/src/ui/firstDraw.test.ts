import assert from 'node:assert/strict';
import { firstDrawCopy, shouldAskAnotherDraw, shouldOfferFirstDraw } from './firstDraw.ts';

assert.equal(firstDrawCopy(false).label, 'Создай зуфуньчика');
assert.equal(firstDrawCopy(false).draw, 'Нарисовать зуфуньчика');
assert.equal(firstDrawCopy(true).label, 'Нарисуй ещё зуфуньчика');
assert.equal(firstDrawCopy(true).draw, 'Нарисовать ещё');
assert.equal(firstDrawCopy(false).photo, 'Фото рисунка или зверя');
assert.equal(firstDrawCopy(true).photo, firstDrawCopy(false).photo);

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
