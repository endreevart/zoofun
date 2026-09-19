import * as THREE from 'three';
import { assetUrl } from '../../assetUrl';
import type { IdyllicLibrary } from '../assets/IdyllicLibrary';
import type { Placement } from '../assets/InstancedScatter';
import { BRIDGE, BURROW, GATE, PONDS } from './layout';
import {
  DIY_PROP_CAP,
  GRASS_MODELS,
  catalogForShell,
  childCatalogForShell,
} from './layoutCatalog';
import type { WorldShell } from './kinds';
import { isAuthoredPath, type AuthoredPath } from './layoutPaths';
import { isAuthoredSpawn, type AuthoredSpawn } from './layoutSpawns';
import { authoredGroundY, stampGroundLift } from './layoutWalk';

export type { AuthoredPath, AuthoredSpawn };
export {
  CATALOG_MODELS,
  CHILD_CATALOG_MODELS,
  DIY_PROP_CAP,
  GRASS_MODELS,
  MEADOW_CATALOG_MODELS,
  GROVE_CATALOG_MODELS,
  catalogForShell,
  childCatalogForShell,
  plazaChildCatalog,
  catalogGroup,
  type CatalogGroupId,
} from './layoutCatalog';
export {
  POND_WALK_MARGIN,
  TREE_TRUNK_RADIUS,
  isWalkFoliage,
  isWalkHouse,
  isWalkTree,
  placedWalkRadius,
  pondRadius,
  stampGroundLift,
  authoredGroundY,
  walkFootprint,
  walkThrough,
} from './layoutWalk';

export type AuthoredProp = {
  id: string;
  model: string;
  x: number;
  z: number;
  height: number;
  rotationY: number;
  /** World Y of the island polygon the stamp sits on. */
  y?: number;
  sink?: number;
  mine?: boolean;
  stillUrl?: string;
  modelUrl?: string;
  meshStatus?: string;
  fit?: 'height' | 'width';
  stretch?: number;
  tiltX?: number;
  tint?: [number, number, number];
};

export const LAYOUT_STORAGE_KEY = 'chudiki.layout.v12';
export const MEADOW_LAYOUT_STORAGE_KEY = 'chudiki.layout.meadow.v3';
export const GROVE_LAYOUT_STORAGE_KEY = 'chudiki.layout.grove.v3';

const SHELL_LAYOUT = {
  garden: {
    key: LAYOUT_STORAGE_KEY,
    file: 'island-layout.json',
    baked: 'layout/island-layout.json',
    bust: 'park258',
  },
  meadow: {
    key: MEADOW_LAYOUT_STORAGE_KEY,
    file: 'meadow-layout.json',
    baked: 'layout/meadow-layout.json',
    bust: 'meadow3',
  },
  grove: {
    key: GROVE_LAYOUT_STORAGE_KEY,
    file: 'grove-layout.json',
    baked: 'layout/grove-layout.json',
    bust: 'grove3',
  },
} as const;

export function layoutStorageKey(shell: WorldShell = 'garden'): string {
  return SHELL_LAYOUT[shell].key;
}

export function layoutDownloadName(shell: WorldShell = 'garden'): string {
  return SHELL_LAYOUT[shell].file;
}

export function bakedLayoutFile(shell: WorldShell = 'garden'): string {
  return SHELL_LAYOUT[shell].baked;
}

