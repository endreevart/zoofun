/**
 * Microphone capture for "record your own sound for this chudik".
 *
 * The recording never leaves the device: it goes straight into IndexedDB next
 * to the creature it belongs to.
 */

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'denied' | 'unsupported';

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private state: RecorderState = 'idle';

  get currentState(): RecorderState {
    return this.state;
  }

  static get isSupported(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  async start(): Promise<RecorderState> {
    if (!VoiceRecorder.isSupported) {
      this.state = 'unsupported';
      return this.state;
    }

    try {
      this.state = 'requesting';
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.state = 'denied';
      return this.state;
    }

    const mimeType = pickMimeType();
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start();
    this.state = 'recording';
    return this.state;
  }

  /** Stops and returns the clip, or null if nothing was captured. */
  async stop(): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
    const recorder = this.recorder;
    if (!recorder || this.state !== 'recording') {
      this.cleanup();
      return null;
    }

    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await finished;

    const mimeType = recorder.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    this.cleanup();

    if (blob.size < 512) return null;
    return { bytes: await blob.arrayBuffer(), mimeType };
  }

  cancel() {
    if (this.recorder && this.state === 'recording') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.state = 'idle';
  }
}

function pickMimeType(): string | null {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported?.(candidate)) return candidate;
  }
  return null;
}
