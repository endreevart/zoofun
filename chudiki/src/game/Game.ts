import * as THREE from 'three';
import { World } from './world/World';
import { Chudik } from './creatures/Chudik';
import {
  kindById,
  type ChudikSpec,
  type DrawingData,
} from './creatures/ChudikSpec';
import { isParkResidentId } from './creatures/residents';
import { resolveModelUrl } from './drawing/stylizeDrawing';
import { hasPersistedStill } from './drawing/portrait';
import { hatchMayOpen, drawingWaitsInEgg, staysInAlbum } from './creatures/hatch';
import { CameraRig } from './interaction/CameraRig';
import { TapController } from './interaction/TapController';
import { LayoutStudio, type LayoutKind } from './interaction/LayoutStudio';
import { PostFx } from './render/PostFx';
import { lookForShell, quality } from './render/quality';
import { Sparkles } from './effects/Sparkles';
import { EmotePuff } from './effects/EmotePuff';
import { getIslandAudio } from './audio/AudioBus';
import { assetUrl } from '../assetUrl';
import { PLAZA_EMOTES, plazaEmoteSrc, type PlazaEmoteId } from './plaza/plazaCopy';
import { claimCueOnce } from './audio/mix';
import { renderCatalogThumbs } from './assets/catalogThumbs';
import { captureRosterThumbs } from './assets/rosterThumbs';
import { mulberry32 } from './core/rng';
import { HERO_FOV } from './world/layout';
import { WORLD_AUTHORED, creatureVisibleOnWorld } from './world/gardens';
import { isDiyWorld, isHangingShell, type WorldShell } from './world/kinds';
import { fogDensityForShell } from './world/Sky';
import type { AuthoredProp } from './world/layoutAuthored';
import { tuning } from './render/tuning';
import { stylizedUniforms, updateStylizedSun } from './render/stylized';
import { updateWorldCurve } from './render/worldCurve';
import {
  hydrateZoo,
  loadVoiceRecording,
  saveCreature,
  deleteCreature,
  type StoredCreature,
} from './persistence/zooStore';
import { FeedingDirector } from './care/FeedingDirector';
import { feedSpots } from './care/feedingPlan';
import { track, setAnalyticsWorld } from '../analytics';
import { JoyAir } from './visits/joyAir';
import { joyFromHearts } from './visits/joy';
import { mayWriteFamilyZoo } from './visits/guestPersist';
import { CrystalField } from './garden/crystalField';
import { ChestField } from './garden/chestField';
import { RunPlinthField } from './garden/runPlinth';
import { gardenChestId, gardenRunId, gardenSmashId, type PlazaMound, type PlazaTicket } from './plaza/plazaDig';

export type CareState = {
  joy: number;
  feeding: boolean;
};

export type GameCallbacks = {
  /** A creature was tapped; the UI may show a name bubble or a hint. */
  onCreatureTapped?(spec: ChudikSpec): void;
  /** Long press: the UI opens the creature's card. */
  onCreatureHeld?(spec: ChudikSpec): void;
  onRosterChanged?(specs: ChudikSpec[]): void;
  onCareChanged?(state: CareState): void;
  onReady?(): void;
  /** Camera (or driven Zufik) is close enough to smash this crystal. */
  onNearCrystal?(id: string | null): void;
  /** Close enough to open the daily ЗУФАН chest. */
  onNearChest?(id: string | null): void;
  /** Close enough to start the lawn jump-run. */
  onNearRun?(id: string | null): void;
};

export type GameStartOptions = {
  onProgress?: (fraction: number) => void;
  world?: 'authored' | 'diy';
  worldId?: string;
  shell?: WorldShell;
  catalog?: string[];
  diyProps?: AuthoredProp[];
  onDiyPersist?: (props: AuthoredProp[]) => void;
  /** Child DIY stamps, including local meadow studio. */
  layoutKind?: LayoutKind;
  /** Guest walk: these records instead of the family zoo. */
  guestRecords?: StoredCreature[];
};

/**
 * Owns the renderer, the world and every living chudik, and is the single
 * surface the React layer talks to.
 */
export class Game {
  get audio() {
    return getIslandAudio();
  }

  private container: HTMLElement;
  private callbacks: GameCallbacks;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  // Everything below needs the loaded world, so it is built in start().
  private rig!: CameraRig;
  private taps!: TapController;
  private layout!: LayoutStudio;
  private world!: World;
  private currentWorldId = WORLD_AUTHORED;
  private planetCore: THREE.Object3D | null = null;
  private planetBackdrop: THREE.Object3D | null = null;
  private postFx!: PostFx;
  private sparkles = new Sparkles();
  private emotePuff = new EmotePuff();
  private emoteMaps = new Map<string, THREE.Texture>();
  private emoteLoader = new THREE.TextureLoader();
  private feeding = new FeedingDirector();
  private lastJoy = -1;
  private lastFeeding = false;
  private drivenId: string | null = null;
  /** Guest walk: never persist this lawn into the signed-in family's zoo. */
  private guestVisit = false;
  private crystals: CrystalField | null = null;
  private crystalMounds: PlazaMound[] = [];
  private crystalTickets: PlazaTicket[] = [];
  private lastNearCrystal: string | null | undefined;
  private chests: ChestField | null = null;
  private chest: PlazaMound | null = null;
  private lastNearChest: string | null | undefined;
  private runPlinths: RunPlinthField | null = null;
  private runMound: PlazaMound | null = null;
  private lastNearRun: string | null | undefined;
  private held = false;

  private creatures = new Map<string, Chudik>();
  /** Deferred postcards: in «Мои зуфики», not on the lawn until «В сад». */
  private album = new Map<string, ChudikSpec>();
  private recordings = new Map<string, { bytes: ArrayBuffer; mimeType: string }>();
  private untune: () => void = () => {};

  private clock = new THREE.Clock();
  private elapsed = 0;
  private frameHandle = 0;
  private lastFrameAt = 0;
  private shadowFrameElapsed = 0;
  private mobileShadowCadence = 0;
  private running = false;
  private disposed = false;
  private startAbort = new AbortController();
  private resizeObserver: ResizeObserver;

  private nameplate: HTMLDivElement;
  private nameplateTarget: Chudik | null = null;
  private joyAir: JoyAir | null = null;
  private creatureHearts = new Map<string, number>();
  private nameplateTimer = 0;
  private projected = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private tvFeed: {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } | null = null;

