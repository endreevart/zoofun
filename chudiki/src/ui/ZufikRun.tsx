import { useCallback, useEffect, useRef, useState } from 'react';
import { getIslandAudio } from '../game/audio/AudioBus';
import { RUN_IMG } from '../game/run/runAssets';
import {
  HERO_H,
  RUN_LEVELS,
  jump,
  startRun,
  tick,
  togglePause,
  type RunState,
} from '../game/run/runSim';
import { HudIcon } from './HudIcon';

type Pics = Record<string, HTMLImageElement>;

function loadPics(): Promise<Pics> {
  const entries = Object.entries(RUN_IMG);
  return Promise.all(
    entries.map(
      ([key, src]) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.decoding = 'sync';
          img.onload = () => resolve([key, img]);
          img.onerror = () => reject(new Error(src));
          img.src = src;
        }),
    ),
  ).then((pairs) => Object.fromEntries(pairs));
}

const SRC = {
  dirt: { x: 6, y: 103, w: 1014, h: 120 },
  grass: { x: 0, y: 106, w: 1024, h: 75 },
  log: { x: 32, y: 38, w: 466, h: 190 },
  bush: { x: 0, y: 0, w: 560, h: 231 },
  rock: { x: 0, y: 0, w: 520, h: 278 },
  tuft: { x: 82, y: 61, w: 241, h: 162 },
  run: { x: 69, y: 40, w: 250, h: 250 },
  jump: { x: 71, y: 68, w: 236, h: 211 },
  flower: { x: 40, y: 23, w: 146, h: 177 },
} as const;

function wrap(scroll: number, span: number) {
  const width = Math.max(1, span);
  const mod = scroll % width;
  return mod < 0 ? mod + width : mod;
}

function cover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  shiftX = 0,
) {
  const scale = Math.max(w / Math.max(img.width, 1), h / Math.max(img.height, 1));
  const dw = Math.max(1, img.width * scale);
  const dh = Math.max(1, img.height * scale);
  const extra = Math.max(0, dw - w);
  const pan = extra === 0 ? 0 : Math.max(-extra / 2, Math.min(extra / 2, -shiftX));
  ctx.drawImage(img, (w - dw) / 2 + pan, (h - dh) / 2, dw, dh);
}

function tile(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  destY: number,
  destH: number,
  scroll: number,
  width: number,
  src: { x: number; y: number; w: number; h: number },
  overlap: number,
) {
  const aspect = src.w / Math.max(src.h, 1);
  const dw = Math.max(8, aspect * destH);
  const step = Math.max(8, dw - overlap);
  let x = -wrap(scroll, step);
  while (x < width + dw) {
    ctx.drawImage(img, src.x, src.y, src.w, src.h, x, destY, dw, destH);
    x += step;
  }
}

function sprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  cx: number,
  footY: number,
  destH: number,
  src: { x: number; y: number; w: number; h: number },
) {
  const sw = Math.min(src.w, img?.naturalWidth || src.w);
  const sh = Math.min(src.h, img?.naturalHeight || src.h);
  if (!img || sw < 2 || sh < 2 || destH < 2) return;
  const dw = (sw / sh) * destH;
  ctx.drawImage(img, src.x, src.y, sw, sh, cx - dw / 2, footY - destH, dw, destH);
}

function paint(ctx: CanvasRenderingContext2D, pics: Pics, state: RunState, w: number, h: number) {
  const wide = w > h;
  const walkY = wide ? h * 0.68 : h * 0.61;
  const unit = ((wide ? 0.24 : 0.2) * h) / HERO_H;
  const cam = state.x - (0.28 * w) / unit;
  const sky = wide ? pics.landscapeSky : pics.portraitSky;
  const hills = wide ? pics.landscapeHills : pics.portraitHills;
  const fore = wide ? pics.landscapeFore : pics.portraitFore;
  ctx.clearRect(0, 0, w, h);
  cover(ctx, sky, w, h, 0);
  cover(ctx, hills, w, h, cam * unit * 0.04);

  ctx.fillStyle = '#c48956';
  ctx.fillRect(0, walkY, w, h - walkY + 2);
  tile(ctx, pics.dirt, walkY, h - walkY + 2, cam * unit, w, SRC.dirt, 20);

  const grassH = wide ? h * 0.086 : h * 0.074;
  const tuftH = wide ? h * 0.12 : h * 0.105;
  const tuftStep = 250;
  const tuftStart = Math.floor((cam - 80) / tuftStep) * tuftStep;
  for (let wx = tuftStart; wx < cam + w / unit + 80; wx += tuftStep) {
    const jitter = ((wx * 13) % 70) - 20;
    const scale = 0.82 + ((wx * 7) % 28) / 100;
    sprite(
      ctx,
      pics.tuft,
      (wx + jitter - cam) * unit,
      walkY + grassH * 0.18,
      tuftH * scale,
      SRC.tuft,
    );
  }
  tile(ctx, pics.grass, walkY - grassH * 0.58, grassH, cam * unit, w, SRC.grass, 12);

  const sizes = {
    log: h * (wide ? 0.155 : 0.13),
    bush: h * (wide ? 0.2 : 0.175),
    rock: h * (wide ? 0.185 : 0.16),
    flower: h * 0.105,
  };
  for (const prop of state.props) {
    if (prop.kind === 'flower' && prop.taken) continue;
    const img =
      prop.kind === 'log'
        ? pics.log
        : prop.kind === 'bush'
          ? pics.bush
          : prop.kind === 'rock'
            ? pics.rock
            : pics.flower;
    const src =
      prop.kind === 'log'
        ? SRC.log
        : prop.kind === 'bush'
          ? SRC.bush
          : prop.kind === 'rock'
            ? SRC.rock
            : SRC.flower;
    const sink = prop.kind === 'bush' ? 18 : prop.kind === 'rock' ? 16 : prop.kind === 'log' ? 10 : 0;
    sprite(ctx, img, (prop.x - cam) * unit, walkY - prop.y * unit + sink, sizes[prop.kind], src);
  }

  const hero = state.y > 8 ? pics.jump : pics.run;
  const heroSrc = state.y > 8 ? SRC.jump : SRC.run;
  const hh = (wide ? 0.24 : 0.2) * h;
  if (state.invuln > 0 && Math.floor(state.t * 16) % 2 === 0) ctx.globalAlpha = 0.45;
  sprite(ctx, hero, (state.x - cam) * unit, walkY - state.y * unit + 12, hh, heroSrc);
  ctx.globalAlpha = 1;

  cover(ctx, fore, w, h, 0);
}

