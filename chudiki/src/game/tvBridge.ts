import { API_BASE } from '../api';

type Sdp = { sdp?: string; type?: string };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) throw new Error(`tv ${path} ${response.status}`);
  return (await response.json()) as T;
}

export async function resetTvRoom(): Promise<void> {
  await json('/v1/tv/reset', { method: 'POST' });
}

export async function postOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
  await json('/v1/tv/offer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sdp: sdp.sdp, type: sdp.type }),
  });
}

export async function readOffer(): Promise<Sdp> {
  return json('/v1/tv/offer');
}

export async function postAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
  await json('/v1/tv/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sdp: sdp.sdp, type: sdp.type }),
  });
}

export async function readAnswer(): Promise<Sdp> {
  return json('/v1/tv/answer');
}

export async function postIce(role: 'sender' | 'receiver', candidate: RTCIceCandidateInit): Promise<void> {
  await json('/v1/tv/ice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, candidate }),
  });
}

export async function readIce(
  role: 'sender' | 'receiver',
  after: number,
): Promise<{ candidates: RTCIceCandidateInit[]; next: number }> {
  return json(`/v1/tv/ice?role=${role}&after=${after}`);
}

export function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState !== 'complete') return;
      pc.removeEventListener('icegatheringstatechange', done);
      resolve();
    };
    pc.addEventListener('icegatheringstatechange', done);
    window.setTimeout(resolve, 1500);
  });
}

export async function pollUntil<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  ms = 12_000,
): Promise<T | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }
  return null;
}
