import * as THREE from 'three';
import { World } from './world/World';
import { Chudik } from './creatures/Chudik';
import { assetUrl } from '../assetUrl';
import {
  generateSpec,
  kindById,
  type ChudikSpec,
  type DrawingData,
} from './creatures/ChudikSpec';
import { CameraRig } from './interaction/CameraRig';
import { TapController } from './interaction/TapController';
import { LayoutStudio } from './interaction/LayoutStudio';
import { PostFx } from './render/PostFx';
import { quality } from './render/quality';
import { Sparkles } from './effects/Sparkles';
import { AudioBus } from './audio/AudioBus';
import { mulberry32 } from './core/rng';
import { HERO_FOV, MEADOW_SPAWN } from './world/layout';
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
import { track } from '../analytics';

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
};

/**
 * Owns the renderer, the world and every living chudik, and is the single
 * surface the React layer talks to.
 */
export class Game {
  readonly audio = new AudioBus();

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
  private planetCore: THREE.Object3D | null = null;
  private planetBackdrop: THREE.Object3D | null = null;
  private postFx!: PostFx;
  private sparkles = new Sparkles();
  private feeding = new FeedingDirector();
  private lastJoy = -1;
  private lastFeeding = false;
  private drivenId: string | null = null;

  private creatures = new Map<string, Chudik>();
  private recordings = new Map<string, { bytes: ArrayBuffer; mimeType: string }>();
  private untune: () => void = () => {};

  private clock = new THREE.Clock();
  private elapsed = 0;
  private frameHandle = 0;
  private running = false;
  private resizeObserver: ResizeObserver;

