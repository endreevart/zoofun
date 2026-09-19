import { assetUrl } from '../../assetUrl';
import { makeNoiseBuffer, schedulePlazaSfx, type PlazaSfx } from '../plaza/plazaSfx';
import { PLACEHOLDER_CUES, UI_CUES, type CueId } from './cues';
import { gardenElementVolume, gardenShouldPause, nextDuckCount } from './gardenDuck';
import { clampMix, DEFAULT_MUSIC, DEFAULT_VOICE, readMix, type IslandMix } from './mix';
import type { VoiceParams } from './voice';
import { voiceDuration } from './voice';

const GARDEN_MUSIC = assetUrl('audio/garden.mp3');
const CUE_PEAK = 0.78;

let shared: AudioBus | null = null;

/** One bus for the picker and every garden, so cues work before Game exists. */
export function getIslandAudio(): AudioBus {
  if (!shared) shared = new AudioBus();
  return shared;
}

/**
 * One shared WebAudio graph. Synthesises creature voices, plays back recorded
 * ones, and keeps the master level gentle because children hold tablets close.
 */
export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private decoded = new Map<string, AudioBuffer>();
  private noise: AudioBuffer | null = null;
  private garden: HTMLAudioElement | null = null;
  private gardenWanted = false;
  private gardenDuck = 0;
  private gardenGain: GainNode | null = null;
  private gardenSource: AudioBufferSourceNode | null = null;
  private gardenBuffer: AudioBuffer | null = null;
  private gardenBytes: ArrayBuffer | null = null;
  private gardenFetch: Promise<ArrayBuffer | null> | null = null;
  private cueDuck = false;
  private bedHeld = false;
  private cueUnduckTimer = 0;
  private cueSource: AudioBufferSourceNode | null = null;
  private cueEl: HTMLAudioElement | null = null;
  private cueBytes = new Map<string, ArrayBuffer>();
  private cueToken = 0;
  private cueDurations = new Map<string, number>();
  private lastCueSeconds = 0;
  private cueEnded: Promise<void> | null = null;
  private cueEndedResolve: (() => void) | null = null;
  private music = DEFAULT_MUSIC;
  private voice = DEFAULT_VOICE;

  constructor() {
    const mix = readMix();
    this.music = mix.music;
    this.voice = mix.voice;
  }

  getMix(): IslandMix {
    return { music: this.music, voice: this.voice };
  }

  setMix(mix: Partial<IslandMix>) {
    if (mix.music !== undefined) this.music = clampMix(mix.music, this.music);
    if (mix.voice !== undefined) this.voice = clampMix(mix.voice, this.voice);
    this.applyGardenDuck();
  }

  /** Browsers only allow audio after a gesture, so this is called on first tap. */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    this.gardenWanted = true;
    if (ctx.state === 'suspended') void ctx.resume();
    this.applyGardenDuck();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* gesture already spent */
      }
      this.applyGardenDuck();
    }
  }

  /** Keep the garden paused for a whole narrator chain (plaza hello…walk). */
  holdBed(on: boolean) {
    this.bedHeld = on;
    if (on) {
      this.cueDuck = true;
    } else if (!this.cueSource && (!this.cueEl || this.cueEl.paused)) {
      this.cueDuck = false;
    }
    this.applyGardenDuck();
  }

  private ensureContext(): AudioContext {
    if (this.context && this.context.state === 'closed') {
      this.context = null;
      this.master = null;
      this.gardenGain = null;
      this.gardenSource = null;
      this.gardenBuffer = null;
      this.decoded.clear();
    }
    if (!this.context) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.5;

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

    if (this.voice <= 0) return voiceDuration(voice);

    const start = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = (options.gain ?? 1) * this.voice;

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
    if (this.voice <= 0) return 0;
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
    gain.gain.value = (options.gain ?? 1) * this.voice;
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

  /** Garden bed as a media track, so a TV stream can carry the music too. */
  tapGardenStream(): MediaStream | null {
    const el = this.garden as (HTMLAudioElement & { captureStream?: () => MediaStream }) | null;
    if (!el || typeof el.captureStream !== 'function') return null;
    try {
      return el.captureStream();
    } catch {
      return null;
    }
  }

  /** Soft looping garden bed. Starts after unlock; pauses when the tab hides. */
  setGardenPaused(paused: boolean) {
    if (paused) {
      this.garden?.pause();
      this.stopGardenBed();
      return;
    }
    if (gardenShouldPause(this.gardenDuck, this.cueDuck, this.bedHeld)) return;
    if (this.gardenWanted) this.startGarden();
  }

  /**
   * Mute and pause the garden bed (microphone capture on iPhone otherwise
   * restarts the track at full volume). Nested: each true needs a false.
   */
  duckGarden(on: boolean) {
    this.gardenDuck = nextDuckCount(this.gardenDuck, on);
    this.applyGardenDuck();
  }

  private applyGardenDuck() {
    const paused = gardenShouldPause(this.gardenDuck, this.cueDuck, this.bedHeld);
    const level = gardenElementVolume(this.gardenDuck, this.music, this.cueDuck, this.bedHeld);
    if (this.gardenGain) this.gardenGain.gain.value = level;
    if (paused) this.stopGardenBed();
    this.hushGardenElements(!paused);
    if (paused) {
      const el = this.garden;
      if (!el) return;
      el.muted = true;
      el.volume = 0;
      el.pause();
      return;
    }
    if (this.gardenWanted && document.visibilityState !== 'hidden') this.startGarden();
  }

  /** HMR and extra unlock() can leave a second garden.mp3 playing. */
  private hushGardenElements(keepOwnPlaying: boolean) {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('audio').forEach((node) => {
      if (node === this.cueEl) return;
      const src = node.currentSrc || node.getAttribute('src') || '';
      if (!src.includes('audio/garden.mp3')) return;
      if (keepOwnPlaying && node === this.garden) return;
      node.pause();
      node.muted = true;
      if (node !== this.garden) {
        node.removeAttribute('src');
        node.load();
        node.remove();
      }
    });
  }

  dispose() {
    this.gardenWanted = false;
    this.gardenDuck = 0;
    this.bedHeld = false;
    this.stopCue();
    window.clearTimeout(this.cueUnduckTimer);
    this.cueDuck = false;
    this.stopGardenBed();
    this.gardenGain?.disconnect();
    this.gardenGain = null;
    this.gardenBuffer = null;
    this.gardenBytes = null;
    this.gardenFetch = null;
    this.cueBytes.clear();
    if (this.garden) {
      this.garden.pause();
      this.garden.removeAttribute('src');
      this.garden.load();
      this.garden.remove();
      this.garden = null;
    }
    if (this.cueEl) {
      this.cueEl.pause();
      this.cueEl.removeAttribute('src');
      this.cueEl.remove();
      this.cueEl = null;
    }
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.decoded.clear();
    this.cueDurations.clear();
    this.noise = null;
  }

  private startGarden() {
    if (!this.gardenWanted || document.visibilityState === 'hidden') return;
    if (gardenShouldPause(this.gardenDuck, this.cueDuck, this.bedHeld)) return;
    this.stopGardenBed();
    this.hushGardenElements(true);
    const el = this.ensureGardenEl();
    this.playGardenEl(el);
  }

  /** `play()` can win a race against pause() on the same tap as a voice cue. */
  private playGardenEl(el: HTMLAudioElement) {
    if (gardenShouldPause(this.gardenDuck, this.cueDuck, this.bedHeld)) {
      el.pause();
      el.muted = true;
      el.volume = 0;
      return;
    }
    el.muted = false;
    el.volume = gardenElementVolume(this.gardenDuck, this.music, this.cueDuck, this.bedHeld);
    const play = el.play();
    if (!play) return;
    void play
      .then(() => {
        if (!gardenShouldPause(this.gardenDuck, this.cueDuck, this.bedHeld)) return;
        el.pause();
        el.muted = true;
        el.volume = 0;
      })
      .catch(() => {});
  }

  private mountMedia(el: HTMLAudioElement) {
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.preload = 'auto';
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.bottom = '0';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    if (!el.isConnected) document.body.appendChild(el);
  }

  private ensureGardenEl(): HTMLAudioElement {
    if (this.garden) return this.garden;
    const el = new Audio(GARDEN_MUSIC);
    el.loop = true;
    el.volume = gardenElementVolume(this.gardenDuck, this.music, this.cueDuck, this.bedHeld);
    this.mountMedia(el);
    this.garden = el;
    return el;
  }

  private fetchGardenBytes(): Promise<ArrayBuffer | null> {
    if (this.gardenBytes) return Promise.resolve(this.gardenBytes);
    if (this.gardenFetch) return this.gardenFetch;
    this.gardenFetch = (async () => {
      try {
        const response = await fetch(GARDEN_MUSIC);
        if (!response.ok) return null;
        this.gardenBytes = await response.arrayBuffer();
        return this.gardenBytes;
      } catch {
        this.gardenFetch = null;
        return null;
      }
    })();
    return this.gardenFetch;
  }

  private async decodeGardenBuffer(): Promise<AudioBuffer | null> {
    if (this.gardenBuffer) return this.gardenBuffer;
    const ctx = this.context;
    if (!ctx) return null;
    const bytes = await this.fetchGardenBytes();
    if (!bytes) return null;
    try {
      this.gardenBuffer = await ctx.decodeAudioData(bytes.slice(0));
      return this.gardenBuffer;
    } catch {
      return null;
    }
  }

  private startGardenBed() {
    const ctx = this.context;
    const buffer = this.gardenBuffer;
    if (!ctx || !buffer || !this.gardenWanted) return;
    if (document.visibilityState === 'hidden') return;
    if (ctx.state !== 'running') return;
    if (this.gardenSource) return;
    if (!this.gardenGain) {
      this.gardenGain = ctx.createGain();
      this.gardenGain.connect(ctx.destination);
    }
    this.gardenGain.gain.value = gardenElementVolume(
      this.gardenDuck,
      this.music,
      this.cueDuck,
      this.bedHeld,
    );
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.gardenGain);
    try {
      source.start();
    } catch {
      return;
    }
    this.gardenSource = source;
    this.garden?.pause();
  }

  private stopGardenBed() {
    try {
      this.gardenSource?.stop();
    } catch {
      /* already stopped */
    }
    this.gardenSource = null;
  }

  async preloadCue(id: CueId): Promise<AudioBuffer | null> {
    const spec = UI_CUES[id];
    if (!spec) return null;
    if (PLACEHOLDER_CUES.has(id)) return null;
    const cacheKey = `cue:${id}`;
    const cached = this.decoded.get(cacheKey);
    if (cached) return cached;
    try {
      let bytes = this.cueBytes.get(id);
      if (!bytes) {
        const response = await fetch(assetUrl(`audio/cues/${spec.file}`));
        if (!response.ok) return null;
        bytes = await response.arrayBuffer();
        this.cueBytes.set(id, bytes);
      }
      const ctx = this.ensureContext();
      if (ctx.state === 'closed') return null;
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      this.decoded.set(cacheKey, buffer);
      this.rememberCueSeconds(id, buffer.duration);
      return buffer;
    } catch {
      return null;
    }
  }

  async preloadCues(ids: readonly CueId[]): Promise<void> {
    await Promise.all(ids.map((id) => this.preloadCue(id)));
  }

  /** Decode the garden bed early so plaza/garden can start it on the next tap. */
  preloadGarden() {
    this.ensureGardenEl();
    void this.fetchGardenBytes();
  }

  cueSeconds(id: CueId): number {
    return this.cueDurations.get(id) ?? this.decoded.get(`cue:${id}`)?.duration ?? 2.6;
  }

  private rememberCueSeconds(id: CueId, seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.cueDurations.set(id, seconds);
    this.lastCueSeconds = seconds;
  }

  /** Cut the narrator so the garden bed comes back up. */
  stopCue() {
    this.cueToken += 1;
    try {
      this.cueSource?.stop();
    } catch {
      /* already stopped */
    }
    this.cueSource = null;
    this.cueEl?.pause();
    this.finishCue();
  }

  /** Resolves when the current narrator clip finishes, is stopped, or never started. */
  waitCueEnd(): Promise<void> {
    const pending = this.cueEnded;
    if (!pending) return Promise.resolve();
    const cap = Math.max(4, (this.lastCueSeconds || 8) + 1.4);
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, cap * 1000);
      void pending.then(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Pre-recorded narrator clip from `/audio/cues`. Duck the garden only after
   * the clip is actually playing, so a hung fetch cannot mute the bed.
   */
  async playCue(id: CueId): Promise<boolean> {
    const spec = UI_CUES[id];
    if (!spec) return false;
    if (this.voice <= 0) return false;
    if (PLACEHOLDER_CUES.has(id)) return false;

    this.settleCueWait();
    const token = ++this.cueToken;
    this.armCueEnd();
    try {
      this.cueSource?.stop();
    } catch {
      /* already stopped */
    }
    this.cueSource = null;
    this.cueEl?.pause();

    const viaGraph = await this.playCueBuffer(id, token);
    if (viaGraph) return true;
    if (token !== this.cueToken) return false;

    const el = this.ensureCueEl();
    el.pause();
    el.src = assetUrl(`audio/cues/${spec.file}`);
    el.volume = Math.max(0, Math.min(1, CUE_PEAK * this.voice));
    this.lastCueSeconds = this.cueSeconds(id);
    el.addEventListener('loadedmetadata', () => this.rememberCueSeconds(id, el.duration), {
      once: true,
    });
    el.addEventListener(
      'ended',
      () => {
        if (token !== this.cueToken) return;
        this.finishCue();
      },
      { once: true },
    );
    try {
      const playing = el.play();
      if (playing) {
        const raced = await Promise.race([
          playing.then(() => 'ok' as const),
          new Promise<'timeout'>((resolve) => {
            window.setTimeout(() => resolve('timeout'), 2500);
          }),
        ]);
        if (raced !== 'ok') {
          el.pause();
          this.finishCue();
          return false;
        }
      }
      if (token !== this.cueToken) return false;
      this.rememberCueSeconds(id, el.duration);
      this.cueDuck = true;
      this.applyGardenDuck();
      return true;
    } catch {
      this.finishCue();
      return false;
    }
  }

  private ensureCueEl(): HTMLAudioElement {
    if (this.cueEl) return this.cueEl;
    const el = new Audio();
    this.mountMedia(el);
    this.cueEl = el;
    return el;
  }

  private armCueEnd() {
    this.cueEnded = new Promise((resolve) => {
      this.cueEndedResolve = resolve;
    });
  }

  private settleCueWait() {
    const resolve = this.cueEndedResolve;
    this.cueEndedResolve = null;
    resolve?.();
  }

  private finishCue() {
    this.settleCueWait();
    window.clearTimeout(this.cueUnduckTimer);
    const token = this.cueToken;
    this.cueUnduckTimer = window.setTimeout(() => {
      if (token !== this.cueToken) return;
      if (this.cueSource) return;
      if (this.cueEl && !this.cueEl.paused) return;
      this.cueDuck = false;
      this.applyGardenDuck();
    }, 80);
  }

  private async playCueBuffer(id: CueId, token: number): Promise<boolean> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running' || !this.master) return false;
    if (token !== this.cueToken) return false;
    const buffer = await this.preloadCue(id);
    if (!buffer || token !== this.cueToken) return false;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = CUE_PEAK * this.voice;
    source.connect(gain);
    gain.connect(this.master);
    source.onended = () => {
      if (this.cueSource !== source) return;
      this.cueSource = null;
      this.finishCue();
    };
    this.cueSource = source;
    try {
      source.start();
    } catch {
      this.cueSource = null;
      return false;
    }
    this.cueDuck = true;
    this.applyGardenDuck();
    this.rememberCueSeconds(id, buffer.duration);
    return true;
  }

  /** Soft hops, steps, stamps, emoji. Does not cut a narrator clip. */
  playSfx(kind: PlazaSfx) {
    if (this.voice <= 0) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.master) return;
    if (!this.noise) this.noise = makeNoiseBuffer(ctx);
    schedulePlazaSfx(ctx, this.master, this.voice, kind, this.noise);
  }

  /** Short UI confirmations, deliberately different from creature voices. */
  playUiSound(kind: 'tap' | 'confirm' | 'appear' | 'error') {
    if (this.voice <= 0) return;
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
      gain.gain.exponentialRampToValueAtTime(0.24 * this.voice, at + 0.02);
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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    shared?.dispose();
    shared = null;
  });
}
