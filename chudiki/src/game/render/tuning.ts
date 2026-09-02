/**
 * The look parameters, in one place, so they can be driven by on-screen sliders
 * and then frozen back into the defaults below.
 *
 * The defaults are the values ported from scripts/render-idyllic-world.py: the
 * grade was fitted by grid search against measured luminance percentiles of the
 * reference painting, and the lights are that script's key/sky/fill rig.
 *
 * This is a development affordance. The panel that drives it only mounts in a
 * dev build, and nothing in the runtime path depends on it being present.
 */

export type TuningValues = {
  // --- key light
  sunIntensity: number;
  /** Compass angle of the sun, degrees. 0 is behind the scene, 90 is camera-right. */
  sunAzimuth: number;
  /** Height of the sun above the horizon, degrees. */
  sunElevation: number;
  /** 0 is a white sun, 1 is the render's golden (1.0, 0.72, 0.36). */
  sunWarmth: number;
  shadowSoftness: number;

  // --- ambient
  skyIntensity: number;
  fillIntensity: number;
  bounceIntensity: number;
  fogDensity: number;

  // --- bloom, applied to linear values before the grade
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;

  // --- ambient occlusion
  aoIntensity: number;

  // --- volumetrics, faked in screen space around the projected sun
  /** Length and brightness of the light shafts raked out of the canopy. */
  shaftStrength: number;
  /** How far down-screen a shaft reaches; 1 is all the way to the sun. */
  shaftLength: number;
  /** Warm scattering veil around the sun, independent of the shafts. */
  sunHaze: number;

  // --- stylized shading, injected into every lit material
  /** Backlit fringe that separates a silhouette from what is behind it. */
  rimStrength: number;
  /** Tightness of that fringe. Low is a broad wash, high is a thin edge. */
  rimPower: number;
  /** Light bleeding through leaf cards and creature skin. */
  translucency: number;
  /** 0 keeps each material's own gloss, 1 makes everything fully matte. */
  matte: number;

  // --- grade
  /** Linear value that the tone curve maps to mid grey. */
  midpoint: number;
  gamma: number;
  contrast: number;
  saturation: number;
  warmRed: number;
  warmBlue: number;
  vignette: number;

  // --- world
  /**
   * Creature height relative to the puppet rig's own units. The rig was built
   * against a smaller garden; at 1.0 a chudik stands as tall as a canopy tree.
   */
  creatureScale: number;
};

export const TUNING_DEFAULTS: TuningValues = {
  sunIntensity: 4.9,
  sunAzimuth: 10,
  sunElevation: 37,
  sunWarmth: 1,
  shadowSoftness: 16,

  skyIntensity: 2.18,
  fillIntensity: 0.9,
  bounceIntensity: 1.36,
  fogDensity: 0.0042,

  bloomStrength: 0.16,
  bloomThreshold: 0.48,
  bloomRadius: 0.6,

  aoIntensity: 0.46,

  shaftStrength: 0.22,
  shaftLength: 0.5,
  sunHaze: 0.28,

  rimStrength: 0.32,
  rimPower: 3.2,
  translucency: 0.35,
  matte: 0.55,

  midpoint: 0.355,
  gamma: 1.18,
  contrast: 1.09,
  saturation: 1.1,
  warmRed: 1.04,
  warmBlue: 1.025,
  vignette: 0.22,

  creatureScale: 0.42,
};

export type TuningControl = {
  key: keyof TuningValues;
  label: string;
  min: number;
  max: number;
  step: number;
};

export type TuningGroup = {
  title: string;
  controls: TuningControl[];
};

