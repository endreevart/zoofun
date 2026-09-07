import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../assetUrl';
import { mulberry32 } from '../game/core/rng';
import type { ChudikSpec } from '../game/creatures/ChudikSpec';
import { cutoutPortrait } from '../game/drawing/cutout';
import {
  STAGE_TOOL,
  applyWash,
  startWash,
  washTotal,
  type WashState,
  type WashTool,
} from '../game/play/wash';

/**
 * The wash scene as a four-step car-wash for a toy: soak with the watering
 * can, scrub the mud into foam with the sponge, rinse the foam off, then
 * towel the chudik dry. The right tool is handed to the child automatically
 * and each step opens with a big banner. All props are generated stickers.
 */

type Splash = { id: number; x: number; y: number; kind: 'foam' | 'drop' | 'shine'; size: number };
type MudFall = { id: number; x: number; y: number; r: number };

/** How often a held tool counts, per tool: the can pours, hands rub. */
const TOOL_COOLDOWN_MS: Record<WashTool, number> = { shower: 240, sponge: 85, towel: 120 };

const TOOL_SPRITE: Record<WashTool, string> = {
  sponge: assetUrl('/ui/sponge.png'),
  shower: assetUrl('/ui/shower.png'),
  towel: assetUrl('/ui/towel.png'),
};
const TOOL_LABEL: Record<WashTool, string> = {
  sponge: 'Губка',
  shower: 'Лейка',
  towel: 'Полотенце',
};
const STAGE_BANNER: Record<string, string> = {
  soak: 'Полей водичкой!',
  scrub: 'Потри губкой!',
  rinse: 'Смой пену!',
  dry: 'Вытри насухо!',
  done: 'Чистый-пречистый!',
};
const SPLASH_SPRITE: Record<Splash['kind'], string> = {
  foam: assetUrl('/ui/foam.png'),
  drop: assetUrl('/ui/drop.png'),
  shine: assetUrl('/ui/star.png'),
};

const cloneWash = (state: WashState): WashState => ({
  ...state,
  spots: state.spots.map((spot) => ({ ...spot })),
  foam: state.foam.map((blob) => ({ ...blob })),
});

let splashId = 0;

