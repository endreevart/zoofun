export const WORLD_AUTHORED = 'authored';
export const WORLD_DIY_SKU = 'world_diy_garden';
export const WORLD_AUTHORED_MEADOW = 'authored_meadow';
export const WORLD_DIY_MEADOW = 'world_diy_meadow';
export const WORLD_AUTHORED_GROVE = 'authored_grove';
export const WORLD_DIY_GROVE = 'world_diy_grove';
export const AUTHORED_TITLE = 'Волшебный остров';

/** Terrain pack. A later island kind adds a new shell id and its own loader. */
export type WorldShell = 'garden' | 'meadow' | 'grove';

export function islandModelForShell(shell: WorldShell): string {
  if (shell === 'meadow') return 'whimsy-isle';
  if (shell === 'grove') return 'floating-grassland';
  return 'floating-island';
}

/** Meshy hanging lawns: no park water, no Kenney grass, walk from the mesh. */
export function isHangingShell(shell: WorldShell): boolean {
  return shell === 'meadow' || shell === 'grove';
}

/**
 * Stamps still cast. Hanging lawns also receive, plus contact discs —
 * a separate catcher either floated or vanished into the voxels.
 */
export function skipsIslandShadows(_shell: WorldShell): boolean {
  return false;
}

/** Unused: a draped catcher either floated or sank into the Meshy lawn. */
export function usesLawnCatcher(_shell: WorldShell): boolean {
  return false;
}

export type IslandKind = {
  id: string;
  shell: WorldShell;
  authoredId: string;
  authoredTitle: string;
  authoredArt: string;
  authoredAccess: 'free';
  constructionSku: string;
  constructionTitle: string;
  constructionArt: string;
  instancePrefix: string;
  styleTitle: string;
};

export const GARDEN_KIND: IslandKind = {
  id: 'garden',
  shell: 'garden',
  authoredId: WORLD_AUTHORED,
  authoredTitle: AUTHORED_TITLE,
  authoredArt: '/ui/magic-island.jpg',
  authoredAccess: 'free',
  constructionSku: WORLD_DIY_SKU,
  constructionTitle: 'Собери сам',
  constructionArt: '/ui/diy-island.jpg',
  instancePrefix: 'Сад',
  styleTitle: 'Волшебный лес',
};

export const MEADOW_KIND: IslandKind = {
  id: 'meadow',
  shell: 'meadow',
  authoredId: WORLD_AUTHORED_MEADOW,
  authoredTitle: 'Висячий луг',
  authoredArt: '/ui/magic-meadow.jpg',
  authoredAccess: 'free',
  constructionSku: WORLD_DIY_MEADOW,
  constructionTitle: 'Собери луг',
  constructionArt: '/ui/diy-meadow.jpg',
  instancePrefix: 'Луг',
  styleTitle: 'Висячий луг',
};

/**
 * Voxel grassland (D-021): free «Куболесье» plus `world_diy_grove`.
 * Studio still opens `?studio=1&kind=grove`.
 */
export const GROVE_KIND: IslandKind = {
  id: 'grove',
  shell: 'grove',
  authoredId: WORLD_AUTHORED_GROVE,
  authoredTitle: 'Куболесье',
  authoredArt: '/ui/magic-grove.jpg',
  authoredAccess: 'free',
  constructionSku: WORLD_DIY_GROVE,
  constructionTitle: 'Собери куболесье',
  constructionArt: '/ui/diy-grove.jpg',
  instancePrefix: 'Куболесье',
  styleTitle: 'Куболесье',
};

export const ISLAND_KINDS: readonly IslandKind[] = [GARDEN_KIND, MEADOW_KIND, GROVE_KIND];
export const SHOP_ISLAND_KINDS: readonly IslandKind[] = ISLAND_KINDS;
export const FREE_ISLAND_KINDS: readonly IslandKind[] = [GARDEN_KIND];
export const PUBLIC_ISLAND_KINDS: readonly IslandKind[] = SHOP_ISLAND_KINDS;

const BY_SKU = new Map(ISLAND_KINDS.map((item) => [item.constructionSku, item]));
const BY_AUTHORED = new Map(ISLAND_KINDS.map((item) => [item.authoredId, item]));

export function kindForSku(sku: string | null | undefined): IslandKind {
  if (sku && BY_SKU.has(sku)) return BY_SKU.get(sku)!;
  return GARDEN_KIND;
}

export function isConstructionSku(sku: string | null | undefined): boolean {
  return Boolean(sku && BY_SKU.has(sku));
}

export function isDiyWorld(id: string | null | undefined): boolean {
  if (!id || BY_AUTHORED.has(id)) return false;
  if (BY_SKU.has(id)) return true;
  for (const kind of ISLAND_KINDS) {
    if (id.startsWith(`${kind.constructionSku}_`)) return true;
  }
  return id.startsWith('world_diy_');
}

export function skuFromWorldId(id: string, sku?: string | null): string {
  if (sku && BY_SKU.has(sku)) return sku;
  if (BY_SKU.has(id)) return id;
  for (const kind of ISLAND_KINDS) {
    if (id.startsWith(`${kind.constructionSku}_`)) return kind.constructionSku;
  }
  if (id.startsWith('world_diy_')) return WORLD_DIY_SKU;
  return '';
}

