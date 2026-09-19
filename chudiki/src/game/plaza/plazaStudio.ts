import * as THREE from 'three';
import { renderCatalogThumbs } from '../assets/catalogThumbs';
import { disposeScatter, InstancedScatter } from '../assets/InstancedScatter';
import type { IdyllicLibrary } from '../assets/IdyllicLibrary';
import {
  defaultStamp,
  plazaChildCatalog,
  toPlacement,
  type AuthoredProp,
} from '../world/layoutAuthored';
import { getIslandAudio } from '../audio/AudioBus';
import { PLAZA_WALK } from './plazaCopy';
import {
  nearPlazaProps,
  plazaCastsShadow,
  plazaLawnLocked,
  plazaViewCell,
  takePlazaStampRoom,
  PLAZA_STAMP_CAP,
} from './plazaView';
import {
  deletePlazaStamp,
  fetchPlazaStamps,
  patchPlazaStamp,
  placePlazaStamp,
} from './plazaApi';
import { displayStillUrl } from '../drawing/portrait';
import { resolveModelUrl } from '../drawing/modelUrl';
import { API_BASE } from '../../api';
import { asPlazaProp } from './plazaStamp';
import { clearPlazaHold, isPlazaToyModel, isPlazaToyPreparing, type PlazaLawnToy } from './plazaToy';
import { compactPlazaToyGlb, seatPlazaToyGlb } from './plazaToyFit';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const TAP_SLOP = 24;

export type PlazaBuildState = {
  enabled: boolean;
  catalog: string[];
  holdingModel: string | null;
  selectedId: string | null;
  count: number;
  cap: number;
  locked: boolean;
  moveArmed: boolean;
};

export class PlazaStudio {
  private library: IdyllicLibrary;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private props: AuthoredProp[] = [];
  private nature: THREE.Group | null = null;
  private enabled = false;
  private holdingModel: string | null = null;
  private selectedId: string | null = null;
  private moveArmed = false;
  private nextLocal = 1;
  private rev = -1;
  private busy = 0;
  private listeners = new Set<() => void>();
  private pending: { startX: number; startY: number } | null = null;
  private flushTimer = 0;
  private pollTimer = 0;
  private networked = true;
  private toyLayer: THREE.Group | null = null;
  private toyStills = new Map<string, string>();
  private toyHeights = new Map<string, number>();
  private toyModelUrls = new Map<string, string>();
  private toyMeshStatus = new Map<string, string>();
  private toyGlbs = new Map<string, THREE.Group>();
  private toyGlbFailed = new Set<string>();
  private toyTextures = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();
  private gltf = new GLTFLoader();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private marker: THREE.Mesh;
  private brush: THREE.Mesh;
  private toyGhost: THREE.Mesh | null = null;
  private toyGhostSrc = '';
  private toyGhostMesh: THREE.Object3D | null = null;
  private toyGhostMeshSrc = '';
  private toyGhostAt = new THREE.Vector3();
  private viewX = 0;
  private viewZ = 0;
  private viewCell = '';
  private shadeCell = '';
  private viewToken = 0;

