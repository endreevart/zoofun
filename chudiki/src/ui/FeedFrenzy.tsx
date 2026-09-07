import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { assetUrl } from '../assetUrl';
import { mulberry32 } from '../game/core/rng';
import type { ChudikSpec } from '../game/creatures/ChudikSpec';
import { cutoutPortrait } from '../game/drawing/cutout';
import {
  CATCH_BAND,
  FEED_GOAL,
  STREAK_BURST,
  caught,
  clockRate,
  fallSpeed,
  isFood,
  nextStreak,
  scoreAfterCatch,
  snackValue,
  spawnPlan,
  waveOf,
  type SnackKind,
} from '../game/play/frenzy';

/**
 * Snacks rain from the sky; the child slides the chudik with its bowl along
 * the bottom to catch them. Sixteen points fill the toy up — and the toy
 * visibly grows rounder as it eats. Wave two speeds the rain up, golden
 * apples pay three, five clean catches burst into stars, and junk (socks,
 * stars) must be dodged: catching one costs a point and a sneeze.
 */

type Falling = { id: number; kind: SnackKind; x: number; y: number };
type Floater = { id: number; x: number; y: number; label: string; kind: 'heart' | 'star' | 'sad' };

const SNACK_SPRITE: Record<SnackKind, string> = {
  apple: assetUrl('/ui/apple.png'),
  berry: assetUrl('/ui/berry.png'),
  star: assetUrl('/ui/star.png'),
  golden: assetUrl('/ui/golden.png'),
  sock: assetUrl('/ui/sock.png'),
};

let floaterId = 0;

