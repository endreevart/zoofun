import { CHUDIK_ACCENT, CHUDIK_BODY } from '../core/palette';
import { chance, intRange, mulberry32, pick, range } from '../core/rng';
import { voiceFromSeed, type VoiceParams } from '../audio/voice';

export type BodyShape = 'blob' | 'egg' | 'pear' | 'round' | 'tall';
export type EarType = 'bunny' | 'horns' | 'antennae' | 'crest' | 'fins' | 'none';

/** Locomotion / look family. OpenRouter picks one from the drawing. */
export type ChudikKind = {
  id: string;
  label: string;
  emoji: string;
  /** Nudges the generated body so the chosen kind is visible. */
  hints: Partial<{ ears: EarType; legs: 0 | 2 | 4; wings: boolean; tail: boolean; size: number }>;
};

export const KINDS: ChudikKind[] = [
  { id: 'jumper', label: 'Прыгун', emoji: '🐰', hints: { ears: 'bunny', legs: 2 } },
  { id: 'fluffy', label: 'Пушистик', emoji: '☁️', hints: { ears: 'none', legs: 0 } },
  { id: 'crawler', label: 'Ползунок', emoji: '🐛', hints: { ears: 'antennae', legs: 4 } },
  { id: 'swimmer', label: 'Плавунец', emoji: '🐟', hints: { ears: 'fins', legs: 0 } },
  { id: 'flyer', label: 'Летун', emoji: '🦋', hints: { wings: true, legs: 2 } },
  { id: 'stomper', label: 'Топотун', emoji: '🐘', hints: { legs: 4, size: 1.35 } },
  { id: 'zippy', label: 'Шустрик', emoji: '⚡', hints: { legs: 2, size: 0.8 } },
  { id: 'eary', label: 'Ушастик', emoji: '👂', hints: { ears: 'bunny', size: 0.95 } },
  { id: 'horny', label: 'Рогатик', emoji: '🦌', hints: { ears: 'horns', legs: 4 } },
  { id: 'sparkle', label: 'Светлячок', emoji: '✨', hints: { ears: 'antennae', size: 0.75 } },
  { id: 'roundy', label: 'Круглик', emoji: '⚪', hints: { ears: 'none', legs: 2 } },
  { id: 'tailly', label: 'Хвостик', emoji: '🐿️', hints: { tail: true, ears: 'crest', legs: 2 } },
];

export function kindById(id: string): ChudikKind {
  return KINDS.find((k) => k.id === id) ?? KINDS[0];
}

/** Contour and texture extracted from a child's drawing. */
export type DrawingData = {
  /** Silhouette outline in a normalised -0.5..0.5 box, y up. */
  contour: Array<[number, number]>;
  /** PNG data URL of the cleaned-up drawing, mapped onto the front and back. */
  textureUrl: string;
  /** Aspect ratio (width / height) of the silhouette. */
  aspect: number;
  /** Where to hang the eyes, in the same normalised space. */
  eyeAnchor: [number, number];
  eyeSpacing: number;
  eyeRadius: number;
  /** Dominant colours, reused for the extruded sides and the feet. */
  sideColor: string;
  accentColor: string;
  /** Neural restyle already painted the face; skip glued-on eyes and feet. */
  painted?: boolean;
  /** Backend-hosted GLB from Meshy. When set, the island loads a 3D mesh. */
  modelUrl?: string;
  /** Clay egg used only while the real creature is still being made. */
  placeholder?: boolean;
};

export type ChudikSpec = {
  id: string;
  name: string;
  kindId: string;
  seed: number;
  origin: 'resident' | 'drawing';
  createdAt: number;

  bodyColor: string;
  bellyColor: string;
  accentColor: string;
  bodyShape: BodyShape;
  earType: EarType;
  legCount: 0 | 2 | 4;
  hasTail: boolean;
  hasWings: boolean;
  eyeScale: number;
  size: number;

  voice: VoiceParams;
  /** Present only for creatures grown from a drawing. */
  drawing?: DrawingData;
  /** Egg on the lawn; the puppet is not ready yet. */
  hatching?: boolean;
};

const BODY_SHAPES: BodyShape[] = ['blob', 'egg', 'pear', 'round', 'tall'];
const EAR_TYPES: EarType[] = ['bunny', 'horns', 'antennae', 'crest', 'fins', 'none'];

/** Builds a full appearance from a seed. */
export function generateSpec(options: {
  id: string;
  name: string;
  seed: number;
  kindId?: string;
  origin?: ChudikSpec['origin'];
  drawing?: DrawingData;
  hatching?: boolean;
}): ChudikSpec {
  const rng = mulberry32(options.seed);
  const kind = options.kindId ? kindById(options.kindId) : pick(rng, KINDS);
  const hints = kind.hints;

  const bodyColor = pick(rng, CHUDIK_BODY);
  const size = (hints.size ?? 1) * range(rng, 0.85, 1.15);

  const spec: ChudikSpec = {
    id: options.id,
    name: options.name,
    kindId: kind.id,
    seed: options.seed,
    origin: options.origin ?? 'resident',
    createdAt: Date.now(),

    bodyColor,
    bellyColor: lighten(bodyColor, 0.32),
    accentColor: options.drawing?.accentColor ?? pick(rng, CHUDIK_ACCENT),
    bodyShape: pick(rng, BODY_SHAPES),
    earType: hints.ears ?? pick(rng, EAR_TYPES),
    legCount: hints.legs ?? (pick(rng, [0, 2, 2, 2, 4]) as 0 | 2 | 4),
    hasTail: hints.tail ?? chance(rng, 0.35),
    hasWings: hints.wings ?? chance(rng, 0.15),
    eyeScale: range(rng, 0.9, 1.25),
    size,

    voice: voiceFromSeed(options.seed, size),
    drawing: options.drawing,
    hatching: options.hatching,
  };

  return spec;
}

/** Fallback nicknames when the backend profile is missing. */
export const NAME_SUGGESTIONS = [
  'Бубуся',
  'Тяпа',
  'Шмяк',
  'Пуфик',
  'Кекс',
  'Мурзик',
  'Тыква',
  'Бублик',
  'Зюзя',
  'Няша',
  'Плюх',
  'Топа',
  'Ушастик',
  'Лапа',
  'Чубик',
  'Дынька',
  'Жужа',
  'Пипа',
  'Хрумка',
  'Облачко',
] as const;

export function randomName(seed: number): string {
  const rng = mulberry32(seed);
  return pick(rng, NAME_SUGGESTIONS);
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function makeId(): string {
  const rng = mulberry32(Date.now() ^ ((Math.random() * 0xffffffff) >>> 0));
  return `ch_${Date.now().toString(36)}_${intRange(rng, 0, 0xffffff).toString(36)}`;
}

function lighten(hex: string, amount: number): string {
  const value = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((value >> 16) & 255) + Math.round(255 * amount));
  const g = Math.min(255, ((value >> 8) & 255) + Math.round(255 * amount));
  const b = Math.min(255, (value & 255) + Math.round(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