const LABELS: Record<string, string> = {
  'sunlit-canopy': 'Дерево парка',
  'verdant-glow': 'Куст',
  'garden-blooms': 'Цветы',
  'neon-leaves': 'Листья',
  'vibrant-bloom': 'Букет',
  'neon-bloom': 'Неон',
  'blooming-bush': 'Куст сад',
  'harvest-cradle': 'Корзина',
  'emerald-cascade': 'Каскад',
  'grass_a': 'Трава',
  'grass_b': 'Трава 2',
  'mosslit-stones': 'Моховые камни',
  'wooden-fence': 'Забор',
  'red-mushroom': 'Гриб',
  'rustic-bench': 'Скамейка',
  'giant-tree': 'Большое дерево',
  'lp_tree_01': 'Дерево 1',
  'lp_tree_02': 'Дерево 2',
  'lp_tree_03': 'Дерево 3',
  'lp_tree_04': 'Дерево 4',
  'lp_pine_01': 'Сосна 1',
  'lp_pine_02': 'Сосна 2',
  'lp_pine_haze_01': 'Сосна дальняя 1',
  'lp_pine_haze_02': 'Сосна дальняя 2',
  'lp_bush_01': 'Куст lp 1',
  'lp_bush_02': 'Куст lp 2',
  'lp_bush_bloom_01': 'Куст цвет 1',
  'lp_bush_bloom_02': 'Куст цвет 2',
  'rock_medium_01': 'Камень средний',
  'rock_small_01': 'Камень мелкий',
  'lotus-pond': 'Пруд',
  'timber-bridge': 'Мост',
  'mossy-burrow': 'Хижина',
  'garden-gate': 'Арка',
  'mossflower-hollow': 'Дупло',
  'wooden-lantern': 'Фонарь',
  'whimsywood-tree': 'Дерево луга',
  'blossom-tree': 'Цветущее дерево',
  'lantern-leaf-tree': 'Дерево-фонарь',
  'luminous-canopy': 'Светлый куст',
  'whimsy-bloom-coral': 'Коралл',
  'blossomback-tortoise': 'Цветочный куст',
  'pebble-blossom': 'Клумба галька',
  'moonlit-glow': 'Клумба лунная',
  'spiral-garden': 'Клумба спираль',
  'acorn-cottage': 'Жёлудь',
  'mushroom-lantern': 'Грибной дом',
  'voxel-tree': 'Дерево',
  'voxel-blossom-tree': 'Цветущее дерево',
  'voxel-evergreen': 'Ель',
  'voxel-blossom-canopy': 'Крона',
  'voxel-bloom-garden': 'Клумба',
  'voxel-verdant-garden': 'Садик',
};

export function propLabel(model: string): string {
  return LABELS[model] ?? model;
}

export function catalogModels(library: IdyllicLibrary, shell: WorldShell = 'garden'): string[] {
  return catalogForShell(shell).filter((name) => library.has(name) || library.canLoad(name));
}

export function childCatalogModels(library: IdyllicLibrary, shell: WorldShell = 'garden'): string[] {
  return childCatalogForShell(shell).filter((name) => library.has(name) || library.canLoad(name));
}

export function isAuthoredProp(value: unknown): value is AuthoredProp {
  if (!value || typeof value !== 'object') return false;
  const item = value as AuthoredProp;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.model === 'string' &&
    item.model.length > 0 &&
    Number.isFinite(item.x) &&
    Number.isFinite(item.z) &&
    Number.isFinite(item.height) &&
    Number.isFinite(item.rotationY)
  );
}

export function parseDiyProps(raw: unknown): AuthoredProp[] {
  if (!raw || typeof raw !== 'object') return [];
  const props = (raw as { props?: unknown }).props;
  if (!Array.isArray(props)) return [];
  return props
    .filter(isAuthoredProp)
    .filter((prop) => !GRASS_MODELS.has(prop.model))
    .slice(0, DIY_PROP_CAP);
}

