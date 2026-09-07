import assert from 'node:assert/strict';
import { chooseZoo } from './zooChoice.ts';

const one = { spec: { id: 'a' } };
const two = { spec: { id: 'b' } };

const offline = chooseZoo({
  local: [one],
  remote: null,
  remoteOwner: null,
  localOwner: 'child-1',
});
assert.equal(offline.records[0]?.spec.id, 'a');
assert.equal(offline.pushLocal, false);

const switched = chooseZoo({
  local: [one],
  remote: [],
  remoteOwner: 'child-2',
  localOwner: 'child-1',
});
assert.deepEqual(switched.records, []);
assert.equal(switched.owner, 'child-2');
assert.equal(switched.pushLocal, false);
assert.equal(switched.writeLocal, true);

const firstLogin = chooseZoo({
  local: [one],
  remote: [],
  remoteOwner: 'child-3',
  localOwner: null,
});
assert.deepEqual(firstLogin.records, []);
assert.equal(firstLogin.pushLocal, false);

const sameFamilyOffline = chooseZoo({
  local: [one, two],
  remote: [],
  remoteOwner: 'child-1',
  localOwner: 'child-1',
});
assert.equal(sameFamilyOffline.records.length, 2);
assert.equal(sameFamilyOffline.pushLocal, true);

const cloudWins = chooseZoo({
  local: [one],
  remote: [two],
  remoteOwner: 'child-1',
  localOwner: 'child-1',
});
assert.equal(cloudWins.records[0]?.spec.id, 'b');
assert.equal(cloudWins.pushLocal, false);
