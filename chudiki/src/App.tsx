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
import { portraitFromImage, portraitUrlOf, displayStillUrl, rosterPhoto } from './game/drawing/portrait';
import { stylizeDrawing, waitForMesh, waitForPostcard } from './game/drawing/stylizeDrawing';
import { eggCanOpen } from './game/creatures/hatch';
import { paperizeCanvas } from './game/drawing/paperize';
import { preloadMeshyModel } from './game/creatures/DrawingChudikBuilder';
import {
  deleteVoiceRecording,
  loadCreatures,
  saveCreature,
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
import { LayoutEditor, StudioWorldSwitch, pickLayoutFile } from './ui/LayoutEditor';
import { WorldPicker } from './ui/WorldPicker';
import { MoveCreaturesSheet } from './ui/MoveCreaturesSheet';
import { WorldFullPrompt } from './ui/WorldFullPrompt';
import { WorldDestSheet } from './ui/WorldDestSheet';
import { DiyHud } from './ui/DiyHud';
import { SoundSheet } from './ui/SoundSheet';
import { isAuthoringStudio, isStudio, studioWorldId } from './studioMode';
import { setAnalyticsWorld, track } from './analytics';
import {
  cinemaAfterNativeChange,
  documentAllowsFullscreen,
  fullscreenBlockedMessage,
  leaveNativeFullscreen,
  nativeFullscreenOn,
  requestNativeFullscreen,
  writeCinemaViewport,
} from './game/interaction/fullscreen';
import {
  fetchRemoteDiyLayout,
  loadDiyLayout,
  putRemoteDiyLayout,
  saveDiyLayout,
} from './game/world/diyLayout';
import {
  WORLD_AUTHORED,
  WORLD_DIY_SKU,
  countOnWorld,
  creatureWorldId,
  gardenTitle,
  idsThatFit,
  moveDestinations,
  worldIsFull,
  type GardenWorld,
} from './game/world/gardens';
import { isConstructionSku, isDiyWorld, isHangingShell, isStudioKind, kindOfWorld, usesChildBuild } from './game/world/kinds';
import { childCatalogForShell } from './game/world/layoutCatalog';
import { saveLayout } from './game/world/layoutAuthored';
import { WalkPad } from './ui/WalkPad';
import { CareHud } from './ui/CareHud';
import { HudIcon } from './ui/HudIcon';
import { FirstDrawPrompt } from './ui/FirstDrawPrompt';
import { shouldAskAnotherDraw, shouldOfferFirstDraw } from './ui/firstDraw';
import { ParentGate } from './ui/ParentGate';
import { PilotChoice } from './ui/PilotChoice';
import { parentToken } from './api';
import { bootstrapParentSession, endParentSession, PAID_FLASH_KEY, sendUnsignedVisitorToAuth } from './parentSession';
import {
  applyRemaining,
  canStartCreation,
  CHECKOUT_SKU_KEY,
  readQuota,
  reconcilePayments,
  spendOneCredit,
  takeOwnedWorldsBefore,
  type Quota,
} from './game/commerce';
import { PackSheet } from './ui/PackSheet';
import { QuotaDock } from './ui/QuotaDock';
import { isTvReceiver, TvReceiver } from './ui/TvReceiver';
import { canCarePlay, hasOwnCreature, isParkResidentId } from './game/creatures/residents';
import type { CueId } from './game/audio/cues';
import { getIslandAudio } from './game/audio/AudioBus';
import { claimCueOnce } from './game/audio/mix';

type Screen = 'zoo' | 'draw' | 'roster' | 'preview';

type HatchLook = {
  id: string;
  src: string | null;
  name: string;
  postcardSrc?: string | null;
  postcardDone?: boolean;
};

/** How long to keep asking the bank after the parent returns from checkout. */
const PAID_CHECK_TRIES = 8;
const PAID_CHECK_DELAY_MS = 3000;

const FAILURE_MESSAGES: Record<string, string> = {
  empty: 'Тут почти ничего не нарисовано. Нарисуй зуфуньчика побольше!',
  'too-small': 'Слишком маленький рисунок. Нарисуй на весь лист!',
  'too-thin': 'Замкни линию, чтобы получилось тело зуфуньчика.',
};

/** Wash/feed still: the child's picture from the API, else a lawn snapshot. */
function stillForCare(spec: ChudikSpec, game: Game | null): string {
  return displayStillUrl(portraitUrlOf(spec.drawing)) ?? game?.captureStill(spec.id) ?? '';
}

function faceOf(spec: ChudikSpec, thumbs: Record<string, string>): string | null {
  return displayStillUrl(rosterPhoto(spec.drawing, thumbs[spec.id]));
}

const TRANSFER_PREVIEW_ID = 'preview_move';

function transferPreviewWorlds(): { currentId: string; worlds: GardenWorld[] } | null {
  try {
    if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has('transfer')) return null;
  } catch {
    return null;
  }
  return {
    currentId: WORLD_DIY_SKU,
    worlds: [
      { id: WORLD_DIY_SKU, title: 'Сад 1', sku: WORLD_DIY_SKU },
      { id: 'world_diy_garden_preview2', title: 'Сад 2', sku: WORLD_DIY_SKU },
    ],
  };
}