export function kindOfWorld(id: string, sku?: string | null): IslandKind {
  if (sku && BY_SKU.has(sku)) return BY_SKU.get(sku)!;
  if (BY_AUTHORED.has(id)) return BY_AUTHORED.get(id)!;
  return kindForSku(skuFromWorldId(id, sku));
}

export function isRetiredWorld(id: string | null | undefined, _sku?: string | null): boolean {
  return id === WORLD_AUTHORED_MEADOW || id === WORLD_AUTHORED_GROVE;
}

export function nextInstanceTitle(prefix: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  let n = 1;
  while (taken.has(`${prefix} ${n}`)) n += 1;
  return `${prefix} ${n}`;
}

export function gardenArt(id: string, sku?: string): string {
  const kind = kindOfWorld(id, sku);
  if (id === kind.authoredId || !isDiyWorld(id)) return kind.authoredArt;
  return kind.constructionArt;
}

export type OwnedKindRow = {
  kind: IslandKind;
  instances: Array<{ id: string; title: string; sku?: string }>;
};

export function ownedKindRows(
  worlds: Array<{ id: string; title: string; sku?: string }>,
  kinds: readonly IslandKind[] = SHOP_ISLAND_KINDS,
): OwnedKindRow[] {
  return kinds
    .map((kind) => ({
      kind,
      instances: worlds.filter(
        (item) => (item.sku ?? skuFromWorldId(item.id)) === kind.constructionSku,
      ),
    }))
    .filter(
      (row) =>
        row.instances.length > 0 || FREE_ISLAND_KINDS.some((item) => item.id === row.kind.id),
    );
}

/** Studio switcher still authors meadow locally (`?studio=1&kind=meadow`). */
export const STUDIO_MEADOW_KIND = MEADOW_KIND;
export const STUDIO_GROVE_KIND = GROVE_KIND;

export function isStudioKind(kind: IslandKind): boolean {
  return kind.id === MEADOW_KIND.id || kind.id === GROVE_KIND.id;
}

/** Child stamp HUD: paid construction copies only. */
export function usesChildBuild(id: string | null | undefined): boolean {
  return isDiyWorld(id);
}

/** Local layout mock of a later island. Not a shop SKU. */
export const PREVIEW_COVE_KIND: IslandKind = {
  id: 'cove',
  shell: 'garden',
  authoredId: 'authored_cove',
  authoredTitle: 'Солнечная бухта',
  authoredArt: '/ui/cove-island.jpg',
  authoredAccess: 'free',
  constructionSku: 'world_diy_cove',
  constructionTitle: 'Собери бухту',
  constructionArt: '/ui/diy-cove.jpg',
  instancePrefix: 'Бухта',
  styleTitle: 'Солнечная бухта',
};

export function pickerKinds(preview: boolean): IslandKind[] {
  return preview ? [...FREE_ISLAND_KINDS, PREVIEW_COVE_KIND] : [...FREE_ISLAND_KINDS];
}

export function shopKinds(preview: boolean): IslandKind[] {
  return preview ? [...SHOP_ISLAND_KINDS, PREVIEW_COVE_KIND] : [...SHOP_ISLAND_KINDS];
}

export type PickerPreview = 'off' | 'kinds' | 'empty';

export function pickerPreview(search: string): PickerPreview {
  try {
    const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(
      'preview',
    );
    if (value === 'kinds' || value === 'empty') return value;
  } catch {
    /* ignore */
  }
  return 'off';
}

export function worldsForPicker(
  worlds: Array<{ id: string; title: string; sku?: string }>,
  preview: PickerPreview,
): Array<{ id: string; title: string; sku?: string }> {
  const live = worlds.filter((item) => !isRetiredWorld(item.id, item.sku));
  if (preview === 'empty') return [];
  if (preview !== 'kinds') return live;
  const sku = PREVIEW_COVE_KIND.constructionSku;
  if (live.some((item) => (item.sku ?? skuFromWorldId(item.id)) === sku)) return live;
  return [...live, { id: sku, title: `${PREVIEW_COVE_KIND.instancePrefix} 1`, sku }];
}

export type OwnedConstruction = {
  id: string;
  title: string;
  sku?: string;
  kind: IslandKind;
};

export function ownedConstruction(
  worlds: Array<{ id: string; title: string; sku?: string }>,
  kinds: readonly IslandKind[] = SHOP_ISLAND_KINDS,
): OwnedConstruction[] {
  return worlds.flatMap((item) => {
    const sku = item.sku ?? skuFromWorldId(item.id);
    const kind = kinds.find((row) => row.constructionSku === sku);
    if (!kind) return [];
    return [{ id: item.id, title: item.title, sku: item.sku, kind }];
  });
}

export function isPreviewKind(kind: IslandKind): boolean {
  return kind.id === PREVIEW_COVE_KIND.id;
}

/** One shop SKU: show its name. Several kinds: ask which style first. */
export function newIslandHint(manyStyles: boolean, styleTitle: string): string {
  return manyStyles ? 'Выберите стиль' : styleTitle;
}

export function emptyIslandLead(manyStyles: boolean): string {
  return manyStyles
    ? 'Выберите стиль и стройте без ограничений'
    : 'Стройте без ограничений';
}
