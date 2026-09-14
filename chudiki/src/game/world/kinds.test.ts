import assert from 'node:assert/strict';
import {
  GARDEN_KIND,
  GROVE_KIND,
  ISLAND_KINDS,
  MEADOW_KIND,
  WORLD_AUTHORED,
  WORLD_DIY_GROVE,
  WORLD_DIY_MEADOW,
  WORLD_DIY_SKU,
  isConstructionSku,
  isDiyWorld,
  isHangingShell,
  skipsIslandShadows,
  usesLawnCatcher,
  kindOfWorld,
  nextInstanceTitle,
  ownedKindRows,
  skuFromWorldId,
  gardenArt,
  PREVIEW_COVE_KIND,
  pickerKinds,
  pickerPreview,
  worldsForPicker,
  ownedConstruction,
  newIslandHint,
  emptyIslandLead,
  STUDIO_GROVE_KIND,
  STUDIO_MEADOW_KIND,
  islandModelForShell,
  isStudioKind,
  usesChildBuild,
} from './kinds.ts';

assert.equal(ISLAND_KINDS.length, 3);
assert.equal(ISLAND_KINDS[0].id, 'garden');
assert.equal(ISLAND_KINDS[1].id, 'meadow');
assert.equal(ISLAND_KINDS[2].id, 'grove');
assert.equal(isConstructionSku(WORLD_DIY_SKU), true);
assert.equal(isConstructionSku(WORLD_DIY_MEADOW), true);
assert.equal(isConstructionSku(WORLD_DIY_GROVE), true);
assert.equal(isConstructionSku('pack_5'), false);
assert.equal(isDiyWorld(WORLD_AUTHORED), false);
assert.equal(isDiyWorld(WORLD_DIY_SKU), true);
assert.equal(isDiyWorld(WORLD_DIY_MEADOW), true);
assert.equal(isDiyWorld(WORLD_DIY_GROVE), true);
assert.equal(isDiyWorld('world_diy_ab12cd'), true);
assert.equal(isDiyWorld('world_diy_garden_aa11bb'), true);
assert.equal(skuFromWorldId('world_diy_ab12cd'), WORLD_DIY_SKU);
assert.equal(skuFromWorldId('world_diy_garden_aa11bb'), WORLD_DIY_SKU);
assert.equal(skuFromWorldId('world_diy_meadow_aa11bb'), WORLD_DIY_MEADOW);
assert.equal(skuFromWorldId('world_diy_grove_aa11bb'), WORLD_DIY_GROVE);
assert.equal(kindOfWorld(WORLD_AUTHORED).id, 'garden');
assert.equal(kindOfWorld(WORLD_DIY_SKU).constructionArt, '/ui/diy-island.jpg');
assert.equal(gardenArt(WORLD_AUTHORED), '/ui/magic-island.jpg');
assert.equal(gardenArt(WORLD_DIY_SKU), '/ui/diy-island.jpg');
assert.equal(gardenArt(MEADOW_KIND.authoredId), '/ui/magic-meadow.jpg');
assert.equal(gardenArt(WORLD_DIY_MEADOW), '/ui/diy-meadow.jpg');
assert.equal(gardenArt(GROVE_KIND.authoredId), '/ui/magic-grove.jpg');
assert.equal(gardenArt(WORLD_DIY_GROVE), '/ui/diy-grove.jpg');
assert.equal(GROVE_KIND.authoredTitle, 'Куболесье');
assert.equal(GROVE_KIND.constructionTitle, 'Собери куболесье');
assert.equal(GROVE_KIND.instancePrefix, 'Куболесье');
assert.equal(nextInstanceTitle('Бухта', ['Бухта 1', 'Бухта 3']), 'Бухта 2');

const rows = ownedKindRows([
  { id: WORLD_DIY_SKU, title: 'Сад 1', sku: WORLD_DIY_SKU },
]);
assert.equal(rows.length, 3);
assert.equal(rows[0].kind.id, GARDEN_KIND.id);
assert.equal(rows[0].instances[0].title, 'Сад 1');
assert.equal(rows[1].kind.id, MEADOW_KIND.id);
assert.equal(rows[1].instances.length, 0);
assert.equal(rows[2].kind.id, GROVE_KIND.id);
assert.equal(rows[2].instances.length, 0);

