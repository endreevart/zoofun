import * as THREE from 'three';
import type { CameraRig } from './CameraRig';
import { skipPlaceFinger } from './cameraPinch';
import { holdDragOffset } from './diyMove';
import type { World } from '../world/World';
import {
  catalogModels,
  childCatalogModels,
  defaultStamp,
  downloadLayout,
  ensureGardenGate,
  GRASS_MODELS,
  DIY_PROP_CAP,
  saveLayout,
  type AuthoredPath,
  type AuthoredProp,
  type AuthoredSpawn,
  type LayoutDocument,
} from '../world/layoutAuthored';
import {
  appendStrokePoint,
  clampPathWidth,
  DEFAULT_PATH_WIDTH,
  nearestPathId,
  shouldCommitStroke,
} from '../world/layoutPaths';
import {
  clampSpawnRadius,
  DEFAULT_SPAWN_RADIUS,
  nearestSpawnId,
} from '../world/layoutSpawns';
import { clearPlazaHold, isPlazaToyModel, type PlazaLawnToy } from '../plaza/plazaToy';

export type LayoutTool = 'place' | 'select' | 'path' | 'spawn';

export type LayoutState = {
  enabled: boolean;
  tool: LayoutTool;
  catalog: string[];
  activeModel: string;
  /** Child DIY: the toy in hand. Null means look around, do not stamp. */
  holdingModel: string | null;
  selectedId: string | null;
  selectedPathId: string | null;
  selectedSpawnId: string | null;
  pathWidth: number;
  spawnRadius: number;
  count: number;
  pathCount: number;
  spawnCount: number;
  dirty: boolean;
  cap: number;
  moveArmed: boolean;
};

export type LayoutKind = 'studio' | 'child';

/** Finger moved farther than this: orbit the map, do not stamp. */
const CHILD_TAP_SLOP = 24;

/**
 * Adult layout editor: stamp, drag, rotate and scale the zoo's props, then
 * save a JSON we can freeze into the game later.
 */
export class LayoutStudio {
  private world: World;
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLElement;
  private rig: CameraRig;

  private enabled = false;
  private tool: LayoutTool = 'place';
  private activeModel = 'sunlit-canopy';
  private holdingModel: string | null = null;
  private selectedId: string | null = null;
  private selectedPathId: string | null = null;
  private selectedSpawnId: string | null = null;
  private moveArmed = false;
  private moveHold: {
    origin: { x: number; z: number } | null;
    startX: number;
    startZ: number;
  } | null = null;
  private pathWidth = DEFAULT_PATH_WIDTH;
  private spawnRadius = DEFAULT_SPAWN_RADIUS;
  private dirty = false;
  private dragging = false;
  private draggingSpawn = false;
  private drawing = false;
  private stroke: [number, number][] = [];
  private pendingPathPick: string | null = null;
  private kind: LayoutKind = 'studio';
  private propCap = Number.POSITIVE_INFINITY;
  private onPersist: ((props: AuthoredProp[]) => void) | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private marker: THREE.Mesh;
  private brush: THREE.Mesh;
  private listeners = new Set<() => void>();
  private placedListeners = new Set<(model: string) => void>();
  private missedListeners = new Set<() => void>();
  private nextId = 1;
  private nextPathId = 1;
  private nextSpawnId = 1;
  private rememberTimer = 0;
  private pendingPlace: { startX: number; startY: number; x: number; z: number } | null =
    null;
  private touchCount = 0;
  private capturedId: number | null = null;
  private toyStills = new Map<string, string>();
  private toyHeights = new Map<string, number>();
  private toyModelUrls = new Map<string, string>();
  private toyMeshStatus = new Map<string, string>();