export function defaultStamp(model: string): Pick<AuthoredProp, 'height' | 'fit' | 'sink'> {
  if (model === 'sunlit-canopy' || model.startsWith('lp_tree') || model.startsWith('lp_pine')) {
    return { height: 5.2 };
  }
  if (model === 'giant-tree') return { height: 12 };
  if (model === 'wooden-fence') return { height: 1.15 };
  if (model === 'rustic-bench') return { height: 0.82 };
  if (model === 'garden-blooms') return { height: 0.72 };
  if (model === 'neon-leaves') return { height: 1.05 };
  if (model === 'vibrant-bloom' || model === 'neon-bloom') return { height: 0.85 };
  if (model === 'blooming-bush') return { height: 1.05 };
  if (model === 'harvest-cradle') return { height: 0.95 };
  if (model === 'emerald-cascade') return { height: 2.1 };
  if (model === 'grass_a' || model === 'grass_b') return { height: 0.48 };
  if (model === 'verdant-glow' || model.startsWith('lp_bush')) return { height: 0.95 };
  if (model === 'red-mushroom') return { height: 0.28 };
  if (model.includes('rock') || model === 'mosslit-stones') {
    return { height: 0.52, fit: 'width', sink: 0.35 };
  }
  if (model === 'lotus-pond') return { height: 8.4, fit: 'width', sink: 0.08 };
  if (model === 'timber-bridge') return { height: 5.2, fit: 'width' };
  if (model === 'mossy-burrow') return { height: 2.6, sink: 0.08 };
  if (model === 'garden-gate') return { height: 4.2, sink: 0.12 };
  if (model === 'mossflower-hollow') return { height: 1.55, sink: 0.08 };
  if (model === 'wooden-lantern') return { height: 0.95, sink: 0.02 };
  if (model === 'whimsywood-tree' || model === 'blossom-tree' || model === 'lantern-leaf-tree') {
    return { height: 6.4 };
  }
  if (model === 'luminous-canopy') return { height: 1.45 };
  if (model === 'whimsy-bloom-coral' || model === 'blossomback-tortoise') return { height: 1.25 };
  if (model === 'pebble-blossom' || model === 'moonlit-glow' || model === 'spiral-garden') {
    return { height: 2.4, fit: 'width', sink: 0.06 };
  }
  if (model === 'acorn-cottage' || model === 'mushroom-lantern') return { height: 2.8, sink: 0.08 };
  if (model === 'voxel-tree' || model === 'voxel-blossom-tree' || model === 'voxel-evergreen') {
    return { height: 8.4 };
  }
  if (model === 'voxel-blossom-canopy') return { height: 1.6 };
  if (model === 'voxel-bloom-garden' || model === 'voxel-verdant-garden') {
    return { height: 2.2, fit: 'width', sink: 0.06 };
  }
  return { height: 1 };
}

export function toPlacement(prop: AuthoredProp, groundY: number): Placement {
  const lift = stampGroundLift(prop.model);
  const y = authoredGroundY(prop, () => groundY);
  return {
    position: new THREE.Vector3(prop.x, y + lift, prop.z),
    height: prop.height,
    rotationY: prop.rotationY,
    sink: prop.model === 'timber-bridge' ? 0 : prop.sink,
    fit: prop.fit,
    tiltX: prop.tiltX,
    stretch: prop.stretch ? new THREE.Vector3(prop.stretch, 1, prop.stretch) : undefined,
    tint: prop.tint ? new THREE.Color().fromArray(prop.tint) : undefined,
  };
}

/** The three lotus ponds that replace the old water discs. */
export function defaultLotusPonds(): AuthoredProp[] {
  return PONDS.map((pond, index) => ({
    id: `pond-${index}`,
    model: 'lotus-pond',
    x: pond.center.x,
    z: pond.center.y,
    height: pond.radiusX * 2.05,
    fit: 'width' as const,
    rotationY: index * 1.7,
    sink: 0.08,
  }));
}

export function defaultTimberBridge(): AuthoredProp {
  return {
    id: 'bridge-0',
    model: 'timber-bridge',
    x: BRIDGE.center.x,
    z: BRIDGE.center.z,
    height: BRIDGE.length + 0.8,
    fit: 'width',
    rotationY: BRIDGE.yaw,
  };
}

export function defaultMossyBurrow(): AuthoredProp {
  return {
    id: 'burrow-0',
    model: 'mossy-burrow',
    x: BURROW.position.x,
    z: BURROW.position.y,
    height: 2.6,
    rotationY: Math.atan2(BURROW.doorDirection.x, BURROW.doorDirection.y),
    sink: 0.08,
  };
}

export function defaultGardenGate(): AuthoredProp {
  return {
    id: 'gate-0',
    model: 'garden-gate',
    x: GATE.position.x,
    z: GATE.position.y,
    height: 4.2,
    rotationY: GATE.yaw,
    sink: 0.12,
  };
}

export function defaultLandmarks(): AuthoredProp[] {
  return [...defaultLotusPonds(), defaultTimberBridge(), defaultMossyBurrow(), defaultGardenGate()];
}

/** Keep a saved island, but put the new arch back if the old torus is gone. */
export function ensureGardenGate(props: AuthoredProp[]): AuthoredProp[] {
  if (props.some((prop) => prop.model === 'garden-gate')) return props;
  return [...props, defaultGardenGate()];
}