assert.equal(pickerKinds(false).length, 3);
assert.equal(pickerKinds(true).map((item) => item.id).join(','), 'garden,meadow,grove,cove');
const previewRows = ownedKindRows(
  [
    { id: WORLD_DIY_SKU, title: 'Сад 1', sku: WORLD_DIY_SKU },
    { id: PREVIEW_COVE_KIND.constructionSku, title: 'Бухта 1', sku: PREVIEW_COVE_KIND.constructionSku },
  ],
  pickerKinds(true),
);
assert.equal(previewRows.length, 4);
assert.equal(previewRows[3].kind.id, 'cove');
assert.equal(previewRows[3].instances[0].title, 'Бухта 1');

assert.equal(GARDEN_KIND.styleTitle, 'Волшебный лес');
assert.equal(pickerPreview('?preview=kinds'), 'kinds');
assert.equal(pickerPreview('?preview=empty'), 'empty');
assert.equal(pickerPreview(''), 'off');
assert.equal(worldsForPicker([{ id: WORLD_DIY_SKU, title: 'Сад 1' }], 'empty').length, 0);
assert.equal(
  worldsForPicker([{ id: WORLD_DIY_SKU, title: 'Сад 1', sku: WORLD_DIY_SKU }], 'kinds').length,
  2,
);
const built = ownedConstruction(
  worldsForPicker(
    [
      { id: WORLD_DIY_SKU, title: 'Сад 1', sku: WORLD_DIY_SKU },
      { id: 'world_diy_garden_aa', title: 'Сад 2', sku: WORLD_DIY_SKU },
    ],
    'kinds',
  ),
  pickerKinds(true),
);
assert.equal(built.map((item) => item.title).join(','), 'Сад 1,Сад 2,Бухта 1');
assert.equal(built[2].kind.id, 'cove');

assert.equal(newIslandHint(false, GARDEN_KIND.styleTitle), 'Волшебный лес');
assert.equal(newIslandHint(true, GARDEN_KIND.styleTitle), 'Выберите стиль');
assert.equal(emptyIslandLead(false), 'Стройте без ограничений');
assert.equal(emptyIslandLead(true), 'Выберите стиль и стройте без ограничений');

assert.equal(ISLAND_KINDS.some((item) => item.id === 'meadow'), true);
assert.equal(isConstructionSku(STUDIO_MEADOW_KIND.constructionSku), true);
assert.equal(isDiyWorld(STUDIO_MEADOW_KIND.authoredId), false);
assert.equal(kindOfWorld(STUDIO_MEADOW_KIND.authoredId).id, 'meadow');
assert.equal(kindOfWorld(STUDIO_MEADOW_KIND.authoredId).shell, 'meadow');
assert.equal(islandModelForShell('meadow'), 'whimsy-isle');
assert.equal(islandModelForShell('garden'), 'floating-island');
assert.equal(islandModelForShell('grove'), 'floating-grassland');
assert.equal(isStudioKind(STUDIO_MEADOW_KIND), true);
assert.equal(isStudioKind(STUDIO_GROVE_KIND), true);
assert.equal(isStudioKind(GARDEN_KIND), false);
assert.equal(usesChildBuild(WORLD_DIY_SKU), true);
assert.equal(usesChildBuild(WORLD_DIY_MEADOW), true);
assert.equal(usesChildBuild(WORLD_DIY_GROVE), true);
assert.equal(usesChildBuild(STUDIO_MEADOW_KIND.authoredId), false);
assert.equal(usesChildBuild(WORLD_AUTHORED), false);
assert.equal(pickerKinds(false).some((item) => item.id === 'meadow'), true);
assert.equal(pickerKinds(false).some((item) => item.id === 'grove'), true);
assert.equal(isConstructionSku(GROVE_KIND.constructionSku), true);
assert.equal(kindOfWorld(GROVE_KIND.authoredId).id, 'grove');
assert.equal(kindOfWorld(GROVE_KIND.authoredId).shell, 'grove');
assert.equal(isHangingShell('grove'), true);
assert.equal(isHangingShell('meadow'), true);
assert.equal(isHangingShell('garden'), false);
assert.equal(skipsIslandShadows('grove'), false);
assert.equal(skipsIslandShadows('meadow'), false);
assert.equal(skipsIslandShadows('garden'), false);
assert.equal(usesLawnCatcher('grove'), false);
assert.equal(usesLawnCatcher('meadow'), false);
assert.equal(usesLawnCatcher('garden'), false);
assert.equal(STUDIO_MEADOW_KIND.constructionSku, WORLD_DIY_MEADOW);
assert.equal(STUDIO_GROVE_KIND.authoredId, GROVE_KIND.authoredId);
