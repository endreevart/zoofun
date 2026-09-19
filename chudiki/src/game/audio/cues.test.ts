import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACEHOLDER_CUES, UI_CUES, isNewPlacePick, type CueId } from './cues.ts';

const ids = Object.keys(UI_CUES) as CueId[];
assert.ok(ids.length >= 8);
assert.equal(new Set(ids).size, ids.length);

assert.equal(
  UI_CUES.empty_quota.line,
  'В зоопарке больше нет мест. Позовём взрослого.',
);
assert.equal(UI_CUES.worlds_back.line, 'Другой зоопарк.');
assert.equal(
  UI_CUES.plaza_hello.line,
  'Это общий зоопарк. Сюда приходят зуфики из разных садов.',
);
assert.equal(UI_CUES.plaza_save.line, 'Поляна запомнила.');
assert.equal(UI_CUES.plaza_found.line, 'Ура! Билетик. Можно нарисовать ещё зуфика.');
assert.equal(
  UI_CUES.plaza_need.line,
  'У тебя ещё нет зуфика для общего зоопарка. Нарисуй или сфотографируй его — тогда можно зайти.',
);
assert.equal(PLACEHOLDER_CUES.has('plaza_need'), true);
assert.equal(PLACEHOLDER_CUES.has('plaza_draw'), false);
assert.equal(PLACEHOLDER_CUES.has('plaza_toy_wait'), false);
assert.equal(PLACEHOLDER_CUES.has('plaza_found'), false);
assert.equal(PLACEHOLDER_CUES.has('plaza_build'), false);
assert.equal(PLACEHOLDER_CUES.has('plaza_things'), false);
assert.equal(PLACEHOLDER_CUES.has('plaza_hello'), false);
assert.equal(PLACEHOLDER_CUES.has('still_after_first'), false);
assert.equal(PLACEHOLDER_CUES.has('postcard_ready'), false);
assert.equal(PLACEHOLDER_CUES.has('revive_need'), false);
assert.equal(PLACEHOLDER_CUES.has('empty_still'), true);
assert.equal(isNewPlacePick(null, 'bush'), true);
assert.equal(isNewPlacePick('bush', 'bush'), false);
assert.equal(isNewPlacePick('bush', 'house'), true);

const cueDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public/audio/cues');

for (const id of ids) {
  const cue = UI_CUES[id];
  assert.equal(cue.file, `${id}.mp3`);
  assert.ok(cue.line.trim().length > 0);
  assert.ok(cue.when.trim().length > 0);
  assert.ok(!cue.line.includes('{'));
  assert.ok(existsSync(join(cueDir, cue.file)), `missing ${cue.file}`);
}