export function fromPlacement(id: string, model: string, placement: Placement): AuthoredProp {
  return {
    id,
    model,
    x: placement.position.x,
    z: placement.position.z,
    height: placement.height,
    rotationY: placement.rotationY ?? 0,
    sink: placement.sink,
    fit: placement.fit,
    tiltX: placement.tiltX,
    stretch: placement.stretch?.x,
    tint: placement.tint ? [placement.tint.r, placement.tint.g, placement.tint.b] : undefined,
  };
}

export type LayoutDocument = {
  props: AuthoredProp[] | null;
  paths: AuthoredPath[];
  /** Where a new egg may appear. Empty means "the meadow, as before". */
  spawns: AuthoredSpawn[];
};

const EMPTY_DOCUMENT: LayoutDocument = { props: null, paths: [], spawns: [] };

export function parseLayoutDocument(raw: unknown): LayoutDocument {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DOCUMENT };
  const parsed = raw as { props?: AuthoredProp[]; paths?: unknown[]; spawns?: unknown[] };
  const props = Array.isArray(parsed.props) && parsed.props.length > 0 ? parsed.props : null;
  const paths = Array.isArray(parsed.paths) ? parsed.paths.filter(isAuthoredPath) : [];
  const spawns = Array.isArray(parsed.spawns) ? parsed.spawns.filter(isAuthoredSpawn) : [];
  return { props, paths, spawns };
}

export function loadSavedDocument(shell: WorldShell = 'garden'): LayoutDocument {
  try {
    const raw = localStorage.getItem(layoutStorageKey(shell));
    if (!raw) return { ...EMPTY_DOCUMENT };
    return parseLayoutDocument(JSON.parse(raw));
  } catch {
    return { ...EMPTY_DOCUMENT };
  }
}

/** Frozen layout in the repo. Used when the browser has no save yet. */
export async function loadBakedLayout(shell: WorldShell = 'garden'): Promise<LayoutDocument | null> {
  const bust = SHELL_LAYOUT[shell].bust;
  try {
    const response = await fetch(`${assetUrl(bakedLayoutFile(shell))}?v=${bust}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const parsed = parseLayoutDocument(await response.json());
    if (!parsed.props) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Browser save first, then the file in public/layout/. */
export async function resolveLayoutDocument(shell: WorldShell = 'garden'): Promise<LayoutDocument> {
  const local = loadSavedDocument(shell);
  if (local.props) return local;
  return (await loadBakedLayout(shell)) ?? { ...EMPTY_DOCUMENT };
}

export function loadSavedLayout(shell: WorldShell = 'garden'): AuthoredProp[] | null {
  return loadSavedDocument(shell).props;
}

export function saveLayout(
  props: AuthoredProp[],
  paths: AuthoredPath[] = [],
  spawns: AuthoredSpawn[] = [],
  shell: WorldShell = 'garden',
) {
  const body = JSON.stringify({ version: 2, props, paths, spawns }, null, 2);
  localStorage.setItem(layoutStorageKey(shell), body);
  return body;
}

export function downloadLayout(
  props: AuthoredProp[],
  paths: AuthoredPath[] = [],
  spawns: AuthoredSpawn[] = [],
  shell: WorldShell = 'garden',
) {
  const body = saveLayout(props, paths, spawns, shell);
  const blob = new Blob([body], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = layoutDownloadName(shell);
  link.click();
  URL.revokeObjectURL(url);
}

export function clearSavedLayout(shell: WorldShell = 'garden') {
  localStorage.removeItem(layoutStorageKey(shell));
}

const SHADOWLESS = new Set([
  // Dozens of Meshy flower stamps at 15–30k faces each; they froze the
  // shadow pass more than they shaded the lawn.
  'garden-blooms',
  'vibrant-bloom',
  'neon-bloom',
  'neon-leaves',
  'grass_a',
  'grass_b',
  'voxel-blossom-canopy',
  'voxel-bloom-garden',
  'voxel-verdant-garden',
  'luminous-canopy',
  'whimsy-bloom-coral',
  'pebble-blossom',
  'moonlit-glow',
  'spiral-garden',
]);

export function natureCastsShadow(name: string): boolean {
  return !SHADOWLESS.has(name);
}
