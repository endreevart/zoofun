import assert from 'node:assert/strict';
import { vitrineSearchLog } from './actionLog.ts';

assert.deepEqual(vitrineSearchLog('  1155  '), { is_code: true, empty: false, q_len: 4 });
assert.deepEqual(vitrineSearchLog('Сад'), { is_code: false, empty: false, q_len: 3 });
assert.deepEqual(vitrineSearchLog('   '), { is_code: false, empty: true, q_len: 0 });