  constructor(options: {
    world: World;
    camera: THREE.PerspectiveCamera;
    canvas: HTMLElement;
    rig: CameraRig;
    kind?: LayoutKind;
    onPersist?: (props: AuthoredProp[]) => void;
    propCap?: number;
  }) {
    this.world = options.world;
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.rig = options.rig;
    this.kind = options.kind ?? 'studio';
    this.onPersist = options.onPersist ?? null;
    this.propCap = options.propCap ?? (this.kind === 'child' ? DIY_PROP_CAP : Number.POSITIVE_INFINITY);

    const catalog = this.catalogNames();
    if (catalog.length) this.activeModel = catalog[0];

    this.marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffdd55, depthTest: false }),
    );
    this.marker.rotation.x = Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 20;
    this.world.root.add(this.marker);

    this.brush = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xf0b24a,
        depthTest: false,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    this.brush.rotation.x = -Math.PI / 2;
    this.brush.visible = false;
    this.brush.renderOrder = 21;
    this.world.root.add(this.brush);

    for (const prop of this.world.authoredProps) {
      const n = Number(prop.id.replace(/\D/g, '').slice(0, 6));
      if (n >= this.nextId) this.nextId = n + 1;
    }
    for (const path of this.world.paintedPaths) {
      const n = Number(path.id.replace(/\D/g, '').slice(0, 6));
      if (n >= this.nextPathId) this.nextPathId = n + 1;
    }
    for (const zone of this.world.spawnZones) {
      const n = Number(zone.id.replace(/\D/g, '').slice(0, 6));
      if (n >= this.nextSpawnId) this.nextSpawnId = n + 1;
    }

    window.addEventListener('pagehide', this.flushRemember);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onPlaced(listener: (model: string) => void) {
    this.placedListeners.add(listener);
    return () => {
      this.placedListeners.delete(listener);
    };
  }

  onMissed(listener: () => void) {
    this.missedListeners.add(listener);
    return () => {
      this.missedListeners.delete(listener);
    };
  }

  private notifyMissed() {
    for (const listener of this.missedListeners) listener();
  }

  private catalogNames(): string[] {
    return this.kind === 'child'
      ? childCatalogModels(this.world.library, this.world.shell)
      : catalogModels(this.world.library, this.world.shell);
  }

  getState(): LayoutState {
    return {
      enabled: this.enabled,
      tool: this.tool,
      catalog: this.catalogNames(),
      activeModel: this.activeModel,
      holdingModel: this.kind === 'child' ? this.holdingModel : this.activeModel,
      selectedId: this.selectedId,
      selectedPathId: this.selectedPathId,
      selectedSpawnId: this.selectedSpawnId,
      pathWidth: this.pathWidth,
      spawnRadius: this.spawnRadius,
      count: this.world.authoredProps.length,
      pathCount: this.world.paintedPaths.length,
      spawnCount: this.world.spawnZones.length,
      dirty: this.dirty,
      cap: Number.isFinite(this.propCap) ? this.propCap : 0,
      moveArmed: this.moveArmed,
    };
  }

  selected(): AuthoredProp | null {
    return this.world.authoredProps.find((prop) => prop.id === this.selectedId) ?? null;
  }

  selectedPath(): AuthoredPath | null {
    return this.world.paintedPaths.find((path) => path.id === this.selectedPathId) ?? null;
  }

  selectedSpawn(): AuthoredSpawn | null {
    return this.world.spawnZones.find((zone) => zone.id === this.selectedSpawnId) ?? null;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.rig.setPrimaryOrbit(this.kind === 'child' ? true : !on);
    this.marker.visible = on && !!this.selectedId;
    this.brush.visible = false;
    this.pendingPlace = null;
    if (this.kind === 'child' && !on) {
      this.holdingModel = null;
      this.moveArmed = false;
      this.moveHold = null;
    }
    // Egg zones are an authoring aid; a child should never see the rings.
    this.world.spawnLayer.setVisible(on && this.kind === 'studio');
    if (on) {
      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      this.canvas.addEventListener('pointermove', this.onHover);
      this.canvas.addEventListener('pointerup', this.onPointerUp);
      this.canvas.addEventListener('pointercancel', this.onPointerUp);
      window.addEventListener('touchstart', this.onTouchStart, { capture: true, passive: true });
      window.addEventListener('touchend', this.onTouchEnd, { capture: true, passive: true });
      window.addEventListener('touchcancel', this.onTouchEnd, { capture: true, passive: true });
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKeyUp);
    } else {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas.removeEventListener('pointermove', this.onHover);
      this.canvas.removeEventListener('pointerup', this.onPointerUp);
      this.canvas.removeEventListener('pointercancel', this.onPointerUp);
      if (this.hoverRaf) window.cancelAnimationFrame(this.hoverRaf);
      this.hoverRaf = 0;
      this.hoverEvent = null;
      window.removeEventListener('touchstart', this.onTouchStart, true);
      window.removeEventListener('touchend', this.onTouchEnd, true);
      window.removeEventListener('touchcancel', this.onTouchEnd, true);
      this.releaseCapture();
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('keyup', this.onKeyUp);
      this.rig.setPrimaryOrbit(true);
      this.cancelStroke();
      this.stopDrag();
      this.canvas.style.cursor = '';
    }
    this.emit();
  }

  setTool(tool: LayoutTool) {
    if (this.kind === 'child' && (tool === 'path' || tool === 'spawn')) return;
    this.tool = tool;
    if (tool !== 'path') {
      this.cancelStroke();
      this.brush.visible = false;
      this.canvas.style.cursor = '';
    } else {
      this.selectedId = null;
      this.syncMarker();
      this.canvas.style.cursor = 'crosshair';
    }
    if (tool === 'spawn') {
      this.selectedId = null;
      this.selectedPathId = null;
      this.world.pathLayer.setSelected(null);
      this.syncMarker();
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.selectedSpawnId = null;
      this.world.spawnLayer.setSelected(null);
    }
    this.emit();
  }

  setPathWidth(width: number) {
    this.pathWidth = clampPathWidth(width);
    const selected = this.selectedPath();
    if (selected) {
      this.world.patchAuthoredPath(selected.id, { width: this.pathWidth });
      this.world.pathLayer.setSelected(selected.id);
      this.markDirty();
    }
    this.emit();
  }

  setSpawnRadius(radius: number) {
    this.spawnRadius = clampSpawnRadius(radius);
    const selected = this.selectedSpawn();
    if (selected) {
      this.world.patchAuthoredSpawn(selected.id, { radius: this.spawnRadius });
      this.world.spawnLayer.setSelected(selected.id);
      this.markDirty();
    }
    this.emit();
  }

  setActiveModel(model: string) {
    if (this.kind === 'child' && GRASS_MODELS.has(model)) return;
    if (this.kind === 'child') {
      this.holdingModel = this.holdingModel === model ? null : model;
      if (this.holdingModel) this.activeModel = this.holdingModel;
      this.selectedId = null;
      this.moveArmed = false;
      this.pendingPlace = null;
      this.syncMarker();
      if (!this.holdingModel) this.brush.visible = false;
      this.emit();
      return;
    }
    this.activeModel = model;
    this.setTool('place');
  }

  /** Arcade / guided hold: always keep this model in hand. */
  forceHold(model: string) {
    if (this.kind === 'child' && GRASS_MODELS.has(model)) return;
    this.holdingModel = model;
    this.activeModel = model;
    this.selectedId = null;
    this.moveArmed = false;
    this.pendingPlace = null;
    this.setTool('place');
    this.syncMarker();
    const y = this.world.groundAt(0, 2);
    this.showDropGhost(new THREE.Vector3(0, y, 2));
    this.emit();
  }

  /** Hold a paid drawing-toy. It is not in the Idyllic catalog. */
  holdToy(model: string, stillUrl: string, height: number, modelUrl?: string) {
    if (!isPlazaToyModel(model)) return;
    this.toyStills.set(model, stillUrl);
    this.toyHeights.set(model, height);
    if (modelUrl) this.toyModelUrls.set(model, modelUrl);
    this.holdingModel = model;
    this.activeModel = model;
    this.selectedId = null;
    this.moveArmed = false;
    this.pendingPlace = null;
    this.setTool('place');
    this.syncMarker();
    const y = this.world.groundAt(0, 2);
    this.showDropGhost(new THREE.Vector3(0, y, 2));
    this.emit();
  }

  noteToys(toys: PlazaLawnToy[]) {
    for (const toy of toys) {
      if (toy.still_url) this.toyStills.set(toy.model, toy.still_url);
      this.toyHeights.set(toy.model, toy.height);
      if (toy.model_url) this.toyModelUrls.set(toy.model, toy.model_url);
      if (toy.mesh_status) this.toyMeshStatus.set(toy.model, toy.mesh_status);
      for (const prop of this.world.authoredProps) {
        if (prop.model !== toy.model) continue;
        const nextUrl = toy.model_url || prop.modelUrl;
        const nextStill = toy.still_url || prop.stillUrl;
        const nextMesh = toy.mesh_status || prop.meshStatus;
        if (prop.modelUrl === nextUrl && prop.stillUrl === nextStill && prop.meshStatus === nextMesh) {
          continue;
        }
        this.world.patchAuthored(prop.id, {
          modelUrl: nextUrl,
          stillUrl: nextStill,
          meshStatus: nextMesh,
        });
      }
    }
  }

  /** Hold the move button, then drag: the toy follows the finger. */
  beginMoveHold() {
    if (this.kind !== 'child' || !this.selectedId) return;
    const selected = this.selected();
    if (!selected) return;
    this.moveArmed = true;
    this.dragging = true;
    this.holdingModel = null;
    this.brush.visible = false;
    this.rig.setPrimaryOrbit(false);
    this.moveHold = { origin: null, startX: selected.x, startZ: selected.z };
    this.emit();
  }

  dragMoveHold(clientX: number, clientY: number) {
    if (!this.moveHold || !this.selectedId) return;
    const point = this.groundPoint(clientX, clientY);
    if (!point) return;
    if (!this.moveHold.origin) {
      this.moveHold.origin = { x: point.x, z: point.z };
      return;
    }
    const next = holdDragOffset(
      this.moveHold.origin,
      { x: this.moveHold.startX, z: this.moveHold.startZ },
      { x: point.x, z: point.z },
    );
    this.moveSelected(next.x, next.z);
  }

  endMoveHold() {
    if (!this.moveHold && !this.moveArmed) return;
    this.moveHold = null;
    this.dragging = false;
    this.moveArmed = false;
    if (this.kind === 'child' && this.enabled) this.rig.setPrimaryOrbit(true);
    this.emit();
  }

  selectedScreen(): { x: number; y: number } | null {
    const selected = this.selected();
    if (!selected || !this.enabled) return null;
    const y =
      this.stampWorldY(selected) + Math.max(0.5, selected.height * 0.55);
    const point = new THREE.Vector3(selected.x, y, selected.z).project(this.camera);
    if (point.z > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (point.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-point.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  rotateSelected(delta: number) {
    const selected = this.selected();
    if (!selected) return;
    this.patchSelected({ rotationY: selected.rotationY + delta });
  }

  scaleSelected(factor: number) {
    const zone = this.selectedSpawn();
    if (zone) {
      this.setSpawnRadius(zone.radius * factor);
      return;
    }
    const path = this.selectedPath();
    if (path) {
      this.setPathWidth(path.width * factor);
      return;
    }
    const selected = this.selected();
    if (!selected) return;
    this.patchSelected({ height: Math.max(0.08, selected.height * factor) });
  }

  deleteSelected() {
    this.removeSelected();
  }

  save() {
    this.flushRemember();
    downloadLayout(this.world.authoredProps, this.world.paintedPaths, this.world.spawnZones, this.world.shell);
    this.dirty = false;
    this.emit();
  }

  /** Write the current garden now (local cache / account), without downloading JSON. */
  flushPersist(): AuthoredProp[] {
    this.flushRemember();
    this.emit();
    return this.world.authoredProps;
  }

  remember() {
    if (this.kind === 'child') {
      this.onPersist?.(this.world.authoredProps);
      this.dirty = false;
      this.emit();
      return;
    }
    saveLayout(this.world.authoredProps, this.world.paintedPaths, this.world.spawnZones, this.world.shell);
    this.dirty = false;
    this.emit();
  }

  importDocument(doc: LayoutDocument) {
    if (!doc.props) return;
    const gated =
      this.kind === 'child' || this.world.shell !== 'garden' ? doc.props : ensureGardenGate(doc.props);
    this.world.applyAuthored(gated);
    if (this.kind === 'studio') {
      this.world.applyAuthoredPaths(doc.paths);
      this.world.applyAuthoredSpawns(doc.spawns);
    }
    this.clearSelection();
    this.remember();
  }

  resetProcedural() {
    this.world.applyAuthored(this.world.proceduralProps.map((prop) => ({ ...prop })));
    this.world.applyAuthoredPaths(
      this.world.frozenPaths.map((path) => ({
        ...path,
        points: path.points.map((point) => [point[0], point[1]] as [number, number]),
      })),
    );
    this.world.applyAuthoredSpawns(this.world.frozenSpawns.map((zone) => ({ ...zone })));
    this.clearSelection();
    this.remember();
  }

  private clearSelection() {
    this.selectedId = null;
    this.selectedPathId = null;
    this.selectedSpawnId = null;
    this.moveArmed = false;
    this.moveHold = null;
    this.world.pathLayer.setSelected(null);
    this.world.spawnLayer.setSelected(null);
    this.syncMarker();
  }

  dispose() {
    window.removeEventListener('pagehide', this.flushRemember);
    window.clearTimeout(this.rememberTimer);
    this.setEnabled(false);
    this.marker.removeFromParent();
    (this.marker.material as THREE.Material).dispose();
    this.marker.geometry.dispose();
    this.brush.removeFromParent();
    (this.brush.material as THREE.Material).dispose();
    this.brush.geometry.dispose();
  }

  private markDirty() {
    this.dirty = true;
    window.clearTimeout(this.rememberTimer);
    this.rememberTimer = window.setTimeout(() => this.remember(), 280);
  }

  private flushRemember = () => {
    window.clearTimeout(this.rememberTimer);
    this.rememberTimer = 0;
    if (this.kind === 'child') {
      this.onPersist?.(this.world.authoredProps);
      this.dirty = false;
      return;
    }
    saveLayout(this.world.authoredProps, this.world.paintedPaths, this.world.spawnZones, this.world.shell);
    this.dirty = false;
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private orbitHold = false;
  private hoverRaf = 0;
  private hoverEvent: PointerEvent | null = null;

  private capturePointer(pointerId: number) {
    this.capturedId = pointerId;
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      this.capturedId = null;
    }
  }

  private releaseCapture() {
    if (this.capturedId == null) return;
    try {
      this.canvas.releasePointerCapture(this.capturedId);
    } catch {
      /* never captured, or already released */
    }
    this.capturedId = null;
  }

  private onTouchStart = (event: TouchEvent) => {
    this.touchCount = event.touches.length;
    if (event.touches.length < 2) return;
    this.pendingPlace = null;
    this.releaseCapture();
    this.stopDrag();
  };

  private onTouchEnd = (event: TouchEvent) => {
    this.touchCount = event.touches.length;
    if (event.touches.length > 0) return;
    this.releaseCapture();
    this.stopDrag();
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    if (event.code === 'Space') {
      this.orbitHold = false;
      this.rig.setPrimaryOrbit(false);
    }
  };

  private onPointerDown = (event: PointerEvent) => {
    if (!this.enabled || event.button !== 0 || this.orbitHold) return;
    if (skipPlaceFinger(event.pointerType, event.isPrimary, this.touchCount)) return;

    const point = this.groundPoint(event.clientX, event.clientY);
    if (!point) return;

    if (this.tool === 'path') {
      // Drag always paints. A short click without a stroke selects a path.
      this.pendingPathPick =
        this.pickPath(event.clientX, event.clientY) ??
        nearestPathId(this.world.paintedPaths, point.x, point.z);
      this.startStroke(point.x, point.z, event.pointerId);
      return;
    }

    if (this.tool === 'spawn') {
      // Only zones answer here, so a tap next to a bush marks a spot for an
      // egg instead of grabbing the bush.
      const hit = nearestSpawnId(this.world.spawnZones, point.x, point.z);
      if (hit) this.selectSpawn(hit);
      else this.stampSpawn(point.x, point.z);
      this.draggingSpawn = true;
      this.capturePointer(event.pointerId);
      this.emit();
      return;
    }

    if (this.kind === 'child') {
      this.onChildPointerDown(event, point);
      return;
    }

    const picked = this.pickProp(event.clientX, event.clientY);
    if (picked) {
      this.pendingPlace = null;
      this.selectedPathId = null;
      this.world.pathLayer.setSelected(null);
      this.selectedId = picked;
      this.dragging = true;
      this.tool = 'select';
      this.syncMarker();
      this.capturePointer(event.pointerId);
      this.emit();
      return;
    }

    const pathHit = this.pickPath(event.clientX, event.clientY) ?? nearestPathId(
      this.world.paintedPaths,
      point.x,
      point.z,
    );
    if (pathHit) {
      this.selectPath(pathHit);
      this.emit();
      return;
    }

    if (this.tool === 'place') {
      this.stamp(point.x, point.z, point.y);
      return;
    }

    this.selectedId = null;
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);
    this.syncMarker();
    this.emit();
  };

  private onChildPointerDown(event: PointerEvent, point: THREE.Vector3) {
    this.pendingPlace = null;
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);

    if (this.moveArmed && this.selectedId) {
      const other = this.pickProp(event.clientX, event.clientY);
      if (other && other !== this.selectedId) {
        this.selectChildProp(other);
        return;
      }
      this.dragging = true;
      this.tool = 'select';
      this.rig.setPrimaryOrbit(false);
      this.moveSelected(point.x, point.z, point.y);
      this.capturePointer(event.pointerId);
      this.emit();
      return;
    }

    if (!this.holdingModel) {
      const picked = this.pickProp(event.clientX, event.clientY);
      if (picked) {
        this.selectChildProp(picked);
        return;
      }
      this.clearSelection();
      this.emit();
      return;
    }

    this.pendingPlace = {
      startX: event.clientX,
      startY: event.clientY,
      x: point.x,
      z: point.z,
    };
    this.showDropGhost(point);
  }

  private selectChildProp(id: string) {
    this.holdingModel = null;
    this.brush.visible = false;
    this.selectedId = id;
    this.moveArmed = false;
    this.dragging = false;
    this.tool = 'select';
    this.syncMarker();
    this.emit();
  }

  private onHover = (event: PointerEvent) => {
    if (!this.enabled || this.orbitHold) return;
    const needsGround =
      this.drawing ||
      this.draggingSpawn ||
      this.dragging ||
      Boolean(this.pendingPlace) ||
      Boolean(this.moveHold) ||
      (this.kind === 'child' && Boolean(this.holdingModel)) ||
      (this.kind !== 'child' && this.tool === 'path');
    if (!needsGround) return;
    this.hoverEvent = event;
    if (this.hoverRaf) return;
    this.hoverRaf = window.requestAnimationFrame(() => {
      this.hoverRaf = 0;
      const next = this.hoverEvent;
      this.hoverEvent = null;
      if (next) this.applyHover(next);
    });
  };

  private applyHover(event: PointerEvent) {
    const point = this.groundPoint(event.clientX, event.clientY);
    if (!point) return;

    if (this.drawing) {
      this.stroke = appendStrokePoint(this.stroke, point.x, point.z);
      this.world.pathLayer.setPreview(this.stroke, this.pathWidth);
      this.showBrush(point);
      return;
    }

    if (this.draggingSpawn && this.selectedSpawnId) {
      this.world.patchAuthoredSpawn(this.selectedSpawnId, { x: point.x, z: point.z });
      this.world.spawnLayer.setSelected(this.selectedSpawnId);
      this.markDirty();
      return;
    }

    if (this.dragging && this.selectedId) {
      this.moveSelected(point.x, point.z, point.y);
      return;
    }

    if (this.pendingPlace) {
      const dx = event.clientX - this.pendingPlace.startX;
      const dy = event.clientY - this.pendingPlace.startY;
      if (dx * dx + dy * dy > CHILD_TAP_SLOP * CHILD_TAP_SLOP) {
        this.pendingPlace = null;
      }
    }

    if (this.kind === 'child') {
      if (this.holdingModel && !this.dragging) this.showDropGhost(point);
      else if (!this.dragging) this.brush.visible = false;
      return;
    }

    if (this.tool === 'path') this.showBrush(point);
  }

  private onPointerUp = (event: PointerEvent) => {
    const place = this.pendingPlace;
    const wasDragging = this.dragging;
    this.pendingPlace = null;
    this.releaseCapture();
    if (this.drawing) this.finishStroke();
    this.stopDrag();
    if (
      this.kind === 'child' &&
      this.holdingModel &&
      place &&
      !wasDragging
    ) {
      const dx = event.clientX - place.startX;
      const dy = event.clientY - place.startY;
      if (dx * dx + dy * dy <= CHILD_TAP_SLOP * CHILD_TAP_SLOP) {
        const point = this.groundPoint(event.clientX, event.clientY);
        if (!point) this.notifyMissed();
        else this.stamp(point.x, point.z, point.y);
      }
    }
    this.emit();
  };

  private stopDrag() {
    this.dragging = false;
    this.draggingSpawn = false;
    if (this.kind === 'child' && this.enabled) this.rig.setPrimaryOrbit(!this.moveArmed);
  }

  private startStroke(x: number, z: number, pointerId: number) {
    this.selectedId = null;
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);
    this.syncMarker();
    this.drawing = true;
    this.stroke = [[x, z]];
    this.world.pathLayer.setPreview(this.stroke, this.pathWidth);
    this.capturePointer(pointerId);
    this.emit();
  }

  private finishStroke() {
    const points = this.stroke;
    const clicked = this.pendingPathPick;
    this.drawing = false;
    this.stroke = [];
    this.pendingPathPick = null;
    this.world.pathLayer.clearPreview();
    if (!shouldCommitStroke(points)) {
      if (clicked) this.selectPath(clicked);
      return;
    }
    const path: AuthoredPath = {
      id: `path-${this.nextPathId++}`,
      points,
      width: this.pathWidth,
    };
    this.world.applyAuthoredPaths([...this.world.paintedPaths, path]);
    this.selectPath(path.id);
    this.markDirty();
  }

  private cancelStroke() {
    this.drawing = false;
    this.stroke = [];
    this.pendingPathPick = null;
    this.world.pathLayer.clearPreview();
  }

  private selectPath(id: string) {
    this.selectedId = null;
    this.selectedPathId = id;
    this.syncMarker();
    this.world.pathLayer.setSelected(id);
    const path = this.selectedPath();
    if (path) this.pathWidth = path.width;
  }

  private selectSpawn(id: string) {
    this.selectedSpawnId = id;
    this.world.spawnLayer.setSelected(id);
    const zone = this.selectedSpawn();
    if (zone) this.spawnRadius = zone.radius;
  }

  private stampSpawn(x: number, z: number) {
    const zone: AuthoredSpawn = {
      id: `spawn-${this.nextSpawnId++}`,
      x,
      z,
      radius: this.spawnRadius,
    };
    this.world.applyAuthoredSpawns([...this.world.spawnZones, zone]);
    this.selectSpawn(zone.id);
    this.markDirty();
  }

  private showBrush(point: THREE.Vector3) {
    this.brush.visible = this.enabled && this.tool === 'path';
    if (!this.brush.visible) return;
    this.brush.position.set(point.x, point.y + 0.09, point.z);
    this.brush.scale.setScalar(this.pathWidth * 0.5);
  }

  private onKey = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    if (event.code === 'Escape' && this.drawing) {
      event.preventDefault();
      this.cancelStroke();
      this.emit();
      return;
    }

    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      this.orbitHold = true;
      this.rig.setPrimaryOrbit(true);
      this.brush.visible = false;
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeSelected();
      return;
    }

    const zone = this.selectedSpawn();
    if (zone) {
      if (event.key === '-' || event.key === '_') this.setSpawnRadius(zone.radius * 0.9);
      else if (event.key === '=' || event.key === '+') this.setSpawnRadius(zone.radius * 1.1);
      return;
    }

    const path = this.selectedPath();
    if (path) {
      if (event.key === '-' || event.key === '_') this.setPathWidth(path.width * 0.9);
      else if (event.key === '=' || event.key === '+') this.setPathWidth(path.width * 1.1);
      return;
    }

    const selected = this.selected();
    if (!selected) return;
    if (event.key === '[' || event.key === 'х') {
      this.patchSelected({ rotationY: selected.rotationY + 0.2 });
    } else if (event.key === ']' || event.key === 'ъ') {
      this.patchSelected({ rotationY: selected.rotationY - 0.2 });
    } else if (event.key === '-' || event.key === '_') {
      this.patchSelected({ height: Math.max(0.08, selected.height * 0.9) });
    } else if (event.key === '=' || event.key === '+') {
      this.patchSelected({ height: selected.height * 1.1 });
    }
  };

  private stamp(x: number, z: number, y?: number) {
    const model = this.kind === 'child' ? this.holdingModel : this.activeModel;
    if (!model) {
      this.notifyMissed();
      return;
    }
    if (this.kind === 'child') {
      if (GRASS_MODELS.has(model)) {
        this.notifyMissed();
        return;
      }
      if (this.world.authoredProps.length >= this.propCap) {
        this.notifyMissed();
        return;
      }
    }
    const toy = isPlazaToyModel(model);
    if (!toy && !this.world.library.has(model)) {
      this.notifyMissed();
      return;
    }
    const extras = toy
      ? {
          height: this.toyHeights.get(model) ?? defaultStamp(model).height,
          stillUrl: this.toyStills.get(model),
          modelUrl: this.toyModelUrls.get(model),
          meshStatus: this.toyMeshStatus.get(model),
          mine: true,
        }
      : defaultStamp(model);
    const prop: AuthoredProp = {
      id: `edit-${this.nextId++}`,
      model,
      x,
      z,
      rotationY: this.kind === 'child' ? 0 : Math.random() * Math.PI * 2,
      ...extras,
      y,
    };
    if (toy) clearPlazaHold();
    this.world.appendAuthored(prop);
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);
    this.selectedId = prop.id;
    this.markDirty();
    this.syncMarker();
    this.emit();
    for (const listener of this.placedListeners) listener(model);
  }

  private showDropGhost(point: THREE.Vector3) {
    this.brush.visible = true;
    this.brush.position.set(point.x, point.y + 0.09, point.z);
    const model = this.holdingModel ?? this.activeModel;
    const extras = isPlazaToyModel(model)
      ? { height: this.toyHeights.get(model) ?? 2 }
      : defaultStamp(model);
    this.brush.scale.setScalar(Math.max(0.55, extras.height * 0.2));
  }

  private moveSelected(x: number, z: number, y?: number) {
    if (!this.selectedId) return;
    this.world.patchAuthored(this.selectedId, Number.isFinite(y) ? { x, z, y } : { x, z });
    this.markDirty();
    this.syncMarker();
  }

  private patchSelected(patch: Partial<AuthoredProp>) {
    if (!this.selectedId) return;
    this.world.patchAuthored(this.selectedId, patch);
    this.markDirty();
    this.syncMarker();
    this.emit();
  }

  private removeSelected() {
    if (this.selectedSpawnId) {
      this.world.applyAuthoredSpawns(
        this.world.spawnZones.filter((zone) => zone.id !== this.selectedSpawnId),
      );
      this.selectedSpawnId = null;
      this.world.spawnLayer.setSelected(null);
      this.markDirty();
      this.emit();
      return;
    }
    if (this.selectedPathId) {
      this.world.applyAuthoredPaths(
        this.world.paintedPaths.filter((path) => path.id !== this.selectedPathId),
      );
      this.selectedPathId = null;
      this.world.pathLayer.setSelected(null);
      this.markDirty();
      this.emit();
      return;
    }
    if (!this.selectedId) return;
    this.world.removeAuthored(this.selectedId);
    this.selectedId = null;
    this.moveArmed = false;
    this.markDirty();
    this.syncMarker();
    this.emit();
  }

  private syncMarker() {
    const selected = this.selected();
    if (!selected || !this.enabled) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(selected.x, this.stampWorldY(selected) + 0.08, selected.z);
    this.marker.scale.setScalar(Math.max(0.6, selected.height * 0.18));
  }

  private stampWorldY(prop: { x: number; z: number; y?: number }): number {
    return Number.isFinite(prop.y) ? prop.y! : this.world.groundAt(prop.x, prop.z);
  }

  private groundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    this.setPointer(clientX, clientY);
    const surface = this.world.pickGround(this.raycaster);
    if (surface) return surface;
    const hit = this.raycaster.ray.intersectPlane(this.ground, this.hit);
    if (!hit) return null;
    this.hit.y = this.world.groundAt(this.hit.x, this.hit.z);
    return this.hit.clone();
  }

  private pickPath(clientX: number, clientY: number): string | null {
    this.setPointer(clientX, clientY);
    return this.world.pathLayer.pick(this.raycaster);
  }

  private pickProp(clientX: number, clientY: number): string | null {
    const group = this.world.root.getObjectByName('idyllic-nature');
    this.setPointer(clientX, clientY);
    // Triangle tests against 15k-face Meshy flowers freeze the editor.
    // A sphere per instance is enough to grab a stamp.
    let bestId: string | null = null;
    let bestDist = Infinity;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const sphere = new THREE.Sphere();
    const hit = new THREE.Vector3();
    group?.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const ids = mesh.userData.propIds as string[] | undefined;
      if (!ids) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const radius = mesh.geometry.boundingSphere?.radius ?? 0.6;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        matrix.decompose(position, quaternion, scale);
        sphere.center.copy(position);
        sphere.radius = radius * Math.max(scale.x, scale.y, scale.z);
        if (!this.raycaster.ray.intersectSphere(sphere, hit)) continue;
        const dist = hit.distanceToSquared(this.raycaster.ray.origin);
        if (dist >= bestDist) continue;
        bestDist = dist;
        bestId = ids[i] ?? null;
      }
    });
    const toyId = this.world.pickToy(this.raycaster);
    if (toyId) {
      const selected = this.world.authoredProps.find((prop) => prop.id === toyId);
      if (selected) {
        const origin = this.raycaster.ray.origin;
        const toyDist =
          (selected.x - origin.x) ** 2 +
          (this.stampWorldY(selected) - origin.y) ** 2 +
          (selected.z - origin.z) ** 2;
        if (!bestId || toyDist < bestDist) return toyId;
      }
    }
    return bestId;
  }

  private setPointer(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }
}
