import * as THREE from 'three';
import type { CameraRig } from './CameraRig';
import type { World } from '../world/World';
import {
  catalogModels,
  defaultStamp,
  downloadLayout,
  ensureGardenGate,
  saveLayout,
  type AuthoredPath,
  type AuthoredProp,
  type LayoutDocument,
} from '../world/layoutAuthored';
import {
  appendStrokePoint,
  clampPathWidth,
  DEFAULT_PATH_WIDTH,
  nearestPathId,
  shouldCommitStroke,
} from '../world/layoutPaths';

export type LayoutTool = 'place' | 'select' | 'path';

export type LayoutState = {
  enabled: boolean;
  tool: LayoutTool;
  catalog: string[];
  activeModel: string;
  selectedId: string | null;
  selectedPathId: string | null;
  pathWidth: number;
  count: number;
  pathCount: number;
  dirty: boolean;
};

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
  private selectedId: string | null = null;
  private selectedPathId: string | null = null;
  private pathWidth = DEFAULT_PATH_WIDTH;
  private dirty = false;
  private dragging = false;
  private drawing = false;
  private stroke: [number, number][] = [];
  private pendingPathPick: string | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private marker: THREE.Mesh;
  private brush: THREE.Mesh;
  private listeners = new Set<() => void>();
  private nextId = 1;
  private nextPathId = 1;
  private rememberTimer = 0;

  constructor(options: {
    world: World;
    camera: THREE.PerspectiveCamera;
    canvas: HTMLElement;
    rig: CameraRig;
  }) {
    this.world = options.world;
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.rig = options.rig;

    const catalog = catalogModels(this.world.library);
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

    window.addEventListener('pagehide', this.flushRemember);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): LayoutState {
    return {
      enabled: this.enabled,
      tool: this.tool,
      catalog: catalogModels(this.world.library),
      activeModel: this.activeModel,
      selectedId: this.selectedId,
      selectedPathId: this.selectedPathId,
      pathWidth: this.pathWidth,
      count: this.world.authoredProps.length,
      pathCount: this.world.paintedPaths.length,
      dirty: this.dirty,
    };
  }

  selected(): AuthoredProp | null {
    return this.world.authoredProps.find((prop) => prop.id === this.selectedId) ?? null;
  }

  selectedPath(): AuthoredPath | null {
    return this.world.paintedPaths.find((path) => path.id === this.selectedPathId) ?? null;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.rig.setPrimaryOrbit(!on);
    this.marker.visible = on && !!this.selectedId;
    this.brush.visible = false;
    if (on) {
      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      this.canvas.addEventListener('pointermove', this.onHover);
      this.canvas.addEventListener('pointerup', this.onPointerUp);
      this.canvas.addEventListener('pointercancel', this.onPointerUp);
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKeyUp);
    } else {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas.removeEventListener('pointermove', this.onHover);
      this.canvas.removeEventListener('pointerup', this.onPointerUp);
      this.canvas.removeEventListener('pointercancel', this.onPointerUp);
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

  setActiveModel(model: string) {
    this.activeModel = model;
    this.tool = 'place';
    this.emit();
  }

  rotateSelected(delta: number) {
    const selected = this.selected();
    if (!selected) return;
    this.patchSelected({ rotationY: selected.rotationY + delta });
  }

  scaleSelected(factor: number) {
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
    downloadLayout(this.world.authoredProps, this.world.paintedPaths);
    this.dirty = false;
    this.emit();
  }

  remember() {
    saveLayout(this.world.authoredProps, this.world.paintedPaths);
    this.dirty = false;
    this.emit();
  }

  importDocument(doc: LayoutDocument) {
    if (!doc.props) return;
    this.world.applyAuthored(ensureGardenGate(doc.props));
    this.world.applyAuthoredPaths(doc.paths);
    this.selectedId = null;
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);
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
    this.selectedId = null;
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);
    this.remember();
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
    saveLayout(this.world.authoredProps, this.world.paintedPaths);
    this.dirty = false;
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private orbitHold = false;

  private onKeyUp = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    if (event.code === 'Space') {
      this.orbitHold = false;
      this.rig.setPrimaryOrbit(false);
    }
  };

  private onPointerDown = (event: PointerEvent) => {
    if (!this.enabled || event.button !== 0 || this.orbitHold) return;
    if (event.pointerType === 'touch' && event.isPrimary === false) return;

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

    const picked = this.pickProp(event.clientX, event.clientY);
    if (picked) {
      this.selectedPathId = null;
      this.world.pathLayer.setSelected(null);
      this.selectedId = picked;
      this.dragging = true;
      this.tool = 'select';
      this.syncMarker();
      this.canvas.setPointerCapture(event.pointerId);
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
      this.stamp(point.x, point.z);
      return;
    }

    this.selectedId = null;
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);
    this.syncMarker();
    this.emit();
  };

  private onHover = (event: PointerEvent) => {
    if (!this.enabled || this.orbitHold) return;
    const point = this.groundPoint(event.clientX, event.clientY);
    if (!point) return;

    if (this.drawing) {
      this.stroke = appendStrokePoint(this.stroke, point.x, point.z);
      this.world.pathLayer.setPreview(this.stroke, this.pathWidth);
      this.showBrush(point);
      return;
    }

    if (this.dragging && this.selectedId) {
      this.moveSelected(point.x, point.z);
      return;
    }

    if (this.tool === 'path') this.showBrush(point);
  };

  private onPointerUp = (event: PointerEvent) => {
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Capture was never taken, or already released.
    }
    if (this.drawing) this.finishStroke();
    this.stopDrag();
    this.emit();
  };

  private stopDrag() {
    this.dragging = false;
  }

  private startStroke(x: number, z: number, pointerId: number) {
    this.selectedId = null;
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);
    this.syncMarker();
    this.drawing = true;
    this.stroke = [[x, z]];
    this.world.pathLayer.setPreview(this.stroke, this.pathWidth);
    this.canvas.setPointerCapture(pointerId);
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

  private stamp(x: number, z: number) {
    const extras = defaultStamp(this.activeModel);
    const prop: AuthoredProp = {
      id: `edit-${this.nextId++}`,
      model: this.activeModel,
      x,
      z,
      rotationY: Math.random() * Math.PI * 2,
      ...extras,
    };
    this.world.appendAuthored(prop);
    this.selectedPathId = null;
    this.world.pathLayer.setSelected(null);
    this.selectedId = prop.id;
    this.markDirty();
    this.syncMarker();
    this.emit();
  }

  private moveSelected(x: number, z: number) {
    if (!this.selectedId) return;
    this.world.patchAuthored(this.selectedId, { x, z });
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
    this.marker.position.set(selected.x, this.world.groundAt(selected.x, selected.z) + 0.08, selected.z);
    this.marker.scale.setScalar(Math.max(0.6, selected.height * 0.18));
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
    if (!group) return null;
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
    group.traverse((object) => {
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
