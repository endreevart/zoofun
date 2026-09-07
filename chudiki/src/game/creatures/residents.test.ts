import assert from 'node:assert/strict';
import { isParkResidentId, PARK_RESIDENTS } from './residents.ts';

assert.equal(PARK_RESIDENTS.length, 4);
const ids = PARK_RESIDENTS.map((resident) => resident.id);
assert.equal(new Set(ids).size, 4);
for (const resident of PARK_RESIDENTS) {
  assert.equal(isParkResidentId(resident.id), true);
  assert.ok(resident.id.startsWith('resident_'));
  assert.ok(resident.model.endsWith('.glb'));
  assert.ok(resident.name.length >= 2);
}
assert.equal(isParkResidentId('ch_tyapa'), false);
assert.equal(isParkResidentId('drawing_meshy_glade'), false);