export function FeedFrenzy({
  spec,
  src,
  onClose,
}: {
  spec: ChudikSpec;
  src: string;
  onClose: (fed: boolean) => void;
}) {
  const [snacks, setSnacks] = useState<Falling[]>([]);
  const [score, setScore] = useState(0);
  const [munch, setMunch] = useState(false);
  const [sneeze, setSneeze] = useState(false);
  const [bowlX, setBowlX] = useState(0.5);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [toySrc, setToySrc] = useState(src);
  const stageRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!banner) return;
    window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), 1400);
    return () => window.clearTimeout(bannerTimer.current);
  }, [banner]);

  const sim = useRef({
    plan: spawnPlan(mulberry32((spec.seed ^ 0xf00d) >>> 0)),
    planIndex: 0,
    clock: 0,
    nextId: 1,
    snacks: [] as Falling[],
    score: 0,
    streak: 0,
    wave: 1 as 1 | 2,
    bowlX: 0.5,
    done: false,
  });

  const addFloater = (x: number, y: number, label: string, kind: Floater['kind']) => {
    const item: Floater = { id: (floaterId += 1), x, y, label, kind };
    setFloaters((current) => [...current.slice(-8), item]);
    window.setTimeout(() => {
      setFloaters((current) => current.filter((floater) => floater.id !== item.id));
    }, 1100);
  };

  useEffect(() => {
    let handle = 0;
    let last = performance.now();
    const step = (now: number) => {
      const state = sim.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!state.done) {
        state.clock += dt * clockRate(state.wave);
        // If the rain runs dry before the belly is full, brew another cloud:
        // the round always stays winnable.
        if (state.planIndex >= state.plan.length && state.snacks.length === 0) {
          const extra = spawnPlan(mulberry32((spec.seed ^ (state.nextId * 7919)) >>> 0), 24);
          const base = state.clock + 0.4;
          state.plan = state.plan.concat(extra.map((s) => ({ ...s, at: base + (s.at - 0.7) })));
        }
        while (
          state.planIndex < state.plan.length &&
          state.plan[state.planIndex].at <= state.clock
        ) {
          const planned = state.plan[state.planIndex];
          state.snacks.push({ id: state.nextId++, kind: planned.kind, x: planned.x, y: -0.06 });
          state.planIndex += 1;
        }
        const kept: Falling[] = [];
        for (const snack of state.snacks) {
          const next = { ...snack, y: snack.y + fallSpeed(snack.kind, state.wave) * dt };
          if (caught(next.x, next.y, state.bowlX)) {
            state.score = scoreAfterCatch(state.score, next.kind);
            state.streak = nextStreak(state.streak, next.kind, true);
            setScore(state.score);
            if (isFood(next.kind)) {
              setMunch(true);
              window.setTimeout(() => setMunch(false), 250);
              addFloater(
                next.x,
                CATCH_BAND[0],
                `+${snackValue(next.kind)}`,
                next.kind === 'golden' ? 'star' : 'heart',
              );
              if (state.streak >= STREAK_BURST) {
                state.streak = 0;
                setBanner('Супер! ✨');
                for (let i = 0; i < 4; i += 1) {
                  addFloater(
                    Math.min(0.9, Math.max(0.1, state.bowlX + (i - 1.5) * 0.09)),
                    CATCH_BAND[0] - 0.04,
                    '',
                    'star',
                  );
                }
              }
              const wave = waveOf(state.score);
              if (wave !== state.wave) {
                state.wave = wave;
                setBanner('Ещё хочу! Быстрее!');
              }
            } else {
              // Junk in the bowl: a sneeze and a lost point. Dodge next time!
              setSneeze(true);
              window.setTimeout(() => setSneeze(false), 500);
              addFloater(next.x, CATCH_BAND[0], '−1', 'sad');
            }
            continue;
          }
          if (next.y < 1.05) {
            kept.push(next);
          } else {
            state.streak = nextStreak(state.streak, next.kind, false);
          }
        }
        state.snacks = kept;
        if (state.score >= FEED_GOAL) {
          state.done = true;
          state.snacks = [];
          setBanner(null);
        }
        setSnacks([...state.snacks]);
      }
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveBowl = (clientX: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.min(0.94, Math.max(0.06, (clientX - rect.left) / rect.width));
    sim.current.bowlX = x;
    setBowlX(x);
  };

  const done = score >= FEED_GOAL;

  return (
    <div className="frenzy" role="dialog" aria-label="Покорми чудика">
      <div className="mg-head">
        <button
          className="icon-button"
          type="button"
          onClick={() => onClose(done)}
          aria-label="Назад в сад"
        >
          ⬅️
        </button>
        <p className="mg-lead">{done ? 'Ням! Наелся!' : `Покорми: ${spec.name}`}</p>
        <span className="mg-progress" aria-hidden="true">
          <img className="mg-progress-icon" src={assetUrl('/ui/apple.png')} alt="" />
          <span
            className="mg-progress-fill frenzy-fill"
            style={{ width: `${Math.min(1, score / FEED_GOAL) * 100}%` }}
          />
        </span>
      </div>

      <div
        ref={stageRef}
        className="frenzy-stage"
        onPointerDown={(event) => {
          // After the win the stage must not steal the button's click.
          if (done) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveBowl(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!done) moveBowl(event.clientX);
        }}
      >
        {snacks.map((snack) => (
          <img
            key={snack.id}
            className={`frenzy-snack${snack.kind === 'sock' ? ' is-sock' : ''}${
              snack.kind === 'golden' ? ' is-golden' : ''
            }`}
            src={SNACK_SPRITE[snack.kind]}
            alt=""
            draggable={false}
            style={{
              left: `${snack.x * 100}%`,
              top: `${snack.y * 100}%`,
              animationDuration: `${2.2 + (snack.id % 3) * 0.7}s`,
              animationDirection: snack.id % 2 ? 'alternate' : 'alternate-reverse',
            }}
          />
        ))}

        {floaters.map((floater) => (
          <span
            key={floater.id}
            className={`frenzy-float is-${floater.kind}`}
            style={{ left: `${floater.x * 100}%`, top: `${floater.y * 100}%` }}
          >
            {floater.kind !== 'sad' ? (
              <img src={floater.kind === 'star' ? assetUrl('/ui/star.png') : assetUrl('/ui/heart.png')} alt="" />
            ) : null}
            {floater.label ? <b>{floater.label}</b> : null}
          </span>
        ))}

        {banner ? (
          <div className="mg-banner" aria-hidden="true">
            <span>{banner}</span>
          </div>
        ) : null}

        <div
          className={`frenzy-bowl${munch ? ' is-munch' : ''}${sneeze ? ' is-sneeze' : ''}${
            done ? ' is-full' : ''
          }`}
          style={{ left: `${bowlX * 100}%`, top: `${((CATCH_BAND[0] + CATCH_BAND[1]) / 2) * 100}%` }}
        >
          <img
            className="frenzy-toy"
            src={toySrc}
            alt=""
            draggable={false}
            // The toy grows rounder with every snack it eats.
            style={
              {
                '--frenzy-toy-scale': String(1 + Math.min(1, score / FEED_GOAL) * 0.32),
              } as CSSProperties
            }
          />
          <img className="frenzy-dish" src={assetUrl('/ui/bowl.png')} alt="" draggable={false} />
        </div>

        {done ? (
          <>
            <div className="frenzy-rain" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <img
                  key={i}
                  src={i % 2 ? assetUrl('/ui/heart.png') : assetUrl('/ui/star.png')}
                  alt=""
                  style={{
                    left: `${6 + i * 9.5}%`,
                    animationDelay: `${(i % 5) * 0.35}s`,
                    animationDuration: `${2.4 + (i % 3) * 0.6}s`,
                  }}
                />
              ))}
            </div>
            <div className="mg-done frenzy-done">
              <button className="big-button primary" type="button" onClick={() => onClose(true)}>
                <span className="icon">🌿</span>
                <span>В сад!</span>
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
