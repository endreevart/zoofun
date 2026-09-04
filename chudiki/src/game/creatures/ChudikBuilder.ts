import * as THREE from 'three';
import { EYE } from '../core/palette';
import { bakePaintables, blobGeometry, createToyMaterial, Paintable } from '../core/geometry';
import { mulberry32, range } from '../core/rng';
import type { BodyShape, ChudikSpec } from './ChudikSpec';

/**
 * Turns a spec into a small puppet. Everything is procedural geometry: no
 * models to download, and a creature can be rebuilt from its seed alone.
 */

export type ChudikRig = {
  root: THREE.Group;
  /** Vertical hop, driven by the walk cycle. */
  bounce: THREE.Group;
  /** Squash and stretch, driven by breathing and landings. */
  squash: THREE.Group;
  eyes: THREE.Group[];
  pupils: THREE.Group[];
  ears: THREE.Group[];
  wings: THREE.Group[];
  tail: THREE.Group | null;
  /** Distance from the feet to the top of the head, for labels and camera. */
  height: number;
  /** Horizontal footprint, used for tap targets and spacing. */
  radius: number;
  /** Cracks on a waiting egg. Missing on hatched puppets. */
  setHatchLook?(progress: number): void;
  dispose(): void;
};

let sharedMaterial: THREE.MeshStandardMaterial | null = null;

/** One material for every procedural chudik: colour lives in the vertices. */
function chudikMaterial(): THREE.MeshStandardMaterial {
  if (!sharedMaterial) {
    sharedMaterial = createToyMaterial({ vertexColors: true, roughness: 0.58 });
  }
  return sharedMaterial;
}

type BodyDims = {
  radius: number;
  squash: THREE.Vector3;
  centerY: number;
  headY: number;
  frontZ: number;
};

function bodyDims(shape: BodyShape, size: number): BodyDims {
  // Roughly a third of a small tree, so a chudik reads clearly from the wide
  // establishing shot without dwarfing the flower beds.
  const radius = 0.86 * size;
  const squash = {
    blob: new THREE.Vector3(1.12, 0.94, 1.02),
    egg: new THREE.Vector3(0.94, 1.22, 0.94),
    pear: new THREE.Vector3(1.06, 1.02, 1.0),
    round: new THREE.Vector3(1.0, 1.0, 1.0),
    tall: new THREE.Vector3(0.82, 1.45, 0.82),
  }[shape];

  const centerY = radius * squash.y * 0.96;
  return {
    radius,
    squash,
    centerY,
    headY: centerY + radius * squash.y * 0.62,
    frontZ: radius * squash.z,
  };
}

