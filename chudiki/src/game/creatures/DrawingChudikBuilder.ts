import * as THREE from 'three';
import { EYE } from '../core/palette';
import { bakePaintables, blobGeometry, createToyMaterial } from '../core/geometry';
import type { ChudikSpec, DrawingData } from './ChudikSpec';
import type { ChudikRig } from './ChudikBuilder';

/**
 * Grows a creature out of a child's drawing.
 *
 * The rule that matters: the drawing is the creature. We extrude its own
 * silhouette, wrap its own strokes around the front and back, and only add the
 * two things that make it belong to this world — googly eyes and little feet.
 * Nothing is redrawn, smoothed away or replaced.
 */
export function buildDrawingChudik(spec: ChudikSpec, drawing: DrawingData): ChudikRig {
  const root = new THREE.Group();
  root.name = `chudik:${spec.id}`;
  const bounce = new THREE.Group();
  const squash = new THREE.Group();
  root.add(bounce);
  bounce.add(squash);

  const disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  // Overall height in world units. Drawings read best a bit taller than the
  // procedural residents so a child can spot their own creature immediately.
  const scale = 2.5 * spec.size;
  const width = drawing.aspect * scale;
  const depth = Math.max(0.22, Math.min(width, scale) * 0.34);

  const shape = contourToShape(drawing.contour, scale);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.42,
    bevelSize: Math.min(width, scale) * 0.045,
    bevelSegments: 3,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  disposables.push(geometry);

  const texture = new THREE.Texture();
  const image = new Image();
  image.onload = () => {
    texture.image = image;
    texture.needsUpdate = true;
  };
  image.src = drawing.textureUrl;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // ExtrudeGeometry lays out cap UVs straight from shape coordinates, so this
  // maps the silhouette's bounding box onto the full 0..1 texture.
  texture.repeat.set(1 / width, 1 / scale);
  texture.offset.set(0.5, 0.5);
  texture.anisotropy = 4;
  disposables.push(texture);

  const faceMaterial = createToyMaterial({ roughness: 0.55 });
  faceMaterial.map = texture;
  const sideMaterial = createToyMaterial({ color: drawing.sideColor, roughness: 0.7 });
  disposables.push(faceMaterial, sideMaterial);

  const bodyMesh = new THREE.Mesh(geometry, [faceMaterial, sideMaterial]);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.userData.chudikId = spec.id;
  bodyMesh.position.y = scale / 2 + scale * 0.06;
  squash.add(bodyMesh);

  const eyeRig = addGooglyEyes(squash, spec, drawing, {
    scale,
    depth,
    lift: bodyMesh.position.y,
    disposables,
  });

  addFeet(squash, spec, drawing, { scale, width, depth, disposables });

  return {
    root,
    bounce,
    squash,
    eyes: eyeRig.eyes,
    pupils: eyeRig.pupils,
    ears: [],
    wings: [],
    tail: null,
    height: scale * 1.12,
    radius: Math.max(width, depth) * 0.5,
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}

/** Normalised contour to a three Shape, forced counter-clockwise. */
function contourToShape(contour: Array<[number, number]>, scale: number): THREE.Shape {
  const points = contour.map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
  if (signedArea(points) < 0) points.reverse();
  return new THREE.Shape(points);
}

function signedArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return area / 2;
}

function addGooglyEyes(
  parent: THREE.Group,
  spec: ChudikSpec,
  drawing: DrawingData,
  ctx: {
    scale: number;
    depth: number;
    lift: number;
    disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>;
  },
): { eyes: THREE.Group[]; pupils: THREE.Group[] } {
  const eyes: THREE.Group[] = [];
  const pupils: THREE.Group[] = [];

  const material = createToyMaterial({ vertexColors: true, roughness: 0.5 });
  ctx.disposables.push(material);

  const eyeRadius = drawing.eyeRadius * ctx.scale * spec.eyeScale;
  const spacing = (drawing.eyeSpacing * ctx.scale) / 2;
  const anchorX = drawing.eyeAnchor[0] * ctx.scale;
  const anchorY = drawing.eyeAnchor[1] * ctx.scale + ctx.lift;
  const eyeZ = ctx.depth / 2 + eyeRadius * 0.5;

  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    group.position.set(anchorX + side * spacing, anchorY, eyeZ);
    parent.add(group);

    const white = new THREE.Mesh(
      bakePaintables([
        { geometry: blobGeometry(eyeRadius, new THREE.Vector3(1, 1.05, 0.92), 20), color: EYE.white },
      ]),
      material,
    );
    white.castShadow = true;
    white.userData.chudikId = spec.id;
    group.add(white);
    ctx.disposables.push(white.geometry);

    const pupilGroup = new THREE.Group();
    const pupil = new THREE.Mesh(
      bakePaintables([
        {
          geometry: blobGeometry(eyeRadius * 0.5, new THREE.Vector3(1, 1.1, 0.85), 16),
          color: EYE.pupil,
        },
        {
          geometry: blobGeometry(eyeRadius * 0.15, new THREE.Vector3(1, 1, 1), 10),
          color: EYE.glint,
          position: new THREE.Vector3(-side * eyeRadius * 0.16, eyeRadius * 0.2, eyeRadius * 0.32),
        },
      ]),
      material,
    );
    pupil.userData.chudikId = spec.id;
    pupilGroup.add(pupil);
    pupilGroup.position.z = eyeRadius * 0.56;
    group.add(pupilGroup);
    ctx.disposables.push(pupil.geometry);

    eyes.push(group);
    pupils.push(pupilGroup);
  }

  return { eyes, pupils };
}

function addFeet(
  parent: THREE.Group,
  spec: ChudikSpec,
  drawing: DrawingData,
  ctx: {
    scale: number;
    width: number;
    depth: number;
    disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>;
  },
) {
  const footRadius = Math.min(ctx.width, ctx.scale) * 0.14;
  const material = createToyMaterial({ vertexColors: true, roughness: 0.6 });
  ctx.disposables.push(material);

  const mesh = new THREE.Mesh(
    bakePaintables(
      [-1, 1].map((side) => ({
        geometry: blobGeometry(footRadius, new THREE.Vector3(0.95, 0.62, 1.45), 12),
        color: drawing.accentColor,
        position: new THREE.Vector3(
          side * ctx.width * 0.2,
          footRadius * 0.62,
          ctx.depth * 0.28,
        ),
      })),
    ),
    material,
  );
  mesh.castShadow = true;
  mesh.userData.chudikId = spec.id;
  parent.add(mesh);
  ctx.disposables.push(mesh.geometry);
}
