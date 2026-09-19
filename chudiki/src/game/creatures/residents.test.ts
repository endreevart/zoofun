import assert from 'node:assert/strict';
import { canCarePlay, hasOwnCreature, isParkResidentId } from './residents.ts';

assert.equal(isParkResidentId('resident_cypa'), true);
assert.equal(isParkResidentId('ch_tyapa'), false);
assert.equal(isParkResidentId('drawing_meshy_glade'), false);
assert.equal(hasOwnCreature([]), false);
assert.equal(hasOwnCreature([{ id: 'resident_cypa' }]), false);
assert.equal(hasOwnCreature([{ id: 'resident_cypa' }, { id: 'ch_tyapa' }]), true);

assert.equal(canCarePlay({ id: 'resident_cypa', origin: 'resident' }), false);
assert.equal(canCarePlay({ id: 'ch_tyapa', origin: 'drawing', hatching: true }), false);
assert.equal(canCarePlay({ id: 'ch_tyapa', origin: 'drawing' }), true);
assert.equal(
  canCarePlay({ id: 'ch_mesh', origin: 'drawing' }),
  true,
  'a 3D mesh without a still still gets wash and feed',
);