export function buildChudik(spec: ChudikSpec): ChudikRig {
  const rng = mulberry32(spec.seed ^ 0xa11ce);
  const dims = bodyDims(spec.bodyShape, spec.size);

  const root = new THREE.Group();
  root.name = `chudik:${spec.id}`;
  const bounce = new THREE.Group();
  const squash = new THREE.Group();
  root.add(bounce);
  bounce.add(squash);

  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  const bodyParts: Paintable[] = [];

  addBody(bodyParts, spec, dims, rng);
  addLimbs(bodyParts, spec, dims, rng);

  const bodyMesh = new THREE.Mesh(bakePaintables(bodyParts), chudikMaterial());
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.userData.chudikId = spec.id;
  squash.add(bodyMesh);
  disposables.push(bodyMesh.geometry);

  const eyeRig = addEyes(squash, spec, dims, disposables);
  const ears = addEars(squash, spec, dims, rng, disposables);
  const wings = spec.hasWings ? addWings(squash, spec, dims, disposables) : [];
  const tail = spec.hasTail ? addTail(squash, spec, dims, disposables) : null;

  return {
    root,
    bounce,
    squash,
    eyes: eyeRig.eyes,
    pupils: eyeRig.pupils,
    ears,
    wings,
    tail,
    height: dims.headY + dims.radius * 0.8,
    radius: dims.radius * dims.squash.x * 1.1,
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}

function addBody(parts: Paintable[], spec: ChudikSpec, dims: BodyDims, rng: () => number) {
  parts.push({
    geometry: blobGeometry(dims.radius, dims.squash, 24),
    color: spec.bodyColor,
    position: new THREE.Vector3(0, dims.centerY, 0),
  });

  // Pear shapes get a heavier bottom so the silhouette stays readable.
  if (spec.bodyShape === 'pear') {
    parts.push({
      geometry: blobGeometry(dims.radius * 0.86, new THREE.Vector3(1.2, 0.8, 1.1), 20),
      color: spec.bodyColor,
      position: new THREE.Vector3(0, dims.centerY - dims.radius * 0.42, 0),
    });
  }

  // Pale belly patch, pressed slightly into the front of the body.
  parts.push({
    geometry: blobGeometry(dims.radius * 0.62, new THREE.Vector3(1.0, 0.95, 0.42), 18),
    color: spec.bellyColor,
    position: new THREE.Vector3(0, dims.centerY - dims.radius * 0.2, dims.frontZ * 0.74),
  });

  // A cheek blush on some of them, straight from the reference cast.
  if (rng() < 0.5) {
    for (const side of [-1, 1]) {
      parts.push({
        geometry: blobGeometry(dims.radius * 0.17, new THREE.Vector3(1, 0.7, 0.35), 10),
        color: spec.accentColor,
        position: new THREE.Vector3(
          side * dims.radius * 0.62,
          dims.headY - dims.radius * 0.22,
          dims.frontZ * 0.66,
        ),
      });
    }
  }
}

function addLimbs(parts: Paintable[], spec: ChudikSpec, dims: BodyDims, rng: () => number) {
  const footRadius = dims.radius * 0.26;

  if (spec.legCount === 0) {
    // No legs: a soft base so it reads as sitting rather than floating.
    parts.push({
      geometry: blobGeometry(dims.radius * 0.78, new THREE.Vector3(1.15, 0.28, 1.05), 16),
      color: spec.bellyColor,
      position: new THREE.Vector3(0, footRadius * 0.5, 0),
    });
    return;
  }

  const rows = spec.legCount === 4 ? [dims.radius * 0.5, -dims.radius * 0.42] : [dims.radius * 0.34];
  for (const z of rows) {
    for (const side of [-1, 1]) {
      parts.push({
        geometry: blobGeometry(footRadius, new THREE.Vector3(0.9, 0.72, 1.35), 12),
        color: spec.accentColor,
        position: new THREE.Vector3(side * dims.radius * 0.46, footRadius * 0.72, z),
      });
    }
  }

  // Stubby side arms; the reference creatures have these little nubs.
  if (rng() < 0.7) {
    for (const side of [-1, 1]) {
      parts.push({
        geometry: blobGeometry(dims.radius * 0.2, new THREE.Vector3(0.8, 0.8, 1.5), 12),
        color: spec.bodyColor,
        position: new THREE.Vector3(
          side * dims.radius * dims.squash.x * 0.92,
          dims.centerY - dims.radius * 0.1,
          dims.radius * 0.18,
        ),
        rotation: new THREE.Euler(0, side * 0.5, side * -0.4),
      });
    }
  }
}

function addEyes(
  parent: THREE.Group,
  spec: ChudikSpec,
  dims: BodyDims,
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>,
): { eyes: THREE.Group[]; pupils: THREE.Group[] } {
  const eyes: THREE.Group[] = [];
  const pupils: THREE.Group[] = [];

  // The oversized, protruding eyes are the signature of this world.
  const eyeRadius = dims.radius * 0.38 * spec.eyeScale;
  const spacing = eyeRadius * 0.94;
  const eyeY = dims.headY - eyeRadius * 0.15;
  const eyeZ = dims.frontZ * 0.66 + eyeRadius * 0.42;

  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    group.position.set(side * spacing, eyeY, eyeZ);
    parent.add(group);

    const white = new THREE.Mesh(
      bakePaintables([
        {
          geometry: blobGeometry(eyeRadius, new THREE.Vector3(1, 1.06, 0.9), 20),
          color: EYE.white,
        },
      ]),
      chudikMaterial(),
    );
    white.castShadow = true;
    white.userData.chudikId = spec.id;
    group.add(white);
    disposables.push(white.geometry);

    const pupilGroup = new THREE.Group();
    const pupil = new THREE.Mesh(
      bakePaintables([
        {
          geometry: blobGeometry(eyeRadius * 0.52, new THREE.Vector3(1, 1.1, 0.85), 16),
          color: EYE.pupil,
          position: new THREE.Vector3(0, 0, 0),
        },
        {
          geometry: blobGeometry(eyeRadius * 0.15, new THREE.Vector3(1, 1, 1), 10),
          color: EYE.glint,
          position: new THREE.Vector3(
            -side * eyeRadius * 0.16,
            eyeRadius * 0.2,
            eyeRadius * 0.34,
          ),
        },
      ]),
      chudikMaterial(),
    );
    pupil.userData.chudikId = spec.id;
    pupilGroup.add(pupil);
    pupilGroup.position.z = eyeRadius * 0.58;
    group.add(pupilGroup);
    disposables.push(pupil.geometry);

    eyes.push(group);
    pupils.push(pupilGroup);
  }

  return { eyes, pupils };
}