  constructor(container: HTMLElement, callbacks: GameCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    const look = quality();
    this.renderer = new THREE.WebGLRenderer({
      antialias: look.antialias,
      // high-performance on iOS picks a path that thermal-throttles into a
      // lost context. Default keeps the garden on screen longer.
      powerPreference: look.tier === 'low' ? 'default' : 'high-performance',
    });
    this.renderer.setPixelRatio(look.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // PostFx's grading pass owns tone mapping, using the curve fitted against
    // the reference painting. Leaving a renderer tone map on would apply a
    // second, unrelated shoulder on top of it.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = look.shadows;
    // Plain PCF on phones: cheap on tile GPUs and far less blocky than Basic.
    this.renderer.shadowMap.type = look.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.PCFShadowMap;
    // The authored garden is static. On phones, keep the same shadow map and
    // refresh moving creature shadows at 10 Hz instead of redrawing every
    // million-triangle caster on every 30 Hz frame.
    if (look.tier === 'low' && look.shadows && !forceFullShadowUpdates()) {
      this.mobileShadowCadence = 0.1;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
    }

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);

    // 46 degrees is the 24 mm lens the reviewed Cycles frame was composed on.
    this.camera = new THREE.PerspectiveCamera(HERO_FOV, 1, 0.4, 1400);
    this.scene.add(this.sparkles.mesh);
    this.preloadEmotes();

    this.nameplate = document.createElement('div');
    this.nameplate.className = 'nameplate';
    this.nameplate.style.opacity = '0';
    container.appendChild(this.nameplate);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    if (import.meta.env.DEV) {
      (window as unknown as { zoo: Game }).zoo = this;
    }

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerdown', this.onFirstSound, { capture: true });
  }

  /** The live zoo picture — not the HTML chrome. Used to share onto a TV. */
  get view(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /**
   * A smaller 16:9 copy of the garden. We only blit when a TV frame is sent,
   * not every animation frame.
   */
  startTvFeed(): HTMLCanvasElement {
    this.stopTvFeed();
    const canvas = document.createElement('canvas');
    canvas.className = 'tv-share-feed';
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) throw new Error('tv canvas failed');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.tvFeed = { canvas, ctx };
    this.grabTvFrame();
    document.body.appendChild(canvas);
    return canvas;
  }

  stopTvFeed() {
    if (!this.tvFeed) return;
    this.tvFeed.canvas.remove();
    this.tvFeed = null;
  }

  grabTvFrame() {
    const feed = this.tvFeed;
    if (!feed) return;
    const src = this.renderer.domElement;
    const sw = src.width;
    const sh = src.height;
    const dw = feed.canvas.width;
    const dh = feed.canvas.height;
    if (!sw || !sh) return;
    let sx = 0;
    let sy = 0;
    let cw = sw;
    let ch = sh;
    if (sw / sh > dw / dh) {
      cw = sh * (dw / dh);
      sx = (sw - cw) / 2;
    } else {
      ch = sw * (dh / dw);
      sy = (sh - ch) / 2;
    }
    feed.ctx.drawImage(src, sx, sy, cw, ch, 0, 0, dw, dh);
  }

