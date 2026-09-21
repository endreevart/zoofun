import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { IdyllicLibrary } from '../assets/IdyllicLibrary';
import {
  composePlacement,
  disposeScatter,
  InstancedScatter,
  setScatterFrustumCulling,
} from '../assets/InstancedScatter';
import { Terrain } from './Terrain';
import { Water } from './Water';
import { applyMeadowCloudTuning, createSky, fogDensityForShell, hazeForShell, usesPuffyClouds } from './Sky';
import { createPaths } from './Paths';
import { Lighting } from './lighting';
import { lookForShell, quality } from '../render/quality';
import { tuning, type TuningValues } from '../render/tuning';
import { createStructures } from './idyllic/structures';
import {
  BRIDGE,
  MEADOW_SPAWN,
  POND,
  PONDS,
  ROAM_BOUNDS,
  ZONES,
  onIsland,
} from './layout';
import { PathLayer } from './PathLayer';
import { SpawnLayer } from './SpawnLayer';
import { GrassField } from './GrassField';
import {
  childCatalogForShell,
  defaultLandmarks,
  ensureGardenGate,
  loadBakedLayout,
  resolveLayoutDocument,
  authoredGroundY,
  natureCastsShadow,
  POND_WALK_MARGIN,
  pondRadius,
  placedWalkRadius,
  toPlacement,
  walkFootprint,
  type AuthoredPath,
  type AuthoredProp,
  type AuthoredSpawn,
  type LayoutDocument,
} from './layoutAuthored';
import { sampleSpawnPoint } from './layoutSpawns';
import { FEEDER_MODEL } from '../care/feedingPlan';
import {
  buildContactShadows,
  disposeContactShadows,
} from './contactShadows';
import { islandModelForShell, isHangingShell, skipsIslandShadows, usesLawnCatcher, type WorldShell } from './kinds';
import { isPlazaToyModel } from '../plaza/plazaToy';
import { DiyToyLayer } from './diyToys';

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
export type WorldMode = 'authored' | 'diy';
export type { WorldShell } from './kinds';

export class World implements WalkableQuery {
  readonly root = new THREE.Group();
  readonly terrain: Terrain;
  readonly water: Water;
  readonly sun: THREE.DirectionalLight;
  readonly library: IdyllicLibrary;
  readonly shell: WorldShell;

  private lighting!: Lighting;
  private fog!: THREE.FogExp2;
  private unsubscribe: () => void = () => {};
  readonly pathLayer: PathLayer;
  readonly spawnLayer: SpawnLayer;
  readonly grassField: GrassField;
  private toys: DiyToyLayer;
  private authored: AuthoredProp[] = [];
  private authoredPaths: AuthoredPath[] = [];
  private authoredSpawns: AuthoredSpawn[] = [];
  private proceduralPaths: AuthoredPath[] = [];
  private proceduralAuthored: AuthoredProp[] = [];
  private proceduralSpawns: AuthoredSpawn[] = [];

  /** Precomputed walkability, sampled on a grid so the per-frame check is O(1). */
  private walkGrid: Uint8Array | null = null;
  private gridStep = 0.5;
  private gridCols = 0;
  private gridRows = 0;
  private walkGridTimer = 0;
  private natureFrustumCulling = true;
  private lastContactAzimuth = Number.NaN;
  private gardenJoy = 0;

