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
import { stylizeDrawing, startMesh, waitForMesh, waitForPostcard, downloadCreatureGlb } from './game/drawing/stylizeDrawing';
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
import { PlazaToyPreview } from './ui/PlazaToyPreview';
import { HatchPuzzle } from './ui/HatchPuzzle';
import { CareRoom } from './ui/CareRoom';
import { FeedFrenzy } from './ui/FeedFrenzy';
import { CreatureCard } from './ui/CreatureCard';
import { RosterSheet } from './ui/RosterSheet';
import { TuningPanel } from './ui/TuningPanel';
import { LayoutEditor, StudioWorldSwitch, pickLayoutFile } from './ui/LayoutEditor';
import { WorldPicker } from './ui/WorldPicker';
import { PlazaYard } from './ui/PlazaYard';
import { MoveCreaturesSheet } from './ui/MoveCreaturesSheet';
import { WorldFullPrompt } from './ui/WorldFullPrompt';
import { WorldDestSheet } from './ui/WorldDestSheet';
import { LayoutPreview, readLayoutPreview } from './ui/layoutPreview';
import { DiyHud } from './ui/DiyHud';
import { SoundSheet } from './ui/SoundSheet';
import { isAuthoringStudio, isStudio, studioWorldId } from './studioMode';
import { vitrineSearchLog } from './actionLog';
import { setAnalyticsWorld, track, trackAction } from './analytics';
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
import { FriendInvite } from './ui/FriendInvite';
import { StillHint } from './ui/StillHint';
import { WaitingFriend } from './ui/WaitingFriend';
import { ArcadeCoach } from './ui/ArcadeCoach';
import { HeartHud } from './ui/HeartHud';
import { HeartRain } from './ui/HeartRain';
import { ZooVitrine } from './ui/ZooVitrine';
import { GuestRoster } from './ui/GuestRoster';
import { lastSeenJoy, rememberJoy } from './game/visits/heartSeen';
import { alreadyGave, localCounts } from './game/visits/heartLocal';
import {
  likeVisit,
  appendVitrine,
  listVitrine,
  ownerShareMeta,
  loadVisit,
  mergeVitrinePage,
  ownerHearts,
  ownerShare,
  visitLink,
  type GuestCreature,
  type VisitSnapshot,
  type VitrineCard,
} from './game/visits/visitApi';
import { shouldKeepFriendLawn, shouldOfferFirstDraw, shouldOfferFriendInvite } from './ui/firstDraw';
import { hatchCanDrawAnother, hatchGardenOpensShop, hatchGardenStartsPaidMesh, hatchMeshCooking } from './ui/hatchView';
import {
  applyArcadeStamp,
  bootWorldAfterArcade,
  finishArcadeQuest,
  arcadeLawnPlanted,
  isArcadeGardenId,
  markArcadeGreeted,
  modelForStep,
  shouldRunArcade,
  withFreeArcadeGarden,
  type ArcadeQuest,
} from './game/arcade/arcadeQuest';
import { ARCADE_CUE_IDS, arcadeEnterCues, arcadeSettleCue, arcadeStampCues, arcadeStepPayload } from './game/arcade/arcadeCues';
import { ensurePlayableArcadeQuest, loadArcadeQuest, loadOrStartArcadeQuest, saveArcadeQuest } from './game/arcade/arcadeStore';
import { ParentGate } from './ui/ParentGate';
import { PilotChoice } from './ui/PilotChoice';
import { parentToken } from './api';
import { bootstrapParentSession, endParentSession, ensureLocalParentSession, PAID_FLASH_KEY, sendUnsignedVisitorToAuth } from './parentSession';
import {
  applyRemaining,
  applyStillRemaining,
  canStartCreation,
  CHECKOUT_SKU_KEY,
  readQuota,
  reconcilePayments,
  spendOneCredit,
  spendOneStill,
  stillQuotaOf,
  takeOwnedWorldsBefore,
  type Quota,
} from './game/commerce';
import {
  artworkToDraftImage,
  clearFriendDraft,
  loadDraftImage,
  loadFriendDraft,
  saveFriendDraft,
  shouldHatchFriendDraft,
  shouldHoldFriendDraft,
  type FriendDraft,
} from './game/friendDraft';
import { PackSheet } from './ui/PackSheet';
import { PlazaToySheet } from './ui/PlazaToySheet';
import { QuotaDock } from './ui/QuotaDock';
import { isTvReceiver, TvReceiver } from './ui/TvReceiver';
import { canCarePlay, hasOwnCreature, isParkResidentId } from './game/creatures/residents';
import type { CueId } from './game/audio/cues';
import { getIslandAudio } from './game/audio/AudioBus';
import { claimCueOnce } from './game/audio/mix';
import { greetPlazaLawn } from './game/plaza/plazaVoice';
import {
  isPlazaToyPreparing,
  isPlazaToySku,
  rememberPlazaHold,
  type PlazaLawnToy,
} from './game/plaza/plazaToy';
import { PLAZA_TOY_PUT } from './game/plaza/plazaCopy';
import {
  clearPlazaToyDraft,
  loadPlazaToyDraft,
  savePlazaToyDraft,
  shouldCommitPlazaToyDraft,
  shouldHatchPlazaToyDraft,
  type PlazaToyDraft,
} from './game/plaza/plazaToyDraft';
import { commitPlazaToy, previewPlazaToy } from './game/plaza/plazaToyJob';
import { plazaCoversWorlds, plazaKeepsGardenBed } from './game/plaza/plazaCues';
import { InstallHint } from './ui/InstallHint';

type Screen = 'zoo' | 'draw' | 'roster' | 'preview' | 'vitrine' | 'plaza';

type HatchLook = {
  id: string;
  src: string | null;
  name: string;
  postcardSrc?: string | null;
  postcardDone?: boolean;
  meshCooking?: boolean;
};

/** How long to keep asking the bank after the parent returns from checkout. */
const PAID_CHECK_TRIES = 8;
const PAID_CHECK_DELAY_MS = 3000;

const FAILURE_MESSAGES: Record<string, string> = {
  empty: 'Тут почти ничего не нарисовано. Нарисуй зуфуньчика побольше!',
  'too-small': 'Слишком маленький рисунок. Нарисуй на весь лист!',
  'too-thin': 'Замкни линию, чтобы получилось тело зуфуньчика.',
};

const REVIVE_JOB_KEY = 'chudiki.reviveJob';
const STILL_HINT_KEY = 'chudiki.stillHintSeen';

function loadReviveJob(): string | null {
  try {
    return sessionStorage.getItem(REVIVE_JOB_KEY);
  } catch {
    return null;
  }
}

function saveReviveJob(jobId: string) {
  try {
    sessionStorage.setItem(REVIVE_JOB_KEY, jobId);
  } catch {
    /* private mode */
  }
}

function clearReviveJob() {
  try {
    sessionStorage.removeItem(REVIVE_JOB_KEY);
  } catch {
    /* private mode */
  }
}

