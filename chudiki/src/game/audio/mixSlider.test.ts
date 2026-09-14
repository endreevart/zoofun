import assert from 'node:assert/strict';
import { sliderFromClientX, sliderToUnit, unitToSliderValue } from './mixSlider.ts';

assert.equal(sliderFromClientX(50, 0, 100), 0.5);
assert.equal(sliderFromClientX(-10, 0, 100), 0);
assert.equal(sliderFromClientX(400, 0, 100), 1);
assert.equal(sliderFromClientX(50, 0, 0), 0);

assert.equal(sliderToUnit('0'), 0);
assert.equal(sliderToUnit('1000'), 1);
assert.equal(sliderToUnit(250), 0.25);
assert.equal(sliderToUnit('nope'), 0);

assert.equal(unitToSliderValue(0.5), '500');
assert.equal(unitToSliderValue(2), '1000');