  static async create(
    seed = 20260901,
    onProgress?: (done: number, total: number) => void,
    options: {
      mode?: WorldMode;
      shell?: WorldShell;
      catalog?: string[];
      diyProps?: AuthoredProp[];
      signal?: AbortSignal;
      renderer?: THREE.WebGLRenderer;
    } = {},
  ): Promise<World> {
    const mode = options.mode ?? 'authored';
    const shell = options.shell ?? 'garden';
    const island = islandModelForShell(shell);
    if (mode === 'diy') {
      const diyProps = options.diyProps ?? [];
      const stamps = options.catalog ?? [...childCatalogForShell(shell)];
      const library = await IdyllicLibrary.load(onProgress, [
        island,
        ...(shell === 'garden' ? ['grass_a', 'grass_b'] : []),
        ...stamps,
        ...diyProps.map((prop) => prop.model).filter((model) => !isPlazaToyModel(model)),
      ], options.signal, options.renderer);
      const saved: LayoutDocument = { props: diyProps, paths: [], spawns: [] };
      try {
        return new World(library, seed, saved, null, 'diy', shell);
      } catch (error) {
        library.dispose();
        throw error;
      }
    }
    const [saved, baked] = await Promise.all([resolveLayoutDocument(shell), loadBakedLayout(shell)]);
    const rawProps = saved.props ?? baked?.props ?? (shell === 'garden' ? defaultLandmarks() : []);
    const props = shell === 'garden' ? ensureGardenGate(rawProps) : rawProps;
    const library = await IdyllicLibrary.load(onProgress, [
      island,
      ...(shell === 'garden' ? ['grass_a', 'grass_b'] : []),
      ...props.map((prop) => prop.model),
    ], options.signal, options.renderer);
    try {
      return new World(library, seed, saved, baked, 'authored', shell);
    } catch (error) {
      library.dispose();
      throw error;
    }
  }

