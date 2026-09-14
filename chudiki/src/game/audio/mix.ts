/** Music and narrator mix. Stored locally so a child can turn either down. */

export const MUSIC_KEY = 'zoofun-music';
export const VOICE_KEY = 'zoofun-voice';

/** Default HTMLAudio garden volume — quiet under voices, tablets sit close. */
export const DEFAULT_MUSIC = 0.11;
/** Narrator / creature-voice multiplier. Cue peak is 0.78 × this. */
export const DEFAULT_VOICE = 1;

export type IslandMix = {
  music: number;
  voice: number;
};

export function clampMix(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/**
 * Slider travel → actual gain. Loudness is not linear: half the slider used
 * to still sound almost max, so "еле слышно" lived in the last few percent.
 */
export const MIX_SLIDER_POWER = 2.2;

export function sliderToGain(slider: number): number {
  return clampMix(slider, 0) ** MIX_SLIDER_POWER;
}

export function gainToSlider(gain: number): number {
  const level = clampMix(gain, 0);
  if (level <= 0) return 0;
  return Math.min(1, level ** (1 / MIX_SLIDER_POWER));
}

function readStored(store: Storage, key: string, fallback: number): number {
  const raw = store.getItem(key);
  if (raw == null || raw === '') return fallback;
  return clampMix(Number.parseFloat(raw), fallback);
}

export function readMix(storage?: Storage | null): IslandMix {
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    if (!store) return { music: DEFAULT_MUSIC, voice: DEFAULT_VOICE };
    return {
      music: readStored(store, MUSIC_KEY, DEFAULT_MUSIC),
      voice: readStored(store, VOICE_KEY, DEFAULT_VOICE),
    };
  } catch {
    return { music: DEFAULT_MUSIC, voice: DEFAULT_VOICE };
  }
}

export function writeMix(mix: IslandMix, storage?: Storage | null): IslandMix {
  const next = {
    music: clampMix(mix.music, DEFAULT_MUSIC),
    voice: clampMix(mix.voice, DEFAULT_VOICE),
  };
  try {
    const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    store?.setItem(MUSIC_KEY, String(next.music));
    store?.setItem(VOICE_KEY, String(next.voice));
  } catch {
    /* private mode */
  }
  return next;
}

/** Session flag so welcome lines do not fire on every return to the same screen. */
export function claimCueOnce(id: string, storage?: Storage | null): boolean {
  const key = `zoofun-spoke-${id}`;
  try {
    const store = storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage);
    if (!store) return true;
    if (store.getItem(key)) return false;
    store.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}