function stillHintSeen(): boolean {
  try {
    return localStorage.getItem(STILL_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function markStillHintSeen() {
  try {
    localStorage.setItem(STILL_HINT_KEY, '1');
  } catch {
    /* private mode */
  }
}

/** Wash/feed still: the child's picture from the API, else a lawn snapshot. */
function stillForCare(spec: ChudikSpec, game: Game | null): string {
  return displayStillUrl(portraitUrlOf(spec.drawing)) ?? game?.captureStill(spec.id) ?? '';
}

function faceOf(spec: ChudikSpec, thumbs: Record<string, string>): string | null {
  return displayStillUrl(rosterPhoto(spec.drawing, thumbs[spec.id]));
}

function bootVisitId(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('visit');
  } catch {
    return null;
  }
}

const HOME_WORLD_KEY = 'chudiki.homeWorld';

function readHomeWorld(): string | null {
  try {
    return sessionStorage.getItem(HOME_WORLD_KEY) || localStorage.getItem(HOME_WORLD_KEY);
  } catch {
    return null;
  }
}

function writeHomeWorld(id: string): void {
  try {
    sessionStorage.setItem(HOME_WORLD_KEY, id);
    localStorage.setItem(HOME_WORLD_KEY, id);
  } catch {
    /* private */
  }
}

function guestToSpec(row: GuestCreature): ChudikSpec {
  return generateSpec({
    id: row.spec.id,
    name: row.spec.name || 'Зуфик',
    seed: 1,
    kindId: row.spec.kindId || 'jumper',
    origin: row.spec.origin === 'photo' ? 'photo' : 'drawing',
    worldId: row.spec.worldId,
    drawing: row.spec.drawing as ChudikSpec['drawing'],
  });
}

async function localSnapshot(worldId: string): Promise<VisitSnapshot> {
  const share = `local:${worldId}`;
  const counts = localCounts(share);
  const records = (await loadCreatures()).filter(
    (row) => !isParkResidentId(row.spec.id) && creatureWorldId(row.spec.worldId) === worldId,
  );
  return {
    id: share,
    world_id: worldId,
    title: gardenTitle(worldId, []),
    diy: isDiyWorld(worldId),
    props: loadDiyLayout(worldId),
    postcard: '',
    hearts: counts.hearts,
    joy: counts.joy,
    creatures: records.map((row) => ({
      spec: {
        id: row.spec.id,
        name: row.spec.name,
        kindId: row.spec.kindId,
        worldId: row.spec.worldId,
        origin: row.spec.origin,
        drawing: row.spec.drawing,
      },
      lastPosition: row.lastPosition ?? null,
      hearts: counts.creatures[row.spec.id] ?? 0,
    })),
  };
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
  const uiPreview = readLayoutPreview();
  if (uiPreview) return <LayoutPreview mode={uiPreview} />;
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
  const [friendInvite, setFriendInvite] = useState(() => {
    try {
      return import.meta.env.DEV && new URLSearchParams(window.location.search).has('friend');
    } catch {
      return false;
    }
  });
  const [stillHint, setStillHint] = useState(false);
  const [friendDraw, setFriendDraw] = useState(false);
  const friendDrawRef = useRef(false);
  const forceArcade = (() => {
    try {
      return import.meta.env.DEV && new URLSearchParams(window.location.search).has('arcade');
    } catch {
      return false;
    }
  })();
  const [arcadeQuest, setArcadeQuest] = useState<ArcadeQuest | null>(null);
  const [arcadeThumb, setArcadeThumb] = useState<string | null>(null);
  const [friendDraft, setFriendDraft] = useState<FriendDraft | null>(() => {
    const existing = loadFriendDraft();
    if (existing) return existing;
    try {
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('lonely')) {
        return {
          worldId: WORLD_AUTHORED,
          image:
            'data:image/svg+xml,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect fill="#fffaf0" width="160" height="160"/><circle cx="80" cy="90" r="46" fill="#e8362c"/><circle cx="64" cy="76" r="6" fill="#241c24"/><circle cx="98" cy="76" r="6" fill="#241c24"/></svg>',
            ),
          lonely: true,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  });
  const [plazaToyDraw, setPlazaToyDraw] = useState(false);
  const [plazaToyDraft, setPlazaToyDraft] = useState<PlazaToyDraft | null>(() => loadPlazaToyDraft());
  const [plazaToyShop, setPlazaToyShop] = useState(false);
  const [plazaHoldRev, setPlazaHoldRev] = useState(0);
  const [plazaToyLook, setPlazaToyLook] = useState<{
    src: string | null;
    jobId?: string;
    toy: PlazaLawnToy | null;
    error?: string | null;
    baking?: boolean;
  } | null>(null);
  const plazaToyBusy = useRef(false);
  const plazaToySeq = useRef(0);
  const plazaToyRemainSeen = useRef(0);
  const plazaToyDrawRef = useRef(false);
  plazaToyDrawRef.current = plazaToyDraw;
  const bakePlazaToyJobRef = useRef<(jobId: string, painted?: string | null) => Promise<boolean>>(
    async () => false,
  );
  const hatchingDraftRef = useRef(false);
  const revivingJobs = useRef(new Set<string>());
  const reviveCreatureRef = useRef<(spec: ChudikSpec) => void>(() => undefined);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [logoutGate, setLogoutGate] = useState(false);
  const [parentEntry, setParentEntry] = useState(() => bootstrapParentSession());
  const appRef = useRef<HTMLDivElement | null>(null);
  const [guestVisit, setGuestVisit] = useState<VisitSnapshot | null>(null);
  const homeWorldRef = useRef<string | null>(readHomeWorld());
  const [vitrineCards, setVitrineCards] = useState<VitrineCard[]>([]);
  const [vitrineMore, setVitrineMore] = useState(false);
  const [vitrineBusy, setVitrineBusy] = useState(false);
  const vitrineOffsetRef = useRef(0);
  const [gardenHearts, setGardenHearts] = useState(0);
  const [gardenJoy, setGardenJoy] = useState(0);
  const [creatureHearts, setCreatureHearts] = useState<Record<string, number>>({});
  const [shareId, setShareId] = useState<string | null>(bootVisitId());
  const [zooCode, setZooCode] = useState(0);
  const [heartCatchup, setHeartCatchup] = useState(false);
  const [heartRain, setHeartRain] = useState(false);
  const [heartRainBrief, setHeartRainBrief] = useState(false);
  const [world, setWorld] = useState<string | null>(() => {
    if (bootVisitId()) return null;
    if (isAuthoringStudio()) {
      try {
        const kind = new URLSearchParams(window.location.search).get('kind');
        if (kind === 'meadow' || kind === 'grove') return studioWorldId();
      } catch {
        /* ignore */
      }
    }
    let force = false;
    try {
      force = import.meta.env.DEV && new URLSearchParams(window.location.search).has('arcade');
    } catch {
      force = false;
    }
    return bootWorldAfterArcade(loadArcadeQuest(WORLD_DIY_SKU)?.step, force);
  });
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
  const arcadeVoiceRef = useRef('');
  const arcadeJustStampedRef = useRef(false);
  const arcadeTimersRef = useRef<number[]>([]);

  const refreshQuota = useCallback(async () => {
    const token = bootstrapParentSession().token;
    if (!token) {
      setQuota(null);
      return;
    }
    setQuota(await readQuota(token));
  }, []);

  useEffect(() => {
    void (async () => {
      const token = await ensureLocalParentSession();
      if (token) {
        setParentEntry((prev) => (prev.token === token ? prev : { ...prev, token }));
      }
      await refreshQuota();
    })();
  }, [refreshQuota]);

  const pickerWorlds = withFreeArcadeGarden(quota?.worlds);

  useEffect(() => {
    if (!world || guestVisit) {
      setArcadeQuest(null);
      return;
    }
    if (
      !shouldRunArcade({
        worldId: world,
        studio: isAuthoringStudio(),
        force: forceArcade,
        quest: null,
      })
    ) {
      setArcadeQuest(null);
      return;
    }
    setArcadeQuest(
      isArcadeGardenId(world)
        ? ensurePlayableArcadeQuest(
            world,
            arcadeLawnPlanted(loadDiyLayout(world).map((prop) => prop.model)),
          )
        : loadOrStartArcadeQuest(world),
    );
  }, [forceArcade, guestVisit, world]);

  useEffect(() => {
    if (guestVisit || !world || !isArcadeGardenId(world)) return;
    if (arcadeQuest && arcadeQuest.step !== 'done') return;
    const planted = arcadeLawnPlanted(loadDiyLayout(world).map((prop) => prop.model));
    if (arcadeQuest?.step === 'done' && planted) return;
    setArcadeQuest(ensurePlayableArcadeQuest(world, planted));
  }, [arcadeQuest, world]);

  useEffect(() => {
    setAnalyticsWorld(world ?? '');
    if (world && !guestVisit) {
      homeWorldRef.current = world;
      writeHomeWorld(world);
    }
  }, [guestVisit, world]);

  useEffect(() => {
    if (shopOpen) trackAction('shop.open');
    if (shopOpen && friendDraft) track('friend.pay_sheet');
  }, [shopOpen, friendDraft]);

  useEffect(() => {
    if (screen === 'draw') trackAction('draw.open');
    if (screen === 'roster') trackAction(guestVisit ? 'roster.guest' : 'roster.open');
    if (screen === 'vitrine') trackAction('vitrine.open');
    if (screen === 'plaza') trackAction('plaza.open');
    if (screen === 'preview') trackAction('draw.preview');
  }, [guestVisit, screen]);

  useEffect(() => {
    if (world) return;
    if (bootVisitId() && !guestVisit) return;
    trackAction('worlds.open');
  }, [guestVisit, world]);

  useEffect(() => {
    if (offerSpec) trackAction('first_draw.offer');
  }, [offerSpec]);

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
      onCreatureTapped: (spec) => {
        if (guestVisit) {
          setScreen('roster');
          return;
        }
        setOfferSpec(spec);
      },
      onCreatureHeld: (spec) => {
        if (guestVisit) {
          void likeCreature(spec.id);
          return;
        }
        setCardSpec(spec);
      },
      onCareChanged: (state) => {
        setJoy(state.joy);
        setFeeding(state.feeding);
      },
    });
    gameRef.current = game;

    void (async () => {
      let diyProps = guestVisit
        ? (guestVisit.props as typeof diyProps)
        : loadDiyLayout(world);
      if (!guestVisit && isDiyWorld(world)) {
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
      try {
        await game.start({
          world: isDiyWorld(world) ? 'diy' : 'authored',
          worldId: world,
          shell: kind.shell,
          layoutKind: usesChildBuild(world) || hangingStudio ? 'child' : 'studio',
          catalog: isDiyWorld(world) ? [...childCatalogForShell(kind.shell)] : undefined,
          diyProps: isDiyWorld(world) ? diyProps : undefined,
          guestRecords: guestVisit
            ? guestVisit.creatures.map((row) => ({
                spec: guestToSpec(row),
                lastPosition: row.lastPosition ?? undefined,
              }))
            : undefined,
          onDiyPersist: (props) => {
            if (guestVisit) return;
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
      } catch (error) {
        console.error('[world] start failed', error);
        if (!cancelled) {
          game.dispose();
          gameRef.current = null;
          setReady(false);
          setWorld(null);
          if (guestVisit) {
            setGuestVisit(null);
            setShareId(null);
            clearVisitUrl();
          }
          flash('Сад не открылся.');
        }
        return;
      }
      if (cancelled) {
        game.dispose();
        return;
      }
      setReady(true);
      if (guestVisit) {
        setDiyBuild(false);
        if (usesChildBuild(world)) game.setDiyBuild(false);
        setRecordedIds(new Set());
        return;
      }
      const planted = arcadeLawnPlanted(diyProps.map((prop) => prop.model));
      const questNow = isArcadeGardenId(world)
        ? ensurePlayableArcadeQuest(world, planted)
        : loadOrStartArcadeQuest(world);
      setArcadeQuest(questNow);
      const arcadeNow = shouldRunArcade({
        worldId: world,
        studio: isAuthoringStudio(),
        force: forceArcade,
        quest: questNow,
      });
      const arcadeStep = questNow.step;
      if (arcadeNow && arcadeStep !== 'settle' && arcadeStep !== 'done') {
        setDiyBuild(true);
        game.setDiyBuild(true);
      } else {
        setDiyBuild(false);
        if (usesChildBuild(world)) game.setDiyBuild(false);
      }
      setRecordedIds(new Set(game.getRecordedIds()));
      for (const pending of game.pendingHatches()) {
        if (pending.drawing.meshDeferred && !pending.drawing.modelUrl) {
          game.prepareHatch(pending.id, { drawing: pending.drawing }, { open: true });
          continue;
        }
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
              ...(mesh.mesh === 'deferred' ? { meshDeferred: true } : {}),
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
  }, [world, guestVisit?.id]);

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
    const audio = getIslandAudio();
    void audio.unlock();
    void audio.playCue(id);
  }, []);

  useEffect(() => {
    const arm = () => {
      void getIslandAudio().unlock();
    };
    document.addEventListener('pointerdown', arm, { capture: true });
    window.addEventListener('keydown', arm, true);
    return () => {
      document.removeEventListener('pointerdown', arm, true);
      window.removeEventListener('keydown', arm, true);
    };
  }, []);

  const speakArcade = useCallback((ids: CueId[]) => {
    for (const timer of arcadeTimersRef.current) window.clearTimeout(timer);
    arcadeTimersRef.current = [];
    if (!ids.length) return;
    const audio = getIslandAudio();
    void (async () => {
      await audio.unlock();
      await audio.preloadCues(ids);
      let delay = 0;
      ids.forEach((id) => {
        const wait = delay;
        arcadeTimersRef.current.push(window.setTimeout(() => speak(id), wait * 1000));
        delay += audio.cueSeconds(id) + 0.18;
      });
    })();
  }, [speak]);

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

  const guestOn = Boolean(guestVisit);
  const arcadeOn = !guestOn && shouldRunArcade({
    worldId: world,
    studio: isAuthoringStudio(),
    force: forceArcade,
    quest: arcadeQuest,
  });
  const arcadeBuilding = Boolean(
    arcadeOn && arcadeQuest && arcadeQuest.step !== 'settle' && arcadeQuest.step !== 'done',
  );
  const arcadeSettle = Boolean(arcadeOn && arcadeQuest?.step === 'settle');

  const clearVisitUrl = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('visit');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
  }, []);

  const goHome = useCallback(
    (homeId?: string | null) => {
      const home = homeId || homeWorldRef.current || pickerWorlds[0]?.id || null;
      if (guestVisit) {
        trackAction('visit.close', { share_id: guestVisit.id, code: guestVisit.code || 0 });
      }
      setGuestVisit(null);
      setShareId(null);
      setZooCode(0);
      setScreen('zoo');
      clearVisitUrl();
      if (home) setWorld(home);
      else setWorld(null);
    },
    [clearVisitUrl, guestVisit, pickerWorlds],
  );

  const leaveToWorlds = useCallback(() => {
    if (guestVisit) {
      goHome();
      return;
    }
    if (arcadeQuest && (arcadeBuilding || arcadeSettle)) {
      speak('arcade_pause');
      track('arcade.skip', { world_id: world, ...arcadeStepPayload(arcadeQuest) });
    } else {
      speak('worlds_back');
      trackAction('worlds.leave', { world_id: world });
    }
    setGuestVisit(null);
    setShareId(null);
    setZooCode(0);
    clearVisitUrl();
    setWorld(null);
  }, [arcadeBuilding, arcadeQuest, arcadeSettle, clearVisitUrl, goHome, guestVisit, speak, world]);

  const applyVisitCounts = useCallback((snap: { hearts: number; joy: number; creatures: GuestCreature[] | Record<string, number> }) => {
    setGardenHearts(snap.hearts);
    setGardenJoy(snap.joy);
    if (Array.isArray(snap.creatures)) {
      setCreatureHearts(Object.fromEntries(snap.creatures.map((row) => [row.spec.id, row.hearts])));
    } else {
      setCreatureHearts(snap.creatures);
    }
  }, []);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  const openVisit = useCallback(async (id: string) => {
    setToast(null);
    setScreen('zoo');
    setReady(false);
    const snap = id.startsWith('local:') ? await localSnapshot(id.slice(6)) : (await loadVisit(id)) ?? (id.includes(':') ? null : await localSnapshot(id));
    if (!snap) {
      flash('Сад не открылся.');
      if (gameRef.current) setReady(true);
      return;
    }
    applyVisitCounts(snap);
    setGuestVisit(snap);
    setShareId(snap.id);
    setZooCode(snap.code || 0);
    setHeartRainBrief(false);
    setHeartRain(true);
    window.setTimeout(() => setHeartRain(false), 2400);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('visit', snap.id);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
    setWorld(snap.world_id);
    trackAction('visit.open', { share_id: snap.id, code: snap.code || 0, joy: snap.joy });
  }, [applyVisitCounts, flash]);

  const vitrineQueryRef = useRef('');

  const refreshVitrine = useCallback(async (query = '') => {
    vitrineQueryRef.current = query;
    if (query.trim()) track('vitrine.search', vitrineSearchLog(query));
    setVitrineBusy(true);
    let page = { items: [] as VitrineCard[], total: 0, offset: 0, limit: 24 };
    try {
      page = await listVitrine(0, 24, query);
      setVitrineCards(page.items);
      vitrineOffsetRef.current = page.offset + page.items.length;
      setVitrineMore(vitrineOffsetRef.current < page.total);
    } finally {
      setVitrineBusy(false);
    }
    const records = await loadCreatures();
    const owned = pickerWorlds;
    const homes = new Map<string, string>();
    for (const lawn of owned) homes.set(lawn.id, lawn.title);
    if (world) homes.set(world, gardenTitle(world, owned));
    for (const record of records) {
      if (isParkResidentId(record.spec.id)) continue;
      const home = creatureWorldId(record.spec.worldId);
      if (!homes.has(home)) homes.set(home, gardenTitle(home, owned));
    }
    const mine = await Promise.all(
      [...homes].map(async ([home, title]) => {
        const [share, hearts] = await Promise.all([ownerShare(home), ownerHearts(home)]);
        return {
          id: share ?? `local:${home}`,
          world_id: home,
          title,
          postcard: '',
          code: hearts?.code,
          hearts: hearts?.hearts ?? 0,
          joy: hearts?.joy ?? 0,
          creatures: countOnWorld(records, home),
          mine: home === (homeWorldRef.current || world),
        } satisfies VitrineCard;
      }),
    );
    if (mine.length) setVitrineCards(mergeVitrinePage(mine, page.items));
  }, [guestVisit, pickerWorlds, world]);

  const loadMoreVitrine = useCallback(async () => {
    if (vitrineBusy || !vitrineMore) return;
    setVitrineBusy(true);
    try {
      const page = await listVitrine(vitrineOffsetRef.current, 24, vitrineQueryRef.current);
      setVitrineCards((current) => appendVitrine(current, page.items));
      vitrineOffsetRef.current = page.offset + page.items.length;
      setVitrineMore(vitrineOffsetRef.current < page.total);
    } finally {
      setVitrineBusy(false);
    }
  }, [vitrineBusy, vitrineMore]);

  const burstHeart = useCallback(() => {
    setHeartRainBrief(true);
    setHeartRain(true);
    window.setTimeout(() => {
      setHeartRain(false);
      setHeartRainBrief(false);
    }, 700);
  }, []);

  const likeGarden = useCallback(() => {
    if (shareId && alreadyGave(shareId)) {
      burstHeart();
      return;
    }
    setGardenHearts((n) => n + 1);
    setGardenJoy((n) => n + 1);
    setGuestVisit((current) =>
      current ? { ...current, hearts: current.hearts + 1, joy: current.joy + 1 } : current,
    );
    burstHeart();
    trackAction('visit.heart', { share_id: shareId, target: 'zoo' });
    void (async () => {
      const id = shareId ?? (world ? await ownerShare(world) : null);
      if (!id) return;
      setShareId(id);
      const snap = await likeVisit(id);
      if (!snap) return;
      applyVisitCounts({
        hearts: snap.hearts,
        joy: snap.joy,
        creatures: guestVisit
          ? guestVisit.creatures.map((row) => ({
              ...row,
              hearts: snap.creatures.find((item) => item.spec.id === row.spec.id)?.hearts ?? row.hearts,
            }))
          : snap.creatures.reduce<Record<string, number>>((bag, row) => {
              if (row.spec.id) bag[row.spec.id] = row.hearts;
              return bag;
            }, { ...creatureHearts }),
      });
      setGuestVisit((current) =>
        current
          ? {
              ...current,
              hearts: snap.hearts,
              joy: snap.joy,
              creatures: current.creatures.map((row) => ({
                ...row,
                hearts: snap.creatures.find((item) => item.spec.id === row.spec.id)?.hearts ?? row.hearts,
              })),
            }
          : current,
      );
    })();
  }, [applyVisitCounts, burstHeart, creatureHearts, guestVisit, shareId, world]);

  const likeCreature = useCallback((creatureId: string) => {
    if (shareId && alreadyGave(shareId, creatureId)) return;
    setCreatureHearts((current) => ({
      ...current,
      [creatureId]: (current[creatureId] ?? 0) + 1,
    }));
    setGardenJoy((n) => n + 1);
    setGuestVisit((current) =>
      current
        ? {
            ...current,
            joy: current.joy + 1,
            creatures: current.creatures.map((row) =>
              row.spec.id === creatureId ? { ...row, hearts: row.hearts + 1 } : row,
            ),
          }
        : current,
    );
    burstHeart();
    trackAction('visit.heart', { share_id: shareId, target: 'creature' });
    void (async () => {
      const id = shareId ?? (world ? await ownerShare(world) : null);
      if (!id) return;
      setShareId(id);
      const snap = await likeVisit(id, creatureId);
      if (!snap) return;
      const next = { ...creatureHearts, [creatureId]: (creatureHearts[creatureId] ?? 0) + 1 };
      if (snap.creatures.length) {
        for (const row of snap.creatures) next[row.spec.id] = row.hearts;
      }
      applyVisitCounts({ hearts: snap.hearts, joy: snap.joy, creatures: next });
      setGuestVisit((current) =>
        current
          ? {
              ...current,
              hearts: snap.hearts,
              joy: snap.joy,
              creatures: current.creatures.map((row) =>
                row.spec.id === creatureId ? { ...row, hearts: next[creatureId] ?? row.hearts } : row,
              ),
            }
          : current,
      );
    })();
  }, [applyVisitCounts, burstHeart, creatureHearts, shareId, world]);

  const shareGarden = useCallback(async () => {
    const meta = world ? await ownerShareMeta(world) : null;
    const id = shareId ?? meta?.id ?? null;
    if (!id) return;
    setShareId(id);
    if (meta?.code) setZooCode(meta.code);
    const link = visitLink(id, meta?.code);
    const copied = meta?.code ? `Номер ${meta.code}` : 'Ссылка скопирована';
    try {
      if (navigator.share) {
        await navigator.share({ title: meta?.code ? `Зоопарк № ${meta.code}` : 'Мой зоопарк', url: link });
      } else {
        await navigator.clipboard.writeText(link);
        flash(copied);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(link);
        flash(copied);
      } catch {
        flash(link);
      }
    }
    trackAction('visit.share', { share_id: id, code: meta?.code });
  }, [flash, shareId, world]);

  useEffect(() => {
    const id = bootVisitId();
    if (!id || guestVisit) return;
    void openVisit(id);
  }, [guestVisit, openVisit]);

  useEffect(() => {
    if (!ready) return;
    gameRef.current?.setGardenHearts(gardenJoy);
    gameRef.current?.setCreatureHearts(creatureHearts);
  }, [creatureHearts, gardenJoy, ready]);

  useEffect(() => {
    if (!ready || !world || guestVisit) return;
    void ownerHearts(world).then((row) => {
      if (!row) return;
      setShareId(row.id);
      setZooCode(row.code || 0);
      applyVisitCounts({ hearts: row.hearts, joy: row.joy, creatures: row.creatures });
      if (row.joy > lastSeenJoy(row.id)) {
        setHeartCatchup(true);
        window.setTimeout(() => setHeartCatchup(false), 2800);
      }
      rememberJoy(row.id, row.joy);
    });
  }, [applyVisitCounts, guestVisit, ready, world]);

  const needsFirstDraw =
    shouldOfferFirstDraw(world) &&
    ready &&
    screen === 'zoo' &&
    !driving &&
    !anotherDraw &&
    !firstDrawDismissed &&
    !arcadeBuilding &&
    !guestOn &&
    (forceFirstDraw || !hasOwnCreature(specs));
  const showDrawPrompt =
    Boolean(world) &&
    (needsFirstDraw || anotherDraw || arcadeSettle) &&
    !driving &&
    !offerSpec &&
    !friendInvite &&
    !stillHint &&
    !guestOn;

  const remainingNow = useCallback(() => {
    if (quotaRef.current) return quotaRef.current.remaining;
    return Number.isFinite(previewEggs) ? previewEggs : null;
  }, [previewEggs]);

  const stillRemainingNow = useCallback(() => {
    if (quotaRef.current) return quotaRef.current.stillRemaining;
    return null;
  }, []);

  const afterFreeHatch = useCallback(() => {
    const stillLeft = stillRemainingNow();
    const used = quotaRef.current?.used ?? 0;
    if (used >= 1 && (stillLeft ?? 0) > 0 && !stillHintSeen()) {
      setStillHint(true);
      speak('still_after_first');
      track('still.hint');
      return;
    }
    if (shouldOfferFriendInvite(stillLeft, Boolean(friendDraft || loadFriendDraft()))) {
      setFriendInvite(true);
      track('friend.invite');
      if (isArcadeGardenId(world)) speak('arcade_need_friends');
    }
  }, [friendDraft, speak, stillRemainingNow, world]);

  const startFriendDraw = useCallback(() => {
    if (
      worldIsFull(
        countOnWorld(
          specs.map((spec) => ({ spec })),
          world ?? WORLD_AUTHORED,
        ),
      )
    ) {
      setFullOpen(true);
      return;
    }
    friendDrawRef.current = true;
    setFriendDraw(true);
    setFriendInvite(false);
    speak('draw');
    trackAction('draw.open', { from: 'friend_lawn' });
    setScreen('draw');
  }, [speak, specs, world]);

  const finishHatch = useCallback((id: string) => {
    const remaining = remainingNow();
    const buy = hatchGardenOpensShop(stillRemainingNow(), remaining);
    const payMesh = hatchGardenStartsPaidMesh(remaining);
    hatchLookRef.current = null;
    setHatchLook(null);
    setPuzzleOpen(false);
    setScreen('zoo');
    gameRef.current?.focusOn(id);
    if (payMesh) {
      const spec = gameRef.current?.getSpecs().find((row) => row.id === id);
      if (spec && !spec.drawing?.modelUrl) {
        reviveCreatureRef.current(spec);
        return;
      }
    }
    if (buy) {
      setFriendInvite(false);
      setShopOpen(true);
      speak('empty_quota');
      return;
    }
    afterFreeHatch();
  }, [afterFreeHatch, remainingNow, speak, stillRemainingNow]);

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
    if (on) {
      setOfferSpec(null);
      track('diy.build');
    }
  }, []);

  useEffect(() => {
    if (!ready || !arcadeBuilding || !world || !arcadeQuest) {
      if (ready && !arcadeBuilding) setDiyBuilding(false);
      return;
    }
    setDiyBuilding(true);
    void getIslandAudio().preloadCues(ARCADE_CUE_IDS);
    const studio = gameRef.current?.layoutStudio;
    if (!studio) return;
    const model = modelForStep(arcadeQuest.step, arcadeQuest.count);
    if (!model) return;
    let gone = false;
    const keepHold = () => {
      if (studio.getState().holdingModel !== model) studio.forceHold(model);
    };
    const stopHold = studio.subscribe(keepHold);
    void (async () => {
      await gameRef.current?.library.ensure(model);
      if (gone) return;
      studio.forceHold(model);
      const thumbs = gameRef.current?.captureCatalogThumbs([model]);
      setArcadeThumb(thumbs?.[model] ?? null);
    })();
    const voiceKey = `${world}:${arcadeQuest.step}:${arcadeQuest.count}`;
    if (arcadeJustStampedRef.current) {
      arcadeJustStampedRef.current = false;
      arcadeVoiceRef.current = voiceKey;
    } else if (arcadeVoiceRef.current !== voiceKey) {
      arcadeVoiceRef.current = voiceKey;
      if (!arcadeQuest.greeted && arcadeQuest.step === 'trees' && arcadeQuest.count === 0) {
        track('arcade.start', { world_id: world, ...arcadeStepPayload(arcadeQuest) });
      }
      speakArcade(arcadeEnterCues(arcadeQuest));
      if (!arcadeQuest.greeted) {
        const greeted = markArcadeGreeted(arcadeQuest);
        saveArcadeQuest(greeted);
        setArcadeQuest(greeted);
      }
    }
    return () => {
      gone = true;
      stopHold();
    };
  }, [arcadeBuilding, arcadeQuest, ready, setDiyBuilding, speakArcade, world]);

  useEffect(() => {
    if (!ready || !arcadeBuilding || !world || !arcadeQuest) return;
    const studio = gameRef.current?.layoutStudio;
    if (!studio) return;
    const stopMissed = studio.onMissed(() => speak('arcade_wrong'));
    const stopPlaced = studio.onPlaced((model) => {
      const next = applyArcadeStamp(arcadeQuest, model);
      if (next === arcadeQuest) return;
      arcadeJustStampedRef.current = true;
      saveArcadeQuest(next);
      setArcadeQuest(next);
      track('arcade.step', { world_id: world, ...arcadeStepPayload(next) });
      const cues = [...arcadeStampCues(arcadeQuest, next)];
      if (next.step === 'settle') {
        track('arcade.done', { world_id: world });
        cues.push(arcadeSettleCue((remainingNow() ?? 0) > 0));
        setArcadeThumb(null);
      }
      speakArcade(cues);
      if (isDiyWorld(world)) {
        const game = gameRef.current;
        if (game) {
          const props = game.saveDiyGarden();
          saveDiyLayout(props, world);
          void putRemoteDiyLayout(props, world);
        }
      }
    });
    return () => {
      stopMissed();
      stopPlaced();
    };
  }, [arcadeBuilding, arcadeQuest, ready, remainingNow, speak, speakArcade, world]);

  useEffect(() => {
    if (plazaKeepsGardenBed(screen, world)) return;
    for (const timer of arcadeTimersRef.current) window.clearTimeout(timer);
    arcadeTimersRef.current = [];
    arcadeVoiceRef.current = '';
    getIslandAudio().setGardenPaused(true);
  }, [screen, world]);

  useEffect(() => {
    if (world || screen === 'plaza') return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.sound-dock')) return;
      document.removeEventListener('pointerdown', onPointer, true);
      if (!claimCueOnce('worlds')) return;
      speak('worlds');
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [screen, world, speak]);

  useEffect(() => {
    if (!ready || !world || !isDiyWorld(world) || arcadeBuilding || arcadeSettle) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.sound-dock')) return;
      document.removeEventListener('pointerdown', onPointer, true);
      if (!claimCueOnce('welcome_diy')) return;
      speak('welcome_diy');
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [arcadeBuilding, arcadeSettle, ready, speak, world]);

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
            if (!next) return next;
            const quotaTotal = Math.max(next.quotaTotal, next.used + settled.remaining);
            const stillQuota = settled.stillQuota ?? stillQuotaOf(quotaTotal);
            return {
              ...next,
              quotaTotal,
              stillQuota,
              stillRemaining:
                settled.stillRemaining ?? Math.max(0, stillQuota - next.stillUsed),
              plazaToyRemaining: settled.plazaToyRemaining ?? next.plazaToyRemaining,
              plazaToyQuota: settled.plazaToyQuota ?? next.plazaToyQuota,
              ownedWorlds: settled.ownedWorlds,
              worlds: settled.worlds,
            };
          });
          if (isPlazaToySku(sku) || Boolean(loadPlazaToyDraft()?.jobId)) {
            trackAction('pay.result', { kind: 'plaza_toy', pending: settled.pending });
            setScreen('plaza');
            const draft = loadPlazaToyDraft();
            if (draft?.jobId) {
              plazaToyBusy.current = true;
              setPlazaToyLook({
                src: draft.painted || draft.image,
                jobId: draft.jobId,
                toy: null,
                baking: true,
              });
              void bakePlazaToyJobRef.current(draft.jobId, draft.painted || draft.image);
            }
            try {
              sessionStorage.removeItem(CHECKOUT_SKU_KEY);
            } catch {
              /* ignore */
            }
            forget();
            return;
          }
          if (isConstructionSku(sku)) {
            const before = takeOwnedWorldsBefore();
            const added = settled.ownedWorlds.filter((id) => !before.includes(id));
            const dest = added.at(-1) ?? settled.ownedWorlds.at(-1);
            if (dest) {
              trackAction('pay.result', { kind: 'world_opened', pending: settled.pending });
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
              trackAction('pay.result', { kind: 'world_pending' });
              flash('Платёж ещё проверяется. Остров откроется сам.');
              forget();
              return;
            }
          } else if (settled.credited > 0) {
            trackAction('pay.result', { kind: 'credits', credited: settled.credited });
            flash(`Оплата прошла. Новых зуфунят в саду: ${settled.credited}.`);
            forget();
            return;
          } else if (settled.pending === 0) {
            trackAction('pay.result', { kind: 'credits_already' });
            flash('Оплата прошла. Кредиты на аккаунте.');
            forget();
            return;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, PAID_CHECK_DELAY_MS));
      }
      if (cancelled) return;
      await refreshQuota();
      trackAction('pay.result', { kind: 'still_pending', world: Boolean(sku && isConstructionSku(sku)) });
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
      trackAction('draw.block', { reason: 'not_signed_in' });
      flash('Зайди с сайта — тогда зуфуньчик появится в объёме.');
      return false;
    }
    const locked = pendingBirthRef.current || pendingBirth;
    const remaining = remainingNow();
    const stillLeft = stillRemainingNow();
    const used = quotaRef.current?.used ?? 0;
    const inviteFriend =
      friendDrawRef.current ||
      friendDraw ||
      friendInvite ||
      shouldKeepFriendLawn(stillLeft, hasOwnCreature(specs), Boolean(friendDraft));
    if (!canStartCreation({ remaining, stillRemaining: stillLeft, used, pendingBirth: locked, inviteFriend })) {
      if (locked) {
        trackAction('draw.block', { reason: 'pending_birth' });
        flash('Подожди чуть-чуть — рисунок ещё отправляется.');
        return false;
      }
      if (stillLeft != null && stillLeft <= 0 && (remaining ?? 0) > 0) {
        trackAction('draw.block', { reason: 'empty_still' });
        speak('empty_still');
        setShopOpen(true);
        return false;
      }
      if (remaining != null && remaining <= 0) {
        trackAction('draw.block', { reason: 'empty_quota' });
        speak('empty_quota');
        setShopOpen(true);
        return false;
      }
      return false;
    }
    if (inviteFriend && stillLeft != null && stillLeft <= 0 && remaining != null && remaining <= 0) {
      friendDrawRef.current = true;
      setFriendDraw(true);
    }
    if (
      worldIsFull(
        countOnWorld(
          specs.map((spec) => ({ spec })),
          world ?? WORLD_AUTHORED,
        ),
      )
    ) {
      trackAction('draw.block', { reason: 'world_full' });
      setFullOpen(true);
      return false;
    }
    return true;
  }, [flash, friendDraft, friendDraw, friendInvite, pendingBirth, remainingNow, speak, specs, stillRemainingNow, world]);

  const drawAnotherFromHatch = useCallback(() => {
    if (!canCreate()) return;
    hatchLookRef.current = null;
    setHatchLook(null);
    setPuzzleOpen(false);
    speak('draw');
    trackAction('draw.open', { from: 'hatch_preview' });
    setScreen('draw');
  }, [canCreate, speak]);

  const processPlazaToy = useCallback(
    async (raw: HTMLCanvasElement | HTMLImageElement) => {
      const source = raw instanceof HTMLCanvasElement ? paperizeCanvas(raw) : raw;
      const seq = ++plazaToySeq.current;
      plazaToyBusy.current = true;
      const image = artworkToDraftImage(source);
      if (image) {
        const draft = { image };
        savePlazaToyDraft(draft);
        setPlazaToyDraft(draft);
      }
      if (!image) {
        plazaToyBusy.current = false;
        speak('error');
        flash('Не получилось разобрать рисунок.');
        setPlazaToyDraw(true);
        return;
      }
      setPlazaToyShop(false);
      setPlazaToyDraw(false);
      setPlazaToyLook({ src: null, toy: null });
      setScreen('plaza');
      let signedIn = Boolean(bootstrapParentSession().token);
      if (!signedIn) {
        const token = await ensureLocalParentSession();
        signedIn = Boolean(token);
        if (token) setParentEntry((prev) => (prev.token === token ? prev : { ...prev, token }));
      }
      if (!signedIn) {
        plazaToyBusy.current = false;
        setPlazaToyLook({
          src: null,
          toy: null,
          error: 'Зайди с сайта — оплату делает взрослый.',
        });
        flash('Зайди с сайта — оплату делает взрослый.');
        return;
      }
      const result = await previewPlazaToy(source);
      if (seq !== plazaToySeq.current) return;
      plazaToyBusy.current = false;
      if (result.ok) {
        const next = { image, painted: result.painted, jobId: result.jobId };
        savePlazaToyDraft(next);
        setPlazaToyDraft(next);
        setPlazaToyLook({ src: result.painted, jobId: result.jobId, toy: null });
        return;
      }
      if (result.reason === 'not_signed_in') {
        setPlazaToyLook({
          src: null,
          toy: null,
          error: 'Зайди с сайта — оплату делает взрослый.',
        });
        flash('Зайди с сайта — оплату делает взрослый.');
        return;
      }
      const message =
        result.reason === 'not_allowed'
          ? 'Этот рисунок нельзя.'
          : result.reason === 'plaza_toy_full'
            ? 'Уже десять штук.'
            : 'Не получилось покрасить.';
      speak('error');
      setPlazaToyLook({ src: null, toy: null, error: message });
    },
    [flash, speak],
  );

  const redrawPlazaToy = useCallback(() => {
    plazaToySeq.current += 1;
    plazaToyBusy.current = false;
    clearPlazaToyDraft();
    setPlazaToyDraft(null);
    setPlazaToyLook(null);
    setPlazaToyShop(false);
    setPlazaToyDraw(true);
    setScreen('plaza');
  }, []);

  const holdPlazaToy = useCallback(
    (toy: PlazaLawnToy, remaining: number, preview?: string | null) => {
      plazaToySeq.current += 1;
      plazaToyBusy.current = false;
      plazaToyRemainSeen.current = remaining;
      const still =
        preview && preview.length > 20 ? preview : toy.still_url;
      rememberPlazaHold({
        ...toy,
        still_url: still,
        placed: false,
        mesh_status: toy.mesh_status || (toy.model_url ? 'ready' : 'pending'),
        preparing: isPlazaToyPreparing({
          ...toy,
          mesh_status: toy.mesh_status || (toy.model_url ? 'ready' : 'pending'),
        }),
      });
      setPlazaHoldRev((n) => n + 1);
      clearPlazaToyDraft();
      setPlazaToyDraft(null);
      setPlazaToyLook(null);
      setPlazaToyShop(false);
      setPlazaToyDraw(false);
      setQuota((current) =>
        current
          ? {
              ...current,
              plazaToyRemaining: remaining,
              plazaToyUsed: Math.max(current.plazaToyUsed, current.plazaToyQuota - remaining),
            }
          : current,
      );
      flash(PLAZA_TOY_PUT);
    },
    [flash],
  );

  const bakePlazaToyJob = useCallback(
    async (jobId: string, painted?: string | null) => {
      plazaToyBusy.current = true;
      setPlazaToyShop(false);
      setPlazaToyLook({ src: painted ?? null, jobId, toy: null, baking: true });
      setScreen('plaza');
      const token = await ensureLocalParentSession();
      if (token) setParentEntry((prev) => (prev.token === token ? prev : { ...prev, token }));
      const result = await commitPlazaToy(jobId);
      plazaToyBusy.current = false;
      if (result.ok) {
        holdPlazaToy(result.toy, result.remaining, painted);
        return true;
      }
      setPlazaToyLook({ src: painted ?? null, jobId, toy: null });
      if (result.reason === 'no_plaza_toys') {
        setPlazaToyShop(true);
        return false;
      }
      if (result.reason === 'not_signed_in') {
        flash('Зайди с сайта — оплату делает взрослый.');
        return false;
      }
      speak('error');
      flash(result.reason === 'plaza_toy_full' ? 'Уже десять штук.' : 'Не получилось поставить.');
      return false;
    },
    [flash, holdPlazaToy, speak],
  );
  bakePlazaToyJobRef.current = bakePlazaToyJob;

  const placePlazaToy = useCallback(async () => {
    const draft = plazaToyDraft ?? loadPlazaToyDraft();
    const jobId = plazaToyLook?.jobId || draft?.jobId;
    const painted = plazaToyLook?.src || draft?.painted || draft?.image || null;
    if (!jobId) {
      setPlazaToyShop(false);
      setPlazaToyDraw(true);
      return;
    }
    await bakePlazaToyJob(jobId, painted);
  }, [bakePlazaToyJob, plazaToyDraft, plazaToyLook]);

  const processArtwork = useCallback(
    async (raw: HTMLCanvasElement | HTMLImageElement) => {
      const source = raw instanceof HTMLCanvasElement ? paperizeCanvas(raw) : raw;
      if (
        shouldHoldFriendDraft({
          remaining: remainingNow(),
          stillRemaining: stillRemainingNow(),
        })
      ) {
        const local = await imageToChudik(source);
        if (!local.ok) {
          trackAction('draw.fail', { reason: local.reason });
          setScreen('draw');
          speak('error');
          flash(FAILURE_MESSAGES[local.reason] ?? 'Не получилось разобрать рисунок.');
          return;
        }
        const image = artworkToDraftImage(source);
        if (!image) {
          trackAction('draw.fail', { reason: 'draft_image' });
          speak('error');
          flash('Не получилось сохранить рисунок.');
          return;
        }
        const draft: FriendDraft = {
          worldId: world ?? WORLD_AUTHORED,
          image,
          lonely: false,
        };
        saveFriendDraft(draft);
        setFriendDraft(draft);
        friendDrawRef.current = false;
        setFriendDraw(false);
        setFriendInvite(false);
        track('friend.draw');
        setScreen('zoo');
        setShopOpen(true);
        return;
      }
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
      const used = quotaRef.current?.used ?? 0;
      setQuota((current) => (used === 0 ? spendOneCredit(current) : spendOneStill(current)));

      const showLook = (look: HatchLook | null) => {
        hatchLookRef.current = look;
        setHatchLook(look);
      };
      const watchingThis = () => hatchLookRef.current?.id === spec.id;
      const enterGarden = () => {
        showLook(null);
        setScreen('zoo');
        game.focusOn(spec.id);
        afterFreeHatch();
      };

      showLook({ id: spec.id, src: null, name: spec.name });
      setScreen('preview');

      let accepted = false;
      try {
        const local = await imageToChudik(source);
        if (!local.ok) {
          trackAction('draw.fail', { reason: local.reason });
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
          if (styled.mesh === 'deferred') painted = { ...painted, meshDeferred: true };
          const name = styled.name || spec.name;
          const kindId = styled.kindId || spec.kindId;
          game.prepareHatch(
            spec.id,
            { drawing: painted, name, kindId },
            { open: eggCanOpen(styled.mesh, styled.modelUrl) },
          );
        };

        const styled = await stylizeDrawing(source, {
          onAccepted: async ({ remaining, stillRemaining, jobId }) => {
            accepted = true;
            spec.hatchJobId = jobId;
            if (typeof remaining === 'number') {
              setQuota((current) => applyRemaining(current, remaining));
            }
            if (typeof stillRemaining === 'number') {
              setQuota((current) => applyStillRemaining(current, stillRemaining));
            }
            if (typeof remaining !== 'number' && typeof stillRemaining !== 'number') {
              void refreshQuota();
            }
            await game.addCreature(spec);
            pendingBirthRef.current = false;
            setPendingBirth(false);
          },
          onImage: (paintedStill) => {
            game.noteHatchPainted(spec.id);
            showLook({
              id: spec.id,
              src: paintedStill.image.src,
              name: paintedStill.name || spec.name,
              postcardSrc: paintedStill.postcardUrl ?? null,
              postcardDone: Boolean(paintedStill.postcardUrl),
              meshCooking: hatchMeshCooking(paintedStill.mesh, paintedStill.modelUrl),
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
          if (typeof styled.stillRemaining === 'number') {
            setQuota((current) => applyStillRemaining(current, styled.stillRemaining));
          }
          await ready(styled);
          if (watchingThis()) {
            const current = hatchLookRef.current;
            if (current) {
              showLook({
                ...current,
                meshCooking: hatchMeshCooking(styled.mesh, styled.modelUrl),
              });
            }
          }
          if (styled.mesh === 'deferred') {
            speak('postcard_ready');
          } else if (!styled.modelUrl) {
            void waitForMesh(styled.jobId)
              .then(async (mesh) => {
                if (watchingThis()) {
                  const current = hatchLookRef.current;
                  if (current) {
                    showLook({
                      ...current,
                      postcardSrc: mesh.postcardUrl ?? current.postcardSrc,
                      postcardDone: Boolean(mesh.postcardUrl) || current.postcardDone,
                      meshCooking: hatchMeshCooking(mesh.mesh, mesh.modelUrl),
                    });
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
                : styled.mesh === 'deferred'
                  ? 'Открытка в саду. Оживить можно потом.'
                  : 'Картинка готова. Объём долепится в саду.',
            );
          }
        } else if (styled.reason === 'not_allowed') {
          trackAction('draw.fail', { reason: 'not_allowed' });
          showLook(null);
          setScreen('draw');
          speak('error');
          flash('Такой рисунок нельзя. Нарисуй зверушку.');
        } else if (styled.reason === 'no_credits') {
          trackAction('draw.fail', { reason: 'no_credits' });
          showLook(null);
          setScreen('zoo');
          speak('empty_quota');
          setShopOpen(true);
          flash('Нужен пакет — бесплатный зверь уже создан.');
        } else if (styled.reason === 'no_stills') {
          trackAction('draw.fail', { reason: 'no_stills' });
          showLook(null);
          setScreen('zoo');
          speak('empty_still');
          setShopOpen(true);
          flash('Картинки закончились. Можно оживить тех, кто уже есть.');
        } else if (accepted && styled.reason === 'timeout') {
          if (!hatchLookRef.current?.src) enterGarden();
          flash('Ещё лепится. Подожди у яйца.');
        } else if (accepted) {
          trackAction('draw.fail', { reason: styled.reason || 'accepted_fail' });
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
          trackAction('draw.fail', { reason: 'not_signed_in' });
          showLook(null);
          setScreen('zoo');
          flash('Зайди с сайта — тогда зуфуньчик появится в объёме.');
        } else if (styled.reason === 'unavailable') {
          trackAction('draw.fail', { reason: 'unavailable' });
          showLook(null);
          setScreen('draw');
          flash('Сейчас нельзя создать зуфуньчика. Попробуй позже.');
        } else {
          trackAction('draw.fail', { reason: styled.reason || 'stylize' });
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
        trackAction('draw.fail', { reason: 'exception' });
        flash('Что-то пошло не так с рисунком.');
        setScreen('zoo');
      } finally {
        pendingBirthRef.current = false;
        setPendingBirth(false);
        setBusy(null);
        void refreshQuota();
      }
    },
    [afterFreeHatch, canCreate, flash, refreshQuota, remainingNow, speak, stillRemainingNow, world],
  );

  const startWaitingHatch = useCallback(async () => {
    const draft = friendDraft ?? loadFriendDraft();
    if (
      !draft ||
      hatchingDraftRef.current ||
      !shouldHatchFriendDraft({
        remaining: remainingNow(),
        stillRemaining: stillRemainingNow(),
        used: quotaRef.current?.used,
        hasDraft: true,
        pendingBirth: pendingBirthRef.current,
      })
    ) {
      return;
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
      return;
    }
    hatchingDraftRef.current = true;
    clearFriendDraft();
    setFriendDraft(null);
    setShopOpen(false);
    try {
      const image = await loadDraftImage(draft.image);
      await processArtwork(image);
    } catch {
      speak('error');
      flash('Не удалось открыть рисунок.');
      saveFriendDraft(draft);
      setFriendDraft(draft);
    } finally {
      hatchingDraftRef.current = false;
    }
  }, [flash, friendDraft, processArtwork, remainingNow, speak, specs, stillRemainingNow, world]);

  const reviveCreature = useCallback(
    async (spec: ChudikSpec) => {
      const jobId = spec.hatchJobId;
      if (!jobId) {
        flash('Сначала появится картинка.');
        return;
      }
      if (spec.drawing?.modelUrl) return;
      if ((quotaRef.current?.remaining ?? 0) <= 0) {
        speak('revive_need');
        saveReviveJob(jobId);
        setCardSpec(null);
        setScreen('zoo');
        setShopOpen(true);
        return;
      }
      if (revivingJobs.current.has(jobId)) return;
      revivingJobs.current.add(jobId);
      clearReviveJob();
      setQuota((current) => spendOneCredit(current));
      const release = () => {
        revivingJobs.current.delete(jobId);
      };
      try {
        const started = await startMesh(jobId);
        if (!started.ok) {
          release();
          void refreshQuota();
          if (started.reason === 'no_credits') {
            speak('revive_need');
            saveReviveJob(jobId);
            setShopOpen(true);
            return;
          }
          speak('error');
          flash('Не получилось оживить.');
          return;
        }
        if (typeof started.remaining === 'number') {
          setQuota((current) => applyRemaining(current, started.remaining ?? 0));
        }
        const game = gameRef.current;
        const openMesh = async (modelUrl: string) => {
          await preloadMeshyModel(modelUrl);
          const drawing = {
            ...(spec.drawing ?? blankEggDrawing()),
            modelUrl,
            meshDeferred: false,
          };
          game?.prepareHatch(spec.id, { drawing }, { open: true });
          release();
        };
        if (started.modelUrl) {
          await openMesh(started.modelUrl);
        } else {
          void waitForMesh(jobId)
            .then(async (mesh) => {
              if (mesh.modelUrl) await openMesh(mesh.modelUrl);
              else release();
            })
            .catch(() => {
              release();
            });
          flash('Лепится в саду.');
        }
        setCardSpec(null);
        setScreen('zoo');
      } catch {
        release();
        speak('error');
        flash('Не получилось оживить.');
      }
    },
    [flash, refreshQuota, speak],
  );
  reviveCreatureRef.current = reviveCreature;

  const saveCreatureGlb = useCallback(async (spec: ChudikSpec) => {
    const ok = await downloadCreatureGlb(spec.id, spec.name);
    if (!ok) flash('Не получилось скачать 3D.');
  }, [flash]);

  useEffect(() => {
    if (!world || screen !== 'zoo') return;
    if (
      !shouldHatchFriendDraft({
        remaining: remainingNow(),
        stillRemaining: stillRemainingNow(),
        used: quotaRef.current?.used,
        hasDraft: Boolean(friendDraft),
        pendingBirth,
      })
    ) {
      return;
    }
    void startWaitingHatch();
  }, [friendDraft, pendingBirth, quota?.remaining, quota?.stillRemaining, screen, startWaitingHatch, world]);

  useEffect(() => {
    const remain = quota?.plazaToyRemaining ?? 0;
    const gained = remain > plazaToyRemainSeen.current;
    plazaToyRemainSeen.current = remain;
    if (!gained) return;
    const draft = plazaToyDraft ?? loadPlazaToyDraft();
    if (!draft || plazaToyBusy.current) return;
    if (
      shouldCommitPlazaToyDraft({
        remaining: remain,
        jobId: draft.jobId,
        pending: plazaToyBusy.current,
      })
    ) {
      void bakePlazaToyJob(draft.jobId!, draft.painted || draft.image);
      return;
    }
    if (
      !shouldHatchPlazaToyDraft({
        remaining: remain,
        hasDraft: true,
        pending: plazaToyBusy.current,
      }) ||
      draft.jobId
    ) {
      return;
    }
    void loadDraftImage(draft.image).then((image) => processPlazaToy(image));
  }, [bakePlazaToyJob, flash, holdPlazaToy, plazaToyDraft, processPlazaToy, quota?.plazaToyRemaining, speak]);

  useEffect(() => {
    if (!world || screen !== 'zoo') return;
    const jobId = loadReviveJob();
    if (!jobId || (quota?.remaining ?? 0) <= 0) return;
    const spec = specs.find((row) => row.hatchJobId === jobId && !row.drawing?.modelUrl);
    if (!spec) {
      clearReviveJob();
      return;
    }
    void reviveCreature(spec);
  }, [quota?.remaining, reviveCreature, screen, specs, world]);

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
      const pending: typeof records = [];
      for (const record of records) {
        if (!fitting.includes(record.spec.id)) continue;
        const next = { ...record, spec: { ...record.spec, worldId: home } };
        pending.push(next);
        if (here === home) {
          void game?.receiveMoved(next.spec);
          continue;
        }
        if (creatureWorldId(record.spec.worldId) === here) {
          game?.unloadCreature(record.spec.id);
        }
      }
      setMoveDest(null);
      setMoveFrom([]);
      setPickFrom(null);
      setFullOpen(false);
      flash(fitting.length === ids.length ? 'Зуфунята переехали.' : 'Часть переехала — там мало места.');
      await Promise.all(pending.map((row) => saveCreature(row, { cloud: 'later' })));
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

  const friendLawn = shouldKeepFriendLawn(
    quota?.stillRemaining,
    hasOwnCreature(specs),
    Boolean(friendDraft),
  );

  const overlayOpen =
    shopOpen ||
    logoutGate ||
    needsFirstDraw ||
    anotherDraw ||
    arcadeSettle ||
    friendInvite ||
    stillHint ||
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
    Boolean(busy) ||
    plazaToyDraw ||
    Boolean(plazaToyLook) ||
    plazaToyShop;

  const showSiteNav =
    Boolean(world) &&
    ready &&
    screen === 'zoo' &&
    (!overlayOpen || arcadeSettle || arcadeBuilding);

  return (
    <div className={cinema ? 'app is-cinema' : 'app'} ref={appRef}>
      <div className="stage" ref={stageRef} />
      {showSiteNav || (ready && world && !arcadeBuilding) ? (
        <div className="island-top">
          {ready && world ? (
            <HeartHud
              hearts={gardenJoy}
              code={zooCode}
              guest={guestOn}
              catchup={heartCatchup}
              onWorlds={leaveToWorlds}
              onHeart={arcadeBuilding ? undefined : () => likeGarden()}
              onShare={arcadeBuilding || guestOn ? undefined : () => void shareGarden()}
              onVitrine={
                arcadeBuilding
                  ? undefined
                  : () => {
                      setToast(null);
                      void refreshVitrine();
                      setScreen('vitrine');
                    }
              }
              onLogout={parentEntry.token ? () => setLogoutGate(true) : undefined}
            />
          ) : null}
        </div>
      ) : null}

      {logoutGate ? (
        <ParentGate
          question="Выйти из зоопарка? Потом снова войдёт взрослый."
          onCancel={() => setLogoutGate(false)}
          onPass={() => {
            setLogoutGate(false);
            trackAction('auth.logout');
            void endParentSession();
          }}
        />
      ) : null}

      {!world && !plazaCoversWorlds(screen, plazaToyDraw, Boolean(plazaToyLook) || plazaToyShop) ? (
        <WorldPicker
          worlds={pickerWorlds}
          onOpen={(id) => {
            if (isArcadeGardenId(id)) {
              setArcadeQuest(
                ensurePlayableArcadeQuest(
                  id,
                  arcadeLawnPlanted(loadDiyLayout(id).map((prop) => prop.model)),
                ),
              );
            }
            trackAction('world.pick', { world_id: id });
            setWorld(id);
          }}
          onError={flash}
          onVitrine={() => {
            setToast(null);
            void refreshVitrine();
            setScreen('vitrine');
          }}
          onPlaza={() => {
            setToast(null);
            greetPlazaLawn();
            setScreen('plaza');
          }}
        />
      ) : null}

      {screen === 'zoo' && world && friendInvite && !arcadeBuilding && !guestOn ? (
        <FriendInvite
          onCreate={() => startFriendDraw()}
          onClose={() => setFriendInvite(false)}
        />
      ) : null}

      {screen === 'zoo' && world && stillHint && !arcadeBuilding && !guestOn ? (
        <StillHint
          onDraw={() => {
            markStillHintSeen();
            setStillHint(false);
            if (!canCreate()) return;
            speak('draw');
            setScreen('draw');
          }}
          onClose={() => {
            markStillHintSeen();
            setStillHint(false);
          }}
        />
      ) : null}

      <HeartRain hearts={gardenJoy || gardenHearts} show={heartRain} brief={heartRainBrief} />
      {screen === 'vitrine' ? (
        <ZooVitrine
          cards={vitrineCards}
          mineId={guestOn ? null : shareId}
          hereId={guestVisit?.id}
          hasMore={vitrineMore}
          loading={vitrineBusy}
          onOpen={(id) => {
            const card = vitrineCards.find((row) => row.id === id);
            trackAction('vitrine.open_zoo', { share_id: id, code: card?.code || 0 });
            if (card?.mine) {
              goHome(card.world_id);
              return;
            }
            if (guestVisit && id === guestVisit.id) {
              setScreen('zoo');
              return;
            }
            void openVisit(id);
          }}
          onClose={() => {
            trackAction('vitrine.close');
            setScreen('zoo');
          }}
          onMore={loadMoreVitrine}
          onSearch={(query) => void refreshVitrine(query)}
        />
      ) : null}

      {screen === 'plaza' ? (
        <PlazaYard
          holdRev={plazaHoldRev}
          onLeave={() => {
            setScreen('zoo');
          }}
          onError={flash}
          onCredit={(remaining) => {
            setQuota((current) => {
              const next = applyRemaining(current, remaining);
              if (!next) return next;
              const quotaTotal = Math.max(next.quotaTotal, next.used + remaining);
              const stillQuota = stillQuotaOf(quotaTotal);
              return {
                ...next,
                quotaTotal,
                stillQuota,
                stillRemaining: Math.max(0, stillQuota - next.stillUsed),
              };
            });
            void refreshQuota();
          }}
          onDraw={() => {
            const home = readHomeWorld() || WORLD_AUTHORED;
            writeHomeWorld(home);
            setWorld(home);
            speak('draw');
            trackAction('first_draw.draw', { from: 'plaza' });
            setScreen('draw');
          }}
          onPhoto={() => {
            const home = readHomeWorld() || WORLD_AUTHORED;
            writeHomeWorld(home);
            setWorld(home);
            speak('photo');
            trackAction('photo.open', { from: 'plaza' });
            setScreen('zoo');
            fileInputRef.current?.click();
          }}
          hideHome={plazaToyDraw || Boolean(plazaToyLook) || plazaToyShop}
          onDrawToy={() => {
            setPlazaToyDraw(true);
            speak('plaza_draw');
            trackAction('plaza.toy_draw');
          }}
        />
      ) : null}

      {arcadeBuilding && arcadeQuest ? (
        <ArcadeCoach
          step={arcadeQuest.step}
          count={arcadeQuest.count}
          thumb={arcadeThumb}
          onLeave={leaveToWorlds}
        />
      ) : null}

      {screen === 'zoo' &&
      world &&
      (friendDraft || friendLawn) &&
      !arcadeOn &&
      !arcadeBuilding &&
      !friendInvite &&
      !shopOpen &&
      !showDrawPrompt &&
      !driving &&
      !offerSpec &&
      !guestOn ? (
        <WaitingFriend
          image={friendDraft?.image}
          lonely={friendDraft?.lonely}
          onTap={() => {
            if (friendDraft) {
              track('friend.resume');
              speak('shop');
              setShopOpen(true);
              return;
            }
            startFriendDraw();
          }}
        />
      ) : null}

      {screen === 'zoo' && ready && (
        <>
          {showHint && !driving && !needsFirstDraw && !anotherDraw && !arcadeBuilding && !arcadeSettle && !friendInvite && !friendDraft && !friendLawn && hasOwnCreature(specs) && (
            <div className="hint">Тапни зуфуньчика — он тебе ответит 👆</div>
          )}

          {showDrawPrompt ? (
            <FirstDrawPrompt
              again={anotherDraw && !needsFirstDraw}
              settle={arcadeSettle}
              onDraw={() => {
                if (arcadeSettle && arcadeQuest) {
                  const done = finishArcadeQuest(arcadeQuest);
                  saveArcadeQuest(done);
                  setArcadeQuest(done);
                  if ((stillRemainingNow() ?? 1) <= 0 && (remainingNow() ?? 0) <= 0) {
                    friendDrawRef.current = true;
                    setFriendDraw(true);
                  }
                }
                if (!canCreate()) return;
                speak('draw');
                setAnotherDraw(false);
                trackAction('first_draw.draw');
                setScreen('draw');
              }}
              onPhoto={() => {
                if (arcadeSettle && arcadeQuest) {
                  const done = finishArcadeQuest(arcadeQuest);
                  saveArcadeQuest(done);
                  setArcadeQuest(done);
                  if ((stillRemainingNow() ?? 1) <= 0 && (remainingNow() ?? 0) <= 0) {
                    friendDrawRef.current = true;
                    setFriendDraw(true);
                  }
                }
                if (!canCreate()) return;
                speak('photo');
                setAnotherDraw(false);
                trackAction('photo.open', { from: 'first_draw' });
                fileInputRef.current?.click();
              }}
              onClose={() => {
                if (arcadeSettle && arcadeQuest) {
                  const done = finishArcadeQuest(arcadeQuest);
                  saveArcadeQuest(done);
                  setArcadeQuest(done);
                }
                setAnotherDraw(false);
                setFirstDrawDismissed(true);
                trackAction('first_draw.close');
              }}
            />
          ) : null}

          {offerSpec || cardSpec || pickFrom || arcadeBuilding || arcadeSettle ? null : (
            <WalkPad onWalk={walkPad} />
          )}

          {offerSpec && !driving && !cardSpec && !guestOn && (
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
              onTeleport={
                !isParkResidentId(offerSpec.id) &&
                moveDestinations(world, quota?.worlds ?? []).length > 0
                  ? () => {
                      setPickFrom([offerSpec]);
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
          !guestOn &&
          (usesChildBuild(world) ||
            (isAuthoringStudio() && isHangingShell(kindOfWorld(world).shell) && !isDiyWorld(world))) &&
          gameRef.current ? (
            <DiyHud
              game={gameRef.current}
              building={diyBuild}
              arcade={arcadeBuilding || arcadeSettle}
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

          {offerSpec || cardSpec || pickFrom || arcadeBuilding || arcadeSettle ? null : (
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
                  track('zoo.overview');
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
                <span>{guestOn ? 'Зуфики' : 'Мои Зуфики'}</span>
              </button>

              {guestOn ? null : (
                <>
                  <button
                    className="big-button primary"
                    onClick={() => {
                      setActionsOpen(false);
                      if (!canCreate()) return;
                      speak('draw');
                      trackAction('draw.open', { from: 'toolbar' });
                      setScreen('draw');
                    }}
                  >
                    <HudIcon name="draw" />
                    <span>Нарисовать</span>
                    {quota && quota.used >= 1 ? (
                      <span className="draw-still-badge">{quota.stillRemaining}</span>
                    ) : null}
                  </button>

                  <button
                    className="big-button"
                    onClick={() => {
                      setActionsOpen(false);
                      if (!canCreate()) return;
                      speak('photo');
                      trackAction('photo.open', { from: 'toolbar' });
                      fileInputRef.current?.click();
                    }}
                  >
                    <HudIcon name="photo" />
                    <span>Фото рисунка</span>
                    {quota && quota.used >= 1 ? (
                      <span className="draw-still-badge">{quota.stillRemaining}</span>
                    ) : null}
                  </button>
                </>
              )}

              {guestOn ? null : (
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
              )}
            </div>
            <button
              className={`toolbar-fab${!actionsOpen ? ' is-waiting' : ''}`}
              type="button"
              aria-label={actionsOpen ? 'Закрыть' : 'Действия'}
              aria-expanded={actionsOpen}
              onClick={() => {
                setActionsOpen((open) => {
                  if (!open) {
                    speak('menu');
                    track('hud.actions');
                  }
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

      {(screen === 'draw' || plazaToyDraw) && (
        <DrawPad
          title={plazaToyDraw ? 'Нарисуй штуку для поляны' : undefined}
          doneLabel={plazaToyDraw ? 'Далее' : undefined}
          onCancel={() => {
            friendDrawRef.current = false;
            setFriendDraw(false);
            if (plazaToyDraw) {
              setPlazaToyDraw(false);
              setScreen('plaza');
              return;
            }
            setScreen('zoo');
          }}
          onDone={(canvas) => {
            if (plazaToyDrawRef.current) void processPlazaToy(canvas);
            else void processArtwork(canvas);
          }}
        />
      )}

      {plazaToyLook && !plazaToyShop ? (
        <PlazaToyPreview
          src={plazaToyLook.src}
          error={plazaToyLook.error}
          busy={plazaToyLook.baking}
          onNext={() => {
            if (!plazaToyLook.src || plazaToyLook.error) return;
            setPlazaToyShop(true);
          }}
          onRedraw={redrawPlazaToy}
        />
      ) : null}

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
            canDrawAnother={hatchCanDrawAnother(stillRemainingNow(), remainingNow())}
            stillRemaining={stillRemainingNow() ?? null}
            meshCooking={hatchLook.meshCooking !== false}
            onDrawAnother={drawAnotherFromHatch}
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

      {screen === 'roster' && guestOn && guestVisit ? (
        <GuestRoster
          shareId={guestVisit.id}
          creatures={guestVisit.creatures}
          thumbs={rosterThumbs}
          onHeart={(id) => likeCreature(id)}
          onClose={() => setScreen('zoo')}
        />
      ) : null}

      {screen === 'roster' && !guestOn && (
        <RosterSheet
          specs={specs}
          thumbs={rosterThumbs}
          onClose={() => setScreen('zoo')}
          onSelect={(spec) => {
            track('roster.select', { id: spec.id });
            setScreen('zoo');
            gameRef.current?.focusOn(spec.id);
            setCardSpec(spec);
          }}
          onGarden={(spec) => {
            track('roster.garden', { id: spec.id });
            setScreen('zoo');
            gameRef.current?.focusOn(spec.id);
          }}
          onDownloadGlb={(spec) => void saveCreatureGlb(spec)}
        />
      )}

      {plazaToyShop ? (
        <PlazaToySheet
          preview={plazaToyLook?.src ?? plazaToyDraft?.painted ?? plazaToyDraft?.image}
          remaining={quota?.plazaToyRemaining ?? 0}
          onClose={() => setPlazaToyShop(false)}
          onError={flash}
          onPlace={() => placePlazaToy()}
        />
      ) : null}

      {shopOpen ? (
        <PackSheet
          remaining={quota?.remaining ?? (Number.isFinite(previewEggs) ? previewEggs : 0)}
          friendPreview={friendDraft?.image}
          forRevive={Boolean(loadReviveJob())}
          onClose={() => {
            trackAction('shop.close');
            setShopOpen(false);
            if (friendDraft && (quota?.remaining ?? 0) <= 0 && !friendDraft.lonely) {
              const next = { ...friendDraft, lonely: true };
              saveFriendDraft(next);
              setFriendDraft(next);
              track('friend.decline');
              flash('Ему будет скучно');
            }
          }}
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
          onRevive={() => void reviveCreature(cardSpec)}
          onDownloadGlb={() => void saveCreatureGlb(cardSpec)}
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
          currentId={world ?? WORLD_AUTHORED}
          worlds={quota?.worlds ?? []}
          onClose={() => setFullOpen(false)}
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

      <InstallHint
        quiet={
          overlayOpen ||
          arcadeBuilding ||
          screen !== 'zoo' ||
          !world ||
          !ready
        }
      />

      {world ? (
      <div className="hud-chrome">
        {quota && screen === 'zoo' && ready && !guestOn && !moveDest && !fullOpen && !pickFrom ? (
          <QuotaDock remaining={quota.remaining} stillRemaining={quota.stillRemaining} showStills={quota.used >= 1} onTopUp={() => {
            speak('shop');
            trackAction('shop.topup');
            setShopOpen(true);
          }} />
        ) : screen === 'zoo' && ready && Number.isFinite(previewEggs) ? (
          <QuotaDock remaining={previewEggs} onTopUp={() => {
            speak('shop');
            trackAction('shop.topup');
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