export function CareRoom({
  spec,
  src,
  onFeed,
  onClose,
}: {
  spec: ChudikSpec;
  src: string;
  onFeed: () => void;
  onClose: (washed: boolean) => void;
}) {
  const [wash, setWash] = useState<WashState>(() => startWash(mulberry32(spec.seed ^ 0x50ab)));
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const [mudFalls, setMudFalls] = useState<MudFall[]>([]);
  const [cheer, setCheer] = useState(false);
  const [wiggle, setWiggle] = useState(false);
  const [banner, setBanner] = useState<string | null>(STAGE_BANNER.soak);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [toySrc, setToySrc] = useState(src);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const toyboxRef = useRef<HTMLDivElement | null>(null);
  const scrubbing = useRef(false);
  const lastScrub = useRef(0);
  // A finished stage ends the current gesture: the child must lift the
  // finger, read the banner and start the next tool deliberately. Without
  // this one long scribble used to fly through the whole wash.
  const stagePauseUntil = useRef(0);
  const needsNewStroke = useRef(false);
  const pourPoint = useRef<{ x: number; y: number } | null>(null);
  const effectRng = useRef(mulberry32((spec.seed ^ 0xbeef) >>> 0));
  const bannerTimer = useRef(0);

  useEffect(() => {
    let alive = true;
    void cutoutPortrait(src).then((cut) => {
      if (alive) setToySrc(cut);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  // The opening banner and every stage banner melt away on their own.
  useEffect(() => {
    if (!banner) return;
    window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), 1500);
    return () => window.clearTimeout(bannerTimer.current);
  }, [banner]);

  const stage = wash.stage;
  const done = stage === 'done';
  const tool: WashTool = done ? 'towel' : STAGE_TOOL[stage];
  const progress = washTotal(wash);

  const spawnSplashes = (x: number, y: number, kind: Splash['kind']) => {
    const burst: Splash[] = Array.from({ length: kind === 'drop' ? 3 : 2 }, (_, i) => ({
      id: (splashId += 1),
      x: x + (Math.random() - 0.5) * 0.12,
      y: kind === 'drop' ? y - 0.12 - i * 0.05 : y + (Math.random() - 0.5) * 0.1,
      kind,
      size: kind === 'shine' ? 0.05 + Math.random() * 0.03 : 0.07 + Math.random() * 0.06,
    }));
    setSplashes((current) => [...current.slice(-16), ...burst]);
    window.setTimeout(() => {
      setSplashes((current) => current.filter((splash) => !burst.includes(splash)));
    }, 850);
  };

  const scrub = (clientX: number, clientY: number) => {
    const stageEl = stageRef.current;
    const toybox = toyboxRef.current;
    if (!stageEl || !toybox || done) return;
    const rect = stageEl.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    pourPoint.current = { x, y };
    setCursor({ x, y });
    const now = performance.now();
    if (needsNewStroke.current || now < stagePauseUntil.current) return;
    if (now - lastScrub.current < TOOL_COOLDOWN_MS[tool]) return;
    lastScrub.current = now;

    // Mud and foam live on the toy, so hit-test in the toy box's coordinates.
    const toyRect = toybox.getBoundingClientRect();
    const tx = (clientX - toyRect.left) / toyRect.width;
    const ty = (clientY - toyRect.top) / toyRect.height;
    setWash((current) => {
      const next = cloneWash(current);
      const result = applyWash(next, tx, ty, effectRng.current);
      if (!result.hit) return current;
      setWiggle(true);
      window.setTimeout(() => setWiggle(false), 220);
      // A defeated mud spot tumbles off the toy in one satisfying chunk.
      const fallen = current.spots.filter(
        (spot, index) => spot.hp > 0 && next.spots[index].hp <= 0,
      );
      if (fallen.length > 0) {
        const chunks = fallen.map((spot) => ({ id: (splashId += 1), x: spot.x, y: spot.y, r: spot.r }));
        setMudFalls((have) => [...have.slice(-6), ...chunks]);
        window.setTimeout(() => {
          setMudFalls((have) => have.filter((chunk) => !chunks.includes(chunk)));
        }, 900);
      }
      if (result.advanced) {
        setBanner(STAGE_BANNER[next.stage]);
        setCheer(true);
        window.setTimeout(() => setCheer(false), 750);
        stagePauseUntil.current = performance.now() + 1200;
        needsNewStroke.current = true;
        if (next.stage === 'done') setCursor(null);
      }
      return next;
    });

    const splashKind: Splash['kind'] =
      tool === 'sponge' ? 'foam' : tool === 'towel' ? 'shine' : 'drop';
    spawnSplashes(x, y, splashKind);
  };

  // The watering can keeps pouring while the finger holds still.
  useEffect(() => {
    if (tool !== 'shower') return;
    const timer = window.setInterval(() => {
      const point = pourPoint.current;
      const stageEl = stageRef.current;
      if (!scrubbing.current || !point || !stageEl) return;
      const rect = stageEl.getBoundingClientRect();
      lastScrub.current = 0;
      scrub(rect.left + point.x * rect.width, rect.top + point.y * rect.height);
    }, 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, done]);

  const celebrated = useRef(false);
  useEffect(() => {
    if (done && !celebrated.current) celebrated.current = true;
  }, [done]);

  // Wet toys glisten; dry toys sparkle back to normal.
  const wetness = stage === 'dry' ? (1 - wash.dry) * 0.7 : stage === 'soak' ? wash.soak : 1;
  const toyFilter = done
    ? 'saturate(1.12) brightness(1.06)'
    : `saturate(${1 + wetness * 0.18}) brightness(${1 + wetness * 0.05})`;

  return (
    <div className="care-room" role="dialog" aria-label="Помыть чудика">
      <div className="mg-head">
        <button
          className="icon-button"
          type="button"
          onClick={() => onClose(celebrated.current)}
          aria-label="Назад в сад"
        >
          ⬅️
        </button>
        <p className="mg-lead">{done ? 'Чистый-пречистый!' : `Помой: ${spec.name}`}</p>
        <span className="mg-progress" aria-hidden="true">
          <img className="mg-progress-icon" src={assetUrl('/ui/sponge.png')} alt="" />
          <span className="mg-progress-fill care-fill" style={{ width: `${progress * 100}%` }} />
        </span>
      </div>

      <div
        ref={stageRef}
        className={`care-stage${done ? ' is-clean' : ''}`}
        onPointerDown={(event) => {
          if (done) return;
          scrubbing.current = true;
          needsNewStroke.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
          scrub(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (scrubbing.current) scrub(event.clientX, event.clientY);
        }}
        onPointerUp={() => {
          scrubbing.current = false;
          pourPoint.current = null;
          setCursor(null);
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
          pourPoint.current = null;
          setCursor(null);
        }}
      >
        <div className="care-bubbles" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <img
              key={i}
              src={assetUrl('/ui/foam.png')}
              alt=""
              draggable={false}
              style={{
                left: `${8 + i * 15}%`,
                width: `${4 + (i % 3) * 2}%`,
                animationDelay: `${i * 1.4}s`,
                animationDuration: `${6 + (i % 3) * 2.5}s`,
              }}
            />
          ))}
        </div>
        <div ref={toyboxRef} className="care-toybox">
          <img
            className={`care-toy${wiggle ? ' is-wiggle' : ''}${cheer ? ' is-cheer' : ''}${done ? ' is-happy' : ''}`}
            src={toySrc}
            alt=""
            draggable={false}
            style={{ filter: toyFilter }}
          />
          {wash.spots.map((spot, index) =>
            spot.hp > 0 ? (
              <img
                key={index}
                className={`care-dirt${wash.soak > 0.3 ? ' is-wet' : ''}`}
                src={assetUrl('/ui/mud.png')}
                alt=""
                draggable={false}
                style={{
                  left: `${(spot.x - spot.r) * 100}%`,
                  top: `${(spot.y - spot.r) * 100}%`,
                  width: `${spot.r * 2 * 100}%`,
                  height: `${spot.r * 2 * 100}%`,
                  opacity: 0.3 + (Math.max(0, spot.hp) / 4) * 0.65,
                  transform: `rotate(${((index * 53) % 44) - 22}deg) scale(${
                    0.75 + (Math.max(0, spot.hp) / 4) * 0.25
                  })`,
                }}
              />
            ) : null,
          )}
          {mudFalls.map((chunk) => (
            <img
              key={`fall-${chunk.id}`}
              className="care-mudfall"
              src={assetUrl('/ui/mud.png')}
              alt=""
              draggable={false}
              style={{
                left: `${(chunk.x - chunk.r) * 100}%`,
                top: `${(chunk.y - chunk.r) * 100}%`,
                width: `${chunk.r * 2 * 100}%`,
              }}
            />
          ))}
          {wash.foam.map((blob, index) => (
            <img
              key={`foam-${index}-${blob.x.toFixed(3)}`}
              className="care-foamblob"
              src={assetUrl('/ui/foam.png')}
              alt=""
              draggable={false}
              style={{
                left: `${(blob.x - blob.r) * 100}%`,
                top: `${(blob.y - blob.r) * 100}%`,
                width: `${blob.r * 2 * 100}%`,
                opacity: 0.55 + (blob.hp / 2) * 0.45,
                animationDelay: `${(index % 5) * 0.35}s`,
              }}
            />
          ))}
        </div>
        {splashes.map((splash) => (
          <img
            key={splash.id}
            className={`care-splash is-${splash.kind}`}
            src={SPLASH_SPRITE[splash.kind]}
            alt=""
            draggable={false}
            style={{
              left: `${splash.x * 100}%`,
              top: `${splash.y * 100}%`,
              width: `${splash.size * 100}%`,
            }}
          />
        ))}
        {cursor && !done ? (
          <img
            className={`care-cursor is-${tool}`}
            src={TOOL_SPRITE[tool]}
            alt=""
            draggable={false}
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
          />
        ) : null}
        {banner ? (
          <div className="mg-banner" aria-hidden="true">
            {!done && banner !== STAGE_BANNER.done ? (
              <img src={TOOL_SPRITE[tool]} alt="" draggable={false} />
            ) : null}
            <span>{banner}</span>
          </div>
        ) : null}
        {done ? (
          <>
            <div className="care-rainbow" aria-hidden="true" />
            <div className="care-sparkle" aria-hidden="true">
              ✨✨✨
            </div>
          </>
        ) : null}
      </div>

      {done ? (
        <div className="mg-done">
          <button className="big-button" type="button" onClick={onFeed}>
            <img className="mg-button-sprite" src={assetUrl('/ui/apple.png')} alt="" />
            <span>Покормить</span>
          </button>
          <button className="big-button primary" type="button" onClick={() => onClose(true)}>
            <span className="icon">🌿</span>
            <span>В сад!</span>
          </button>
        </div>
      ) : (
        <div className="care-tools">
          {(Object.keys(TOOL_SPRITE) as WashTool[]).map((key) => (
            <button
              key={key}
              className={`care-tool${tool === key ? ' is-active is-turn' : ' is-waiting'}`}
              type="button"
              disabled={tool !== key}
              aria-label={TOOL_LABEL[key]}
            >
              <img src={TOOL_SPRITE[key]} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