function addEars(
  parent: THREE.Group,
  spec: ChudikSpec,
  dims: BodyDims,
  rng: () => number,
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>,
): THREE.Group[] {
  if (spec.earType === 'none') return [];

  const pivots: THREE.Group[] = [];
  const topY = dims.headY + dims.radius * 0.28;

  const makePivot = (x: number, y: number, z: number, tiltZ: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.z = tiltZ;
    parent.add(pivot);
    pivots.push(pivot);
    return pivot;
  };

  const attach = (pivot: THREE.Group, parts: Paintable[]) => {
    const mesh = new THREE.Mesh(bakePaintables(parts), chudikMaterial());
    mesh.castShadow = true;
    mesh.userData.chudikId = spec.id;
    pivot.add(mesh);
    disposables.push(mesh.geometry);
  };

  switch (spec.earType) {
    case 'bunny': {
      const length = dims.radius * range(rng, 1.4, 2.1);
      const width = dims.radius * 0.19;
      for (const side of [-1, 1]) {
        const pivot = makePivot(side * dims.radius * 0.34, topY, 0, side * 0.22);
        attach(pivot, [
          {
            geometry: new THREE.CapsuleGeometry(width, length, 4, 12),
            color: spec.bodyColor,
            position: new THREE.Vector3(0, length / 2, 0),
          },
          {
            geometry: new THREE.CapsuleGeometry(width * 0.55, length * 0.72, 4, 10),
            color: spec.accentColor,
            position: new THREE.Vector3(0, length / 2, width * 0.62),
          },
        ]);
      }
      break;
    }
    case 'horns': {
      const length = dims.radius * range(rng, 0.6, 0.95);
      for (const side of [-1, 1]) {
        const pivot = makePivot(side * dims.radius * 0.42, topY, 0, side * 0.5);
        attach(pivot, [
          {
            geometry: new THREE.ConeGeometry(dims.radius * 0.17, length, 10),
            color: spec.accentColor,
            position: new THREE.Vector3(0, length / 2, 0),
          },
        ]);
      }
      break;
    }
    case 'antennae': {
      const length = dims.radius * range(rng, 0.9, 1.5);
      for (const side of [-1, 1]) {
        const pivot = makePivot(side * dims.radius * 0.28, topY, 0, side * 0.3);
        attach(pivot, [
          {
            geometry: new THREE.CylinderGeometry(dims.radius * 0.05, dims.radius * 0.06, length, 6),
            color: spec.accentColor,
            position: new THREE.Vector3(0, length / 2, 0),
          },
          {
            geometry: blobGeometry(dims.radius * 0.15, new THREE.Vector3(1, 1, 1), 12),
            color: spec.accentColor,
            position: new THREE.Vector3(0, length, 0),
          },
        ]);
      }
      break;
    }
    case 'crest': {
      const pivot = makePivot(0, topY - dims.radius * 0.08, 0, 0);
      const spikes = 3 + Math.floor(rng() * 3);
      const parts: Paintable[] = [];
      for (let i = 0; i < spikes; i++) {
        const t = spikes === 1 ? 0.5 : i / (spikes - 1);
        const height = dims.radius * (0.4 + Math.sin(t * Math.PI) * 0.55);
        parts.push({
          geometry: new THREE.ConeGeometry(dims.radius * 0.15, height, 8),
          color: spec.accentColor,
          position: new THREE.Vector3(0, height / 2, (t - 0.5) * dims.radius * 0.9),
          rotation: new THREE.Euler((t - 0.5) * -0.7, 0, 0),
        });
      }
      attach(pivot, parts);
      break;
    }
    case 'fins': {
      for (const side of [-1, 1]) {
        const pivot = makePivot(
          side * dims.radius * dims.squash.x * 0.78,
          dims.headY - dims.radius * 0.2,
          -dims.radius * 0.1,
          side * -0.4,
        );
        attach(pivot, [
          {
            geometry: blobGeometry(dims.radius * 0.45, new THREE.Vector3(0.22, 1, 0.75), 12),
            color: spec.accentColor,
            position: new THREE.Vector3(0, dims.radius * 0.2, 0),
          },
        ]);
      }
      break;
    }
  }

  return pivots;
}

