import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api';

/**
 * Full-screen garden on the TV's own browser. The tablet posts JPEG frames;
 * this page only shows them — no HUD, no AirPlay.
 */
export function TvReceiver() {
  const imageRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState('Ждём сад… На телефоне или компьютере нажми 📺');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    const pull = async () => {
      try {
        const response = await fetch(`${API_BASE}/v1/tv/frame?t=${Date.now()}`);
        if (!response.ok || cancelled) return;
        const blob = await response.blob();
        if (cancelled || blob.size < 32) return;
        const next = URL.createObjectURL(blob);
        const image = imageRef.current;
        if (image) image.src = next;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = next;
        setStatus('');
      } catch {
        /* keep waiting */
      }
    };

    void pull();
    const id = window.setInterval(() => void pull(), 160);
    const wait = window.setTimeout(() => {
      if (!cancelled && !imageRef.current?.naturalWidth) {
        setStatus('На телефоне или компьютере нажми 📺 — сад появится здесь.');
      }
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearTimeout(wait);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return (
    <div className="tv-receiver">
      <img ref={imageRef} alt="" />
      {status ? <p>{status}</p> : null}
    </div>
  );
}

export function isTvReceiver(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('tv');
  } catch {
    return false;
  }
}