  private nameplate: HTMLDivElement;
  private nameplateTarget: Chudik | null = null;
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
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(look.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // PostFx's grading pass owns tone mapping, using the curve fitted against
    // the reference painting. Leaving a renderer tone map on would apply a
    // second, unrelated shoulder on top of it.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = look.shadows;
    this.renderer.shadowMap.type = look.softShadows
      ? THREE.PCFSoftShadowMap
      : THREE.BasicShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    // 46 degrees is the 24 mm lens the reviewed Cycles frame was composed on.
    this.camera = new THREE.PerspectiveCamera(HERO_FOV, 1, 0.4, 1400);
    this.scene.add(this.sparkles.mesh);

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
   * starts the loop. An empty park is the starting state: children fill it.
   */
  async start(onProgress?: (fraction: number) => void): Promise<void> {
    const storedPromise = hydrateZoo();
    this.world = await World.create(undefined, (done, total) =>
      onProgress?.(total > 0 ? (done / total) * 0.92 : 0.92),
    );
    this.scene.add(this.world.root);
    this.scene.fog = this.world.root.userData.fog as THREE.FogExp2;
    this.planetCore = this.world.root.getObjectByName('planet-core') ?? null;
    this.planetBackdrop = this.world.root.getObjectByName('planet-backdrop') ?? null;

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

    this.layout = new LayoutStudio({
      world: this.world,
      camera: this.camera,
      canvas,
      rig: this.rig,
    });

    this.postFx = new PostFx(this.renderer, this.scene, this.camera);
    this.untune = tuning.subscribe((values) => {
      for (const chudik of this.creatures.values()) chudik.setScale(values.creatureScale);
    });
    this.resize();

    const stored = await storedPromise;
    onProgress?.(0.97);

    this.spawnStored(stored, false);
    await this.maybeSeedGladeCreature();
    if (this.creatures.size > 0) {
      await this.loadRecordings([...this.creatures.keys()]);
    }

    this.running = true;
    this.clock.start();
    this.loop();

    this.emitRoster();
    this.emitCare(true);
    onProgress?.(1);
    this.callbacks.onReady?.();
  }

  private spawnStored(records: StoredCreature[], arrival: boolean) {
    const rng = mulberry32(4242);
    for (const record of records) {
      let spot = record.lastPosition
        ? new THREE.Vector3(record.lastPosition.x, 0, record.lastPosition.z)
        : this.world.findOpenSpot(rng);
      if (!this.world.isWalkable(spot.x, spot.z)) {
        spot = this.world.findOpenSpot(rng, spot);
      }
      this.instantiate(record.spec, spot, arrival);
    }
  }

  private instantiate(spec: ChudikSpec, spot: THREE.Vector3, arrival: boolean): Chudik {
    const chudik = new Chudik(spec, this.world, spot);
    chudik.setScale(tuning.get().creatureScale);
    this.world.root.add(chudik.object3D);
    this.creatures.set(spec.id, chudik);
    if (arrival) chudik.playArrival();
    return chudik;
  }

  /** Adds a brand new creature, saves it, and makes an entrance out of it. */
  async addCreature(spec: ChudikSpec): Promise<void> {
    const spot = this.world.findOpenSpot(Math.random, MEADOW_SPAWN);
    const chudik = this.instantiate(spec, spot, true);

    await saveCreature({ spec, lastPosition: { x: spot.x, z: spot.z } });
    this.emitRoster();
    track('creature.add', { id: spec.id, name: spec.name, kind: spec.kindId });

    const burstPoint = chudik.position.clone();
    burstPoint.y += chudik.height * 0.5;
    const egg = spec.hatching === true;
    this.sparkles.burst(
      burstPoint,
      [spec.bodyColor, spec.accentColor, '#ffffff', '#ffe066'],
      egg ? 22 : 54,
      egg ? 0.8 : 1.25,
    );

    this.audio.playUiSound(egg ? 'tap' : 'appear');
    // Stay on the current zoo view. Flying onto the spawn made every later
    // orbit revolve around that one creature instead of the park.

    if (!egg) {
      window.setTimeout(() => this.playVoice(spec.id), 700);
    }
    this.showNameplate(chudik, egg ? 4.2 : 3.4);
  }

  /**
   * One Meshy doodle on the meadow so the 3D path is visible without drawing
   * again. Skipped once that creature already lives in the zoo.
   */
  private async maybeSeedGladeCreature(): Promise<void> {
    const id = 'drawing_meshy_glade';
    if (this.creatures.has(id)) return;
    const spec = generateSpec({
      id,
      name: 'Корона',
      seed: 20260903,
      kindId: 'flyer',
      origin: 'drawing',
      drawing: {
        contour: [
          [-0.22, -0.42],
          [0.22, -0.42],
          [0.22, 0.42],
          [-0.22, 0.42],
        ],
        textureUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
        aspect: 1,
        eyeAnchor: [0, 0.12],
        eyeSpacing: 0.18,
        eyeRadius: 0.07,
        sideColor: '#f4e4c1',
        accentColor: '#f5d76e',
        painted: true,
        modelUrl: assetUrl('models/creatures/krakozyabra.glb'),
      },
    });
    const spot = this.world.findOpenSpot(Math.random, MEADOW_SPAWN);
    this.instantiate(spec, spot, true);
    await saveCreature({ spec, lastPosition: { x: spot.x, z: spot.z } });
    this.emitRoster();
  }

  async removeCreature(id: string): Promise<void> {
    if (this.drivenId === id) this.releaseControl();
    const chudik = this.creatures.get(id);
    if (chudik) {
      if (this.nameplateTarget === chudik) this.hideNameplate();
      chudik.dispose();
      this.creatures.delete(id);
    }
    this.recordings.delete(id);
    this.audio.forgetRecording(id);
    await deleteCreature(id);
    this.emitRoster();
    track('creature.remove', { id });
  }

  /** Keep the egg; remember the finished puppet for the next tap or the wait. */
  prepareHatch(
    id: string,
    patch: { drawing: DrawingData; name?: string; kindId?: string },
  ) {
    const chudik = this.creatures.get(id);
    if (!chudik?.isHatching) return;
    if (patch.name) chudik.spec.name = patch.name;
    if (patch.kindId) chudik.spec.kindId = patch.kindId;
    chudik.spec.drawing = patch.drawing;
    chudik.prepareHatch(patch.drawing);
    void saveCreature({
      spec: chudik.spec,
      lastPosition: { x: chudik.position.x, z: chudik.position.z },
    });
    this.showNameplate(chudik, 3);
  }

  /** Swap the egg for the finished creature. */
  async finishHatch(id: string): Promise<void> {
    const chudik = this.creatures.get(id);
    if (!chudik?.isHatching) return;
    const drawing = chudik.takeHatch() ?? chudik.spec.drawing;
    if (!drawing || drawing.placeholder) return;
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
    await saveCreature({
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
    if (!chudik) return;
    Object.assign(chudik.spec, spec);
    await saveCreature({
      spec: chudik.spec,
      lastPosition: { x: chudik.position.x, z: chudik.position.z },
    });
    this.emitRoster();
  }

  getSpecs(): ChudikSpec[] {
    return [...this.creatures.values()]
      .map((c) => c.spec)
      .sort((a, b) => a.createdAt - b.createdAt);
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

  /** Send everyone to the harvest baskets and pull the camera back so it shows. */
  feedZoo(): boolean {
    if (this.feeding.active) return true;
    this.releaseControl();
    const feeders = this.world.feederSpots();
    if (feeders.length === 0 || this.creatures.size === 0) return false;
    const hungry = [...this.creatures.values()].filter((chudik) => !chudik.isHatching);
    if (hungry.length === 0) return false;
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

  /** Makes a creature react and speak, as if tapped. */
  poke(id: string): void {
    const chudik = this.creatures.get(id);
    if (!chudik) return;
    if (chudik.isHatching) {
      const open = chudik.nudgeHatch();
      this.audio.playUiSound('tap');
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
    track('creature.view', { id, name: chudik.spec.name });
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

  get library() {
    return this.world.library;
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
    const emoji = chudik.isHatching ? '🥚' : kind.emoji;
    const label = chudik.isHatching ? 'Постучи' : kind.label;
    this.nameplate.innerHTML = `<span class="nameplate-emoji">${emoji}</span><span class="nameplate-text"><strong>${escapeHtml(
      chudik.spec.name,
    )}</strong><em>${escapeHtml(label)}</em></span>`;
    this.nameplateTarget = chudik;
    this.nameplateTimer = seconds;
    this.nameplate.style.opacity = '1';
  }

  private hideNameplate() {
    this.nameplateTarget = null;
    this.nameplateTimer = 0;
    this.nameplate.style.opacity = '0';
  }

  private updateNameplate(dt: number) {
    if (!this.nameplateTarget) return;

    this.nameplateTimer -= dt;
    if (this.nameplateTimer <= 0) {
      this.hideNameplate();
      return;
    }

    const chudik = this.nameplateTarget;
    this.projected.copy(chudik.position);
    this.projected.y += chudik.height + 0.45;
    this.projected.project(this.camera);

    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = ((this.projected.x + 1) / 2) * rect.width;
    const sy = ((-this.projected.y + 1) / 2) * rect.height;

    this.nameplate.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`;
    this.nameplate.style.opacity = this.nameplateTimer < 0.5 ? String(this.nameplateTimer * 2) : '1';
  }

  private loop = () => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.elapsed += dt;

    this.rig.update(dt);
    this.world.update(this.elapsed);
    this.sparkles.update(dt);

    // The stylized shading and the light shafts both need the key light
    // expressed relative to this frame's camera.
    updateStylizedSun(this.world.sun, this.camera);
    updateWorldCurve(
      this.rig.orbitDistance,
      this.camera,
      this.scene.fog instanceof THREE.FogExp2 ? this.scene.fog : null,
      tuning.get().fogDensity,
      this.planetCore,
      this.planetBackdrop,
    );
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

    this.updateNameplate(dt);
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
    if (document.visibilityState !== 'hidden') return;
    // Remember where everyone was standing, so the zoo feels continuous.
    for (const chudik of this.creatures.values()) {
      void saveCreature({
        spec: chudik.spec,
        lastPosition: { x: chudik.position.x, z: chudik.position.z },
      });
    }
  };

  /** Renders a single frame; used by the preview after a drawing is processed. */
  renderOnce() {
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
    };
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerdown', this.onFirstSound, { capture: true });
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
    this.sparkles.dispose();
    this.stopTvFeed();
    this.audio.dispose();
    this.nameplate.remove();
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
