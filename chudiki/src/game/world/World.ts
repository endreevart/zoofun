import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { IdyllicLibrary } from '../assets/IdyllicLibrary';
import { composePlacement, InstancedScatter } from '../assets/InstancedScatter';
import { Terrain } from './Terrain';
import { Water } from './Water';
import { HAZE_COLOR, createSky } from './Sky';
import { createPaths } from './Paths';
import { Lighting } from './lighting';
import { tuning, type TuningValues } from '../render/tuning';
import { createStructures } from './idyllic/structures';
import { BRIDGE, POND, PONDS, ROAM_BOUNDS, TREE_CLUSTERS, ZONES, inWalkZone } from './layout';
import { PathLayer } from './PathLayer';
import { GrassField } from './GrassField';
import {
  defaultLandmarks,
  ensureGardenGate,
  loadBakedLayout,
  resolveLayoutDocument,
  natureCastsShadow,
  pondRadius,
  placedWalkRadius,
  toPlacement,
  walkFootprint,
  type AuthoredPath,
  type AuthoredProp,
  type LayoutDocument,
} from './layoutAuthored';
import { FEEDER_MODEL } from '../care/feedingPlan';

export type WalkableQuery = {
  heightAt(x: number, z: number): number;
  isWalkable(x: number, z: number): boolean;
  findOpenSpot(rng: () => number, near?: THREE.Vector3): THREE.Vector3;
};

/**
 * Assembles the Idyllic garden and answers the spatial questions the creatures
 * ask. The layout, materials and lighting all come from
 * scripts/render-idyllic-world.py, so the runtime scene and the reviewed Cycles
 * frame stay in step.
 */
export class World implements WalkableQuery {
  readonly root = new THREE.Group();
  readonly terrain: Terrain;
  readonly water: Water;
  readonly sun: THREE.DirectionalLight;
  readonly library: IdyllicLibrary;

  private lighting!: Lighting;
  private fog!: THREE.FogExp2;
  private unsubscribe: () => void = () => {};
  private treeSpots: THREE.Vector2[] = [];
  readonly pathLayer: PathLayer;
  readonly grassField: GrassField;
  private authored: AuthoredProp[] = [];
  private authoredPaths: AuthoredPath[] = [];
  private proceduralPaths: AuthoredPath[] = [];
  private proceduralAuthored: AuthoredProp[] = [];

  /** Precomputed walkability, sampled on a grid so the per-frame check is O(1). */
  private walkGrid: Uint8Array | null = null;
  private gridStep = 0.5;
  private gridCols = 0;
  private gridRows = 0;
  private walkGridTimer = 0;

  static async create(
    seed = 20260901,
    onProgress?: (done: number, total: number) => void,
  ): Promise<World> {
    const [saved, baked] = await Promise.all([resolveLayoutDocument(), loadBakedLayout()]);
    const props = ensureGardenGate(saved.props ?? baked?.props ?? defaultLandmarks());
    const library = await IdyllicLibrary.load(onProgress, [
      'floating-island',
      'grass_a',
      'grass_b',
      ...props.map((prop) => prop.model),
    ]);
    return new World(library, seed, saved, baked);
  }

  private constructor(
    library: IdyllicLibrary,
    seed: number,
    saved: LayoutDocument,
    baked: LayoutDocument | null,
  ) {
    this.library = library;
    this.root.name = 'world';

    this.root.add(createSky());

    this.lighting = new Lighting();
    this.sun = this.lighting.sun;
    this.root.add(this.lighting.group);

    this.terrain = new Terrain(
      seed + 3,
      library.groundTexture('grass_albedo', 26),
      library.groundTexture('grass_normal', 26),
    );
    this.terrain.adoptFloatingIsland(library);
    this.root.add(this.terrain.group);

    this.water = new Water();
    this.root.add(this.water.group);

    // Dirt ribbons were built for the procedural lawn. On the Meshy platform
    // they sit inside the grass and read as those thin brown slivers. Painted
    // paths from the layout brush live in PathLayer instead.
    if (!this.terrain.usesFloatingIsland) {
      this.root.add(createPaths(library, this.terrain));
    }

    this.pathLayer = new PathLayer(this.terrain);
    this.root.add(this.pathLayer.group);
    this.grassField = new GrassField(this.terrain, library);
    this.root.add(this.grassField.group);

    // Landmarks stay (bridge, gate, burrow). The lotus ponds replace the old
    // water discs; everything else starts empty for the layout editor.
    const scatter = new InstancedScatter(library);
    this.root.add(createStructures(library, this.terrain, scatter, mulberry32(seed + 19)));
    this.proceduralAuthored = ensureGardenGate(baked?.props ?? defaultLandmarks());
    this.proceduralPaths = baked?.paths ?? [];
    this.applyAuthored(ensureGardenGate(saved.props ?? this.proceduralAuthored));
    this.applyAuthoredPaths(saved.paths.length ? saved.paths : this.proceduralPaths);

    this.treeSpots = TREE_CLUSTERS.map(([x, z]) => new THREE.Vector2(x, z));

    // Light aerial haze so the ocean and far islets recede instead of sitting
    // as painted cutouts on the horizon.
    this.fog = new THREE.FogExp2(HAZE_COLOR.getHex(), 0.0045);
    this.root.userData.fog = this.fog;

    this.apply(tuning.get());
    this.unsubscribe = tuning.subscribe((values) => this.apply(values));

    this.buildWalkGrid();
  }