export const TUNING_GROUPS: TuningGroup[] = [
  {
    title: 'Солнце',
    controls: [
      { key: 'sunIntensity', label: 'Яркость', min: 0, max: 8, step: 0.05 },
      { key: 'sunAzimuth', label: 'Направление', min: -180, max: 180, step: 1 },
      { key: 'sunElevation', label: 'Высота', min: 3, max: 85, step: 1 },
      { key: 'sunWarmth', label: 'Теплота', min: 0, max: 1, step: 0.01 },
      { key: 'shadowSoftness', label: 'Мягкость теней', min: 0, max: 16, step: 0.5 },
    ],
  },
  {
    title: 'Заполняющий свет',
    controls: [
      { key: 'skyIntensity', label: 'Небо', min: 0, max: 3, step: 0.02 },
      { key: 'fillIntensity', label: 'Холодный слева', min: 0, max: 2, step: 0.01 },
      { key: 'bounceIntensity', label: 'Тёплый спереди', min: 0, max: 2, step: 0.01 },
      { key: 'fogDensity', label: 'Дымка', min: 0, max: 0.02, step: 0.0002 },
    ],
  },
  {
    title: 'Свечение и AO',
    controls: [
      { key: 'bloomStrength', label: 'Свечение', min: 0, max: 0.8, step: 0.01 },
      { key: 'bloomThreshold', label: 'Порог свечения', min: 0.2, max: 2, step: 0.01 },
      { key: 'bloomRadius', label: 'Радиус свечения', min: 0, max: 1.5, step: 0.01 },
      { key: 'aoIntensity', label: 'Затенение в щелях', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Солнечные лучи',
    controls: [
      { key: 'shaftStrength', label: 'Лучи', min: 0, max: 1.2, step: 0.01 },
      { key: 'shaftLength', label: 'Длина лучей', min: 0.1, max: 1, step: 0.01 },
      { key: 'sunHaze', label: 'Дымка солнца', min: 0, max: 1.2, step: 0.01 },
    ],
  },
  {
    title: 'Мультфильм',
    controls: [
      { key: 'rimStrength', label: 'Контурный свет', min: 0, max: 1.2, step: 0.01 },
      { key: 'rimPower', label: 'Резкость контура', min: 1, max: 6, step: 0.1 },
      { key: 'translucency', label: 'Просвет листвы', min: 0, max: 1, step: 0.01 },
      { key: 'matte', label: 'Матовость', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Мир',
    controls: [{ key: 'creatureScale', label: 'Размер чудиков', min: 0.15, max: 1.2, step: 0.01 }],
  },
  {
    title: 'Цветокоррекция',
    controls: [
      { key: 'midpoint', label: 'Экспозиция', min: 0.05, max: 1.5, step: 0.005 },
      { key: 'gamma', label: 'Гамма', min: 0.35, max: 1.6, step: 0.01 },
      { key: 'contrast', label: 'Контраст', min: 0.3, max: 1.8, step: 0.01 },
      { key: 'saturation', label: 'Насыщенность', min: 0.4, max: 2.6, step: 0.01 },
      { key: 'warmRed', label: 'Тёплый красный', min: 0.9, max: 1.2, step: 0.005 },
      { key: 'warmBlue', label: 'Холодный синий', min: 0.8, max: 1.15, step: 0.005 },
      { key: 'vignette', label: 'Виньетка', min: 0, max: 0.6, step: 0.01 },
    ],
  },
];

// Bumped when the parameter set changes, so a browser holding the previous
// session's values does not shadow newly frozen defaults.
const STORAGE_KEY = 'chudiki.tuning.v5';

export class Tuning {
  private values: TuningValues = { ...TUNING_DEFAULTS };
  private listeners = new Set<(values: TuningValues) => void>();

  constructor() {
    this.values = { ...TUNING_DEFAULTS, ...readStored() };
  }

  get(): TuningValues {
    return this.values;
  }

  set(key: keyof TuningValues, value: number) {
    if (this.values[key] === value) return;
    this.values = { ...this.values, [key]: value };
    this.persist();
    this.emit();
  }

  reset() {
    this.values = { ...TUNING_DEFAULTS };
    this.persist();
    this.emit();
  }

  subscribe(listener: (values: TuningValues) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The current values as a code block, ready to paste over TUNING_DEFAULTS. */
  snippet(): string {
    const lines = (Object.keys(TUNING_DEFAULTS) as (keyof TuningValues)[]).map((key) => {
      const value = this.values[key];
      // Fog density needs more places than the rest to stay meaningful.
      const text = key === 'fogDensity' ? value.toFixed(4) : String(Number(value.toFixed(3)));
      return `  ${key}: ${text},`;
    });
    return `export const TUNING_DEFAULTS: TuningValues = {\n${lines.join('\n')}\n};`;
  }

  private emit() {
    for (const listener of this.listeners) listener(this.values);
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Private browsing or a full quota: tuning simply will not survive reload.
    }
  }
}

function readStored(): Partial<TuningValues> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<TuningValues> = {};
    for (const key of Object.keys(TUNING_DEFAULTS) as (keyof TuningValues)[]) {
      if (typeof parsed[key] === 'number' && Number.isFinite(parsed[key])) {
        out[key] = parsed[key] as number;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Shared instance: the game applies it, the panel drives it. */
export const tuning = new Tuning();
