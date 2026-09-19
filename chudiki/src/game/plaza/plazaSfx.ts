/** Soft lawn sounds. Synth only — no files, no ElevenLabs. */

export const PLAZA_MOVE_SFX = ['step', 'jump', 'land'] as const;
export const PLAZA_BUILD_SFX = ['place', 'lift', 'nudge', 'trash', 'save', 'smash', 'found'] as const;
export const PLAZA_EMOTE_SFX = ['hello', 'hooray', 'wow', 'love', 'laugh', 'play'] as const;

export type PlazaSfx =
  | (typeof PLAZA_MOVE_SFX)[number]
  | (typeof PLAZA_BUILD_SFX)[number]
  | (typeof PLAZA_EMOTE_SFX)[number];

export const PLAZA_SFX: PlazaSfx[] = [...PLAZA_MOVE_SFX, ...PLAZA_BUILD_SFX, ...PLAZA_EMOTE_SFX];

export function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.45)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function schedulePlazaSfx(
  ctx: AudioContext,
  dest: AudioNode,
  voice: number,
  kind: PlazaSfx,
  noise: AudioBuffer,
): void {
  if (voice <= 0) return;
  const now = ctx.currentTime + 0.01;
  const gain = voice;
  switch (kind) {
    case 'step':
      rustle(ctx, dest, noise, now, 0.1 * gain, 0.07, 720);
      return;
    case 'jump':
      sweep(ctx, dest, now, 420, 180, 0.18 * gain, 0.22);
      rustle(ctx, dest, noise, now, 0.06 * gain, 0.08, 1400);
      return;
    case 'land':
      rustle(ctx, dest, noise, now, 0.16 * gain, 0.1, 420);
      blip(ctx, dest, now, 110, 0.14 * gain, 0.12, 'sine');
      return;
    case 'place':
      blip(ctx, dest, now, 210, 0.2 * gain, 0.09, 'triangle');
      blip(ctx, dest, now + 0.05, 330, 0.14 * gain, 0.08, 'triangle');
      rustle(ctx, dest, noise, now, 0.08 * gain, 0.07, 900);
      return;
    case 'lift':
      sweep(ctx, dest, now, 180, 340, 0.1 * gain, 0.16);
      rustle(ctx, dest, noise, now, 0.07 * gain, 0.14, 1600);
      return;
    case 'nudge':
      blip(ctx, dest, now, 520, 0.1 * gain, 0.06, 'triangle');
      return;
    case 'trash':
      rustle(ctx, dest, noise, now, 0.16 * gain, 0.18, 1800);
      sweep(ctx, dest, now, 280, 90, 0.1 * gain, 0.16);
      return;
    case 'smash':
      rustle(ctx, dest, noise, now, 0.12 * gain, 0.1, 480);
      sweep(ctx, dest, now, 180, 90, 0.08 * gain, 0.1);
      return;
    case 'found':
      blip(ctx, dest, now, 523, 0.1 * gain, 0.16, 'sine');
      blip(ctx, dest, now + 0.11, 659, 0.11 * gain, 0.18, 'sine');
      blip(ctx, dest, now + 0.22, 784, 0.12 * gain, 0.22, 'sine');
      blip(ctx, dest, now + 0.36, 1046, 0.1 * gain, 0.28, 'sine');
      return;
    case 'save':
      blip(ctx, dest, now, 523, 0.12 * gain, 0.12, 'sine');
      blip(ctx, dest, now + 0.09, 659, 0.12 * gain, 0.12, 'sine');
      blip(ctx, dest, now + 0.18, 784, 0.14 * gain, 0.16, 'sine');
      return;
    case 'hello':
      blip(ctx, dest, now, 392, 0.14 * gain, 0.14, 'sine');
      blip(ctx, dest, now + 0.12, 494, 0.14 * gain, 0.16, 'sine');
      return;
    case 'hooray':
      blip(ctx, dest, now, 523, 0.12 * gain, 0.1, 'triangle');
      blip(ctx, dest, now + 0.08, 659, 0.13 * gain, 0.1, 'triangle');
      blip(ctx, dest, now + 0.16, 784, 0.15 * gain, 0.18, 'triangle');
      return;
    case 'wow':
      sweep(ctx, dest, now, 280, 640, 0.16 * gain, 0.28);
      return;
    case 'love':
      blip(ctx, dest, now, 349, 0.12 * gain, 0.22, 'sine');
      blip(ctx, dest, now, 440, 0.1 * gain, 0.22, 'sine');
      return;
    case 'laugh':
      blip(ctx, dest, now, 587, 0.12 * gain, 0.07, 'triangle');
      blip(ctx, dest, now + 0.09, 698, 0.12 * gain, 0.07, 'triangle');
      blip(ctx, dest, now + 0.18, 523, 0.12 * gain, 0.1, 'triangle');
      return;
    case 'play':
      sweep(ctx, dest, now, 480, 200, 0.16 * gain, 0.2);
      return;
  }
}

function rustle(
  ctx: AudioContext,
  dest: AudioNode,
  buffer: AudioBuffer,
  at: number,
  peak: number,
  duration: number,
  cutoff: number,
) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(at);
  src.stop(at + duration + 0.03);
}

function blip(
  ctx: AudioContext,
  dest: AudioNode,
  at: number,
  freq: number,
  peak: number,
  duration: number,
  type: OscillatorType,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}

function sweep(
  ctx: AudioContext,
  dest: AudioNode,
  at: number,
  from: number,
  to: number,
  peak: number,
  duration: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}