function addWings(
  parent: THREE.Group,
  spec: ChudikSpec,
  dims: BodyDims,
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>,
): THREE.Group[] {
  const wings: THREE.Group[] = [];

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(
      side * dims.radius * dims.squash.x * 0.7,
      dims.centerY + dims.radius * 0.25,
      -dims.radius * 0.35,
    );
    parent.add(pivot);

    const mesh = new THREE.Mesh(
      bakePaintables([
        {
          geometry: blobGeometry(dims.radius * 0.62, new THREE.Vector3(1.25, 0.9, 0.14), 14),
          color: spec.accentColor,
          position: new THREE.Vector3(side * dims.radius * 0.6, dims.radius * 0.15, 0),
          rotation: new THREE.Euler(0, 0, side * 0.35),
        },
      ]),
      chudikMaterial(),
    );
    mesh.userData.chudikId = spec.id;
    pivot.add(mesh);
    disposables.push(mesh.geometry);
    wings.push(pivot);
  }

  return wings;
}

function addTail(
  parent: THREE.Group,
  spec: ChudikSpec,
  dims: BodyDims,
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(0, dims.centerY - dims.radius * 0.2, -dims.frontZ * 0.86);
  parent.add(pivot);

  const mesh = new THREE.Mesh(
    bakePaintables([
      {
        geometry: new THREE.CapsuleGeometry(dims.radius * 0.13, dims.radius * 0.7, 4, 10),
        color: spec.bodyColor,
        position: new THREE.Vector3(0, dims.radius * 0.32, -dims.radius * 0.12),
        rotation: new THREE.Euler(0.5, 0, 0),
      },
      {
        geometry: blobGeometry(dims.radius * 0.24, new THREE.Vector3(1, 1, 1), 12),
        color: spec.accentColor,
        position: new THREE.Vector3(0, dims.radius * 0.72, -dims.radius * 0.36),
      },
    ]),
    chudikMaterial(),
  );
  mesh.castShadow = true;
  mesh.userData.chudikId = spec.id;
  pivot.add(mesh);
  disposables.push(mesh.geometry);

  return pivot;
}
