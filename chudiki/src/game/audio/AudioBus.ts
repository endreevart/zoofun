import type { VoiceParams } from './voice';
import { voiceDuration } from './voice';

/**
 * One shared WebAudio graph. Synthesises creature voices, plays back recorded
 * ones, and keeps the master level gentle because children hold tablets close.
 */
export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private decoded = new Map<string, AudioBuffer>();

  /** Browsers only allow audio after a gesture, so this is called on first tap. */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.5;

      // Soft ceiling so no synthesised note can ever spike.
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;

      this.master.connect(limiter);
      limiter.connect(this.context.destination);
    }
    return this.context;
  }

  get sampleRate(): number {
    return this.ensureContext().sampleRate;
  }

  /** Plays a synthesised voice. Returns how long it will sound, in seconds. */
  playVoice(voice: VoiceParams, options: { pan?: number; gain?: number } = {}): number {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = options.gain ?? 1;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.cutoff;
    filter.Q.value = 0.8;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));

    out.connect(filter);
    filter.connect(panner);
    panner.connect(this.master!);

    let cursor = start;
    for (let i = 0; i < voice.melody.length; i++) {
      const freq = voice.baseFreq * Math.pow(2, voice.melody[i] / 12);
      this.scheduleNote(ctx, out, voice, freq, cursor, i);
      cursor += voice.noteLength + voice.gap;
    }

    const total = voiceDuration(voice);
    window.setTimeout(() => out.disconnect(), (total + 0.5) * 1000);
    return total;
  }

  private scheduleNote(
    ctx: AudioContext,
    destination: GainNode,
    voice: VoiceParams,
    freq: number,
    at: number,
    index: number,
  ) {
    const length = voice.noteLength;
    const gain = ctx.createGain();
    gain.connect(destination);

    const osc = ctx.createOscillator();
    osc.type = oscTypeFor(voice.timbre);
    osc.frequency.setValueAtTime(freq, at);

    switch (voice.timbre) {
      case 'boing':
        // Fast downward sweep: the classic cartoon bounce.
        osc.frequency.setValueAtTime(freq * 2.1, at);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, at + length);
        break;
      case 'squeak':
        osc.frequency.setValueAtTime(freq * 0.8, at);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.9, at + length * 0.7);
        break;
      case 'toot':
        osc.frequency.setValueAtTime(freq * 0.94, at);
        osc.frequency.linearRampToValueAtTime(freq, at + length * 0.25);
        break;
      default:
        if (voice.glide > 0.05 && index > 0) {
          osc.frequency.setValueAtTime(freq * (1 - voice.glide * 0.18), at);
          osc.frequency.exponentialRampToValueAtTime(freq, at + length * 0.4);
        }
    }

    if (voice.vibratoDepth > 0.02) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = voice.vibratoRate;
      lfoGain.gain.value = freq * voice.vibratoDepth * 0.08;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + length + 0.05);
    }

    // Percussive but not clicky: quick attack, rounded tail.
    const peak = voice.timbre === 'hum' ? 0.32 : 0.46;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.03, length * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);

    osc.connect(gain);
    osc.start(at);
    osc.stop(at + length + 0.05);

    // 'burble' adds a detuned partner for a wet, gargly texture.
    if (voice.timbre === 'burble') {
      const second = ctx.createOscillator();
      second.type = 'sine';
      second.frequency.setValueAtTime(freq * 1.008, at);
      const secondGain = ctx.createGain();
      secondGain.gain.setValueAtTime(0.0001, at);
      secondGain.gain.exponentialRampToValueAtTime(peak * 0.6, at + 0.02);
      secondGain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      second.connect(secondGain);
      secondGain.connect(destination);
      second.start(at);
      second.stop(at + length + 0.05);
    }
  }

  /** Caches and plays a recorded clip. `key` is the creature id. */
  async playRecording(
    key: string,
    bytes: ArrayBuffer,
    options: { pan?: number; gain?: number } = {},
  ): Promise<number> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();

    let buffer = this.decoded.get(key);
    if (!buffer) {
      buffer = await ctx.decodeAudioData(bytes.slice(0));
      this.decoded.set(key, buffer);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = options.gain ?? 1;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.master!);
    source.start();

    return buffer.duration;
  }

  forgetRecording(key: string) {
    this.decoded.delete(key);
  }

  /** Short UI confirmations, deliberately different from creature voices. */
  playUiSound(kind: 'tap' | 'confirm' | 'appear' | 'error') {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime + 0.01;
    const notes: Record<typeof kind, number[]> = {
      tap: [660],
      confirm: [523, 659, 784],
      appear: [392, 523, 659, 880],
      error: [220, 180],
    };

    notes[kind].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const at = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.24, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(at);
      osc.stop(at + 0.28);
    });
  }
}

function oscTypeFor(timbre: VoiceParams['timbre']): OscillatorType {
  switch (timbre) {
    case 'chirp':
      return 'sine';
    case 'boing':
      return 'triangle';
    case 'warble':
      return 'sine';
    case 'squeak':
      return 'sawtooth';
    case 'burble':
      return 'sine';
    case 'hum':
      return 'triangle';
    case 'toot':
      return 'square';
  }
}