  /**
   * Loads the nature models, builds the park, restores the child's zoo and
   * starts the loop.
   */
  async start(options: GameStartOptions = {}): Promise<void> {
    const onProgress = options.onProgress;
    this.currentWorldId = options.worldId ?? WORLD_AUTHORED;
    setAnalyticsWorld(this.currentWorldId);
    this.guestVisit = Boolean(options.guestRecords);
    const mode = options.world ?? (isDiyWorld(this.currentWorldId) ? 'diy' : 'authored');
    const storedPromise = this.guestVisit ? Promise.resolve([] as StoredCreature[]) : hydrateZoo();
    let world: World;
    try {
      world = await World.create(
        undefined,
        (done, total) => onProgress?.(total > 0 ? (done / total) * 0.92 : 0.92),
        {
          mode,
          shell: options.shell,
          catalog: options.catalog,
          diyProps: options.diyProps,
          signal: this.startAbort.signal,
          renderer: this.renderer,
        },
      );
    } catch (error) {
      if (this.disposed || this.startAbort.signal.aborted) return;
      throw error;
    }
    if (this.disposed) {
      world.dispose();
      return;
    }
    this.world = world;
    this.joyAir = new JoyAir();
    this.world.root.add(this.joyAir.group);
    this.crystals = new CrystalField(
      (x, z) => this.world.heightAt(x, z),
      isHangingShell(this.world.shell),
    );
    this.world.root.add(this.crystals.group);
    if (this.crystalMounds.length) this.crystals.setMounds(this.crystalMounds);
    if (this.crystalTickets.length) this.crystals.setTickets(this.crystalTickets);
    this.chests = new ChestField((x, z) => this.world.heightAt(x, z));
    this.world.root.add(this.chests.group);
    if (this.chest) this.chests.setChest(this.chest);
    this.runPlinths = new RunPlinthField((x, z) => this.world.heightAt(x, z));
    this.world.root.add(this.runPlinths.group);
    if (this.runMound) this.runPlinths.setMound(this.runMound);
    this.scene.add(this.world.root);
    this.scene.fog = this.world.root.userData.fog as THREE.FogExp2;
    this.planetCore = this.world.root.getObjectByName('planet-core') ?? null;
    this.planetBackdrop = this.world.root.getObjectByName('planet-backdrop') ?? null;

    const look = lookForShell(quality(), isHangingShell(this.world.shell));
    this.renderer.setPixelRatio(look.pixelRatio);
    this.renderer.shadowMap.type = look.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.PCFShadowMap;

    const canvas = this.renderer.domElement;
    this.rig = new CameraRig({
      domElement: canvas,
      camera: this.camera,
      groundHeightAt: (x, z) => this.world.heightAt(x, z),
    });
    this.rig.setAutoSpin(0);

    this.taps = new TapController({
      element: canvas,
      onTap: (x, y) => this.handleTap(x, y),
      onLongPress: (x, y) => this.handleLongPress(x, y),
    });

    const layoutKind: LayoutKind = options.layoutKind ?? (mode === 'diy' ? 'child' : 'studio');
    this.layout = new LayoutStudio({
      world: this.world,
      camera: this.camera,
      canvas,
      rig: this.rig,
      kind: layoutKind,
      onPersist: layoutKind === 'child' ? options.onDiyPersist : undefined,
    });
    // DIY opens in play so a tap can walk, wash, and feed. The hammer turns
    // stamping on. If layout stays enabled, creature taps never fire.

    this.postFx = new PostFx(
      this.renderer,
      this.scene,
      this.camera,
      look,
    );
    this.untune = tuning.subscribe((values) => {
      for (const chudik of this.creatures.values()) chudik.setScale(values.creatureScale);
    });
    this.resize();

    const stored = options.guestRecords
      ? options.guestRecords
      : (await storedPromise).filter((record) =>
          creatureVisibleOnWorld(record.spec.worldId, this.currentWorldId),
        );
    if (this.disposed) return;
    onProgress?.(0.97);

    this.spawnStored(stored, false);
    if (this.creatures.size > 0) {
      await this.loadRecordings([...this.creatures.keys()]);
    }
    if (this.disposed) return;
    // compileAsync walks the scene before a shadow pass exists. Programs then
    // cache without a live map, and the garden isle samples empty shadows.
    if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
    }
    // compileAsync can never return on hanging isles and on some phones after
    // a heavy vitrine. First frame still draws without it.
    if (!isHangingShell(this.world.shell) && quality().tier !== 'low') {
      try {
        await Promise.race([
          this.renderer.compileAsync(this.scene, this.camera),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error('compile-timeout')), 1800);
          }),
        ]);
      } catch {
        /* First frame still draws; compile is only to skip the hitch. */
      }
    }
    if (this.disposed) return;

    this.running = true;
    this.clock.start();
    this.loop();

    this.emitRoster();
    this.emitCare(true);
    onProgress?.(1);
    this.callbacks.onReady?.();
    if (import.meta.env.DEV) {
      (window as Window & { __game?: Game }).__game = this;
    }
  }

  private spawnStored(records: StoredCreature[], arrival: boolean) {
    const rng = mulberry32(4242);
    for (const record of records) {
      if (isParkResidentId(record.spec.id) || record.spec.origin === 'resident') continue;
      if (staysInAlbum(record.spec.drawing)) {
        this.album.set(record.spec.id, { ...record.spec, hatching: false });
        continue;
      }
      let spot = record.lastPosition
        ? new THREE.Vector3(record.lastPosition.x, 0, record.lastPosition.z)
        : this.world.findSpawnSpot(rng);
      if (!this.world.isWalkable(spot.x, spot.z)) {
        spot = this.world.findOpenSpot(rng, spot);
      }
      try {
        const chudik = this.instantiate(record.spec, spot, arrival);
        if (chudik.isHatching) this.showNameplate(chudik, 4.2);
      } catch {
        // A broken drawing must not keep the rest of the lawn from opening.
      }
    }
  }

  private instantiate(spec: ChudikSpec, spot: THREE.Vector3, arrival: boolean): Chudik {
    const drawing = spec.drawing?.modelUrl
      ? { ...spec.drawing, modelUrl: resolveModelUrl(spec.drawing.modelUrl) }
      : spec.drawing;
    let next = drawing === spec.drawing ? spec : { ...spec, drawing };
    if (
      drawingWaitsInEgg(next.drawing) &&
      !staysInAlbum(next.drawing) &&
      next.origin !== 'resident' &&
      !isParkResidentId(next.id)
    ) {
      next = { ...next, hatching: true };
    }
    const chudik = new Chudik(next, this.world, spot);
    chudik.setScale(tuning.get().creatureScale);
    this.world.root.add(chudik.object3D);
    this.creatures.set(spec.id, chudik);
    if (arrival) chudik.playArrival();
    if (next.hatching && spec.hatching !== true) {
      void this.persistFamily({
        spec: chudik.spec,
        lastPosition: { x: chudik.position.x, z: chudik.position.z },
      });
    }
    return chudik;
  }

  private persistFamily(record: StoredCreature): Promise<void> {
    if (!mayWriteFamilyZoo({ guestVisit: this.guestVisit })) return Promise.resolve();
    return saveCreature(record);
  }

  private forgetFamily(id: string): Promise<void> {
    if (!mayWriteFamilyZoo({ guestVisit: this.guestVisit })) return Promise.resolve();
    return deleteCreature(id);
  }

  /** Adds a brand new creature, saves it, and makes an entrance out of it. */
  async addCreature(spec: ChudikSpec): Promise<void> {
    const home = { ...spec, worldId: spec.worldId ?? this.currentWorldId };
    const spot = this.world.findSpawnSpot(Math.random);
    const chudik = this.instantiate(home, spot, true);

    await this.persistFamily({ spec: home, lastPosition: { x: spot.x, z: spot.z } });
    this.emitRoster();
    track('creature.add', { id: spec.id, kind: spec.kindId });

    const burstPoint = chudik.position.clone();
    burstPoint.y += chudik.height * 0.5;
    const egg = spec.hatching === true;
    this.sparkles.burst(
      burstPoint,
      [spec.bodyColor, spec.accentColor, '#ffffff', '#ffe066'],
      egg ? 22 : 54,
      egg ? 0.8 : 1.25,
    );

    if (egg) this.audio.playUiSound('tap');
    else {
      void this.audio.playCue('born').then((ok: boolean) => {
        if (!ok) this.audio.playUiSound('appear');
      });
    }
    if (egg) {
      this.rig.flyTo(chudik.position, 5.2, 1.1);
    }

    if (!egg) {
      window.setTimeout(() => this.playVoice(spec.id), 700);
    }
    this.showNameplate(chudik, egg ? 4.2 : 3.4);
  }

  /** Postcard without 3D: persist for the album, do not plant an egg. */
  async keepInAlbum(spec: ChudikSpec): Promise<void> {
    const drawing = spec.drawing ? { ...spec.drawing, meshDeferred: true } : spec.drawing;
    const home: ChudikSpec = {
      ...spec,
      hatching: false,
      drawing,
      worldId: spec.worldId ?? this.currentWorldId,
    };
    this.unloadCreature(home.id);
    this.album.set(home.id, home);
    await this.persistFamily({ spec: home });
    this.emitRoster();
  }

  /** Lawn egg when leftover 3D actually starts Tripo. */
  async plantEgg(spec: ChudikSpec): Promise<void> {
    this.album.delete(spec.id);
    const drawing = spec.drawing ? { ...spec.drawing, meshDeferred: false } : spec.drawing;
    const egg: ChudikSpec = {
      ...spec,
      hatching: true,
      drawing,
      worldId: spec.worldId ?? this.currentWorldId,
    };
    if (this.creatures.has(spec.id)) {
      const chudik = this.creatures.get(spec.id);
      if (chudik && drawing) chudik.spec.drawing = drawing;
      this.returnToEgg(spec.id);
      return;
    }
    await this.addCreature(egg);
  }

  hasHatching(): boolean {
    for (const chudik of this.creatures.values()) {
      if (chudik.isHatching) return true;
    }
    return false;
  }

  /** A care minigame finished: the garden agrees loudly. */
  celebrate(id: string): void {
    const chudik = this.creatures.get(id);
    if (!chudik || chudik.isHatching) return;
    chudik.fullness = 1;
    this.rig.flyTo(chudik.position, 5.4, 0.9);
    chudik.react();
    const burstPoint = chudik.position.clone();
    burstPoint.y += chudik.height * 0.6;
    this.sparkles.burst(
      burstPoint,
      [chudik.spec.bodyColor, chudik.spec.accentColor, '#ffffff', '#ffe066'],
      36,
      1.1,
    );
    this.audio.playUiSound('appear');
    this.showNameplate(chudik, 3);
    window.setTimeout(() => this.playVoice(id), 400);
  }

  async removeCreature(id: string): Promise<void> {
    if (isParkResidentId(id)) return;
    if (this.drivenId === id) this.releaseControl();
    const chudik = this.creatures.get(id);
    if (chudik) {
      if (this.nameplateTarget === chudik) this.hideNameplate();
      chudik.dispose();
      this.creatures.delete(id);
    }
    this.recordings.delete(id);
    this.audio.forgetRecording(id);
    this.album.delete(id);
    await this.forgetFamily(id);
    this.emitRoster();
    track('creature.remove', { id });
  }

  /** Take a creature off this lawn without deleting it. */
  unloadCreature(id: string): void {
    if (isParkResidentId(id)) return;
    if (this.drivenId === id) this.releaseControl();
    const chudik = this.creatures.get(id);
    if (chudik) {
      if (this.nameplateTarget === chudik) this.hideNameplate();
      chudik.dispose();
      this.creatures.delete(id);
    }
    this.emitRoster();
  }

  /** A creature that already lives in the zoo, arriving from another lawn. */
  async receiveMoved(spec: ChudikSpec): Promise<void> {
    if (isParkResidentId(spec.id)) return;
    const home = { ...spec, worldId: spec.worldId ?? this.currentWorldId };
    if (staysInAlbum(home.drawing)) {
      await this.keepInAlbum(home);
      return;
    }
    if (!this.running) {
      await this.persistFamily({ spec: home });
      return;
    }
    this.unloadCreature(spec.id);
    let spot = this.world.findSpawnSpot(Math.random);
    if (!this.world.isWalkable(spot.x, spot.z)) {
      spot = this.world.findOpenSpot(Math.random, spot);
    }
    this.instantiate(home, spot, true);
    await this.persistFamily({ spec: home, lastPosition: { x: spot.x, z: spot.z } });
    this.emitRoster();
  }

  /** OpenRouter painted; keep the egg and move the wait ring forward. */
  noteHatchPainted(id: string) {
    this.creatures.get(id)?.noteHatchPainted();
  }

  /** Eggs still waiting for Meshy after a reload. */
  /** Eggs still waiting for a GLB after a reload. */
  pendingHatches(): Array<{ id: string; jobId: string; drawing: DrawingData }> {
    const waiting: Array<{ id: string; jobId: string; drawing: DrawingData }> = [];
    for (const chudik of this.creatures.values()) {
      const jobId = chudik.spec.hatchJobId;
      const drawing = chudik.spec.drawing;
      if (!jobId || !drawing || drawing.modelUrl) continue;
      if (!chudik.isHatching) continue;
      if (staysInAlbum(drawing)) continue;
      waiting.push({ id: chudik.id, jobId, drawing });
    }
    return waiting;
  }

  /**
   * Keep the egg. `open` is only true when the GLB exists.
   */
  prepareHatch(
    id: string,
    patch: { drawing: DrawingData; name?: string; kindId?: string },
    options?: { open?: boolean },
  ) {
    const drawing = patch.drawing.modelUrl
      ? { ...patch.drawing, modelUrl: resolveModelUrl(patch.drawing.modelUrl) }
      : patch.drawing;
    const open = options?.open === true;
    const chudik = this.creatures.get(id);
    if (!chudik) {
      const held = this.album.get(id);
      if (!held) return;
      if (patch.name) held.name = patch.name;
      if (patch.kindId) held.kindId = patch.kindId;
      held.drawing = staysInAlbum(drawing) || drawing.meshDeferred
        ? { ...drawing, meshDeferred: true }
        : drawing;
      void this.persistFamily({ spec: held });
      this.emitRoster();
      return;
    }
    if (staysInAlbum(drawing) && !open) {
      void this.keepInAlbum({
        ...chudik.spec,
        name: patch.name || chudik.spec.name,
        kindId: patch.kindId || chudik.spec.kindId,
        drawing,
      });
      return;
    }
    if (!chudik.isHatching) {
      const current = chudik.spec.drawing;
      const next = {
        ...current,
        ...drawing,
        modelUrl: drawing.modelUrl || current?.modelUrl,
        postcardUrl: drawing.postcardUrl || current?.postcardUrl,
        placeholder: undefined,
      };
      const meshArrived = Boolean(next.modelUrl) && next.modelUrl !== current?.modelUrl;
      if (meshArrived) {
        void this.upgradeCreature(id, { drawing: next, name: patch.name, kindId: patch.kindId });
        return;
      }
      if (drawingWaitsInEgg(next)) {
        chudik.spec.drawing = next;
        this.returnToEgg(id);
        return;
      }
      if (hasPersistedStill(drawing)) {
        chudik.spec.drawing = next;
        void this.persistFamily({
          spec: chudik.spec,
          lastPosition: { x: chudik.position.x, z: chudik.position.z },
        });
        this.showNameplate(chudik, 3);
      }
      return;
    }
    if (patch.name) chudik.spec.name = patch.name;
    if (patch.kindId) chudik.spec.kindId = patch.kindId;
    chudik.spec.drawing = drawing;
    if (open && hatchMayOpen(drawing)) {
      chudik.prepareHatch(drawing);
    } else {
      chudik.noteHatchPainted();
    }
    void this.persistFamily({
      spec: chudik.spec,
      lastPosition: { x: chudik.position.x, z: chudik.position.z },
    });
    this.showNameplate(chudik, 3);
  }

  /** A cookie that never got a GLB sits back in the egg. */
  returnToEgg(id: string) {
    const chudik = this.creatures.get(id);
    if (!chudik?.returnToEgg()) return;
    if (this.drivenId === id) this.releaseControl();
    void this.persistFamily({
      spec: chudik.spec,
      lastPosition: { x: chudik.position.x, z: chudik.position.z },
    });
    this.emitRoster();
    this.showNameplate(chudik, 4.2);
  }

  /** Second OpenRouter still: the toy in the garden. Does not reopen the egg. */
  attachPostcard(id: string, postcardUrl: string) {
    const chudik = this.creatures.get(id);
    if (chudik?.spec.drawing) {
      chudik.spec.drawing = { ...chudik.spec.drawing, postcardUrl };
      void this.persistFamily({
        spec: chudik.spec,
        lastPosition: { x: chudik.position.x, z: chudik.position.z },
      });
      return;
    }
    const held = this.album.get(id);
    if (!held?.drawing) return;
    held.drawing = { ...held.drawing, postcardUrl };
    void this.persistFamily({ spec: held });
  }

  /** Swap the egg for the finished creature. */
  async finishHatch(id: string): Promise<void> {
    const chudik = this.creatures.get(id);
    if (!chudik?.isHatching) return;
    const drawing = chudik.takeHatch() ?? chudik.spec.drawing;
    if (!hatchMayOpen(drawing)) return;
    await this.upgradeCreature(id, { drawing, name: chudik.spec.name, kindId: chudik.spec.kindId });
  }

  /** Hatches the painted drawing onto a silhouette that is already in the zoo. */
  async upgradeCreature(
    id: string,
    patch: { drawing?: DrawingData; name?: string; kindId?: string },
  ): Promise<void> {
    const chudik = this.creatures.get(id);
    if (!chudik) return;
    if (patch.name) chudik.spec.name = patch.name;
    if (patch.kindId) chudik.spec.kindId = patch.kindId;
    if (patch.drawing) {
      chudik.replaceDrawing(patch.drawing);
      chudik.setScale(tuning.get().creatureScale);
      chudik.playArrival();
      const burstPoint = chudik.position.clone();
      burstPoint.y += chudik.height * 0.5;
      this.sparkles.burst(
        burstPoint,
        [chudik.spec.bodyColor, chudik.spec.accentColor, '#ffffff', '#ffe066'],
        40,
        1.1,
      );
      this.audio.playUiSound('appear');
    }
    await this.persistFamily({
      spec: chudik.spec,
      lastPosition: { x: chudik.position.x, z: chudik.position.z },
    });
    this.emitRoster();
    this.showNameplate(chudik, 3.4);
    if (patch.name) {
      window.setTimeout(() => this.playVoice(id), 500);
    }
  }

  /** Replaces a spec in place, e.g. after renaming. */
  async updateSpec(spec: ChudikSpec): Promise<void> {
    const chudik = this.creatures.get(spec.id);
    if (!chudik) {
      if (!this.album.has(spec.id)) return;
      this.album.set(spec.id, spec);
      await this.persistFamily({ spec });
      this.emitRoster();
      return;
    }
    Object.assign(chudik.spec, spec);
    await this.persistFamily({
      spec: chudik.spec,
      lastPosition: { x: chudik.position.x, z: chudik.position.z },
    });
    this.emitRoster();
  }

  getSpecs(): ChudikSpec[] {
    const byId = new Map<string, ChudikSpec>();
    for (const spec of this.album.values()) {
      if (isParkResidentId(spec.id) || spec.origin === 'resident') continue;
      byId.set(spec.id, spec);
    }
    for (const chudik of this.creatures.values()) {
      if (isParkResidentId(chudik.spec.id) || chudik.spec.origin === 'resident') continue;
      byId.set(chudik.spec.id, chudik.spec);
    }
    return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  hasRecording(id: string): boolean {
    return this.recordings.has(id);
  }

  getRecordedIds(): string[] {
    return [...this.recordings.keys()];
  }

  setRecording(id: string, recording: { bytes: ArrayBuffer; mimeType: string } | null) {
    if (recording) this.recordings.set(id, recording);
    else this.recordings.delete(id);
    this.audio.forgetRecording(id);
  }

  private async loadRecordings(ids: string[]) {
    for (const id of ids) {
      const recording = await loadVoiceRecording(id);
      if (recording) this.recordings.set(id, recording);
    }
  }

  /** Plays whatever voice this creature has: recorded first, synth otherwise. */
  playVoice(id: string): void {
    const chudik = this.creatures.get(id);
    if (!chudik) return;

    const pan = this.screenPan(chudik);
    const recording = this.recordings.get(id);

    if (recording) {
      void this.audio.playRecording(id, recording.bytes, { pan, gain: 1 }).catch(() => {
        this.audio.playVoice(chudik.spec.voice, { pan });
      });
    } else {
      this.audio.playVoice(chudik.spec.voice, { pan });
    }
  }

  focusOn(id: string): void {
    const chudik = this.creatures.get(id);
    if (!chudik) return;
    this.rig.flyTo(chudik.position, 4.2, 1.1);
    this.showNameplate(chudik, 3);
  }

  showWholeZoo(): void {
    this.releaseControl();
    this.rig.showWholeZoo();
  }

  setGardenHearts(hearts: number) {
    this.world?.setGardenJoy(joyFromHearts(hearts));
    this.joyAir?.setHearts(hearts);
  }

  setCreatureHearts(counts: Record<string, number>) {
    this.creatureHearts = new Map(Object.entries(counts));
    if (this.nameplateTarget) this.showNameplate(this.nameplateTarget, 2.4);
  }

  /** Third-person: camera sits behind this chudik, pad and WASD walk it. */
  controlCreature(id: string): boolean {
    const chudik = this.creatures.get(id);
    if (!chudik) return false;
    if (this.drivenId && this.drivenId !== id) this.releaseControl();
    this.drivenId = id;
    chudik.setDriven(true);
    this.rig.follow(chudik.position);
    track('creature.walk', { id });
    this.applyWalk();
    this.showNameplate(chudik, 2.4);
    return true;
  }

  releaseControl(): void {
    if (!this.drivenId) return;
    const chudik = this.creatures.get(this.drivenId);
    chudik?.setDriven(false);
    this.drivenId = null;
    this.rig.follow(null);
    this.applyWalk();
  }

  get isDriving(): boolean {
    return this.drivenId !== null;
  }

  get drivenCreatureId(): string | null {
    return this.drivenId;
  }

  /** Freeze the 3D garden while a 2D overlay is playing. */
  setHeld(held: boolean) {
    if (this.held === held) return;
    this.held = held;
    if (held) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
      return;
    }
    if (this.running && document.visibilityState !== 'hidden') {
      this.clock.getDelta();
      this.loop();
    }
  }

  /** Send everyone to the harvest baskets. An empty DIY lawn gathers in the meadow. */
  feedZoo(): boolean {
    if (this.feeding.active) return true;
    this.releaseControl();
    if (this.creatures.size === 0) return false;
    const hungry = [...this.creatures.values()].filter((chudik) => !chudik.isHatching);
    if (hungry.length === 0) return false;
    const meadow = this.world.findSpawnSpot(() => 0.37);
    const feeders = feedSpots(this.world.feederSpots(), { x: meadow.x, z: meadow.z });
    this.feeding.start(hungry, feeders, this.world);
    this.showWholeZoo();
    track('creature.feed', { count: this.creatures.size });
    for (const feeder of feeders) {
      const burst = new THREE.Vector3(feeder.x, this.world.heightAt(feeder.x, feeder.z) + 1.15, feeder.z);
      this.sparkles.burst(burst, ['#ffe066', '#ffb347', '#fff7d6'], 36, 1.15);
    }
    this.emitCare(true);
    return true;
  }

  getCare(): CareState {
    return { joy: this.joy(), feeding: this.feeding.active };
  }

  private joy(): number {
    if (this.creatures.size === 0) return 1;
    let sum = 0;
    for (const chudik of this.creatures.values()) sum += chudik.fullness;
    return sum / this.creatures.size;
  }

  private walkPad = { forward: 0, right: 0 };
  private walkKeys = { forward: 0, right: 0 };

  /** On-screen D-pad. Merged with WASD so they can be held together. */
  setWalkPad(forward: number, right: number): void {
    this.walkPad.forward = forward;
    this.walkPad.right = right;
    this.applyWalk();
  }

  setWalkKeys(forward: number, right: number): void {
    this.walkKeys.forward = forward;
    this.walkKeys.right = right;
    this.applyWalk();
  }

  private applyWalk() {
    if (!this.rig) return;
    const forward = THREE.MathUtils.clamp(this.walkPad.forward + this.walkKeys.forward, -1, 1);
    const right = THREE.MathUtils.clamp(this.walkPad.right + this.walkKeys.right, -1, 1);
    if (this.drivenId) {
      this.rig.setWalk(0, 0);
      this.creatures.get(this.drivenId)?.setDriveInput(forward, right, this.rig.yawAngle);
      return;
    }
    this.rig.setWalk(forward, right);
  }

  /** Same pictograms as the shared lawn. Local puff only — no plaza post. */
  playEmote(id: string, kind: PlazaEmoteId): void {
    const chudik = this.creatures.get(id);
    if (!chudik || chudik.isHatching) return;
    chudik.react();
    this.audio.playSfx(kind);
    this.withEmoteMap(kind, (map) => {
      const live = this.creatures.get(id);
      if (!live) return;
      const origin = live.position.clone();
      origin.y += live.height * 0.95;
      const power = THREE.MathUtils.clamp(live.height / 1.5, 0.55, 1.25);
      this.emotePuff.burst(this.scene, map, origin, power);
    });
  }

  private preloadEmotes() {
    for (const item of PLAZA_EMOTES) {
      this.emoteLoader.load(assetUrl(item.src), (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        this.emoteMaps.set(item.id, texture);
      });
    }
  }

  private withEmoteMap(kind: PlazaEmoteId, then: (map: THREE.Texture) => void) {
    const ready = this.emoteMaps.get(kind);
    if (ready) {
      then(ready);
      return;
    }
    this.emoteLoader.load(assetUrl(plazaEmoteSrc(kind)), (texture) => {
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      this.emoteMaps.set(kind, texture);
      then(texture);
    });
  }

  /** Makes a creature react and speak, as if tapped. */
  poke(id: string): void {
    const chudik = this.creatures.get(id);
    if (!chudik) return;
    if (chudik.isHatching) {
      const open = chudik.nudgeHatch();
      if (claimCueOnce('egg')) void this.audio.playCue('egg');
      else this.audio.playUiSound('tap');
      this.sparkles.burst(
        chudik.position.clone().setY(chudik.position.y + chudik.height * 0.55),
        [chudik.spec.accentColor, '#ffffff', '#ffe066'],
        10,
        0.45,
      );
      this.showNameplate(chudik, 2.4);
      if (open) void this.finishHatch(id);
      return;
    }
    chudik.react();
    this.playVoice(id);
    track('creature.view', { id, kind: chudik.spec.kindId });
    this.sparkles.burst(
      chudik.position.clone().setY(chudik.position.y + chudik.height * 0.7),
      [chudik.spec.accentColor, '#ffffff', '#ffe066'],
      14,
      0.7,
    );
    this.showNameplate(chudik, 2.2);
  }

  get layoutStudio(): LayoutStudio {
    return this.layout;
  }

  saveDiyGarden(): AuthoredProp[] {
    return this.layout.flushPersist();
  }

  setDiyBuild(on: boolean) {
    this.layout.setEnabled(on);
    if (on) this.layout.setTool('place');
  }

  setCrystalMounds(mounds: readonly PlazaMound[]) {
    this.crystalMounds = mounds.slice();
    this.crystals?.setMounds(this.crystalMounds);
    this.lastNearCrystal = undefined;
    this.emitNearCrystal();
  }

  setCrystalTickets(tickets: readonly PlazaTicket[]) {
    this.crystalTickets = tickets.slice();
    this.crystals?.setTickets(this.crystalTickets);
  }

  setChest(chest: PlazaMound | null) {
    this.chest = chest;
    this.chests?.setChest(this.chest);
    this.lastNearChest = undefined;
    this.emitNearChest();
  }

  setRunPlinth(mound: PlazaMound | null) {
    this.runMound = mound;
    this.runPlinths?.setMound(this.runMound);
    this.lastNearRun = undefined;
    this.emitNearRun();
  }

  lookAtChest() {
    if (!this.rig || !this.chest) return;
    this.rig.flyTo(new THREE.Vector3(this.chest.x, 0.4, this.chest.z), 9.4, 0.9);
  }

  get library() {
    return this.world.library;
  }

  get worldShell() {
    return this.world.shell;
  }

  captureCatalogThumbs(names: readonly string[]): Record<string, string> {
    if (!this.world) return {};
    return renderCatalogThumbs(this.world.library, names, this.renderer);
  }

  private handleTap(clientX: number, clientY: number) {
    if (this.layout.getState().enabled) return;
    void this.audio.unlock();
    const chudik = this.pick(clientX, clientY);
    if (!chudik) return;

    this.poke(chudik.id);
    if (!chudik.isHatching) this.callbacks.onCreatureTapped?.(chudik.spec);
  }

  private handleLongPress(clientX: number, clientY: number) {
    if (this.layout.getState().enabled) return;
    const chudik = this.pick(clientX, clientY);
    if (!chudik || chudik.isHatching) return;
    void this.audio.unlock();
    this.callbacks.onCreatureHeld?.(chudik.spec);
  }

  /**
   * Finds the creature under the finger. Falls back to the nearest creature
   * within a generous radius, because small fingers miss small targets.
   */
  private pick(clientX: number, clientY: number): Chudik | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    this.pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const roots = [...this.creatures.values()].map((c) => c.object3D);
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      const id = hit.object.userData.chudikId as string | undefined;
      if (id && this.creatures.has(id)) return this.creatures.get(id)!;
    }

    let best: Chudik | null = null;
    let bestDistance = 52;
    for (const chudik of this.creatures.values()) {
      this.projected.copy(chudik.position);
      this.projected.y += chudik.height * 0.5;
      this.projected.project(this.camera);
      if (this.projected.z > 1) continue;

      const sx = ((this.projected.x + 1) / 2) * rect.width;
      const sy = ((-this.projected.y + 1) / 2) * rect.height;
      const distance = Math.hypot(sx - x, sy - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = chudik;
      }
    }
    return best;
  }

  /** Stereo position of a creature, so sound comes from where it stands. */
  private screenPan(chudik: Chudik): number {
    this.projected.copy(chudik.position).project(this.camera);
    return THREE.MathUtils.clamp(this.projected.x, -1, 1) * 0.7;
  }

  private showNameplate(chudik: Chudik, seconds: number) {
    const kind = kindById(chudik.spec.kindId);
    const hatching = chudik.isHatching;
    const emoji = hatching ? '🥚' : kind.emoji;
    const label = hatching ? 'Появляется' : kind.label;
    const birth = hatching
      ? '<span class="nameplate-birth" aria-hidden="true"><span class="nameplate-birth-spin"></span></span>'
      : '';
    this.nameplate.classList.toggle('nameplate--hatching', hatching);
    const hearts = this.creatureHearts.get(chudik.spec.id) ?? 0;
    const tail = hearts > 0 ? `<span class="nameplate-heart">♥ ${hearts}</span>` : '';
    this.nameplate.innerHTML = `${birth}<span class="nameplate-row"><span class="nameplate-emoji">${emoji}</span><span class="nameplate-text"><strong>${escapeHtml(
      chudik.spec.name,
    )}</strong><em>${escapeHtml(label)}</em>${tail}</span></span>`;
    this.nameplateTarget = chudik;
    this.nameplateTimer = hatching ? Number.POSITIVE_INFINITY : seconds;
    this.nameplate.style.opacity = '1';
  }

  private hideNameplate() {
    this.nameplateTarget = null;
    this.nameplateTimer = 0;
    this.nameplate.classList.remove('nameplate--hatching');
    this.nameplate.style.opacity = '0';
  }

  private updateNameplate(dt: number) {
    if (!this.nameplateTarget) return;

    const pinned = this.nameplateTarget.isHatching;
    if (!pinned) {
      this.nameplateTimer -= dt;
      if (this.nameplateTimer <= 0) {
        this.hideNameplate();
        return;
      }
    }

    const chudik = this.nameplateTarget;
    this.projected.copy(chudik.position);
    this.projected.y += chudik.height + (pinned ? 0.95 : 0.45);
    this.projected.project(this.camera);

    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = ((this.projected.x + 1) / 2) * rect.width;
    const sy = ((-this.projected.y + 1) / 2) * rect.height;

    this.nameplate.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`;
    const fading = !pinned && this.nameplateTimer < 0.5;
    this.nameplate.style.opacity = fading ? String(this.nameplateTimer * 2) : '1';
  }

  private loop = () => {
    this.frameHandle = 0;
    if (!this.running || this.held) return;
    if (document.visibilityState === 'hidden') return;
    this.frameHandle = requestAnimationFrame(this.loop);

    const cap = quality().maxFps;
    if (cap > 0) {
      const now = performance.now();
      if (now - this.lastFrameAt < 1000 / cap - 1) return;
      this.lastFrameAt = now;
    }

    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.elapsed += dt;

    this.rig.setHoldIdle(this.hasHatching());
    this.rig.update(dt);
    this.world.update(this.elapsed);
    this.sparkles.update(dt);
    this.emotePuff.update(dt);
    this.joyAir?.update(dt);
    this.crystals?.update(this.elapsed);
    this.chests?.update(this.elapsed);
    this.runPlinths?.update(this.elapsed);

    // The stylized shading and the light shafts both need the key light
    // expressed relative to this frame's camera.
    updateStylizedSun(this.world.sun, this.camera);
    const planetAmount = updateWorldCurve(
      this.rig.orbitDistance,
      this.camera,
      this.scene.fog instanceof THREE.FogExp2 ? this.scene.fog : null,
      tuning.get().fogDensity * (fogDensityForShell(this.world.shell) / 0.0042),
      this.planetCore,
      this.planetBackdrop,
    );
    this.world.setNatureFrustumCulling(planetAmount < 0.001);
    this.postFx.updateSun(this.world.sun, this.camera);

    if (this.drivenId) {
      const driver = this.creatures.get(this.drivenId);
      if (!driver) this.releaseControl();
      else driver.setDriveInput(
        THREE.MathUtils.clamp(this.walkPad.forward + this.walkKeys.forward, -1, 1),
        THREE.MathUtils.clamp(this.walkPad.right + this.walkKeys.right, -1, 1),
        this.rig.yawAngle,
      );
    }

    const roster = [...this.creatures.values()];
    const fed = this.feeding.update(dt, roster);
    for (const id of fed) {
      const chudik = this.creatures.get(id);
      if (!chudik) continue;
      const burst = chudik.position.clone();
      burst.y += chudik.height * 0.45;
      this.sparkles.burst(burst, [chudik.spec.bodyColor, '#ffe066', '#fff'], 18, 0.7);
    }
    for (const chudik of roster) {
      chudik.update(dt, this.elapsed, this.camera.position);
      if (chudik.wantsHatch()) void this.finishHatch(chudik.id);
    }
    if (!this.feeding.active) {
      for (const chudik of roster) {
        chudik.fullness = Math.max(0.22, chudik.fullness - dt / 240);
      }
    }
    this.emitCare();
    this.emitNearCrystal();
    this.emitNearChest();
    this.emitNearRun();

    this.updateNameplate(dt);
    if (this.mobileShadowCadence > 0) {
      this.shadowFrameElapsed += dt;
      if (this.shadowFrameElapsed >= this.mobileShadowCadence) {
        this.shadowFrameElapsed %= this.mobileShadowCadence;
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    this.postFx.render(dt);
    if (this.tvFeed) this.grabTvFrame();
  };

  private resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.postFx?.setSize(width, height);
  }

  private emitRoster() {
    this.callbacks.onRosterChanged?.(this.getSpecs());
  }

  private emitNearCrystal() {
    if (!this.rig || this.crystalMounds.length === 0) {
      if (this.lastNearCrystal) {
        this.lastNearCrystal = null;
        this.callbacks.onNearCrystal?.(null);
      }
      return;
    }
    let x = this.rig.lookX;
    let z = this.rig.lookZ;
    if (this.drivenId) {
      const driver = this.creatures.get(this.drivenId);
      if (driver) {
        x = driver.position.x;
        z = driver.position.z;
      }
    }
    const id = gardenSmashId(x, z, this.rig.orbitDistance, this.crystalMounds);
    if (id === this.lastNearCrystal) return;
    this.lastNearCrystal = id;
    this.callbacks.onNearCrystal?.(id);
  }

  private emitNearChest() {
    if (!this.rig || !this.chest) {
      if (this.lastNearChest) {
        this.lastNearChest = null;
        this.callbacks.onNearChest?.(null);
      }
      return;
    }
    let x = this.rig.lookX;
    let z = this.rig.lookZ;
    if (this.drivenId) {
      const driver = this.creatures.get(this.drivenId);
      if (driver) {
        x = driver.position.x;
        z = driver.position.z;
      }
    }
    const id = gardenChestId(x, z, this.rig.orbitDistance, this.chest);
    if (id === this.lastNearChest) return;
    this.lastNearChest = id;
    this.callbacks.onNearChest?.(id);
  }

  private emitNearRun() {
    if (!this.rig || !this.runMound) {
      if (this.lastNearRun) {
        this.lastNearRun = null;
        this.callbacks.onNearRun?.(null);
      }
      return;
    }
    let x = this.rig.lookX;
    let z = this.rig.lookZ;
    if (this.drivenId) {
      const driver = this.creatures.get(this.drivenId);
      if (driver) {
        x = driver.position.x;
        z = driver.position.z;
      }
    }
    const id = gardenRunId(x, z, this.rig.orbitDistance, this.runMound);
    if (id === this.lastNearRun) return;
    this.lastNearRun = id;
    this.callbacks.onNearRun?.(id);
  }

  private emitCare(force = false) {
    const joy = this.joy();
    const feeding = this.feeding.active;
    if (
      !force &&
      feeding === this.lastFeeding &&
      Math.abs(joy - this.lastJoy) < 0.02
    ) {
      return;
    }
    this.lastJoy = joy;
    this.lastFeeding = feeding;
    this.callbacks.onCareChanged?.({ joy, feeding });
  }

  private onFirstSound = () => {
    void this.audio.unlock();
  };

  private onVisibilityChange = () => {
    this.audio.setGardenPaused(document.visibilityState === 'hidden');
    if (document.visibilityState === 'hidden') {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
      this.walkPad = { forward: 0, right: 0 };
      this.walkKeys = { forward: 0, right: 0 };
      this.applyWalk();
      this.rig?.releaseGesture();
      // Remember where everyone was standing, so the zoo feels continuous.
      for (const chudik of this.creatures.values()) {
        void this.persistFamily({
          spec: chudik.spec,
          lastPosition: { x: chudik.position.x, z: chudik.position.z },
        });
      }
      return;
    }
    if (this.running && !this.held) {
      this.clock.getDelta();
      this.loop();
    }
  };

  private onContextLost = (event: Event) => {
    event.preventDefault();
    try {
      sessionStorage.setItem('zooo:webgl-safe', '1');
    } catch {
      /* Safari private mode can deny storage. */
    }
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  };

  private onContextRestored = () => {
    window.location.reload();
  };

  /** Cream-studio stills for «Мои Зуфики». Drawing portraits stay preferred. */
  captureRosterThumbs(): Record<string, string> {
    return captureRosterThumbs(this.renderer, this.creatures.values());
  }

  /** One lawn snapshot when the wire zoo dropped the drawing still. */
  captureStill(id: string): string | null {
    const chudik = this.creatures.get(id);
    if (!chudik) return null;
    return captureRosterThumbs(this.renderer, [chudik])[id] ?? null;
  }

  /** Renders a single frame; used by the preview after a drawing is processed. */
  renderOnce() {
    if (this.mobileShadowCadence > 0) this.renderer.shadowMap.needsUpdate = true;
    this.postFx.render(1 / 60);
    if (this.tvFeed) this.grabTvFrame();
  }

  /** Dev-only snapshot of the render state, used when verifying visuals. */
  debugInfo() {
    let castShadow = 0;
    let receiveShadow = 0;
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.castShadow) castShadow++;
      if (mesh.receiveShadow) receiveShadow++;
    });

    const shadowCamera = this.world.sun.shadow.camera;
    return {
      quality: quality().tier,
      shadowMapEnabled: this.renderer.shadowMap.enabled,
      toneMapping: this.renderer.toneMapping,
      castShadow,
      receiveShadow,
      shadowFrustum: {
        left: shadowCamera.left,
        right: shadowCamera.right,
        top: shadowCamera.top,
        bottom: shadowCamera.bottom,
      },
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      creatures: this.creatures.size,
      cameraPosition: this.camera.position.toArray().map((v) => Number(v.toFixed(2))),
      sunPosition: this.world.sun.position.toArray().map((v) => Number(v.toFixed(2))),
      shafts: this.postFx.shaftDebug(),
      stylized: {
        rim: stylizedUniforms.rimStrength.value,
        translucency: stylizedUniforms.translucency.value,
      },
      shell: this.world.shell,
      sunCast: this.world.sun.castShadow,
      shadowType: this.renderer.shadowMap.type,
      bias: this.world.sun.shadow.bias,
      normalBias: this.world.sun.shadow.normalBias,
      mapSize: this.world.sun.shadow.mapSize.x,
      catcher: (() => {
        const mesh = this.scene.getObjectByName('lawn-shadows') as THREE.Mesh | undefined;
        if (!mesh) return null;
        const pos = new THREE.Vector3();
        mesh.getWorldPosition(pos);
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        return {
          receive: mesh.receiveShadow,
          visible: mesh.visible,
          y: Number(pos.y.toFixed(3)),
          parent: mesh.parent?.name ?? null,
          material: material?.type,
        };
      })(),
      casterNames: (() => {
        const names: string[] = [];
        this.scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh && mesh.castShadow) names.push(mesh.name || mesh.type);
        });
        return names.slice(0, 40);
      })(),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.startAbort.abort();
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerdown', this.onFirstSound, { capture: true });
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.resizeObserver.disconnect();
    this.layout?.dispose();
    this.taps?.dispose();
    this.rig?.dispose();
    this.untune();
    this.postFx?.dispose();
    this.releaseControl();
    this.feeding.cancel([...this.creatures.values()]);
    for (const chudik of this.creatures.values()) chudik.dispose();
    this.creatures.clear();
    this.album.clear();
    this.sparkles.dispose();
    this.emotePuff.dispose();
    for (const map of this.emoteMaps.values()) map.dispose();
    this.emoteMaps.clear();
    this.joyAir?.dispose();
    this.crystals?.dispose();
    this.crystals = null;
    this.chests?.dispose();
    this.chests = null;
    this.runPlinths?.dispose();
    this.runPlinths = null;
    this.world?.dispose();
    this.stopTvFeed();
    this.audio.setGardenPaused(true);
    this.nameplate.remove();
    try {
      this.renderer.forceContextLoss();
    } catch {
      /* Safari may already have dropped the only WebGL context. */
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Dev-only A/B switch used by the repeatable mobile benchmark. */
function forceFullShadowUpdates(): boolean {
  try {
    return import.meta.env.DEV && new URLSearchParams(window.location.search).get('shadows') === 'full';
  } catch {
    return false;
  }
}
