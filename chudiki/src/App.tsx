import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import {
  generateSpec,
  makeId,
  randomName,
  randomSeed,
  type ChudikSpec,
} from './game/creatures/ChudikSpec';
import { blankEggDrawing, imageToChudik, styledToChudik } from './game/drawing/imageToChudik';
import { portraitFromImage, portraitUrlOf } from './game/drawing/portrait';
import { stylizeDrawing, waitForMesh } from './game/drawing/stylizeDrawing';
import { eggCanOpen } from './game/creatures/hatch';
import { paperizeCanvas } from './game/drawing/paperize';
import { preloadMeshyModel } from './game/creatures/DrawingChudikBuilder';
import {
  deleteVoiceRecording,
  saveVoiceRecording,
} from './game/persistence/zooStore';
import { DrawPad } from './ui/DrawPad';
import { HatchPreview } from './ui/HatchPreview';
import { HatchPuzzle } from './ui/HatchPuzzle';
import { CareRoom } from './ui/CareRoom';
import { FeedFrenzy } from './ui/FeedFrenzy';
import { CreatureCard } from './ui/CreatureCard';
import { RosterSheet } from './ui/RosterSheet';
import { TuningPanel } from './ui/TuningPanel';
import { LayoutEditor } from './ui/LayoutEditor';
import { isStudio } from './studioMode';
import { WalkPad } from './ui/WalkPad';
import { CareHud } from './ui/CareHud';
import { HudIcon } from './ui/HudIcon';
import { PilotChoice } from './ui/PilotChoice';
import { bootstrapParentSession, PAID_FLASH_KEY, siteHomeUrl } from './parentSession';
import { applyRemaining, canStartCreation, readQuota, spendOneCredit, type Quota } from './game/commerce';
import { PackSheet } from './ui/PackSheet';
import { QuotaDock } from './ui/QuotaDock';
import { isTvReceiver, TvReceiver } from './ui/TvReceiver';

type Screen = 'zoo' | 'draw' | 'roster' | 'preview';

type HatchLook = { id: string; src: string | null; name: string };

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenNode = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function currentFullscreen(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function enterFullscreen(node: HTMLElement): Promise<boolean> {
  const el = node as FullscreenNode;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function leaveFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    /* already left */
  }
}

const FAILURE_MESSAGES: Record<string, string> = {
  empty: 'Тут почти ничего не нарисовано. Нарисуй чудика побольше!',
  'too-small': 'Слишком маленький рисунок. Нарисуй на весь лист!',
  'too-thin': 'Замкни линию, чтобы получилось тело чудика.',
};

