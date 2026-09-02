import * as THREE from 'three';
import { assetUrl } from '../../assetUrl';
import type { IdyllicLibrary } from '../assets/IdyllicLibrary';
import type { Placement } from '../assets/InstancedScatter';
import { BRIDGE, BURROW, GATE, PONDS } from './layout';
import { isAuthoredPath, type AuthoredPath } from './layoutPaths';

export type { AuthoredPath };

export type AuthoredProp = {
  id: string;
  model: string;
  x: number;
  z: number;
  height: number;
  rotationY: number;
  sink?: number;
  fit?: 'height' | 'width';
  stretch?: number;
  tiltX?: number;
  tint?: [number, number, number];
};

export const LAYOUT_STORAGE_KEY = 'chudiki.layout.v12';

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
};

export function propLabel(model: string): string {
  return LABELS[model] ?? model;
}

export const CATALOG_MODELS = [
  'sunlit-canopy',
  'verdant-glow',
  'garden-blooms',
  'neon-leaves',
  'vibrant-bloom',
  'neon-bloom',
  'blooming-bush',
  'harvest-cradle',
  'emerald-cascade',
  'grass_a',
  'grass_b',
  'mosslit-stones',
  'wooden-fence',
  'red-mushroom',
  'rustic-bench',
  'lotus-pond',
  'timber-bridge',
  'mossy-burrow',
  'garden-gate',
  'mossflower-hollow',
  'wooden-lantern',
  'giant-tree',
  'lp_tree_01',
  'lp_tree_02',
  'lp_tree_03',
  'lp_tree_04',
  'lp_pine_01',
  'lp_pine_02',
  'lp_bush_01',
  'lp_bush_02',
  'lp_bush_bloom_01',
  'rock_medium_01',
  'rock_small_01',
];

export function catalogModels(library: IdyllicLibrary): string[] {
  return CATALOG_MODELS.filter((name) => library.has(name) || library.canLoad(name));
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
  return { height: 1 };
}

/** Stamps a chudik may walk through: water, the bridge, the gate, grass. */
export function walkThrough(model: string): boolean {
  return (
    model === 'lotus-pond' ||
    model === 'timber-bridge' ||
    model === 'garden-gate' ||
    model === 'grass_a' ||
    model === 'grass_b'
  );
}

export function isWalkTree(model: string): boolean {
  return (
    model === 'giant-tree' ||
    model === 'sunlit-canopy' ||
    model.startsWith('lp_tree') ||
    model.startsWith('lp_pine')
  );
}

/**
 * Fallback radius when the mesh is not loaded. Prefer `placedWalkRadius`
 * so a feeder, bush or burrow uses its real footprint, not a guess.
 */
export function walkFootprint(prop: AuthoredProp): number {
  if (walkThrough(prop.model)) return 0;
  if (isWalkTree(prop.model)) return Math.max(1.05, prop.height * 0.2);
  if (prop.model === 'mossy-burrow' || prop.model === 'mossflower-hollow') return 1.8;
  if (prop.model === 'harvest-cradle') return 1.05;
  if (prop.model.includes('bush') || prop.model === 'verdant-glow') return 0.78;
  return 0.55;
}

/** Disc from the placed mesh: 42% of width, trunk-only for trees. */
export function placedWalkRadius(
  prop: AuthoredProp,
  modelSize: { x: number; y: number; z: number },
): number {
  if (walkThrough(prop.model)) return 0;
  const modelWidth = Math.max(modelSize.x, modelSize.z);
  const unit =
    prop.fit === 'width'
      ? modelWidth > 1e-4
        ? 1 / modelWidth
        : 1
      : modelSize.y > 1e-4
        ? 1 / modelSize.y
        : 1;
  const scale = prop.height * unit;
  const span = modelWidth * scale;
  if (isWalkTree(prop.model)) return Math.max(0.95, span * 0.22);
  return Math.max(0.28, span * 0.42);
}

/** Collision disc for a lotus pond: water plus the rock rim. */
export function pondRadius(prop: AuthoredProp): number {
  return prop.height * 0.55;
}

export function toPlacement(prop: AuthoredProp, groundY: number): Placement {
  const lift = prop.model === 'timber-bridge' ? 0.07 : 0;
  return {
    position: new THREE.Vector3(prop.x, groundY + lift, prop.z),
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
};

export function parseLayoutDocument(raw: unknown): LayoutDocument {
  if (!raw || typeof raw !== 'object') return { props: null, paths: [] };
  const parsed = raw as { props?: AuthoredProp[]; paths?: unknown[] };
  const props = Array.isArray(parsed.props) && parsed.props.length > 0 ? parsed.props : null;
  const paths = Array.isArray(parsed.paths) ? parsed.paths.filter(isAuthoredPath) : [];
  return { props, paths };
}

export function loadSavedDocument(): LayoutDocument {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return { props: null, paths: [] };
    return parseLayoutDocument(JSON.parse(raw));
  } catch {
    return { props: null, paths: [] };
  }
}

/** Frozen layout in the repo. Used when the browser has no save yet. */
export async function loadBakedLayout(): Promise<LayoutDocument | null> {
  try {
    const response = await fetch(`${assetUrl('layout/island-layout.json')}?v=park257`, {
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
export async function resolveLayoutDocument(): Promise<LayoutDocument> {
  const local = loadSavedDocument();
  if (local.props) return local;
  return (await loadBakedLayout()) ?? { props: null, paths: [] };
}

export function loadSavedLayout(): AuthoredProp[] | null {
  return loadSavedDocument().props;
}

export function saveLayout(props: AuthoredProp[], paths: AuthoredPath[] = []) {
  const body = JSON.stringify({ version: 2, props, paths }, null, 2);
  localStorage.setItem(LAYOUT_STORAGE_KEY, body);
  return body;
}

export function downloadLayout(props: AuthoredProp[], paths: AuthoredPath[] = []) {
  const body = saveLayout(props, paths);
  const blob = new Blob([body], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'island-layout.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function clearSavedLayout() {
  localStorage.removeItem(LAYOUT_STORAGE_KEY);
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
]);

export function natureCastsShadow(name: string): boolean {
  return !SHADOWLESS.has(name);
}