export function App() {
  if (isTvReceiver()) return <TvReceiver />;
  if (sendUnsignedVisitorToAuth()) return null;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => {
    try {
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('roster')) {
        return 'roster';
      }
    } catch {
      /* ignore */
    }
    return 'zoo';
  });
  const [specs, setSpecs] = useState<ChudikSpec[]>([]);
  const [rosterThumbs, setRosterThumbs] = useState<Record<string, string>>({});
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
  const nativeHeldRef = useRef(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const quotaRef = useRef(quota);
  quotaRef.current = quota;
  const [pendingBirth, setPendingBirth] = useState(false);
  const pendingBirthRef = useRef(false);
  const [hatchLook, setHatchLook] = useState<HatchLook | null>(null);
  const hatchLookRef = useRef<HatchLook | null>(null);
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const [careSpec, setCareSpec] = useState<ChudikSpec | null>(null);
  const [frenzySpec, setFrenzySpec] = useState<ChudikSpec | null>(null);
  const [puzzleSpec, setPuzzleSpec] = useState<ChudikSpec | null>(null);
  const [playStill, setPlayStill] = useState('');
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
  const [forceFirstDraw] = useState(() => {
    try {
      return import.meta.env.DEV && new URLSearchParams(window.location.search).has('first');
    } catch {
      return false;
    }
  });
  const [anotherDraw, setAnotherDraw] = useState(() => {
    try {
      return import.meta.env.DEV && new URLSearchParams(window.location.search).has('again');
    } catch {
      return false;
    }
  });
  const [firstDrawDismissed, setFirstDrawDismissed] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [logoutGate, setLogoutGate] = useState(false);
  const [parentEntry] = useState(() => bootstrapParentSession());
  const appRef = useRef<HTMLDivElement | null>(null);
  const [world, setWorld] = useState<string | null>(() =>
    isAuthoringStudio() ? studioWorldId() : null,
  );
  const [diyBuild, setDiyBuild] = useState(false);
  const [diyPicking, setDiyPicking] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [moveDest, setMoveDest] = useState<string | null>(null);
  const [moveFrom, setMoveFrom] = useState<ChudikSpec[]>([]);
  const [pickFrom, setPickFrom] = useState<ChudikSpec[] | null>(() => {
    if (!transferPreviewWorlds()) return null;
    return [
      generateSpec({
        id: TRANSFER_PREVIEW_ID,
        name: 'Жучок',
        seed: 7,
        kindId: 'crawler',
        origin: 'drawing',
        worldId: WORLD_DIY_SKU,
      }),
    ];
  });
  const [fullOpen, setFullOpen] = useState(false);
  const offerMoveRef = useRef<string | null>(null);

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
    setAnalyticsWorld(world ?? '');
  }, [world]);

  useEffect(() => {
    if (shopOpen) track('shop.open');
  }, [shopOpen]);

  useEffect(() => {
    if (screen === 'draw') track('draw.open');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'zoo') setActionsOpen(false);
    if (screen !== 'preview') setPuzzleOpen(false);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'roster' || !ready) return;
    const game = gameRef.current;
    if (!game) return;
    setRosterThumbs((current) => {
      if (Object.keys(current).length > 0) return current;
      return game.captureRosterThumbs();
    });
  }, [screen, ready, specs.length]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !world) return;

    let cancelled = false;
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

    void (async () => {
      let diyProps = loadDiyLayout(world);
      if (isDiyWorld(world)) {
        const remote = await fetchRemoteDiyLayout(world);
        if (remote) {
          diyProps = remote;
          saveDiyLayout(remote, world);
        }
      }
      if (cancelled) {
        game.dispose();
        return;
      }
      const kind = kindOfWorld(world);
      const hangingStudio = isAuthoringStudio() && isHangingShell(kind.shell) && !isDiyWorld(world);
      await game.start({
        world: isDiyWorld(world) ? 'diy' : 'authored',
        worldId: world,
        shell: kind.shell,
        layoutKind: usesChildBuild(world) || hangingStudio ? 'child' : 'studio',
        catalog: isDiyWorld(world) ? [...childCatalogForShell(kind.shell)] : undefined,
        diyProps: isDiyWorld(world) ? diyProps : undefined,
        onDiyPersist: (props) => {
          if (isDiyWorld(world)) {
            saveDiyLayout(props, world);
            void putRemoteDiyLayout(props, world);
            return;
          }
          if (isHangingShell(kindOfWorld(world).shell)) {
            saveLayout(props, [], [], kindOfWorld(world).shell);
          }
        },
        onProgress: (fraction) => setLoadProgress(fraction),
      });
      if (cancelled) {
        game.dispose();
        return;
      }
      setReady(true);
      setDiyBuild(false);
      if (usesChildBuild(world)) game.setDiyBuild(false);
      setRecordedIds(new Set(game.getRecordedIds()));
      for (const pending of game.pendingHatches()) {
        void waitForMesh(pending.jobId)
          .then(async (mesh) => {
            if (!eggCanOpen(mesh.mesh, mesh.modelUrl)) return;
            if (mesh.modelUrl) await preloadMeshyModel(mesh.modelUrl);
            let painted = pending.drawing;
            if (mesh.image) {
              const fromStyle = await styledToChudik(mesh.image);
              if (fromStyle.ok) painted = fromStyle.drawing;
              const portraitUrl = portraitFromImage(mesh.image);
              if (portraitUrl) painted = { ...painted, portraitUrl };
            }
            const drawing = {
              ...painted,
              ...(mesh.modelUrl ? { modelUrl: mesh.modelUrl, placeholder: undefined } : {}),
              ...(mesh.postcardUrl ? { postcardUrl: mesh.postcardUrl } : {}),
            };
            game.prepareHatch(
              pending.id,
              { drawing },
              { open: eggCanOpen(mesh.mesh, mesh.modelUrl) },
            );
          })
          .catch(() => {
            // Keep the egg. The next visit polls the same job until the GLB lands.
          });
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      game.dispose();
      gameRef.current = null;
    };
  }, [world]);

  useEffect(() => {
    if (!ready || !world) return;
    const dest = offerMoveRef.current;
    if (!dest || dest !== world) return;
    offerMoveRef.current = null;
    void loadCreatures().then((records) => {
      const fromAuthored = records
        .filter(
          (record) =>
            !isParkResidentId(record.spec.id) &&
            creatureWorldId(record.spec.worldId) === WORLD_AUTHORED,
        )
        .map((record) => record.spec);
      if (fromAuthored.length) {
        setMoveFrom(fromAuthored);
        setMoveDest(dest);
      }
    });
  }, [ready, world]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setShowHint(false), 7000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!offerSpec || cardSpec) return;
    const timer = window.setTimeout(() => setOfferSpec(null), 16000);
    return () => window.clearTimeout(timer);
  }, [offerSpec, cardSpec]);

  const speak = useCallback((id: CueId) => {
    void getIslandAudio().playCue(id);
  }, []);

  const startPilot = useCallback((id: string) => {
    if (!gameRef.current?.controlCreature(id)) return;
    speak('walk');
    setDriving(true);
    setOfferSpec(null);
    setCardSpec(null);
    setShowHint(false);
  }, [speak]);

  const stopPilot = useCallback((opts?: { silent?: boolean }) => {
    const wasDriving = Boolean(gameRef.current?.isDriving);
    gameRef.current?.releaseControl();
    setDriving(false);
    if (wasDriving && !opts?.silent) speak('stop');
  }, [speak]);

  const quietGarden = useCallback((quiet: boolean) => {
    getIslandAudio().duckGarden(quiet);
  }, []);

  const needsFirstDraw =
    shouldOfferFirstDraw(world) &&
    ready &&
    screen === 'zoo' &&
    !driving &&
    !anotherDraw &&
    !firstDrawDismissed &&
    (forceFirstDraw || !hasOwnCreature(specs));
  const showDrawPrompt =
    Boolean(world) && (needsFirstDraw || anotherDraw) && !driving && !offerSpec;

  const finishHatch = useCallback((id: string) => {
    hatchLookRef.current = null;
    setHatchLook(null);
    setPuzzleOpen(false);
    setScreen('zoo');
    gameRef.current?.focusOn(id);
    if (shouldAskAnotherDraw(quotaRef.current?.remaining)) {
      speak('shop');
      setShopOpen(true);
    }
  }, [speak]);

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

  const setDiyBuilding = useCallback((on: boolean) => {
    setDiyBuild(on);
    gameRef.current?.setDiyBuild(on);
    if (on) setOfferSpec(null);
  }, []);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  useEffect(() => {
    if (world) return;
    getIslandAudio().setGardenPaused(true);
  }, [world]);

  useEffect(() => {
    if (world) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.sound-dock')) return;
      document.removeEventListener('pointerdown', onPointer, true);
      if (!claimCueOnce('worlds')) return;
      speak('worlds');
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [world, speak]);

  useEffect(() => {
    if (!ready || world !== 'diy') return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.sound-dock')) return;
      document.removeEventListener('pointerdown', onPointer, true);
      if (!claimCueOnce('welcome_diy')) return;
      speak('welcome_diy');
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [ready, world, speak]);

  useEffect(() => {
    if (!needsFirstDraw) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.first-draw-btn, .first-draw-close, .sound-dock')) return;
      document.removeEventListener('pointerdown', onPointer, true);
      speak('welcome_garden');
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointer, { capture: true });
  }, [needsFirstDraw, speak]);

  useEffect(() => {
    if (!anotherDraw || needsFirstDraw) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.first-draw-btn, .first-draw-close, .sound-dock, .pack-shop, .quota-topup')) return;
      setAnotherDraw(false);
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointer, { capture: true });
  }, [anotherDraw, needsFirstDraw]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(PAID_FLASH_KEY) !== '1') return;
    } catch {
      return;
    }
    const forget = () => {
      try {
        sessionStorage.removeItem(PAID_FLASH_KEY);
      } catch {
        /* ignore */
      }
    };
    if (!bootstrapParentSession().token) {
      forget();
      return;
    }
    let cancelled = false;

    // The bank's notification can be late or lost, so never promise credits
    // that are not there yet. Ask, wait, and say what is actually true.
    void (async () => {
      flash('Проверяем оплату…');
      let sku: string | null = null;
      try {
        sku = sessionStorage.getItem(CHECKOUT_SKU_KEY);
      } catch {
        sku = null;
      }
      for (let attempt = 0; attempt < PAID_CHECK_TRIES && !cancelled; attempt++) {
        const settled = await reconcilePayments();
        if (cancelled) return;
        if (settled) {
          setQuota((current) => {
            const next = applyRemaining(current, settled.remaining);
            return next
              ? { ...next, ownedWorlds: settled.ownedWorlds, worlds: settled.worlds }
              : next;
          });
          if (isConstructionSku(sku)) {
            const before = takeOwnedWorldsBefore();
            const added = settled.ownedWorlds.filter((id) => !before.includes(id));
            const dest = added.at(-1) ?? settled.ownedWorlds.at(-1);
            if (dest) {
              flash('Сад открыт — собери его.');
              offerMoveRef.current = dest;
              setWorld(dest);
              try {
                sessionStorage.removeItem(CHECKOUT_SKU_KEY);
              } catch {
                /* ignore */
              }
              forget();
              return;
            }
            if (settled.pending === 0) {
              flash('Платёж ещё проверяется. Остров откроется сам.');
              forget();
              return;
            }
          } else if (settled.credited > 0) {
            flash(`Оплата прошла. Новых зуфунят в саду: ${settled.credited}.`);
            forget();
            return;
          } else if (settled.pending === 0) {
            flash('Оплата прошла. Кредиты на аккаунте.');
            forget();
            return;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, PAID_CHECK_DELAY_MS));
      }
      if (cancelled) return;
      await refreshQuota();
      flash(
        sku && isConstructionSku(sku)
          ? 'Платёж ещё проверяется. Остров откроется сам — загляни через минуту.'
          : 'Платёж ещё проверяется. Зуфунята появятся сами — загляни через минуту.',
      );
      forget();
    })();

    return () => {
      cancelled = true;
    };
  }, [flash, refreshQuota]);

  const toggleFullscreen = useCallback(() => {
    if (cinema) {
      setCinema(false);
      nativeHeldRef.current = false;
      void leaveNativeFullscreen();
      return;
    }
    if (!documentAllowsFullscreen(document)) {
      flash(fullscreenBlockedMessage(navigator.userAgent, false));
      return;
    }
    const root = appRef.current ?? document.documentElement;
    void requestNativeFullscreen(root).then((ok) => {
      if (!ok) flash(fullscreenBlockedMessage(navigator.userAgent, true));
    });
  }, [cinema, flash]);

  useEffect(() => {
    const sync = () => {
      setCinema((prev) => {
        const next = cinemaAfterNativeChange(
          nativeFullscreenOn(),
          nativeHeldRef.current,
          prev,
        );
        nativeHeldRef.current = next.hadNative;
        return next.cinema;
      });
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => writeCinemaViewport(root, cinema);
    apply();
    if (!cinema) return;
    window.scrollTo(0, 0);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
      writeCinemaViewport(root, false);
    };
  }, [cinema]);

  const canCreate = useCallback(() => {
    const signedIn = Boolean(bootstrapParentSession().token);
    if (!signedIn) {
      flash('Зайди с сайта — тогда зуфуньчик появится в объёме.');
      return false;
    }
    const locked = pendingBirthRef.current || pendingBirth;
    if (!canStartCreation({ remaining: quota?.remaining ?? null, pendingBirth: locked })) {
      if (locked) {
        flash('Подожди чуть-чуть — рисунок ещё отправляется.');
        return false;
      }
      if (quota && quota.remaining <= 0) {
        speak('empty_quota');
        setShopOpen(true);
        return false;
      }
      return false;
    }
    if (
      worldIsFull(
        countOnWorld(
          specs.map((spec) => ({ spec })),
          world ?? WORLD_AUTHORED,
        ),
      )
    ) {
      setFullOpen(true);
      return false;
    }
    return true;
  }, [flash, pendingBirth, quota, speak, specs, world]);
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
        worldId: world ?? WORLD_AUTHORED,
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
        if (shouldAskAnotherDraw(quotaRef.current?.remaining)) {
          speak('shop');
          setShopOpen(true);
        }
      };

      showLook({ id: spec.id, src: null, name: spec.name });
      setScreen('preview');

      let accepted = false;
      try {
        const local = await imageToChudik(source);
        if (!local.ok) {
          showLook(null);
          setScreen('draw');
          speak('error');
          flash(FAILURE_MESSAGES[local.reason] ?? 'Не получилось разобрать рисунок.');
          return;
        }

        let painted = local.drawing;
        const ready = async (
          styled: Extract<Awaited<ReturnType<typeof stylizeDrawing>>, { ok: true }>,
        ) => {
          const keptPostcard = painted.postcardUrl;
          const fromStyle = await styledToChudik(styled.image);
          if (fromStyle.ok) painted = fromStyle.drawing;
          const portraitUrl = portraitFromImage(styled.image);
          const postcardUrl = styled.postcardUrl || keptPostcard;
          if (styled.modelUrl) {
            await preloadMeshyModel(styled.modelUrl);
            painted = { ...painted, modelUrl: styled.modelUrl };
          }
          if (portraitUrl) painted = { ...painted, portraitUrl };
          if (postcardUrl) painted = { ...painted, postcardUrl };
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
              postcardSrc: paintedStill.postcardUrl ?? null,
              postcardDone: Boolean(paintedStill.postcardUrl),
            });
            void waitForPostcard(paintedStill.jobId).then((postcardSrc) => {
              if (postcardSrc) {
                painted = { ...painted, postcardUrl: postcardSrc };
                game.attachPostcard(spec.id, postcardSrc);
              }
              if (!watchingThis()) return;
              const current = hatchLookRef.current;
              if (!current) return;
              showLook({
                ...current,
                postcardSrc: postcardSrc ?? current.postcardSrc,
                postcardDone: true,
              });
            });
          },
        });
        if (styled.ok) {
          const left = styled.remaining;
          if (typeof left === 'number') {
            setQuota((current) => applyRemaining(current, left));
          }
          await ready(styled);
          if (!styled.modelUrl) {
            void waitForMesh(styled.jobId)
              .then(async (mesh) => {
                if (mesh.postcardUrl && watchingThis()) {
                  const current = hatchLookRef.current;
                  if (current) {
                    showLook({ ...current, postcardSrc: mesh.postcardUrl, postcardDone: true });
                  }
                }
                if (!mesh.modelUrl) return;
                await ready({
                  ...styled,
                  modelUrl: mesh.modelUrl,
                  mesh: mesh.mesh,
                  postcardUrl: mesh.postcardUrl ?? styled.postcardUrl,
                });
              })
              .catch(() => {
                // Stay an egg; pendingHatches will poll again after a reload.
              });
          }
          if (!watchingThis()) {
            flash(
              styled.modelUrl
                ? 'Почти! Постучи — или подожди чуть-чуть.'
                : 'Картинка готова. Объём долепится в саду.',
            );
          }
        } else if (styled.reason === 'not_allowed') {
          showLook(null);
          setScreen('draw');
          speak('error');
          flash('Такой рисунок нельзя. Нарисуй зверушку.');
        } else if (styled.reason === 'no_credits') {
          showLook(null);
          setScreen('zoo');
          speak('empty_quota');
          setShopOpen(true);
          flash('Нужен пакет — бесплатный зверь уже создан.');
        } else if (accepted && styled.reason === 'timeout') {
          if (!hatchLookRef.current?.src) enterGarden();
          flash('Ещё лепится. Подожди у яйца.');
        } else if (accepted) {
          await game.removeCreature(spec.id);
          showLook(null);
          setScreen('draw');
          speak('error');
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
          flash('Зайди с сайта — тогда зуфуньчик появится в объёме.');
        } else if (styled.reason === 'unavailable') {
          showLook(null);
          setScreen('draw');
          flash('Сейчас нельзя создать зуфуньчика. Попробуй позже.');
        } else {
          showLook(null);
          setScreen('draw');
          speak('error');
          flash('Не получилось обработать рисунок.');
        }
      } catch (error) {
        console.error('[drawing] processing failed', error);
        if (accepted) {
          await game.removeCreature(spec.id);
        }
        showLook(null);
        speak('error');
        flash('Что-то пошло не так с рисунком.');
        setScreen('zoo');
      } finally {
        pendingBirthRef.current = false;
        setPendingBirth(false);
        setBusy(null);
        void refreshQuota();
      }
    },
    [canCreate, flash, refreshQuota, speak, world],
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
        speak('error');
        flash('Не удалось открыть фото.');
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [flash, processArtwork, speak],
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

  const transferCreatures = useCallback(
    async (ids: string[], dest: string) => {
      const records = await loadCreatures();
      const here = creatureWorldId(world);
      const home = creatureWorldId(dest);
      const fitting = idsThatFit(ids, records, home);
      if (fitting.length === 0) {
        flash('Там тоже полно. Купи ещё сад.');
        return;
      }
      const game = gameRef.current;
      for (const record of records) {
        if (!fitting.includes(record.spec.id)) continue;
        const next = { ...record.spec, worldId: home };
        if (here === home) {
          await game?.receiveMoved(next);
          continue;
        }
        await saveCreature({ ...record, spec: next });
        if (creatureWorldId(record.spec.worldId) === here) {
          game?.unloadCreature(record.spec.id);
        }
      }
      setMoveDest(null);
      setMoveFrom([]);
      setPickFrom(null);
      flash(fitting.length === ids.length ? 'Зуфунята переехали.' : 'Часть переехала — там мало места.');
    },
    [flash, world],
  );

  const moveCreatures = useCallback(
    async (ids: string[]) => {
      if (!moveDest) return;
      await transferCreatures(ids, moveDest);
    },
    [moveDest, transferCreatures],
  );

  const openMoveFromHere = useCallback(
    (dest: string) => {
      void loadCreatures().then((records) => {
        const fromHere = records
          .filter(
            (record) =>
              !isParkResidentId(record.spec.id) &&
              creatureWorldId(record.spec.worldId) === creatureWorldId(world),
          )
          .map((record) => record.spec);
        if (!fromHere.length) {
          flash('Здесь некого переносить.');
          return;
        }
        setMoveFrom(fromHere);
        setMoveDest(dest);
      });
    },
    [flash, world],
  );

  const overlayOpen =
    shopOpen ||
    logoutGate ||
    needsFirstDraw ||
    anotherDraw ||
    Boolean(offerSpec) ||
    driving ||
    Boolean(cardSpec) ||
    Boolean(careSpec) ||
    Boolean(frenzySpec) ||
    Boolean(puzzleSpec) ||
    actionsOpen ||
    diyPicking ||
    Boolean(moveDest) ||
    Boolean(pickFrom) ||
    fullOpen ||
    Boolean(busy);

  const showSiteNav = Boolean(world) && ready && screen === 'zoo' && !overlayOpen;

  return (
    <div className={cinema ? 'app is-cinema' : 'app'} ref={appRef}>
      <div className="stage" ref={stageRef} />
      {showSiteNav ? (
        <div className="site-nav">
          <button className="site-back" type="button" onClick={() => {
            speak('worlds_back');
            setWorld(null);
          }}>
            В миры
          </button>
          {parentEntry.token ? (
            <button className="site-back" type="button" onClick={() => setLogoutGate(true)}>
              Выйти
            </button>
          ) : null}
        </div>
      ) : null}

      {logoutGate ? (
        <ParentGate
          question="Выйти из зоопарка? Потом снова войдёт взрослый."
          onCancel={() => setLogoutGate(false)}
          onPass={() => {
            setLogoutGate(false);
            void endParentSession();
          }}
        />
      ) : null}

      {!world ? (
        <WorldPicker
          worlds={quota?.worlds ?? []}
          onOpen={(id) => setWorld(id)}
          onError={flash}
        />
      ) : null}

      {screen === 'zoo' && ready && (
        <>
          {showHint && !driving && !needsFirstDraw && !anotherDraw && hasOwnCreature(specs) && (
            <div className="hint">Тапни зуфуньчика — он тебе ответит 👆</div>
          )}

          {showDrawPrompt ? (
            <FirstDrawPrompt
              again={anotherDraw && !needsFirstDraw}
              onDraw={() => {
                if (!canCreate()) return;
                speak('draw');
                setAnotherDraw(false);
                setScreen('draw');
              }}
              onPhoto={() => {
                if (!canCreate()) return;
                speak('photo');
                setAnotherDraw(false);
                fileInputRef.current?.click();
              }}
              onClose={() => {
                setAnotherDraw(false);
                setFirstDrawDismissed(true);
              }}
            />
          ) : null}

          {offerSpec || cardSpec || pickFrom ? null : <WalkPad onWalk={walkPad} />}

          {offerSpec && !driving && !cardSpec && (
            <PilotChoice
              spec={offerSpec}
              pic={faceOf(offerSpec, rosterThumbs)}
              onPilot={() => startPilot(offerSpec.id)}
              onSettings={() => setCardSpec(offerSpec)}
              onWash={
                canCarePlay(offerSpec)
                  ? () => {
                      speak('wash');
                      setPlayStill(stillForCare(offerSpec, gameRef.current));
                      setCareSpec(offerSpec);
                      setOfferSpec(null);
                    }
                  : null
              }
              onFeedGame={
                canCarePlay(offerSpec)
                  ? () => {
                      speak('feed');
                      setPlayStill(stillForCare(offerSpec, gameRef.current));
                      setFrenzySpec(offerSpec);
                      setOfferSpec(null);
                    }
                  : null
              }
              onPuzzle={
                canCarePlay(offerSpec)
                  ? () => {
                      const src = stillForCare(offerSpec, gameRef.current);
                      if (!src) return;
                      speak('puzzle');
                      setPlayStill(src);
                      setPuzzleSpec(offerSpec);
                      setOfferSpec(null);
                    }
                  : null
              }
              onDismiss={() => setOfferSpec(null)}
            />
          )}

          {driving && (
            <button className="pilot-stop" type="button" onClick={() => stopPilot()}>
              <span className="icon">✋</span>
              <span>Отпустить</span>
            </button>
          )}

          {world &&
          (usesChildBuild(world) ||
            (isAuthoringStudio() && isHangingShell(kindOfWorld(world).shell) && !isDiyWorld(world))) &&
          gameRef.current ? (
            <DiyHud
              game={gameRef.current}
              building={diyBuild}
              onSetBuild={setDiyBuilding}
              onPicking={setDiyPicking}
              onSpeak={speak}
              onSave={async () => {
                const gardenId = world;
                const game = gameRef.current;
                if (!game || !gardenId) return false;
                try {
                  const props = game.saveDiyGarden();
                  if (isDiyWorld(gardenId)) {
                    saveDiyLayout(props, gardenId);
                    void putRemoteDiyLayout(props, gardenId).then((remote) => {
                      if (parentToken() && !remote) {
                        flash('Сад записался тут. На сайт не ушёл — зайди с сайта.');
                      }
                    });
                  } else if (isHangingShell(kindOfWorld(gardenId).shell)) {
                    saveLayout(props, [], [], kindOfWorld(gardenId).shell);
                  }
                  return true;
                } catch {
                  return false;
                }
              }}
            />
          ) : null}

          {offerSpec || cardSpec || pickFrom ? null : (
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
                  stopPilot({ silent: true });
                  speak('zoo');
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
                  speak('roster');
                  setRosterThumbs(gameRef.current?.captureRosterThumbs() ?? {});
                  setScreen('roster');
                }}
              >
                <HudIcon name="roster" />
                <span>Мои Зуфики</span>
              </button>

              <button
                className="big-button primary"
                onClick={() => {
                  setActionsOpen(false);
                  if (!canCreate()) return;
                  speak('draw');
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
                  speak('photo');
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
                  stopPilot({ silent: true });
                  speak('feed');
                  const ok = gameRef.current?.feedZoo();
                  if (ok === false) {
                    flash('Сначала нарисуй зуфуньчика — он придёт кушать.');
                  }
                }}
              />
            </div>
            <button
              className={`toolbar-fab${!actionsOpen ? ' is-waiting' : ''}`}
              type="button"
              aria-label={actionsOpen ? 'Закрыть' : 'Действия'}
              aria-expanded={actionsOpen}
              onClick={() => {
                setActionsOpen((open) => {
                  if (!open) speak('menu');
                  return !open;
                });
              }}
            >
              {actionsOpen ? (
                <span className="icon">✕</span>
              ) : (
                <HudIcon name="draw" />
              )}
            </button>
            </div>
          )}

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
              finishHatch(id);
            }}
          />
        ) : (
          <HatchPreview
            src={hatchLook.src}
            postcardSrc={hatchLook.postcardSrc}
            postcardDone={hatchLook.postcardDone}
            name={hatchLook.name}
            onPuzzle={hatchLook.src ? () => {
              speak('puzzle');
              setPuzzleOpen(true);
            } : undefined}
            onForward={() => {
              const id = hatchLook.id;
              finishHatch(id);
            }}
          />
        )
      ) : null}

      {careSpec ? (
        <CareRoom
          spec={careSpec}
          src={playStill || displayStillUrl(portraitUrlOf(careSpec.drawing)) || ''}
          onFeed={() => {
            setFrenzySpec(careSpec);
            setCareSpec(null);
          }}
          onClose={(washed) => {
            if (washed) track('creature.wash', { id: careSpec.id });
            setCareSpec(null);
            setPlayStill('');
            if (washed) gameRef.current?.celebrate(careSpec.id);
          }}
        />
      ) : null}

      {frenzySpec ? (
        <FeedFrenzy
          spec={frenzySpec}
          src={playStill || displayStillUrl(portraitUrlOf(frenzySpec.drawing)) || ''}
          onClose={(fed) => {
            if (fed) track('creature.feed', { id: frenzySpec.id });
            setFrenzySpec(null);
            setPlayStill('');
            if (fed) gameRef.current?.celebrate(frenzySpec.id);
          }}
        />
      ) : null}

      {puzzleSpec && (playStill || portraitUrlOf(puzzleSpec.drawing)) ? (
        <HatchPuzzle
          src={playStill || displayStillUrl(portraitUrlOf(puzzleSpec.drawing)) || ''}
          name={puzzleSpec.name}
          onBack={() => {
            setPuzzleSpec(null);
            setPlayStill('');
          }}
          onForward={() => {
            setPuzzleSpec(null);
            setPlayStill('');
            gameRef.current?.celebrate(puzzleSpec.id);
          }}
        />
      ) : null}

      {screen === 'roster' && (
        <RosterSheet
          specs={specs}
          thumbs={rosterThumbs}
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
          pic={faceOf(cardSpec, rosterThumbs)}
          hasRecording={recordedIds.has(cardSpec.id)}
          onClose={() => setCardSpec(null)}
          onPlayVoice={() => gameRef.current?.poke(cardSpec.id)}
          onFind={() => {
            setCardSpec(null);
            gameRef.current?.focusOn(cardSpec.id);
          }}
          onPilot={() => startPilot(cardSpec.id)}
          onSpeak={speak}
          onSaveRecording={(recording) => void saveRecording(cardSpec, recording)}
          onClearRecording={() => void clearRecording(cardSpec)}
          onDelete={() => void removeCreature(cardSpec)}
          onMove={
            moveDestinations(world, quota?.worlds ?? []).length > 0
              ? () => {
                  setPickFrom([cardSpec]);
                  setCardSpec(null);
                }
              : undefined
          }
          onGardenQuiet={quietGarden}
        />
      )}

      {moveDest && moveFrom.length > 0 ? (
        <MoveCreaturesSheet
          destTitle={gardenTitle(moveDest, quota?.worlds ?? [])}
          specs={moveFrom}
          onLater={() => {
            setMoveDest(null);
            setMoveFrom([]);
          }}
          onMove={(ids) => void moveCreatures(ids)}
        />
      ) : null}

      {pickFrom && pickFrom.length > 0 ? (
        <WorldDestSheet
          spec={pickFrom[0]}
          pic={faceOf(pickFrom[0], rosterThumbs)}
          currentId={transferPreviewWorlds()?.currentId ?? world ?? WORLD_AUTHORED}
          worlds={transferPreviewWorlds()?.worlds ?? quota?.worlds ?? []}
          onCancel={() => setPickFrom(null)}
          onMove={(dest) => {
            const specs = pickFrom;
            setPickFrom(null);
            if (!specs || specs[0]?.id === TRANSFER_PREVIEW_ID) return;
            void transferCreatures(
              specs.map((spec) => spec.id),
              dest,
            );
          }}
        />
      ) : null}

      {fullOpen ? (
        <WorldFullPrompt
          destinations={moveDestinations(world, quota?.worlds ?? [])}
          onBuy={() => {
            setFullOpen(false);
            setWorld(null);
          }}
          onPickDest={(dest) => {
            setFullOpen(false);
            openMoveFromHere(dest);
          }}
        />
      ) : null}

      {busy && (
        <div className="busy">
          <div className="spinner" />
          <span>{busy}</span>
        </div>
      )}

      {world && !ready && (
        <div className="busy busy-compact">
          <div className="spinner" />
          <span className="load-bar" aria-hidden="true">
            <span className="food-bar-fill" style={{ width: `${Math.round(loadProgress * 100)}%` }} />
          </span>
        </div>
      )}

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      {world ? (
      <div className="hud-chrome">
        {quota && screen === 'zoo' && ready ? (
          <QuotaDock remaining={quota.remaining} onTopUp={() => {
            speak('shop');
            setShopOpen(true);
          }} />
        ) : screen === 'zoo' && ready && Number.isFinite(previewEggs) ? (
          <QuotaDock remaining={previewEggs} onTopUp={() => {
            speak('shop');
            setShopOpen(true);
          }} />
        ) : null}
        {screen === 'zoo' ? (
        <div className="admin-dock">
          <div className="sound-dock">
            <button
              className={`tv-share${soundOpen ? ' is-live' : ''}`}
              type="button"
              title="Звук"
              aria-label="Звук"
              aria-pressed={soundOpen}
              onClick={() => {
                setSoundOpen((open) => !open);
                void getIslandAudio().unlock();
              }}
            >
              🔊
            </button>
            {soundOpen ? <SoundSheet onClose={() => setSoundOpen(false)} /> : null}
          </div>
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
          {isStudio() && world && !usesChildBuild(world) && ready && gameRef.current && (
            <LayoutEditor game={gameRef.current} />
          )}
          {isAuthoringStudio() && world && isStudioKind(kindOfWorld(world)) && ready && gameRef.current && (
            <div className="layout-launch">
              <StudioWorldSwitch
                shell={kindOfWorld(world).shell}
                onDownload={() => gameRef.current?.layoutStudio.save()}
                onOpen={() => {
                  const game = gameRef.current;
                  if (!game) return;
                  pickLayoutFile(async (doc) => {
                    if (!doc.props) return;
                    await game.library.ensureAll(doc.props.map((prop) => prop.model));
                    game.layoutStudio.importDocument(doc);
                  });
                }}
              />
            </div>
          )}
          {isStudio() && world && !isDiyWorld(world) && ready && <TuningPanel />}
        </div>
        ) : null}
      </div>
      ) : null}

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
