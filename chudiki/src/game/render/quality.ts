/**
 * Phone GPUs cannot hold the desktop garden: 2048 soft shadows, bloom,
 * sun shafts and a dense lawn. One cheap tier keeps the island readable.
 *
 * iPhone Safari is the hard case. Large render targets, soft shadows and a
 * dense lawn can exceed a phone's practical GPU budget. The low tier keeps
 * those allocations bounded; a context-loss fallback removes shadow maps too.
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
  /** Half-float composer targets go black on several iOS WebGL paths. */
  composerHalfFloat: boolean;
  /** MSAA on the composer target. Keep 0 on phones; it is not free there. */
  composerSamples: number;
  /** 0 = uncapped. Phones cap so Safari does not thermal-throttle into black. */
  maxFps: number;
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
const TABLET_UA = /iPad|Android(?!.*Mobile)/i;

/** Safe mode stays 1×. Save-Data keeps the old cheap blit. Everyone else 2×. */
function phonePixelRatio(hints: QualityHints, safeMode: boolean): number {
  if (safeMode) return 1;
  if (hints.saveData) return 1.25;
  return Math.min(hints.devicePixelRatio || 2, 2);
}

export function settingsFromHints(
  hints: QualityHints,
  force: QualityTier | null = null,
  safeMode = false,
): QualitySettings {
  const phone = safeMode || (force
    ? force === 'low'
    : hints.saveData ||
      (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) ||
      PHONE_UA.test(hints.userAgent) ||
      TABLET_UA.test(hints.userAgent) ||
      (/Macintosh/i.test(hints.userAgent) && hints.coarsePointer) ||
      (hints.coarsePointer && hints.shortSide <= 1024));

  if (phone) {
    // 8-bit composer, no canvas MSAA. The garden PostFx blit ignores the
    // canvas's own MSAA, so that extra buffer was paid for and never seen —
    // until iOS ran out of GPU memory. 1.25× on a 3× iPhone is why the
    // lawn looked like a screenshot of a screenshot; 2× is still well
    // under native and only two 8-bit targets.
    return {
      tier: 'low',
      pixelRatio: phonePixelRatio(hints, safeMode),
      antialias: false,
      shadows: !safeMode,
      shadowMapSize: safeMode ? 512 : 1024,
      softShadows: false,
      gtao: false,
      bloom: false,
      shafts: false,
      grassStep: 1.15,
      grassBlades: 3,
      paintedGrass: false,
      grassReceivesShadow: false,
      composerHalfFloat: false,
      composerSamples: 0,
      maxFps: 30,
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
    composerHalfFloat: true,
    composerSamples: 0,
    maxFps: 0,
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

/** Dev-only override so a laptop can preview the phone garden: ?quality=low */
function forcedTier(): QualityTier | null {
  try {
    if (!import.meta.env?.DEV) return null;
    const value = new URLSearchParams(window.location.search).get('quality');
    return value === 'low' || value === 'high' ? value : null;
  } catch {
    return null;
  }
}

/** Resolved once per page load — the renderer cannot change these mid-flight. */
export function quality(): QualitySettings {
  let safeMode = false;
  try {
    safeMode = sessionStorage.getItem('zooo:webgl-safe') === '1';
  } catch {
    /* SSR / storage disabled */
  }
  cached ??= settingsFromHints(detectHints(), forcedTier(), safeMode);
  return cached;
}

/**
 * Hanging Meshy isles keep millions of triangles. Desktop garden PostFx
 * (GTAO, bloom, shafts, 1.5× pixels, 2048 soft shadows) cannot fill that.
 */
export function lookForHeavyIsland(base: QualitySettings): QualitySettings {
  return {
    ...base,
    // Phones keep their low-tier DPR. Desktop hanging isles drop to 1×.
    pixelRatio: base.tier === 'low' ? base.pixelRatio : Math.min(base.pixelRatio, 1),
    antialias: false,
    gtao: false,
    bloom: false,
    shafts: false,
    shadowMapSize: Math.min(base.shadowMapSize, 1024),
    softShadows: false,
  };
}

/**
 * Meshy isles are millions of triangles on every shell. Phones always take
 * the cheap look; hanging desktop isles drop PostFx the same way.
 */
export function lookForShell(base: QualitySettings, hanging: boolean): QualitySettings {
  if (hanging) {
    // Voxel canopies print a hard umbra with plain PCF. Soften just the
    // hanging shells; garden phones stay on the cheap map.
    return { ...lookForHeavyIsland(base), softShadows: true };
  }
  if (base.tier === 'low') return lookForHeavyIsland(base);
  return base;
}

/**
 * Shared lawn: a huge grass disk, crystals, catalog stamps, and other
 * toys. iPad used to sit on the desktop garden look and hitch.
 */
export function lookForPlaza(base: QualitySettings): QualitySettings {
  return {
    ...lookForHeavyIsland(base),
    pixelRatio: 1,
    shadows: true,
    softShadows: false,
    shadowMapSize: 512,
    maxFps: 30,
  };
}