  private constructor(
    library: IdyllicLibrary,
    seed: number,
    saved: LayoutDocument,
    baked: LayoutDocument | null,
    mode: WorldMode = 'authored',
    shell: WorldShell = 'garden',
  ) {
    this.library = library;
    this.shell = shell;
    this.root.name = 'world';

    this.root.add(createSky(shell));

    this.lighting = new Lighting(
      lookForShell(quality(), isHangingShell(shell)),
      isHangingShell(shell),
    );
    this.sun = this.lighting.sun;
    this.root.add(this.lighting.group);

    this.terrain = new Terrain(
      seed + 3,
      library.groundTexture('grass_albedo', 26),
      library.groundTexture('grass_normal', 26),
    );
    this.terrain.adoptFloatingIsland(
      library,
      islandModelForShell(shell),
      usesLawnCatcher(shell),
    );
    this.root.add(this.terrain.group);

    this.water = new Water();
    if (shell === 'garden') this.root.add(this.water.group);

    // Dirt ribbons were built for the procedural lawn. On the Meshy platform
    // they sit inside the grass and read as those thin brown slivers. Painted
    // paths from the layout brush live in PathLayer instead.
    if (shell === 'garden' && !this.terrain.usesFloatingIsland) {
      this.root.add(createPaths(library, this.terrain));
    }

    this.pathLayer = new PathLayer(this.terrain);
    this.root.add(this.pathLayer.group);
    this.spawnLayer = new SpawnLayer(this.terrain);
    this.root.add(this.spawnLayer.group);
    this.grassField = new GrassField(this.terrain, library);
    if (shell === 'garden') this.root.add(this.grassField.group);
    this.toys = new DiyToyLayer(this.root, (x, z) => this.groundAt(x, z));

    if (mode !== 'diy' && shell === 'garden') {
      const scatter = new InstancedScatter(library);
      this.root.add(createStructures(library, this.terrain, scatter, mulberry32(seed + 19)));
    }
    if (mode === 'diy') {
      this.proceduralAuthored = [];
      this.proceduralPaths = [];
      this.proceduralSpawns = [];
      this.applyAuthored(saved.props ?? []);
      this.applyAuthoredPaths([]);
      this.applyAuthoredSpawns([]);
    } else if (shell === 'garden') {
      this.proceduralAuthored = ensureGardenGate(baked?.props ?? defaultLandmarks());
      this.proceduralPaths = baked?.paths ?? [];
      this.proceduralSpawns = baked?.spawns ?? [];
      this.applyAuthored(ensureGardenGate(saved.props ?? this.proceduralAuthored));
      this.applyAuthoredPaths(saved.paths.length ? saved.paths : this.proceduralPaths);
      this.applyAuthoredSpawns(saved.spawns.length ? saved.spawns : this.proceduralSpawns);
    } else {
      this.proceduralAuthored = baked?.props ?? [];
      this.proceduralPaths = baked?.paths ?? [];
      this.proceduralSpawns = baked?.spawns ?? [];
      this.applyAuthored(saved.props ?? this.proceduralAuthored);
      this.applyAuthoredPaths(saved.paths.length ? saved.paths : this.proceduralPaths);
      this.applyAuthoredSpawns(saved.spawns.length ? saved.spawns : this.proceduralSpawns);
    }

    // Light aerial haze so the ocean and far islets recede instead of sitting
    // as painted cutouts on the horizon. The hanging meadow keeps more sky.
    this.fog = new THREE.FogExp2(hazeForShell(shell).getHex(), fogDensityForShell(shell));
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

  /** Zones the adult painted for new eggs. Empty means "use the meadow". */
  get spawnZones(): AuthoredSpawn[] {
    return this.authoredSpawns;
  }

  get frozenSpawns(): AuthoredSpawn[] {
    return this.proceduralSpawns;
  }

  applyAuthored(props: AuthoredProp[]) {
    const previous = this.root.getObjectByName('idyllic-nature');
    if (previous) discardNatureGroup(previous);

    const scatter = new InstancedScatter(this.library);
    for (const prop of props) {
      if (!this.library.has(prop.model)) continue;
      scatter.place(prop.model, this.placementOf(prop));
    }
    const group = scatter.build({
      name: 'idyllic-nature',
      castShadow: skipsIslandShadows(this.shell) ? false : natureCastsShadow,
      receiveShadow: true,
      spatial: useSpatialBatches(),
    });
    this.tagInstances(group, props);
    this.root.add(group);
    this.authored = props;
    this.toys.sync(this.authored);
    this.refreshContactShadows();
    this.requestWalkGrid();
  }

  /** Add one stamp without rebuilding every other model. */
  appendAuthored(prop: AuthoredProp) {
    this.authored = [...this.authored, prop];
    if (isPlazaToyModel(prop.model)) this.toys.sync(this.authored);
    else this.rebuildNatureModel(prop.model);
    this.requestWalkGrid();
  }

  /** Delete one stamp; only that model's instances are rebuilt. */
  removeAuthored(id: string) {
    const gone = this.authored.find((prop) => prop.id === id);
    if (!gone) return;
    this.authored = this.authored.filter((prop) => prop.id !== id);
    if (isPlazaToyModel(gone.model)) this.toys.sync(this.authored);
    else this.rebuildNatureModel(gone.model);
    this.requestWalkGrid();
  }

  applyAuthoredPaths(paths: AuthoredPath[]) {
    this.authoredPaths = paths;
    this.pathLayer.rebuild(paths);
    if (this.shell === 'garden') this.grassField.rebuild(paths);
  }

  patchAuthoredPath(id: string, patch: Partial<AuthoredPath>) {
    const index = this.authoredPaths.findIndex((path) => path.id === id);
    if (index < 0) return;
    this.authoredPaths[index] = { ...this.authoredPaths[index], ...patch };
    this.pathLayer.rebuild(this.authoredPaths);
  }

  applyAuthoredSpawns(spawns: AuthoredSpawn[]) {
    this.authoredSpawns = spawns;
    this.spawnLayer.rebuild(spawns);
  }

  patchAuthoredSpawn(id: string, patch: Partial<AuthoredSpawn>) {
    const index = this.authoredSpawns.findIndex((zone) => zone.id === id);
    if (index < 0) return;
    this.authoredSpawns[index] = { ...this.authoredSpawns[index], ...patch };
    this.spawnLayer.rebuild(this.authoredSpawns);
  }

  /** Move/rotate one stamp without rebuilding every tree. */
  patchAuthored(id: string, patch: Partial<AuthoredProp>) {
    const index = this.authored.findIndex((prop) => prop.id === id);
    if (index < 0) return;
    const next = { ...this.authored[index], ...patch };
    if ((patch.x !== undefined || patch.z !== undefined) && patch.y === undefined) {
      next.y = this.groundAt(next.x, next.z);
    }
    this.authored[index] = next;
    if (isPlazaToyModel(next.model)) {
      this.toys.sync(this.authored);
      this.refreshContactShadows();
      this.requestWalkGrid();
      return;
    }
    const group = this.root.getObjectByName('idyllic-nature');
    if (!group || !this.library.has(next.model)) return;
    const model = this.library.get(next.model);
    const matrix = new THREE.Matrix4();
    group.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const [modelName, materialName] = mesh.name.split(':');
      if (modelName !== next.model) return;
      const ids = mesh.userData.propIds as string[] | undefined;
      const instance = ids?.indexOf(next.id) ?? -1;
      if (instance < 0) return;
      const primitive = model.primitives.find((item) => item.materialName === materialName);
      composePlacement(model.size, this.placementOf(next), matrix, primitive?.matrix);
      mesh.setMatrixAt(instance, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    this.refreshContactShadows();
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
      // Removing an InstancedMesh does not release its per-instance matrix and
      // colour buffers. DIY editing can rebuild the same tree dozens of times.
      disposeScatter(child);
    }

    const subset = this.authored.filter((prop) => prop.model === modelName && this.library.has(prop.model));
    if (subset.length) {
      const scatter = new InstancedScatter(this.library);
      for (const prop of subset) {
        scatter.place(prop.model, this.placementOf(prop));
      }
      const piece = scatter.build({
        name: 'nature-piece',
        castShadow: skipsIslandShadows(this.shell) ? false : natureCastsShadow,
        receiveShadow: true,
        spatial: useSpatialBatches(),
      });
      while (piece.children.length) {
        group.add(piece.children[0]);
      }
    }

    this.tagInstances(group, this.authored);
    this.refreshContactShadows();
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
      const allIds = idsByModel.get(model) ?? [];
      const placementIndices = mesh.userData.placementIndices as number[] | undefined;
      mesh.userData.propIds = placementIndices
        ? placementIndices.map((index) => allIds[index]).filter(Boolean)
        : allIds;
    });
  }

  /** Flat CPU bounds are valid during close play, before the shader bends the world. */
  setNatureFrustumCulling(enabled: boolean) {
    if (enabled === this.natureFrustumCulling) return;
    this.natureFrustumCulling = enabled;
    const nature = this.root.getObjectByName('idyllic-nature');
    if (nature) setScatterFrustumCulling(nature, enabled);
  }

  /** Pushes tunable look parameters into the lights and the fog. */
  setGardenJoy(amount: number) {
    this.gardenJoy = Math.max(0, Math.min(1, amount));
    this.apply(tuning.get());
  }

  apply(values: TuningValues) {
    this.lighting.apply(values);
    this.lighting.applyJoy(this.gardenJoy);
    if (isHangingShell(this.shell) && values.sunAzimuth !== this.lastContactAzimuth) {
      this.refreshContactShadows(values.sunAzimuth);
    }
    this.fog.density =
      values.fogDensity * (fogDensityForShell(this.shell) / 0.0042);
    if (usesPuffyClouds(this.shell)) {
      const dome = this.root.getObjectByName('sky-dome');
      if (dome instanceof THREE.Mesh && dome.material instanceof THREE.ShaderMaterial) {
        applyMeadowCloudTuning(dome.material, values);
      }
    }
  }

  /** Height of whatever a creature would stand on, bridge deck included. */
  heightAt(x: number, z: number): number {
    return this.bridgeDeckHeight(x, z) ?? this.terrain.heightAt(x, z);
  }

  /** Lawn under a stamp. Ignores the invisible walk-deck so props sit on grass. */
  groundAt(x: number, z: number): number {
    return this.terrain.stampHeight(x, z);
  }

  private placementOf(prop: AuthoredProp) {
    return toPlacement(prop, authoredGroundY(prop, () => this.groundAt(prop.x, prop.z)));
  }

  pickGround(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    return this.terrain.pickSurface(raycaster);
  }

  pickToy(raycaster: THREE.Raycaster): string | null {
    return this.toys.pick(raycaster);
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
   * Where a chudik may stand: the island lawn, out of the water, clear of
   * trunks and houses. Canopies, bushes, rocks and flowers stay open.
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
        this.stampBlockedDisc(pond.x, pond.z, pondRadius(pond) + POND_WALK_MARGIN, true);
      }
    } else {
      for (const pond of PONDS) {
        this.stampBlockedDisc(
          pond.center.x,
          pond.center.y,
          Math.max(pond.radiusX, pond.radiusZ) + POND_WALK_MARGIN,
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
    if (isHangingShell(this.shell)) {
      if (!this.terrain.hasWalkSurface(x, z)) return false;
      return this.terrain.slopeAt(x, z) <= 0.8;
    }
    if (!onIsland(x, z, 2.2)) return false;
    const onBridge = this.bridgeDeckHeight(x, z) !== null;
    if (this.terrain.creekCut(x, z) > 0.12 && !onBridge) return false;
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

  /**
   * Where a new egg goes: inside a zone the adult painted in the layout
   * editor, or on the main meadow when none are painted.
   */
  findSpawnSpot(rng: () => number): THREE.Vector3 {
    const chosen = sampleSpawnPoint(this.authoredSpawns, rng, (x, z) => this.isWalkable(x, z));
    if (chosen) return new THREE.Vector3(chosen.x, this.heightAt(chosen.x, chosen.z), chosen.z);
    return this.findOpenSpot(rng, MEADOW_SPAWN);
  }

  get pondCenter(): THREE.Vector3 {
    return new THREE.Vector3(POND.center.x, POND.surfaceY, POND.center.y);
  }

  update(elapsed: number) {
    this.water.update(elapsed, this.sun);
    this.grassField.update(elapsed);
  }

  private refreshContactShadows(azimuthDeg = tuning.get().sunAzimuth) {
    disposeContactShadows(this.root);
    if (!isHangingShell(this.shell)) return;
    this.root.add(
      buildContactShadows(
        this.authored.filter((prop) => natureCastsShadow(prop.model)),
        (model) => (this.library.has(model) ? this.library.get(model).size : undefined),
        (x, z) => this.groundAt(x, z),
        azimuthDeg,
      ),
    );
    this.lastContactAzimuth = azimuthDeg;
  }

  dispose() {
    if (this.walkGridTimer) window.clearTimeout(this.walkGridTimer);
    this.unsubscribe();
    disposeContactShadows(this.root);
    this.pathLayer.dispose();
    this.spawnLayer.dispose();
    this.grassField.dispose();
    this.terrain.dispose();
    this.water.dispose();
    this.toys.dispose();
    const nature = this.root.getObjectByName('idyllic-nature');
    if (nature) disposeScatter(nature);
    const sky = this.root.getObjectByName('sky');
    sky?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.dispose();
      }
    });
    this.root.removeFromParent();
    this.root.clear();
    this.library.dispose();
  }
}

/** Drop an InstancedScatter group without disposing shared library geometry. */
function discardNatureGroup(group: THREE.Object3D) {
  disposeScatter(group);
}

/** Dev A/B for the repeatable mobile render benchmark. */
function useSpatialBatches(): boolean {
  if (quality().tier !== 'low') return false;
  try {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('spatial') === '0') {
      return false;
    }
  } catch {
    /* SSR/tests */
  }
  return true;
}
