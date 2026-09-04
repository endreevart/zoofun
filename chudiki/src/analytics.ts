/**
 * Client-side analytics tracker.
 * Buffers events and flushes them to POST /v1/t every 10 seconds
 * or on visibilitychange / beforeunload.
 */

import { API_BASE, authHeaders } from './api';

const FLUSH_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_BUFFER = 200;

let sid: string | null = null;
let source = 'island';
let buffer: { e: string; ts: number; p?: Record<string, unknown> }[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function generateSid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function detectDevice() {
  const ua = navigator.userAgent;
  let type: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (/iPad|tablet/i.test(ua)) type = 'tablet';
  else if (/iPhone|Android.*Mobile|webOS|iPod/i.test(ua)) type = 'mobile';
  else if (/Android/i.test(ua)) type = 'tablet';

  let os = '';
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS (\d+[_\d]*)/);
    os = 'iOS' + (m ? ' ' + m[1].replace(/_/g, '.') : '');
  } else if (/Android/.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    os = 'Android' + (m ? ' ' + m[1] : '');
  } else if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_.]+)/);
    os = 'macOS' + (m ? ' ' + m[1].replace(/_/g, '.') : '');
  } else if (/Windows/.test(ua)) {
    os = 'Windows';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
  }

  let browser = '';
  if (/CriOS/.test(ua)) browser = 'Chrome iOS';
  else if (/FxiOS/.test(ua)) browser = 'Firefox iOS';
  else if (/EdgiOS|Edg\//.test(ua)) browser = 'Edge';
  else if (/YaBrowser/.test(ua)) browser = 'Yandex';
  else if (/Chrome/.test(ua) && !/Chromium/.test(ua)) {
    const m = ua.match(/Chrome\/([\d]+)/);
    browser = 'Chrome' + (m ? ' ' + m[1] : '');
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    const m = ua.match(/Version\/([\d]+)/);
    browser = 'Safari' + (m ? ' ' + m[1] : '');
  } else if (/Firefox/.test(ua)) {
    const m = ua.match(/Firefox\/([\d]+)/);
    browser = 'Firefox' + (m ? ' ' + m[1] : '');
  }

  return {
    type,
    os,
    browser,
    w: window.screen?.width ?? 0,
    h: window.screen?.height ?? 0,
    locale: navigator.language ?? '',
    parentGate: false,
  };
}

function flush() {
  if (buffer.length === 0 || !sid) return;
  const events = buffer.splice(0, MAX_BUFFER);
  const payload = JSON.stringify({
    sid,
    source,
    device: detectDevice(),
    events,
  });

  const url = API_BASE.replace(/\/api\/zoo\/?$/, '') + '/v1/t';
  const headers = authHeaders({ 'Content-Type': 'application/json' });

  if (navigator.sendBeacon) {
    // sendBeacon doesn't support custom headers, so we use fetch for auth
    // but fall back to sendBeacon for unload scenarios
    try {
      void fetch(url, { method: 'POST', headers, body: payload, keepalive: true }).catch(() => {
        navigator.sendBeacon(url, payload);
      });
    } catch {
      navigator.sendBeacon(url, payload);
    }
  } else {
    void fetch(url, { method: 'POST', headers, body: payload, keepalive: true }).catch(() => {});
  }
}

export function track(event: string, payload?: Record<string, unknown>) {
  if (!sid) return;
  if (buffer.length >= MAX_BUFFER) flush();
  buffer.push({ e: event, ts: Date.now() / 1000, ...(payload ? { p: payload } : {}) });
}

export function initAnalytics(src: 'island' | 'site' = 'island') {
  if (sid) return; // already initialized
  sid = generateSid();
  source = src;

  track('session.start');

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  heartbeatTimer = setInterval(() => track('session.heartbeat'), HEARTBEAT_INTERVAL_MS);

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', onUnload);
}

export function stopAnalytics() {
  if (!sid) return;
  track('session.end');
  flush();
  if (flushTimer) clearInterval(flushTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('beforeunload', onUnload);
  sid = null;
}

function onVisibility() {
  if (document.visibilityState === 'hidden') {
    track('session.heartbeat');
    flush();
  }
}

function onUnload() {
  track('session.end');
  flush();
}
