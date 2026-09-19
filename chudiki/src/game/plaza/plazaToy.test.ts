import assert from 'node:assert/strict';
import {
  absorbPlazaToys,
  isPlazaToyModel,
  isPlazaToyPreparing,
  isPlazaToySku,
  peekPlazaHold,
  plazaToyPaintedSrc,
  PLAZA_TOY_CAP,
  PLAZA_TOY_HOLD_KEY,
  PLAZA_TOY_SKU,
  rememberPlazaHold,
  takePlazaHold,
  upsertPlazaToy,
} from './plazaToy.ts';

const store = new Map<string, string>();
const memory = {
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string) {
    store.set(key, value);
  },
  removeItem(key: string) {
    store.delete(key);
  },
};
Object.defineProperty(globalThis, 'sessionStorage', { value: memory, configurable: true });

assert.equal(PLAZA_TOY_SKU, 'plaza_toy_1');
assert.equal(PLAZA_TOY_CAP, 10);
assert.equal(isPlazaToySku('plaza_toy_1'), true);
assert.equal(isPlazaToySku('pack_1'), false);
assert.equal(isPlazaToyModel('toy_ab12'), true);
assert.equal(isPlazaToyModel('toy_'), false);
assert.equal(isPlazaToyModel('sunlit-canopy'), false);
assert.equal(plazaToyPaintedSrc({}), null);
assert.equal(plazaToyPaintedSrc({ image_png_base64: 'short' }), null);
assert.equal(
  plazaToyPaintedSrc({ image_png_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }),
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
);
assert.equal(
  plazaToyPaintedSrc({
    image_png_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    media_type: 'image/webp',
  }),
  'data:image/webp;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
);
assert.equal(
  plazaToyPaintedSrc({ toy: { still_url: '/v1/plaza/toys/ab/still' } }),
  '/v1/plaza/toys/ab/still',
);

rememberPlazaHold({
  id: 'ab12',
  model: 'toy_ab12',
  still_url: '/v1/plaza/toys/ab12/still',
  height: 2,
  placed: false,
});
assert.equal(store.has(PLAZA_TOY_HOLD_KEY), true);
assert.deepEqual(peekPlazaHold(), {
  id: 'ab12',
  model: 'toy_ab12',
  still_url: '/v1/plaza/toys/ab12/still',
  height: 2,
  placed: false,
});
assert.deepEqual(takePlazaHold(), {
  id: 'ab12',
  model: 'toy_ab12',
  still_url: '/v1/plaza/toys/ab12/still',
  height: 2,
  placed: false,
});
assert.equal(takePlazaHold(), null);
assert.equal(peekPlazaHold(), null);

const painted = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const localToy = {
  id: 'ab12',
  model: 'toy_ab12',
  still_url: painted,
  height: 2,
  placed: false,
  preparing: true,
};
assert.deepEqual(upsertPlazaToy([], localToy), [localToy]);
assert.equal(upsertPlazaToy([localToy], { ...localToy, placed: true })[0].placed, true);

const absorbed = absorbPlazaToys(
  [{ id: 'ab12', model: 'toy_ab12', still_url: '/v1/plaza/toys/ab12/still', height: 2, placed: false }],
  [localToy],
);
assert.equal(absorbed.length, 1);
assert.equal(absorbed[0].still_url, painted);
assert.equal(absorbed[0].preparing, undefined);

const kept = absorbPlazaToys([], [localToy]);
assert.equal(kept[0].id, 'ab12');

assert.equal(isPlazaToyPreparing({ mesh_status: 'pending' }), true);
assert.equal(isPlazaToyPreparing({ mesh_status: 'ready', model_url: '/v1/generation/stylize/x/model.glb' }), false);
assert.equal(isPlazaToyPreparing({ mesh_status: 'skipped' }), false);