export function ZufikRun({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const picsRef = useRef<Pics | null>(null);
  const stateRef = useRef(startRun());
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(() => ({ ...startRun() }));
  const won = view.status === 'win';
  const paused = view.status === 'pause';

  const hop = useCallback(() => {
    const now = stateRef.current;
    if (now.status !== 'play' || now.y > 1) return;
    stateRef.current = jump(now);
    getIslandAudio().playSfx('jump');
  }, []);

  useEffect(() => {
    let alive = true;
    void loadPics()
      .then((pics) => {
        if (!alive) return;
        picsRef.current = pics;
        setReady(true);
      })
      .catch(() => {
        if (alive) onClose();
      });
    return () => {
      alive = false;
    };
  }, [onClose]);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      const prev = stateRef.current;
      stateRef.current = tick(prev, dt);
      const next = stateRef.current;
      if (next.flowers > prev.flowers) getIslandAudio().playSfx('found');
      if (prev.status !== 'win' && next.status === 'win') getIslandAudio().playSfx('hooray');
      setView((old) =>
        old.status === next.status &&
        old.flowers === next.flowers &&
        old.level === next.level &&
        old.goal === next.goal &&
        Math.abs(old.x - next.x) < 8
          ? old
          : { ...next, props: next.props },
      );
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const pics = picsRef.current;
      if (pics) paint(ctx, pics, next, w, h);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault();
        hop();
      }
      if (event.code === 'Escape') {
        stateRef.current = togglePause(stateRef.current);
        setView({ ...stateRef.current });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hop]);

  const restart = () => {
    const lv = won && view.level >= RUN_LEVELS ? 1 : view.level;
    stateRef.current = startRun(lv);
    setView({ ...stateRef.current });
  };

  const goNext = () => {
    stateRef.current = startRun(view.level + 1);
    setView({ ...stateRef.current });
  };

  const last = won && view.level >= RUN_LEVELS;
  const nextReady = won && !last;

  return (
    <div className="zufik-run" role="dialog" aria-label="Игра">
      <canvas
        ref={canvasRef}
        className="zufik-run-canvas"
        onPointerDown={hop}
      />
      <div className="zufik-run-hud">
        <div className="zufik-run-hud-left">
          <div className="zufik-run-count" aria-label={`${view.flowers} из ${view.goal}`}>
            <img className="zufik-run-count-plate" src={RUN_IMG.counter} alt="" draggable={false} />
            <img className="zufik-run-count-flower" src={RUN_IMG.flower} alt="" draggable={false} />
            <span className="zufik-run-count-num">
              {view.flowers}/{view.goal}
            </span>
          </div>
          <div className="zufik-run-dots" aria-hidden="true">
            {Array.from({ length: RUN_LEVELS }, (_, i) => (
              <span key={i} className={i < view.level ? 'zufik-run-dot is-on' : 'zufik-run-dot'} />
            ))}
          </div>
        </div>
        <button
          className="zufik-run-pause"
          type="button"
          aria-label="Пауза"
          onClick={() => {
            stateRef.current = togglePause(stateRef.current);
            setView({ ...stateRef.current });
          }}
        >
          <img src={RUN_IMG.btnPause} alt="" draggable={false} />
        </button>
      </div>
      {paused || won ? null : (
        <button className="zufik-run-jump" type="button" aria-label="Прыжок" onPointerDown={hop}>
          <img src={RUN_IMG.btnJump} alt="" draggable={false} />
        </button>
      )}
      {paused || won ? (
        <div className="zufik-run-sheet">
          {nextReady ? (
            <button className="zufik-run-next" type="button" aria-label="Дальше" onClick={goNext}>
              <img src={RUN_IMG.btnJump} alt="" draggable={false} />
            </button>
          ) : null}
          <button className="zufik-run-restart" type="button" aria-label="Ещё раз" onClick={restart}>
            <img src={RUN_IMG.btnRestart} alt="" draggable={false} />
          </button>
          <button className="zufik-run-leave" type="button" aria-label="В сад" onClick={onClose}>
            <HudIcon name="zoo" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
