/**
 * Phone GPUs cannot hold the desktop garden: 2048 soft shadows, bloom,
 * sun shafts and a dense lawn. One cheap tier keeps the island readable.
 */

export type QualityTier = 'high' | 'low';

export type QualitySettings = {
  tier: QualityTier;
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  softShadows: boolean;
  gtao: boolean;
  bloom: boolean;
  shafts: boolean;
  grassStep: number;
  grassBlades: number;
  paintedGrass: boolean;
  grassReceivesShadow: boolean;
};

export type QualityHints = {
  coarsePointer: boolean;
  shortSide: number;
  saveData: boolean;
  deviceMemory?: number;
  userAgent: string;
  devicePixelRatio: number;
};

const PHONE_UA = /Android.+Mobile|iPhone|iPod/i;

export function settingsFromHints(hints: QualityHints): QualitySettings {
  const phone =
    hints.saveData ||
    (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) ||
    PHONE_UA.test(hints.userAgent) ||
    (hints.coarsePointer && hints.shortSide <= 520);

  if (phone) {
    return {
      tier: 'low',
      pixelRatio: Math.min(hints.devicePixelRatio || 1, 1),
      antialias: false,
      shadows: false,
      shadowMapSize: 512,
      softShadows: false,
      gtao: false,
      bloom: false,
      shafts: false,
      grassStep: 1.05,
      grassBlades: 3,
      paintedGrass: false,
      grassReceivesShadow: false,
    };
  }

  return {
    tier: 'high',
    pixelRatio: Math.min(hints.devicePixelRatio || 1, 1.5),
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    softShadows: true,
    // Tablets stay on the full garden, but skip the AO pass that already
    // dropped them to the old "low" PostFx tier.
    gtao: !hints.coarsePointer,
    bloom: true,
    shafts: true,
    grassStep: 0.48,
    grassBlades: 7,
    paintedGrass: true,
    grassReceivesShadow: true,
  };
}

export function detectHints(): QualityHints {
  const width = typeof window === 'undefined' ? 1280 : Math.min(window.innerWidth, window.screen.width);
  const height =
    typeof window === 'undefined' ? 800 : Math.min(window.innerHeight, window.screen.height);
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    shortSide: Math.min(width, height),
    saveData: Boolean(connection?.saveData),
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
  };
}

let cached: QualitySettings | null = null;

/** Resolved once per page load — the renderer cannot change these mid-flight. */
export function quality(): QualitySettings {
  cached ??= settingsFromHints(detectHints());
  return cached;
}