export function App() {
  if (isTvReceiver()) return <TvReceiver />;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('zoo');
  const [specs, setSpecs] = useState<ChudikSpec[]>([]);
  const [recordedIds, setRecordedIds] = useState<Set<string>>(new Set());
  const [cardSpec, setCardSpec] = useState<ChudikSpec | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [joy, setJoy] = useState(0.42);
  const [feeding, setFeeding] = useState(false);
  const [offerSpec, setOfferSpec] = useState<ChudikSpec | null>(null);
  const [driving, setDriving] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [cinema, setCinema] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [pendingBirth, setPendingBirth] = useState(false);
  const pendingBirthRef = useRef(false);
  const [hatchLook, setHatchLook] = useState<HatchLook | null>(null);
  const hatchLookRef = useRef<HatchLook | null>(null);
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const [careSpec, setCareSpec] = useState<ChudikSpec | null>(null);
  const [frenzySpec, setFrenzySpec] = useState<ChudikSpec | null>(null);
  const [puzzleSpec, setPuzzleSpec] = useState<ChudikSpec | null>(null);
  const [shopOpen, setShopOpen] = useState(() => {
    try {
      return import.meta.env.DEV && new URLSearchParams(window.location.search).has('shop');
    } catch {
      return false;
    }
  });
  const previewEggs = import.meta.env.DEV
    ? Number.parseInt(new URLSearchParams(window.location.search).get('eggs') ?? '', 10)
    : Number.NaN;
  const [actionsOpen, setActionsOpen] = useState(false);
  const [parentEntry] = useState(() => bootstrapParentSession());
  const appRef = useRef<HTMLDivElement | null>(null);

  const refreshQuota = useCallback(async () => {
    const token = bootstrapParentSession().token;
    if (!token) {
      setQuota(null);
      return;
    }
    setQuota(await readQuota(token));
  }, []);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  useEffect(() => {
    if (screen !== 'zoo') setActionsOpen(false);
    if (screen !== 'preview') setPuzzleOpen(false);
  }, [screen]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const game = new Game(stage, {
      onRosterChanged: (next) => setSpecs(next),
      onCreatureTapped: (spec) => setOfferSpec(spec),
      onCreatureHeld: (spec) => setCardSpec(spec),
      onCareChanged: (state) => {
        setJoy(state.joy);
        setFeeding(state.feeding);
      },
    });
    gameRef.current = game;

    void game.start((fraction) => setLoadProgress(fraction)).then(() => {
      setReady(true);
      setRecordedIds(new Set(game.getRecordedIds()));
      for (const pending of game.pendingHatches()) {
        void waitForMesh(pending.jobId)
          .then(async (mesh) => {
            if (!eggCanOpen(mesh.mesh, mesh.modelUrl)) return;
            if (mesh.modelUrl) await preloadMeshyModel(mesh.modelUrl);
            const drawing = {
              ...pending.drawing,
              ...(mesh.modelUrl ? { modelUrl: mesh.modelUrl, placeholder: undefined } : {}),
              ...(mesh.postcardUrl ? { postcardUrl: mesh.postcardUrl } : {}),
            };
            game.prepareHatch(pending.id, { drawing }, { open: true });
          })
          .catch(() => {
            // The job is gone (API restart). Hatch what we have: the painted
            // extrude. A shut egg forever is worse than a missing mesh.
            game.prepareHatch(pending.id, { drawing: pending.drawing }, { open: true });
          });
      }
    });

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setShowHint(false), 7000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!offerSpec) return;
    const timer = window.setTimeout(() => setOfferSpec(null), 8000);
    return () => window.clearTimeout(timer);
  }, [offerSpec]);

  const startPilot = useCallback((id: string) => {
    if (!gameRef.current?.controlCreature(id)) return;
    setDriving(true);
    setOfferSpec(null);
    setCardSpec(null);
    setShowHint(false);
  }, []);

  const stopPilot = useCallback(() => {
    gameRef.current?.releaseControl();
    setDriving(false);
  }, []);

  useEffect(() => {
    if (!ready || screen !== 'zoo') {
      if (ready) gameRef.current?.setWalkKeys(0, 0);
      return;
    }

    const held = new Set<string>();
    const apply = () => {
      const forward = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) +
        (held.has('KeyS') || held.has('ArrowDown') ? -1 : 0);
      const right = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) +
        (held.has('KeyA') || held.has('ArrowLeft') ? -1 : 0);
      gameRef.current?.setWalkKeys(forward, right);
    };

    const onDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        return;
      }
      event.preventDefault();
      held.add(event.code);
      apply();
    };
    const onUp = (event: KeyboardEvent) => {
      if (!held.has(event.code)) return;
      held.delete(event.code);
      apply();
    };
    const halt = () => {
      held.clear();
      gameRef.current?.setWalkKeys(0, 0);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', halt);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', halt);
      halt();
    };
  }, [ready, screen]);

  const walkPad = useCallback((forward: number, right: number) => {
    gameRef.current?.setWalkPad(forward, right);
  }, []);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(PAID_FLASH_KEY) !== '1') return;
    } catch {
      return;
    }
    flash('Оплата прошла. Кредиты уже на аккаунте.');
    void refreshQuota();
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(PAID_FLASH_KEY);
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [flash, refreshQuota]);

  const toggleFullscreen = useCallback(() => {
    if (currentFullscreen()) {
      setCinema(false);
      void leaveFullscreen();
      return;
    }
    setCinema(true);
    const root = appRef.current ?? document.documentElement;
    void enterFullscreen(root);
  }, []);

  useEffect(() => {
    const sync = () => setCinema(Boolean(currentFullscreen()));
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const canCreate = useCallback(() => {
    const signedIn = Boolean(bootstrapParentSession().token);
    if (!signedIn && !import.meta.env.DEV) {
      flash('Зайди с сайта — тогда чудик появится в объёме.');
      return false;
    }
    const locked = pendingBirthRef.current || pendingBirth;
    if (!canStartCreation({ remaining: quota?.remaining ?? null, pendingBirth: locked })) {
      if (locked) {
        flash('Подожди чуть-чуть — рисунок ещё отправляется.');
        return false;
      }
      if (quota && quota.remaining <= 0) {
        setShopOpen(true);
        return false;
      }
      return false;
    }
    return true;
  }, [flash, pendingBirth, quota]);
  const processArtwork = useCallback(
    async (raw: HTMLCanvasElement | HTMLImageElement) => {
      const source = raw instanceof HTMLCanvasElement ? paperizeCanvas(raw) : raw;
      if (!canCreate()) return;
      const game = gameRef.current;
      if (!game) return;
      const seed = randomSeed();
      const spec = generateSpec({
        id: makeId(),
        name: randomName(seed),
        seed,
        kindId: 'roundy',
        origin: 'drawing',
        hatching: true,
        drawing: blankEggDrawing(),
      });

      setBusy(null);
      pendingBirthRef.current = true;
      setPendingBirth(true);
      setQuota((current) => spendOneCredit(current));

      const showLook = (look: HatchLook | null) => {
        hatchLookRef.current = look;
        setHatchLook(look);
      };
      const watchingThis = () => hatchLookRef.current?.id === spec.id;
      const enterGarden = () => {
        showLook(null);
        setScreen('zoo');
        game.focusOn(spec.id);
      };

      showLook({ id: spec.id, src: null, name: spec.name });
      setScreen('preview');

      let accepted = false;
      try {
        const local = await imageToChudik(source);
        if (!local.ok) {
          showLook(null);
          setScreen('draw');
          flash(FAILURE_MESSAGES[local.reason] ?? 'Не получилось разобрать рисунок.');
          return;
        }

        let painted = local.drawing;
        const ready = async (
          styled: Extract<Awaited<ReturnType<typeof stylizeDrawing>>, { ok: true }>,
        ) => {
          const fromStyle = await styledToChudik(styled.image);
          if (fromStyle.ok) painted = fromStyle.drawing;
          const portraitUrl = portraitFromImage(styled.image);
          if (styled.modelUrl) {
            await preloadMeshyModel(styled.modelUrl);
            painted = { ...painted, modelUrl: styled.modelUrl };
          }
          if (portraitUrl) painted = { ...painted, portraitUrl };
          if (styled.postcardUrl) painted = { ...painted, postcardUrl: styled.postcardUrl };
          const name = styled.name || spec.name;
          const kindId = styled.kindId || spec.kindId;
          game.prepareHatch(
            spec.id,
            { drawing: painted, name, kindId },
            { open: eggCanOpen(styled.mesh, styled.modelUrl) },
          );
        };

        const styled = await stylizeDrawing(source, {
          onAccepted: async ({ remaining, jobId }) => {
            accepted = true;
            spec.hatchJobId = jobId;
            if (typeof remaining === 'number') {
              setQuota((current) => applyRemaining(current, remaining));
            } else {
              void refreshQuota();
            }
            await game.addCreature(spec);
          },
          onImage: (paintedStill) => {
            game.noteHatchPainted(spec.id);
            showLook({
              id: spec.id,
              src: paintedStill.image.src,
              name: paintedStill.name || spec.name,
            });
          },
        });
        if (styled.ok) {
          const left = styled.remaining;
          if (typeof left === 'number') {
            setQuota((current) => applyRemaining(current, left));
          }
          await ready(styled);
          if (styled.mesh === 'pending') {
            void waitForMesh(styled.jobId)
              .then(async (mesh) => {
                if (!eggCanOpen(mesh.mesh, mesh.modelUrl)) return;
                await ready({
                  ...styled,
                  modelUrl: mesh.modelUrl,
                  mesh: mesh.mesh,
                  postcardUrl: mesh.postcardUrl ?? styled.postcardUrl,
                });
              })
              .catch(async () => {
                // Polling died; open the egg with the painted extrude.
                await ready({ ...styled, mesh: 'failed' });
              });
          }
          if (!watchingThis()) {
            flash(
              styled.modelUrl
                ? 'Почти! Постучи — или подожди чуть-чуть.'
                : styled.mesh === 'failed'
                  ? 'Картинка готова, объём не вышел. Постучи.'
                  : 'Картинка готова. Объём долепится в саду.',
            );
          }
        } else if (styled.reason === 'not_allowed') {
          showLook(null);
          setScreen('draw');
          flash('Такой рисунок нельзя. Нарисуй зверушку.');
        } else if (styled.reason === 'no_credits') {
          showLook(null);
          setScreen('zoo');
          setShopOpen(true);
          flash('Нужен пакет — бесплатный зверь уже создан.');
        } else if (accepted && styled.reason === 'timeout') {
          if (!hatchLookRef.current?.src) enterGarden();
          flash('Ещё лепится. Подожди у яйца.');
        } else if (accepted) {
          await game.removeCreature(spec.id);
          showLook(null);
          setScreen('draw');
          flash('Не получилось. Попытка вернулась.');
        } else if (!bootstrapParentSession().token && import.meta.env.DEV) {
          await game.addCreature(spec);
          game.prepareHatch(spec.id, { drawing: local.drawing }, { open: true });
          showLook(null);
          setScreen('zoo');
          flash('Постучи по яйцу — там твой рисунок.');
        } else if (!bootstrapParentSession().token || styled.reason === 'not_signed_in') {
          showLook(null);
          setScreen('zoo');
          flash('Зайди с сайта — тогда чудик появится в объёме.');
        } else if (styled.reason === 'unavailable') {
          showLook(null);
          setScreen('draw');
          flash('Сейчас нельзя создать чудика. Попробуй позже.');
        } else {
          showLook(null);
          setScreen('draw');
          flash('Не получилось обработать рисунок.');
        }
      } catch (error) {
        console.error('[drawing] processing failed', error);
        if (accepted) {
          await game.removeCreature(spec.id);
        }
        showLook(null);
        flash('Что-то пошло не так с рисунком.');
        setScreen('zoo');
      } finally {
        pendingBirthRef.current = false;
        setPendingBirth(false);
        setBusy(null);
        void refreshQuota();
      }
    },
    [canCreate, flash, refreshQuota],
  );

  const handlePhoto = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('image decode failed'));
          image.src = url;
        });
        await processArtwork(image);
      } catch {
        flash('Не удалось открыть фото.');
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [flash, processArtwork],
  );

  const saveRecording = useCallback(
    async (spec: ChudikSpec, recording: { bytes: ArrayBuffer; mimeType: string }) => {
      const game = gameRef.current;
      if (!game) return;

      await saveVoiceRecording(spec.id, recording.bytes, recording.mimeType);
      game.setRecording(spec.id, recording);
      setRecordedIds(new Set(game.getRecordedIds()));
      game.playVoice(spec.id);
      flash(`Теперь ${spec.name} говорит твоим звуком!`);
    },
    [flash],
  );

  const clearRecording = useCallback(
    async (spec: ChudikSpec) => {
      const game = gameRef.current;
      if (!game) return;

      await deleteVoiceRecording(spec.id);
      game.setRecording(spec.id, null);
      setRecordedIds(new Set(game.getRecordedIds()));
      game.playVoice(spec.id);
    },
    [],
  );

  const removeCreature = useCallback(
    async (spec: ChudikSpec) => {
      const game = gameRef.current;
      if (!game) return;
      setCardSpec(null);
      await game.removeCreature(spec.id);
      setRecordedIds(new Set(game.getRecordedIds()));
      flash(`${spec.name} ушёл домой.`);
    },
    [flash],
  );

  return (
    <div className="app" ref={appRef}>
      <div className="stage" ref={stageRef} />
      {parentEntry.fromSite && screen !== 'draw' && screen !== 'preview' ? (
        <a className="site-back" href={siteHomeUrl()}>
          На сайт
        </a>
      ) : null}

      {screen === 'zoo' && ready && (
        <>
          {showHint && !driving && specs.length > 0 && (
            <div className="hint">Тапни чудика — он тебе ответит 👆</div>
          )}
          {specs.length === 0 && !driving && (
            <div className="hint">Нарисуй чудика — он поселится в саду 🎨</div>
          )}

          <WalkPad onWalk={walkPad} />

          {offerSpec && !driving && (
            <PilotChoice
              spec={offerSpec}
              onPilot={() => startPilot(offerSpec.id)}
              onWash={
                portraitUrlOf(offerSpec.drawing)
                  ? () => {
                      setCareSpec(offerSpec);
                      setOfferSpec(null);
                    }
                  : null
              }
              onFeedGame={
                portraitUrlOf(offerSpec.drawing)
                  ? () => {
                      setFrenzySpec(offerSpec);
                      setOfferSpec(null);
                    }
                  : null
              }
              onPuzzle={
                portraitUrlOf(offerSpec.drawing)
                  ? () => {
                      setPuzzleSpec(offerSpec);
                      setOfferSpec(null);
                    }
                  : null
              }
              onDismiss={() => setOfferSpec(null)}
            />
          )}

          {driving && (
            <button className="pilot-stop" type="button" onClick={stopPilot}>
              <span className="icon">✋</span>
              <span>Отпустить</span>
            </button>
          )}

          {quota ? (
            <QuotaDock remaining={quota.remaining} onTopUp={() => setShopOpen(true)} />
          ) : Number.isFinite(previewEggs) ? (
            <QuotaDock remaining={previewEggs} onTopUp={() => setShopOpen(true)} />
          ) : null}

          <div className={`toolbar-dock${actionsOpen ? ' is-open' : ''}`}>
            <button
              className="toolbar-scrim"
              type="button"
              aria-label="Закрыть"
              onClick={() => setActionsOpen(false)}
            />
            <div className="toolbar">
              <button
                className="big-button ghost"
                onClick={() => {
                  setActionsOpen(false);
                  stopPilot();
                  gameRef.current?.showWholeZoo();
                }}
              >
                <HudIcon name="zoo" />
                <span>Весь зоопарк</span>
              </button>

              <button
                className="big-button ghost"
                onClick={() => {
                  setActionsOpen(false);
                  setScreen('roster');
                }}
              >
                <HudIcon name="roster" />
                <span>Мои чудики</span>
              </button>

              <button
                className="big-button primary"
                onClick={() => {
                  setActionsOpen(false);
                  if (!canCreate()) return;
                  setScreen('draw');
                }}
              >
                <HudIcon name="draw" />
                <span>Нарисовать</span>
              </button>

              <button
                className="big-button"
                onClick={() => {
                  setActionsOpen(false);
                  if (!canCreate()) return;
                  fileInputRef.current?.click();
                }}
              >
                <HudIcon name="photo" />
                <span>Фото рисунка</span>
              </button>

              <CareHud
                joy={joy}
                feeding={feeding}
                onFeed={() => {
                  setActionsOpen(false);
                  stopPilot();
                  const ok = gameRef.current?.feedZoo();
                  if (ok === false) {
                    flash(
                      specs.length === 0
                        ? 'Сначала нарисуй чудика — он придёт кушать.'
                        : 'Поставьте корзинку в парке — туда придут кушать.',
                    );
                  }
                }}
              />
            </div>
            <button
              className="toolbar-fab"
              type="button"
              aria-label={actionsOpen ? 'Закрыть' : 'Действия'}
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((open) => !open)}
            >
              {actionsOpen ? (
                <span className="icon">✕</span>
              ) : (
                <HudIcon name="draw" />
              )}
            </button>
          </div>
        </>
      )}

      {screen === 'draw' && (
        <DrawPad
          onCancel={() => setScreen('zoo')}
          onDone={(canvas) => void processArtwork(canvas)}
        />
      )}

      {screen === 'preview' && hatchLook ? (
        puzzleOpen && hatchLook.src ? (
          <HatchPuzzle
            src={hatchLook.src}
            name={hatchLook.name}
            onBack={() => setPuzzleOpen(false)}
            onForward={() => {
              const id = hatchLook.id;
              hatchLookRef.current = null;
              setHatchLook(null);
              setPuzzleOpen(false);
              setScreen('zoo');
              gameRef.current?.focusOn(id);
            }}
          />
        ) : (
          <HatchPreview
            src={hatchLook.src}
            name={hatchLook.name}
            onPuzzle={hatchLook.src ? () => setPuzzleOpen(true) : undefined}
            onForward={() => {
              const id = hatchLook.id;
              hatchLookRef.current = null;
              setHatchLook(null);
              setScreen('zoo');
              gameRef.current?.focusOn(id);
            }}
          />
        )
      ) : null}

      {careSpec ? (
        <CareRoom
          spec={careSpec}
          src={portraitUrlOf(careSpec.drawing) ?? ''}
          onFeed={() => {
            setFrenzySpec(careSpec);
            setCareSpec(null);
          }}
          onClose={(washed) => {
            setCareSpec(null);
            if (washed) gameRef.current?.celebrate(careSpec.id);
          }}
        />
      ) : null}

      {frenzySpec ? (
        <FeedFrenzy
          spec={frenzySpec}
          src={portraitUrlOf(frenzySpec.drawing) ?? ''}
          onClose={(fed) => {
            setFrenzySpec(null);
            if (fed) gameRef.current?.celebrate(frenzySpec.id);
          }}
        />
      ) : null}

      {puzzleSpec && portraitUrlOf(puzzleSpec.drawing) ? (
        <HatchPuzzle
          src={portraitUrlOf(puzzleSpec.drawing)!}
          name={puzzleSpec.name}
          onBack={() => setPuzzleSpec(null)}
          onForward={() => {
            setPuzzleSpec(null);
            gameRef.current?.celebrate(puzzleSpec.id);
          }}
        />
      ) : null}

      {screen === 'roster' && (
        <RosterSheet
          specs={specs}
          recordedIds={recordedIds}
          onClose={() => setScreen('zoo')}
          onSelect={(spec) => {
            setScreen('zoo');
            gameRef.current?.focusOn(spec.id);
            setCardSpec(spec);
          }}
        />
      )}

      {shopOpen ? (
        <PackSheet
          remaining={quota?.remaining ?? (Number.isFinite(previewEggs) ? previewEggs : 0)}
          onClose={() => setShopOpen(false)}
          onError={flash}
        />
      ) : null}

      {cardSpec && (
        <CreatureCard
          spec={cardSpec}
          hasRecording={recordedIds.has(cardSpec.id)}
          onClose={() => setCardSpec(null)}
          onPlayVoice={() => gameRef.current?.poke(cardSpec.id)}
          onFind={() => {
            setCardSpec(null);
            gameRef.current?.focusOn(cardSpec.id);
          }}
          onPilot={() => startPilot(cardSpec.id)}
          onSaveRecording={(recording) => void saveRecording(cardSpec, recording)}
          onClearRecording={() => void clearRecording(cardSpec)}
          onDelete={() => void removeCreature(cardSpec)}
        />
      )}

      {busy && (
        <div className="busy">
          <div className="spinner" />
          <span>{busy}</span>
        </div>
      )}

      {!ready && (
        <div className="busy">
          <div className="spinner" />
          <span>Открываем зоопарк...</span>
          <span className="load-bar" aria-hidden="true">
            <span className="food-bar-fill" style={{ width: `${Math.round(loadProgress * 100)}%` }} />
          </span>
        </div>
      )}

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      <div className="admin-dock">
        {screen === 'zoo' && ready && (
          <button
            className={`tv-share${cinema ? ' is-live' : ''}`}
            type="button"
            title={cinema ? 'Выйти из полного экрана' : 'Открыть зоопарк на весь экран'}
            aria-label={cinema ? 'Выйти из полного экрана' : 'Открыть зоопарк на весь экран'}
            onClick={toggleFullscreen}
          >
            ⛶
          </button>
        )}
        {isStudio() && ready && gameRef.current && <LayoutEditor game={gameRef.current} />}
        {isStudio() && ready && <TuningPanel />}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handlePhoto(file);
        }}
      />
    </div>
  );
}
