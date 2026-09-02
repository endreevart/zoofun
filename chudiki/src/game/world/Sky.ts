import * as THREE from 'three';
import { ISLAND } from './layout';
import { worldCurveUniforms } from '../render/worldCurve';

/**
 * Sky dome plus a handful of hazy islets on the horizon, so the zoo-island
 * sits in an ocean instead of a forested valley.
 */

/**
 * Sky ramp stops. The horizon is cream rather than the near-white the Blender
 * node tree used: on screen, bloom and the grade push that last stop straight
 * to paper white and the top half of the frame stops reading as sky at all.
 */
const HORIZON = new THREE.Color(0.78, 0.86, 0.92);
const ZENITH = new THREE.Color(0.32, 0.60, 0.94);

export const HAZE_COLOR = new THREE.Color(0.62, 0.78, 0.88);

export function createSky(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sky';
  group.add(createDome());
  group.add(createPlanetCore());
  const backdrop = new THREE.Group();
  backdrop.name = 'planet-backdrop';
  backdrop.add(createDistantIsles());
  group.add(backdrop);
  return group;
}

/**
 * Solid earth under the lawn. Close up it sits far below the park and stays
 * hidden. When the world wraps into a globe this fills the empty hemisphere
 * so the zoo reads as a little planet instead of a bent carpet.
 */
function createPlanetCore(): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0.18, 0.46, 0.16),
    emissive: new THREE.Color(0.03, 0.08, 0.02),
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
  mesh.name = 'planet-core';
  mesh.position.set(0, -40, -4);
  mesh.scale.setScalar(0.001);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -11;
  return mesh;
}

function createDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizonColor: { value: HORIZON },
      zenithColor: { value: ZENITH },
      ...worldCurveUniforms,
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vHeight = normalize(world.xyz).y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      uniform float uPlanetAmount;
      varying float vHeight;
      void main() {
        // Blue is brought lower than the Blender ramp had it. The playable
        // camera looks slightly down, so only the bottom of the dome is ever on
        // screen, and a ramp tuned for the full hemisphere leaves it all cream.
        float h = smoothstep(0.16, 0.60, clamp(vHeight, 0.0, 1.0) * 0.5 + 0.42);
        // From the globe view we look down through the dome and would otherwise
        // see only the cream horizon — a white void around the planet.
        h = mix(h, 0.78, uPlanetAmount);
        gl_FragColor = vec4(mix(horizonColor, zenithColor, h), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky-dome';
  return mesh;
}

/** Tiny far-off islets, pale enough to read as haze rather than more zoo. */
function createDistantIsles(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'distant-isles';

  const rock = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0.58, 0.64, 0.58),
    emissive: new THREE.Color(0.08, 0.1, 0.12),
  });
  const cap = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0.38, 0.52, 0.34),
    emissive: new THREE.Color(0.04, 0.07, 0.05),
  });

  const islets = [
    { x: 96, z: -78, radius: 13, height: 5.5 },
    { x: -88, z: -92, radius: 10, height: 4.5 },
    { x: 38, z: -118, radius: 16, height: 6.5 },
    { x: -118, z: 18, radius: 9, height: 3.8 },
    { x: 78, z: 72, radius: 8, height: 3.2 },
  ];

  for (const isle of islets) {
    const base = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), rock);
    base.position.set(isle.x, ISLAND.oceanY - 1.4, isle.z);
    base.scale.set(isle.radius, isle.height, isle.radius * 0.78);
    base.castShadow = false;
    base.receiveShadow = false;
    const top = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cap);
    top.position.set(isle.x, ISLAND.oceanY + isle.height * 0.2, isle.z);
    top.scale.set(isle.radius * 0.7, isle.height * 0.42, isle.radius * 0.55);
    top.castShadow = false;
    top.receiveShadow = false;
    group.add(base, top);
  }

  return group;
}