  get authoredProps(): AuthoredProp[] {
    return this.authored;
  }

  /** Harvest baskets the child placed — animals walk here to eat. */
  feederSpots(): { id: string; x: number; z: number; rotationY: number }[] {
    return this.authored
      .filter((prop) => prop.model === FEEDER_MODEL)
      .map((prop) => ({ id: prop.id, x: prop.x, z: prop.z, rotationY: prop.rotationY }));
  }

  get paintedPaths(): AuthoredPath[] {
    return this.authoredPaths;
  }

  get proceduralProps(): AuthoredProp[] {
    return this.proceduralAuthored;
  }

  get frozenPaths(): AuthoredPath[] {
    return this.proceduralPaths;
  }

  applyAuthored(props: AuthoredProp[]) {
    const previous = this.root.getObjectByName('idyllic-nature');
    if (previous) discardNatureGroup(previous);

    const scatter = new InstancedScatter(this.library);
    for (const prop of props) {
      if (!this.library.has(prop.model)) continue;
      scatter.place(prop.model, toPlacement(prop, this.groundAt(prop.x, prop.z)));
    }
    const group = scatter.build({
      name: 'idyllic-nature',
      castShadow: natureCastsShadow,
    });
    this.tagInstances(group, props);
    this.root.add(group);
    this.authored = props;
    this.requestWalkGrid();
  }

  /** Add one stamp without rebuilding every other model. */
  appendAuthored(prop: AuthoredProp) {
    this.authored = [...this.authored, prop];
    this.rebuildNatureModel(prop.model);
    this.requestWalkGrid();
  }

  /** Delete one stamp; only that model's instances are rebuilt. */
  removeAuthored(id: string) {
    const gone = this.authored.find((prop) => prop.id === id);
    if (!gone) return;
    this.authored = this.authored.filter((prop) => prop.id !== id);
    this.rebuildNatureModel(gone.model);
    this.requestWalkGrid();
  }

  applyAuthoredPaths(paths: AuthoredPath[]) {
    this.authoredPaths = paths;
    this.pathLayer.rebuild(paths);
    this.grassField.rebuild(paths);
  }

  patchAuthoredPath(id: string, patch: Partial<AuthoredPath>) {
    const index = this.authoredPaths.findIndex((path) => path.id === id);
    if (index < 0) return;
    this.authoredPaths[index] = { ...this.authoredPaths[index], ...patch };
    this.pathLayer.rebuild(this.authoredPaths);
  }

