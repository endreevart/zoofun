import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_CUES, isNewPlacePick, type CueId } from './cues.ts';

const ids = Object.keys(UI_CUES) as CueId[];
assert.ok(ids.length >= 8);
assert.equal(new Set(ids).size, ids.length);

assert.equal(
  UI_CUES.empty_quota.line,
  'В зоопарке больше нет мест. Позовём взрослого.',
);
assert.equal(UI_CUES.worlds_back.line, 'Другой зоопарк.');
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
