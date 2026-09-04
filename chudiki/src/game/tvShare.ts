/**
 * Garden goes to a TV as HLS. The AirPlay picker must run in the same tap,
 * on a video that already has a live source and sits inside the fullscreen root.
 */

import { API_BASE } from '../api';

export type TvShareMode = 'remote' | 'link';

type WebkitVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
};

export function tvWatchUrl(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    url.searchParams.set('tv', '1');
    return url.toString();
  }
  return `${window.location.origin}/tv`;
}

export function tvWatchLabel(): string {
  try {
    const url = new URL(tvWatchUrl());
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    return `${url.host.replace(/^www\./, '')}${path}`;
  } catch {
    return 'zooo.fun/tv';
  }
}

export function livePlaylistUrl(): string {
  return new URL(`${API_BASE}/v1/tv/live.m3u8`, window.location.origin).href;
}

export function canPromptTv(): boolean {
  const video = document.createElement('video') as WebkitVideo;
  return typeof video.webkitShowPlaybackTargetPicker === 'function' || Boolean(video.remote);
}

export class TvShare {
  private video: HTMLVideoElement | null = null;
  private watchers: Array<() => void> = [];
  private onEnded: (() => void) | null = null;
  private onWireless: ((on: boolean) => void) | null = null;
  private closeFeed: (() => void) | null = null;
  private grabFrame: (() => void) | null = null;
  private picture: HTMLCanvasElement | null = null;
  private mount: HTMLElement | null = null;
  private stopping = false;
  private sending = false;
  private playlistReady = false;

  get feeding(): boolean {
    return this.closeFeed !== null;
  }

  /** @deprecated use feeding — live used to mean "session started", not "TV connected". */
  get live(): boolean {
    return this.feeding;
  }

  get wireless(): boolean {
    const video = this.video as WebkitVideo | null;
    if (video?.webkitCurrentPlaybackTargetIsWireless) return true;
    return video?.remote?.state === 'connected';
  }

  warm(options: {
    openFeed: () => HTMLCanvasElement;
    grabFrame: () => void;
    closeFeed: () => void;
    mount: HTMLElement;
    onEnded?: () => void;
    onWireless?: (on: boolean) => void;
  }): void {
    if (this.feeding) {
      this.showVideo(options.mount);
      return;
    }
    this.stop();
    this.stopping = false;
    this.playlistReady = false;
    this.onEnded = options.onEnded ?? null;
    this.onWireless = options.onWireless ?? null;
    this.closeFeed = options.closeFeed;
    this.grabFrame = options.grabFrame;
    this.picture = options.openFeed();
    this.mount = options.mount;
    void resetTvRoom();
    this.ensureVideo(options.mount);
    this.pumpFrames();
    void this.attachWhenLive();
  }

  pickTv(): boolean {
    if (!this.video) this.ensureVideo(this.mount ?? document.body);
    this.showVideo(this.mount ?? document.body);
    this.tryAttachSrc();
    return this.promptRemote(this.video!);
  }

  stop() {
    if (this.stopping && !this.video) return;
    this.stopping = true;
    for (const unhook of this.watchers) unhook();
    this.watchers = [];
    void resetTvRoom().catch(() => {});

    this.closeFeed?.();
    this.closeFeed = null;
    this.grabFrame = null;
    this.picture = null;
    this.mount = null;
    this.playlistReady = false;

    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
      this.video = null;
    }

    const ended = this.onEnded;
    this.onEnded = null;
    this.onWireless = null;
    ended?.();
  }

  private ensureVideo(mount: HTMLElement) {
    if (this.video) {
      this.showVideo(mount);
      return;
    }
    const video = document.createElement('video') as WebkitVideo;
    video.className = 'tv-share-video is-visible';
    video.setAttribute('x-webkit-airplay', 'allow');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('controls', 'true');
    video.setAttribute('controlsList', 'nofullscreen nodownload');
    video.playsInline = true;
    video.autoplay = true;
    video.muted = true;
    video.controls = true;
    video.disableRemotePlayback = false;
    mount.appendChild(video);
    this.video = video;
    this.mount = mount;
    this.hookWireless(video);
  }

  private showVideo(mount: HTMLElement) {
    if (!this.video) return;
    this.mount = mount;
    this.video.classList.add('is-visible');
    this.video.controls = true;
    if (this.video.parentElement !== mount) mount.appendChild(this.video);
  }

  private hookWireless(video: WebkitVideo) {
    const emit = () => this.onWireless?.(this.wireless);
    video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', emit);
    this.watchers.push(() => {
      video.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', emit);
    });
    const remote = video.remote;
    if (remote) {
      const on = () => this.onWireless?.(true);
      const off = () => this.onWireless?.(false);
      remote.addEventListener('connect', on);
      remote.addEventListener('disconnect', off);
      this.watchers.push(() => {
        remote.removeEventListener('connect', on);
        remote.removeEventListener('disconnect', off);
      });
    }
  }

  private tryAttachSrc() {
    if (!this.video || !this.playlistReady) return;
    if (this.video.getAttribute('src') === livePlaylistUrl()) return;
    this.video.src = livePlaylistUrl();
    void this.video.play().catch(() => {});
  }

  private pumpFrames() {
    const tick = () => {
      if (this.stopping || this.sending || !this.picture) return;
      this.sending = true;
      this.grabFrame?.();
      this.picture.toBlob(
        (blob) => {
          void this.postFrame(blob).finally(() => {
            this.sending = false;
          });
        },
        'image/jpeg',
        0.42,
      );
    };
    tick();
    const id = window.setInterval(tick, 320);
    this.watchers.push(() => window.clearInterval(id));
  }

  private async postFrame(blob: Blob | null) {
    if (!blob || this.stopping) return;
    try {
      await fetch(`${API_BASE}/v1/tv/frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
    } catch {
      /* next frame */
    }
  }

  private async attachWhenLive(): Promise<void> {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && !this.stopping) {
      try {
        const response = await fetch(`${API_BASE}/v1/tv/live.m3u8`, { cache: 'no-store' });
        if (response.ok && (await response.text()).includes('.ts')) {
          this.playlistReady = true;
          this.tryAttachSrc();
          return;
        }
      } catch {
        /* keep waiting */
      }
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
  }

  private promptRemote(video: HTMLVideoElement): boolean {
    const webkit = video as WebkitVideo;
    if (typeof webkit.webkitShowPlaybackTargetPicker === 'function') {
      try {
        webkit.webkitShowPlaybackTargetPicker();
        return true;
      } catch {
        /* try Cast */
      }
    }
    if (video.remote) {
      void video.remote.prompt().catch(() => {});
      return true;
    }
    return false;
  }
}

async function resetTvRoom(): Promise<void> {
  try {
    await fetch(`${API_BASE}/v1/tv/reset`, { method: 'POST' });
  } catch {
    /* first frame can open the room */
  }
}