  /** Move/rotate one stamp without rebuilding every tree. */
  patchAuthored(id: string, patch: Partial<AuthoredProp>) {
    const index = this.authored.findIndex((prop) => prop.id === id);
    if (index < 0) return;
    const next = { ...this.authored[index], ...patch };
    this.authored[index] = next;
    const group = this.root.getObjectByName('idyllic-nature');
    if (!group || !this.library.has(next.model)) return;
    const model = this.library.get(next.model);
    const matrix = new THREE.Matrix4();
    composePlacement(model.size, toPlacement(next, this.groundAt(next.x, next.z)), matrix);
    group.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      if (mesh.name.split(':')[0] !== next.model) return;
      const ids = mesh.userData.propIds as string[] | undefined;
      const instance = ids?.indexOf(next.id) ?? -1;
      if (instance < 0) return;
      mesh.setMatrixAt(instance, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    this.requestWalkGrid();
  }

  private rebuildNatureModel(modelName: string) {
    const group = this.root.getObjectByName('idyllic-nature') as THREE.Group | undefined;
    if (!group) {
      this.applyAuthored(this.authored);
      return;
    }

    const stale = group.children.filter((child) => child.name.split(':')[0] === modelName);
    for (const child of stale) {
      child.removeFromParent();
    }

    const subset = this.authored.filter((prop) => prop.model === modelName && this.library.has(prop.model));
    if (subset.length) {
      const scatter = new InstancedScatter(this.library);
      for (const prop of subset) {
        scatter.place(prop.model, toPlacement(prop, this.groundAt(prop.x, prop.z)));
      }
      const piece = scatter.build({
        name: 'nature-piece',
        castShadow: natureCastsShadow,
      });
      while (piece.children.length) {
        group.add(piece.children[0]);
      }
    }

    this.tagInstances(group, this.authored);
  }

  private tagInstances(group: THREE.Group, props: AuthoredProp[]) {
    const idsByModel = new Map<string, string[]>();
    for (const prop of props) {
      const list = idsByModel.get(prop.model) ?? [];
      list.push(prop.id);
      idsByModel.set(prop.model, list);
    }
    group.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const model = mesh.name.split(':')[0];
      mesh.userData.propIds = idsByModel.get(model) ?? [];
    });
  }

  /** Pushes tunable look parameters into the lights and the fog. */
  apply(values: TuningValues) {
    this.lighting.apply(values);
    this.fog.density = values.fogDensity;
  }

  /** Height of whatever a creature would stand on, bridge deck included. */
  heightAt(x: number, z: number): number {
    return this.bridgeDeckHeight(x, z) ?? this.terrain.heightAt(x, z);
  }

  /** Lawn under a stamp. Ignores the invisible walk-deck so props sit on grass. */
  groundAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  pickGround(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    return this.terrain.pickSurface(raycaster);
  }

  isWalkable(x: number, z: number): boolean {
    if (!this.walkGrid) return false;
    const col = Math.round((x - ROAM_BOUNDS.minX) / this.gridStep);
    const row = Math.round((z - ROAM_BOUNDS.minZ) / this.gridStep);
    if (col < 0 || row < 0 || col >= this.gridCols || row >= this.gridRows) return false;
    return this.walkGrid[row * this.gridCols + col] === 1;
  }

  private requestWalkGrid() {
    if (!this.walkGrid) return;
    if (this.walkGridTimer) return;
    this.walkGridTimer = window.setTimeout(() => {
      this.walkGridTimer = 0;
      this.buildWalkGrid();
    }, 180);
  }

  /**
   * Where a chudik may stand: on the lawn, out of the water, clear of trunks.
   * The bridge deck counts, so they can cross the creek.
   *
   * Props and ponds are stamped as discs instead of tested against every cell
   * — 250 stamps × 9k cells froze the tab when the editor dragged a bush.
   */
  private buildWalkGrid() {
    this.gridCols = Math.floor((ROAM_BOUNDS.maxX - ROAM_BOUNDS.minX) / this.gridStep) + 1;
    this.gridRows = Math.floor((ROAM_BOUNDS.maxZ - ROAM_BOUNDS.minZ) / this.gridStep) + 1;
    this.walkGrid = new Uint8Array(this.gridCols * this.gridRows);

    for (let row = 0; row < this.gridRows; row++) {
      for (let col = 0; col < this.gridCols; col++) {
        const x = ROAM_BOUNDS.minX + col * this.gridStep;
        const z = ROAM_BOUNDS.minZ + row * this.gridStep;
        this.walkGrid[row * this.gridCols + col] = this.computeWalkableBase(x, z) ? 1 : 0;
      }
    }

    const ponds = this.authored.filter((prop) => prop.model === 'lotus-pond');
    if (ponds.length) {
      for (const pond of ponds) {
        this.stampBlockedDisc(pond.x, pond.z, pondRadius(pond) + 0.55, true);
      }
    } else {
      for (const pond of PONDS) {
        this.stampBlockedDisc(
          pond.center.x,
          pond.center.y,
          Math.max(pond.radiusX, pond.radiusZ) + 0.55,
          true,
        );
      }
    }

    for (const prop of this.authored) {
      const radius = this.library.has(prop.model)
        ? placedWalkRadius(prop, this.library.get(prop.model).size)
        : walkFootprint(prop);
      if (radius <= 0) continue;
      this.stampBlockedDisc(prop.x, prop.z, radius, false);
    }
  }

  private stampBlockedDisc(cx: number, cz: number, radius: number, keepBridge: boolean) {
    if (!this.walkGrid) return;
    const minCol = Math.max(0, Math.floor((cx - radius - ROAM_BOUNDS.minX) / this.gridStep));
    const maxCol = Math.min(
      this.gridCols - 1,
      Math.ceil((cx + radius - ROAM_BOUNDS.minX) / this.gridStep),
    );
    const minRow = Math.max(0, Math.floor((cz - radius - ROAM_BOUNDS.minZ) / this.gridStep));
    const maxRow = Math.min(
      this.gridRows - 1,
      Math.ceil((cz + radius - ROAM_BOUNDS.minZ) / this.gridStep),
    );
    const r2 = radius * radius;
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = ROAM_BOUNDS.minX + col * this.gridStep;
        const z = ROAM_BOUNDS.minZ + row * this.gridStep;
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz > r2) continue;
        if (keepBridge && this.bridgeDeckHeight(x, z) !== null) continue;
        this.walkGrid[row * this.gridCols + col] = 0;
      }
    }
  }

  private computeWalkableBase(x: number, z: number): boolean {
    if (!inWalkZone(x, z)) return false;
    const onBridge = this.bridgeDeckHeight(x, z) !== null;
    if (this.terrain.creekCut(x, z) > 0.12 && !onBridge) return false;
    for (const spot of this.treeSpots) {
      const dx = spot.x - x;
      const dz = spot.y - z;
      if (dx * dx + dz * dz < 2.2) return false;
    }
    if (this.terrain.slopeAt(x, z) > 0.8) return false;
    return true;
  }

  /** Deck height if the point is on the bridge, otherwise null. */
  private bridgeDeckHeight(x: number, z: number): number | null {
    const dx = x - BRIDGE.center.x;
    const dz = z - BRIDGE.center.z;
    const cos = Math.cos(BRIDGE.yaw);
    const sin = Math.sin(BRIDGE.yaw);
    const along = dx * cos + dz * sin;
    const across = -dx * sin + dz * cos;

    if (Math.abs(along) > BRIDGE.length / 2) return null;
    if (Math.abs(across) > BRIDGE.width / 2 - 0.3) return null;

    const t = along / BRIDGE.length + 0.5;
    const base = Math.max(
      POND.surfaceY + 0.2,
      this.terrain.heightAt(BRIDGE.center.x, BRIDGE.center.z) + 0.15,
    );
    return base + BRIDGE.arc * Math.sin(Math.PI * t) + 0.1;
  }

  /**
   * Somewhere pleasant to put a newly hatched creature. Without a hint it draws
   * from the clearings themselves rather than from the roam bounding box, which
   * is now mostly forest and would reject nearly every sample.
   */
  findOpenSpot(rng: () => number, near?: THREE.Vector3): THREE.Vector3 {
    for (let i = 0; i < 300; i++) {
      let x: number;
      let z: number;
      if (near) {
        x = near.x + (rng() - 0.5) * 6;
        z = near.z + (rng() - 0.5) * 6;
      } else {
        const zone = ZONES[Math.floor(rng() * ZONES.length) % ZONES.length];
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * 0.85;
        x = zone.center.x + Math.cos(angle) * zone.radiusX * radius;
        z = zone.center.y + Math.sin(angle) * zone.radiusZ * radius;
      }
      if (this.isWalkable(x, z)) return new THREE.Vector3(x, this.heightAt(x, z), z);
    }
    if (this.walkGrid) {
      for (let i = 0; i < this.walkGrid.length; i++) {
        if (this.walkGrid[i] !== 1) continue;
        const col = i % this.gridCols;
        const row = (i / this.gridCols) | 0;
        const x = ROAM_BOUNDS.minX + col * this.gridStep;
        const z = ROAM_BOUNDS.minZ + row * this.gridStep;
        return new THREE.Vector3(x, this.heightAt(x, z), z);
      }
    }
    return new THREE.Vector3(2.4, this.heightAt(2.4, 2.2), 2.2);
  }

  get pondCenter(): THREE.Vector3 {
    return new THREE.Vector3(POND.center.x, POND.surfaceY, POND.center.y);
  }

  update(elapsed: number) {
    this.water.update(elapsed, this.sun);
    this.grassField.update(elapsed);
  }

  dispose() {
    if (this.walkGridTimer) window.clearTimeout(this.walkGridTimer);
    this.unsubscribe();
    this.pathLayer.dispose();
    this.grassField.dispose();
    this.terrain.dispose();
    this.water.dispose();
    this.library.dispose();
  }
}

/** Drop an InstancedScatter group without disposing shared library geometry. */
function discardNatureGroup(group: THREE.Object3D) {
  group.removeFromParent();
}