  constructor(options: {
    library: IdyllicLibrary;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    canvas: HTMLElement;
    renderer: THREE.WebGLRenderer;
  }) {
    this.library = options.library;
    this.scene = options.scene;
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.renderer = options.renderer;
    this.marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffdd55, depthTest: false }),
    );
    this.marker.rotation.x = Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 20;
    this.scene.add(this.marker);
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
    this.scene.add(this.brush);
  }

  get catalog(): string[] {
    return plazaChildCatalog().filter((name) => this.library.canLoad(name));
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): PlazaBuildState {
    return {
      enabled: this.enabled,
      catalog: this.catalog,
      holdingModel: this.holdingModel,
      selectedId: this.selectedId,
      count: this.props.length,
      cap: PLAZA_STAMP_CAP,
      locked: plazaLawnLocked(this.props),
      moveArmed: this.moveArmed,
    };
  }

  selected(): AuthoredProp | null {
    return this.props.find((prop) => prop.id === this.selectedId) ?? null;
  }

  selectedScreen(): { x: number; y: number } | null {
    const prop = this.selected();
    if (!prop || !this.enabled) return null;
    this.camera.updateMatrixWorld();
    const point = new THREE.Vector3(prop.x, Math.max(0.5, prop.height * 0.55), prop.z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { x: rect.left + rect.width / 2, y: rect.top + 140 };
    }
    return {
      x: THREE.MathUtils.clamp((point.x * 0.5 + 0.5) * rect.width + rect.left, rect.left + 80, rect.right - 80),
      y: THREE.MathUtils.clamp((-point.y * 0.5 + 0.5) * rect.height + rect.top, rect.top + 80, rect.bottom - 80),
    };
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.holdingModel = null;
      this.selectedId = null;
      this.moveArmed = false;
      this.pending = null;
    }
    this.brush.visible = false;
    this.hideToyGhost();
    this.syncMarker();
    this.emit();
  }

  setNetworked(on: boolean) {
    this.networked = on;
  }

  /** Same as the garden: tap the card again to put the toy down. */
  setActiveModel(model: string) {
    if (plazaLawnLocked(this.props) && this.holdingModel !== model) return;
    this.holdingModel = this.holdingModel === model ? null : model;
    this.selectedId = null;
    this.moveArmed = false;
    this.pending = null;
    if (!this.holdingModel) {
      this.brush.visible = false;
      this.hideToyGhost();
    }
    this.syncMarker();
    this.emit();
  }

  async hold(model: string) {
    this.setActiveModel(model);
    if (this.holdingModel && !isPlazaToyModel(model) && !this.library.has(model)) {
      await this.library.ensure(model);
    }
  }

  holdToy(model: string, stillUrl: string, height: number, modelUrl?: string) {
    this.toyStills.set(model, stillUrl);
    this.toyHeights.set(model, height);
    if (modelUrl) this.toyModelUrls.set(model, modelUrl);
    this.holdingModel = model;
    this.selectedId = null;
    this.moveArmed = false;
    this.pending = null;
    this.brush.visible = false;
    this.camera.updateMatrixWorld();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
    forward.normalize();
    this.showToyGhost(
      new THREE.Vector3(
        this.camera.position.x + forward.x * 6,
        0,
        this.camera.position.z + forward.z * 6,
      ),
    );
    this.syncMarker();
    this.emit();
  }

  noteToys(toys: PlazaLawnToy[]) {
    let dirty = false;
    for (const toy of toys) {
      if (toy.still_url) this.toyStills.set(toy.model, toy.still_url);
      this.toyHeights.set(toy.model, toy.height);
      if (toy.model_url) this.toyModelUrls.set(toy.model, toy.model_url);
      if (toy.mesh_status) this.toyMeshStatus.set(toy.model, toy.mesh_status);
      for (const prop of this.props) {
        if (prop.model !== toy.model) continue;
        const nextUrl = toy.model_url || prop.modelUrl;
        const nextStill = toy.still_url || prop.stillUrl;
        const nextMesh = toy.mesh_status || prop.meshStatus;
        if (prop.modelUrl === nextUrl && prop.stillUrl === nextStill && prop.meshStatus === nextMesh) {
          continue;
        }
        prop.modelUrl = nextUrl;
        prop.stillUrl = nextStill;
        prop.meshStatus = nextMesh;
        dirty = true;
      }
    }
    if (dirty) this.rebuildToys();
  }

  async ensure(names: readonly string[]) {
    await this.library.ensureAll(names);
  }

  beginMoveHold() {
    this.moveArmed = true;
    this.holdingModel = null;
    this.brush.visible = false;
    this.hideToyGhost();
    this.emit();
    getIslandAudio().playSfx('lift');
  }

  dragMoveHold(clientX: number, clientY: number) {
    if (!this.moveArmed || !this.selectedId) return;
    const point = this.groundPoint(clientX, clientY);
    if (!point) return;
    const index = this.props.findIndex((prop) => prop.id === this.selectedId);
    if (index < 0) return;
    this.props[index] = {
      ...this.props[index],
      x: THREE.MathUtils.clamp(point.x, -PLAZA_WALK, PLAZA_WALK),
      z: THREE.MathUtils.clamp(point.z, -PLAZA_WALK, PLAZA_WALK),
    };
    this.rebuild();
    this.syncMarker();
  }

  endMoveHold() {
    this.moveArmed = false;
    const id = this.selectedId;
    if (id) void this.flush(id);
    this.emit();
  }

  rotateSelected(delta: number) {
    const prop = this.selected();
    if (!prop) return;
    this.patchLocal(prop.id, { rotationY: prop.rotationY + delta });
    this.scheduleFlush(prop.id);
    getIslandAudio().playSfx('nudge');
  }

  scaleSelected(factor: number) {
    const prop = this.selected();
    if (!prop) return;
    this.patchLocal(prop.id, { height: Math.max(0.25, Math.min(16, prop.height * factor)) });
    this.scheduleFlush(prop.id);
    getIslandAudio().playSfx('nudge');
  }

  deleteSelected() {
    const id = this.selectedId;
    if (!id) return;
    getIslandAudio().playSfx('trash');
    this.selectedId = null;
    this.props = this.props.filter((prop) => prop.id !== id);
    this.rebuild();
    this.syncMarker();
    this.emit();
    if (id.startsWith('local-') || !this.networked) return;
    this.busy += 1;
    void deletePlazaStamp(id)
      .then((body) => {
        if (body) this.rev = body.rev;
      })
      .finally(() => {
        this.busy = Math.max(0, this.busy - 1);
        void this.pull();
      });
  }

  thumbs(names: readonly string[]): Record<string, string> {
    return renderCatalogThumbs(this.library, names, this.renderer);
  }

  async boot() {
    if (this.networked) await this.pull();
    window.clearInterval(this.pollTimer);
    this.pollTimer = window.setInterval(() => {
      if (this.networked) void this.pull();
    }, 3000);
  }

  syncRev(rev: number | undefined) {
    if (!this.networked) return;
    if (rev == null || rev === this.rev) return;
    void this.pull();
  }

  async save(): Promise<boolean> {
    const id = this.selectedId;
    if (id) await this.flush(id);
    if (this.networked) await this.pull();
    getIslandAudio().playSfx('save');
    return true;
  }

  /** True only when the camera must not orbit (move-hold is on the HUD). */
  onPointerDown(event: PointerEvent): boolean {
    if (!this.enabled) return false;
    const point = this.groundPoint(event.clientX, event.clientY);
    if (!this.holdingModel) {
      const picked = this.pickProp(event.clientX, event.clientY) ?? (point ? this.pickNear(point.x, point.z) : null);
      this.selectedId = picked;
      this.pending = null;
      this.syncMarker();
      this.emit();
      return false;
    }
    this.pending = { startX: event.clientX, startY: event.clientY };
    if (point) this.showDropGhost(point);
    return false;
  }

  onPointerMove(event: PointerEvent): boolean {
    if (!this.enabled) return false;
    const point = this.groundPoint(event.clientX, event.clientY);
    if (this.pending) {
      const slop = Math.hypot(event.clientX - this.pending.startX, event.clientY - this.pending.startY);
      if (slop > TAP_SLOP) this.pending = null;
    }
    if (this.holdingModel && !this.moveArmed && point) this.showDropGhost(point);
    else if (!this.holdingModel) {
      this.brush.visible = false;
      this.hideToyGhost();
    }
    return false;
  }

  onPointerUp(event: PointerEvent): boolean {
    const pending = this.pending;
    this.pending = null;
    if (!this.enabled || !this.holdingModel || !pending) return false;
    if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > TAP_SLOP) {
      return false;
    }
    const point = this.groundPoint(event.clientX, event.clientY);
    if (!point) return false;
    void this.stamp(point.x, point.z);
    return false;
  }

  dispose() {
    window.clearTimeout(this.flushTimer);
    window.clearInterval(this.pollTimer);
    this.marker.removeFromParent();
    this.brush.removeFromParent();
    (this.brush.material as THREE.Material).dispose();
    this.brush.geometry.dispose();
    this.disposeToyGhost();
    if (this.nature) disposeScatter(this.nature);
    this.clearToys();
    this.listeners.clear();
  }

  private showDropGhost(point: THREE.Vector3) {
    if (this.holdingModel && isPlazaToyModel(this.holdingModel)) {
      this.brush.visible = false;
      this.showToyGhost(point);
      return;
    }
    this.hideToyGhost();
    this.brush.visible = true;
    this.brush.position.set(point.x, 0.09, point.z);
    const extras = defaultStamp(this.holdingModel ?? '');
    this.brush.scale.setScalar(Math.max(0.55, extras.height * 0.2));
  }

  private hideToyGhost() {
    if (this.toyGhost) this.toyGhost.visible = false;
    if (this.toyGhostMesh) this.toyGhostMesh.visible = false;
  }

  private disposeToyGhost() {
    if (this.toyGhost) {
      this.toyGhost.removeFromParent();
      this.toyGhost.geometry.dispose();
      (this.toyGhost.material as THREE.Material).dispose();
      this.toyGhost = null;
      this.toyGhostSrc = '';
    }
    if (this.toyGhostMesh) {
      this.toyGhostMesh.removeFromParent();
      this.toyGhostMesh = null;
      this.toyGhostMeshSrc = '';
    }
  }

  private fitToyGhost(texture: THREE.Texture) {
    if (!this.toyGhost) return;
    const image = texture.image as { width?: number; height?: number };
    const aspect = (image.width || 1) / (image.height || 1);
    const height = this.toyHeights.get(this.holdingModel ?? '') ?? 2;
    const h = Math.max(0.9, height);
    this.toyGhost.scale.set(h * Math.min(aspect, 1.35), h, 1);
  }

  private showToyGhost(point: THREE.Vector3) {
    const model = this.holdingModel;
    if (!model) {
      this.hideToyGhost();
      return;
    }
    this.toyGhostAt.copy(point);
    const modelUrl = this.toyModelUrls.get(model);
    if (modelUrl) {
      this.showToyMeshGhost(point, modelUrl);
      return;
    }
    this.showToyStillGhost(point);
  }

  private showToyMeshGhost(point: THREE.Vector3, url: string) {
    const resolved = resolveModelUrl(url, API_BASE);
    if (this.toyGlbFailed.has(resolved)) {
      this.showToyStillGhost(point);
      return;
    }
    const cached = this.toyGlbs.get(resolved);
    if (!cached) {
      this.showToyStillGhost(point);
      this.gltf.load(
        resolved,
        (gltf) => {
          this.toyGlbs.set(resolved, gltf.scene);
          this.rebuildToys();
          if (!this.holdingModel) return;
          const current = this.toyModelUrls.get(this.holdingModel);
          if (!current || resolveModelUrl(current, API_BASE) !== resolved) return;
          this.showToyMeshGhost(this.toyGhostAt, current);
        },
        undefined,
        () => {
          this.toyGlbFailed.add(resolved);
        },
      );
      return;
    }
    if (this.toyGhost) this.toyGhost.visible = false;
    const height = this.toyHeights.get(this.holdingModel ?? '') ?? 2;
    if (this.toyGhostMeshSrc !== resolved || !this.toyGhostMesh) {
      if (this.toyGhostMesh) this.toyGhostMesh.removeFromParent();
      const clone = cached.clone(true);
      clone.traverse((object) => {
        object.userData.shared = true;
      });
      this.toyGhostMesh = clone;
      this.toyGhostMeshSrc = resolved;
      this.scene.add(clone);
    }
    this.toyGhostMesh.visible = true;
    seatPlazaToyGlb(this.toyGhostMesh, {
      height,
      x: point.x,
      z: point.z,
      rotationY: 0,
    });
  }

  private showToyStillGhost(point: THREE.Vector3) {
    if (this.toyGhostMesh) this.toyGhostMesh.visible = false;
    const model = this.holdingModel;
    if (!model) {
      this.hideToyGhost();
      return;
    }
    const height = this.toyHeights.get(model) ?? 2;
    const src = displayStillUrl(this.toyStills.get(model) || null);
    if (!this.toyGhost) {
      this.toyGhost = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          depthTest: false,
        }),
      );
      this.toyGhost.renderOrder = 22;
      this.scene.add(this.toyGhost);
    }
    const h = Math.max(0.9, height);
    this.toyGhost.visible = true;
    this.toyGhost.scale.set(Math.max(0.7, height * 0.72), h, 1);
    this.toyGhost.position.set(point.x, h / 2, point.z);
    this.toyGhost.lookAt(this.camera.position.x, h / 2, this.camera.position.z);
    if (!src || src === this.toyGhostSrc) return;
    this.toyGhostSrc = src;
    const material = this.toyGhost.material as THREE.MeshBasicMaterial;
    const cached = this.toyTextures.get(src);
    if (cached) {
      material.map = cached;
      material.needsUpdate = true;
      this.fitToyGhost(cached);
      return;
    }
    this.loader.load(src, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      this.toyTextures.set(src, texture);
      if (this.toyGhostSrc !== src || !this.toyGhost) return;
      material.map = texture;
      material.needsUpdate = true;
      this.fitToyGhost(texture);
    });
  }

  private async pull() {
    if (!this.networked || this.busy) return;
    const body = await fetchPlazaStamps();
    if (!body || this.busy) return;
    if (this.rev >= 0 && body.rev < this.rev) return;
    if (body.rev === this.rev && this.props.length === body.stamps.length) {
      let meshDirty = false;
      for (const row of body.stamps) {
        if (!row.model_url) continue;
        const prop = this.props.find((item) => item.id === row.id);
        if (!prop || prop.modelUrl === row.model_url) continue;
        prop.modelUrl = row.model_url;
        prop.meshStatus = row.mesh_status;
        this.toyModelUrls.set(prop.model, row.model_url);
        if (row.mesh_status) this.toyMeshStatus.set(prop.model, row.mesh_status);
        meshDirty = true;
      }
      if (!meshDirty) return;
      this.rebuildToys();
      this.emit();
      return;
    }
    const locals = this.props.filter((prop) => prop.id.startsWith('local-'));
    if (body.rev <= Math.max(0, this.rev) && locals.length && body.stamps.length < this.props.length) {
      return;
    }
    this.rev = body.rev;
    const keep = this.selectedId;
    this.props = body.stamps.map((row) => {
      const prop = { ...defaultStamp(row.model), ...asPlazaProp(row) };
      if (prop.stillUrl) this.toyStills.set(prop.model, prop.stillUrl);
      if (prop.modelUrl) this.toyModelUrls.set(prop.model, prop.modelUrl);
      if (prop.meshStatus) this.toyMeshStatus.set(prop.model, prop.meshStatus);
      return prop;
    });
    if (keep && !this.props.some((prop) => prop.id === keep)) this.selectedId = null;
    const wanted = [
      ...new Set(
        this.viewProps()
          .map((prop) => prop.model)
          .filter((model) => !isPlazaToyModel(model)),
      ),
    ];
    if (wanted.length) await this.library.ensureAll(wanted);
    this.rebuild();
    this.syncMarker();
    this.emit();
  }

  private async stamp(x: number, z: number) {
    const model = this.holdingModel;
    if (!model || plazaLawnLocked(this.props)) return;
    const toy = isPlazaToyModel(model);
    if (!toy) {
      if (!this.library.has(model)) await this.library.ensure(model);
      if (!this.library.has(model)) return;
    }
    const extras = this.toyHeights.has(model)
      ? { height: this.toyHeights.get(model)! }
      : defaultStamp(model);
    const tempId = `local-${this.nextLocal++}`;
    const prop: AuthoredProp = {
      id: tempId,
      model,
      x: THREE.MathUtils.clamp(x, -PLAZA_WALK, PLAZA_WALK),
      z: THREE.MathUtils.clamp(z, -PLAZA_WALK, PLAZA_WALK),
      rotationY: 0,
      ...extras,
      y: 0,
      mine: true,
      stillUrl: this.toyStills.get(model),
      modelUrl: this.toyModelUrls.get(model),
      meshStatus: this.toyMeshStatus.get(model),
    };
    this.props = takePlazaStampRoom([...this.props, prop], PLAZA_STAMP_CAP);
    this.selectedId = tempId;
    if (toy) {
      clearPlazaHold();
      this.hideToyGhost();
    }
    this.rebuild();
    this.syncMarker();
    this.emit();
    getIslandAudio().playSfx('place');
    if (!this.networked) return;
    this.busy += 1;
    const body = await placePlazaStamp(model, prop.x, prop.z, prop.height);
    this.busy = Math.max(0, this.busy - 1);
    if (!body) {
      void this.pull();
      return;
    }
    this.rev = body.rev;
    if (body.stamp.still_url) this.toyStills.set(model, body.stamp.still_url);
    if (body.stamp.model_url) this.toyModelUrls.set(model, body.stamp.model_url);
    if (body.stamp.mesh_status) this.toyMeshStatus.set(model, body.stamp.mesh_status);
    this.props = this.props.map((row) =>
      row.id === tempId ? { ...defaultStamp(body.stamp.model), ...asPlazaProp(body.stamp) } : row,
    );
    if (this.selectedId === tempId) this.selectedId = body.stamp.id;
    this.rebuild();
    this.syncMarker();
    this.emit();
  }

  private pickNear(x: number, z: number): string | null {
    let best: string | null = null;
    let bestDist = 3.6;
    for (const prop of this.props) {
      if (prop.mine === false) continue;
      const dist = Math.hypot(prop.x - x, prop.z - z);
      if (dist < bestDist) {
        bestDist = dist;
        best = prop.id;
      }
    }
    return best;
  }

  private pickProp(clientX: number, clientY: number): string | null {
    this.setPointer(clientX, clientY);
    let bestId: string | null = null;
    let bestDist = Infinity;
    const group = this.nature;
    if (!group && !this.toyLayer) return null;
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
      for (let i = 0; i < mesh.count; i += 1) {
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
    this.toyLayer?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const id = mesh.userData.propId as string | undefined;
      if (!id) return;
      if (this.props.find((prop) => prop.id === id)?.mine === false) return;
      const hits = this.raycaster.intersectObject(mesh, false);
      if (!hits.length) return;
      const dist = hits[0].distance;
      if (dist * dist >= bestDist) return;
      bestDist = dist * dist;
      bestId = id;
    });
    return bestId;
  }

  private patchLocal(id: string, patch: Partial<AuthoredProp>) {
    const index = this.props.findIndex((prop) => prop.id === id);
    if (index < 0) return;
    this.props[index] = { ...this.props[index], ...patch };
    this.rebuild();
    this.syncMarker();
    this.emit();
  }

  private scheduleFlush(id: string) {
    window.clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => {
      void this.flush(id);
    }, 280);
  }

  private async flush(id: string) {
    if (!this.networked || id.startsWith('local-')) return;
    const prop = this.props.find((row) => row.id === id);
    if (!prop) return;
    this.busy += 1;
    const body = await patchPlazaStamp(id, {
      x: prop.x,
      z: prop.z,
      height: prop.height,
      rotation_y: prop.rotationY,
    });
    this.busy = Math.max(0, this.busy - 1);
    if (body) this.rev = body.rev;
  }

  private setPointer(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private groundPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    this.setPointer(clientX, clientY);
    const hit = this.raycaster.ray.intersectPlane(this.ground, this.hit);
    return hit ? this.hit.clone() : null;
  }

  /** Load and shade only what sits near the walking child. */
  syncView(x: number, z: number) {
    this.viewX = x;
    this.viewZ = z;
    const cell = plazaViewCell(x, z);
    if (cell !== this.viewCell) {
      this.viewCell = cell;
      void this.ensureNearThenRebuild();
      return;
    }
    const shade = plazaViewCell(x, z, 8);
    if (shade !== this.shadeCell) {
      this.shadeCell = shade;
      this.paintNearShadows();
    }
  }

  private viewProps(): AuthoredProp[] {
    const near = nearPlazaProps(this.props, this.viewX, this.viewZ);
    const selected = this.selected();
    if (selected && !near.some((row) => row.id === selected.id)) return [...near, selected];
    return near;
  }

  private toyVisible(prop: AuthoredProp): boolean {
    if (prop.id === this.selectedId) return true;
    return nearPlazaProps([prop], this.viewX, this.viewZ).length > 0;
  }

  private async ensureNearThenRebuild() {
    const token = ++this.viewToken;
    const wanted = [
      ...new Set(
        this.viewProps()
          .map((prop) => prop.model)
          .filter((model) => !isPlazaToyModel(model) && !this.library.has(model)),
      ),
    ];
    if (wanted.length) await this.library.ensureAll(wanted);
    if (token !== this.viewToken) return;
    this.rebuild();
  }

  private paintNearShadows() {
    this.nature?.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const sphere = mesh.boundingSphere;
      if (!sphere) {
        mesh.castShadow = false;
        return;
      }
      mesh.castShadow = plazaCastsShadow(sphere.center.x, sphere.center.z, this.viewX, this.viewZ);
      mesh.receiveShadow = true;
    });
    this.toyLayer?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const world = mesh.getWorldPosition(new THREE.Vector3());
      mesh.castShadow = plazaCastsShadow(world.x, world.z, this.viewX, this.viewZ);
      mesh.receiveShadow = false;
    });
  }

  private rebuild() {
    if (this.nature) disposeScatter(this.nature);
    const scatter = new InstancedScatter(this.library);
    const placed = this.viewProps().filter((prop) => !isPlazaToyModel(prop.model) && this.library.has(prop.model));
    for (const prop of placed) {
      scatter.place(prop.model, toPlacement(prop, 0));
    }
    this.nature = scatter.build({
      name: 'plaza-nature',
      spatial: true,
      spatialMinTriangles: 0,
      castShadow: false,
      receiveShadow: true,
    });
    this.tagInstances(this.nature, placed);
    this.scene.add(this.nature);
    this.rebuildToys();
    this.viewCell = plazaViewCell(this.viewX, this.viewZ);
    this.shadeCell = plazaViewCell(this.viewX, this.viewZ, 8);
    this.paintNearShadows();
  }

  private clearToys() {
    if (!this.toyLayer) return;
    this.toyLayer.removeFromParent();
    this.toyLayer.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.shared) return;
      mesh.geometry.dispose();
      const material = mesh.material as THREE.Material;
      material.dispose();
    });
    this.toyLayer = null;
  }

  private rebuildToys() {
    this.clearToys();
    const group = new THREE.Group();
    group.name = 'plaza-toys';
    for (const prop of this.props) {
      if (!isPlazaToyModel(prop.model) || !this.toyVisible(prop)) continue;
      const modelUrl = prop.modelUrl || this.toyModelUrls.get(prop.model);
      if (modelUrl) this.placeToyGlb(group, prop, modelUrl);
      else this.placeToyStill(group, prop);
    }
    this.scene.add(group);
    this.toyLayer = group;
    this.paintNearShadows();
  }

  private placeToyStill(group: THREE.Group, prop: AuthoredProp) {
    const src = displayStillUrl(prop.stillUrl || this.toyStills.get(prop.model) || null);
    if (!src) return;
    const preparing = isPlazaToyPreparing({
      mesh_status: prop.meshStatus || this.toyMeshStatus.get(prop.model),
      model_url: prop.modelUrl || this.toyModelUrls.get(prop.model),
    });
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(0.6, prop.height * 0.72), Math.max(0.8, prop.height)),
      new THREE.MeshLambertMaterial({
        transparent: true,
        opacity: preparing ? 0.82 : 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    card.position.set(prop.x, Math.max(0.4, prop.height / 2), prop.z);
    card.rotation.y = prop.rotationY;
    card.userData.propId = prop.id;
    card.castShadow = plazaCastsShadow(prop.x, prop.z, this.viewX, this.viewZ);
    card.receiveShadow = false;
    const cached = this.toyTextures.get(src);
    if (cached) {
      (card.material as THREE.MeshLambertMaterial).map = cached;
      (card.material as THREE.MeshLambertMaterial).needsUpdate = true;
    } else {
      this.loader.load(src, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        this.toyTextures.set(src, texture);
        const material = card.material as THREE.MeshLambertMaterial;
        material.map = texture;
        material.needsUpdate = true;
        const image = texture.image as { width?: number; height?: number };
        const aspect = (image.width || 1) / (image.height || 1);
        card.scale.set(Math.min(aspect, 1.35), 1, 1);
      });
    }
    group.add(card);
    if (preparing) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(0.4, prop.height * 0.28), 0.045, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.9, depthTest: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(prop.x, 0.12, prop.z);
      ring.userData.propId = prop.id;
      group.add(ring);
    }
  }

  private placeToyGlb(group: THREE.Group, prop: AuthoredProp, url: string) {
    const resolved = resolveModelUrl(url, API_BASE);
    if (this.toyGlbFailed.has(resolved)) {
      this.placeToyStill(group, prop);
      return;
    }
    const cached = this.toyGlbs.get(resolved);
    if (cached) {
      this.mountToyGlb(group, prop, cached);
      return;
    }
    this.placeToyStill(group, prop);
    this.gltf.load(
      resolved,
      (gltf) => {
        compactPlazaToyGlb(gltf.scene);
        this.toyGlbs.set(resolved, gltf.scene);
        this.rebuildToys();
      },
      undefined,
      () => {
        this.toyGlbFailed.add(resolved);
        this.rebuildToys();
      },
    );
  }

  private mountToyGlb(group: THREE.Group, prop: AuthoredProp, root: THREE.Object3D) {
    const clone = root.clone(true);
    clone.traverse((object) => {
      object.userData.shared = true;
      object.userData.propId = prop.id;
    });
    seatPlazaToyGlb(clone, {
      height: prop.height,
      x: prop.x,
      z: prop.z,
      rotationY: prop.rotationY,
      castShadow: plazaCastsShadow(prop.x, prop.z, this.viewX, this.viewZ),
    });
    clone.userData.propId = prop.id;
    group.add(clone);
  }

  private tagInstances(group: THREE.Group, placed: AuthoredProp[]) {
    const idsByModel = new Map<string, string[]>();
    for (const prop of placed) {
      const list = idsByModel.get(prop.model) ?? [];
      list.push(prop.id);
      idsByModel.set(prop.model, list);
    }
    group.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const model = mesh.name.split(':')[0];
      const allIds = idsByModel.get(model) ?? [];
      const placementIndices = mesh.userData.placementIndices as number[] | undefined;
      mesh.userData.propIds = placementIndices
        ? placementIndices.map((index) => allIds[index]).filter(Boolean)
        : allIds;
    });
  }

  private syncMarker() {
    const prop = this.selected();
    if (!prop || !this.enabled) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(prop.x, 0.08, prop.z);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
