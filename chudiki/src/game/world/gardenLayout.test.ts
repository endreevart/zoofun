import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gardenBaked = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../public/layout/island-layout.json'), 'utf8'),
);
assert.equal(gardenBaked.version, 2);
assert.ok(Array.isArray(gardenBaked.props) && gardenBaked.props.length >= 140);
assert.ok(gardenBaked.props.some((prop: { model: string }) => prop.model === 'garden-gate'));
assert.ok(gardenBaked.props.some((prop: { model: string }) => prop.model === 'lotus-pond'));
assert.ok(gardenBaked.props.some((prop: { model: string }) => prop.model === 'timber-bridge'));
assert.equal(gardenBaked.props.some((prop: { model: string }) => prop.model === 'grass_a'), false);
const fence = gardenBaked.props.find((prop: { id: string }) => prop.id === 'h-10') as
  | { model: string; x: number; z: number }
  | undefined;
assert.equal(fence?.model, 'wooden-fence');
assert.ok(fence && fence.x > 8 && fence.z > 3.5);
