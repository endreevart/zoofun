import { intRange, mulberry32, pick, range, Rng } from '../core/rng';

/**
 * Every chudik gets its own little voice, derived from its seed so it never
 * changes between sessions. No audio files: it is all synthesised on the fly.
 */

export type VoiceTimbre = 'chirp' | 'boing' | 'warble' | 'squeak' | 'burble' | 'hum' | 'toot';

export type VoiceParams = {
  timbre: VoiceTimbre;
  /** Root pitch in Hz. Small creatures sit higher. */
  baseFreq: number;
  /** Semitone offsets of the little melody, 2 to 5 notes. */
  melody: number[];
  noteLength: number;
  gap: number;
  vibratoRate: number;
  vibratoDepth: number;
  /** Low-pass cutoff, keeps everything soft for small ears. */
  cutoff: number;
  glide: number;
};

const TIMBRES: VoiceTimbre[] = ['chirp', 'boing', 'warble', 'squeak', 'burble', 'hum', 'toot'];

const MELODY_SHAPES: number[][] = [
  [0, 4, 7],
  [0, 7],
  [0, -3, 2],
  [0, 5, 3, 8],
  [0, 2, 4, 5, 7],
  [0, 12],
  [0, -5],
  [0, 3, 7, 12],
  [0, 1, 0],
  [0, 9, 5],
];

export function voiceFromSeed(seed: number, sizeHint = 1): VoiceParams {
  const rng: Rng = mulberry32(seed ^ 0x5eed);
  const timbre = pick(rng, TIMBRES);

  // Bigger bodies speak lower. Keeps a visual/audio link kids notice instantly.
  const sizeFactor = 1 / Math.max(0.55, Math.min(1.9, sizeHint));
  const baseFreq = range(rng, 210, 620) * Math.pow(sizeFactor, 0.7);

  const shape = pick(rng, MELODY_SHAPES);
  const melody = rng() < 0.35 ? shape.slice().reverse() : shape.slice();
  if (rng() < 0.3) melody.push(melody[0] + intRange(rng, -4, 12));

  return {
    timbre,
    baseFreq,
    melody,
    noteLength: range(rng, 0.09, 0.2),
    gap: range(rng, 0.01, 0.07),
    vibratoRate: range(rng, 4, 16),
    vibratoDepth: range(rng, 0, 0.4),
    cutoff: range(rng, 1800, 6500),
    glide: range(rng, 0, 0.6),
  };
}

export function voiceDuration(voice: VoiceParams): number {
  return voice.melody.length * (voice.noteLength + voice.gap) + 0.15;
}
