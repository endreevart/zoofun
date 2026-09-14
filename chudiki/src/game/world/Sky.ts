import * as THREE from 'three';
import { ISLAND } from './layout';
import { worldCurveUniforms } from '../render/worldCurve';
import { isHangingShell, type WorldShell } from './kinds';
import { cloudSoftEdges, HAZE_RGB, MEADOW_HAZE_RGB, usesPuffyClouds } from './skyLook';
import { tuning, type TuningValues } from '../render/tuning';

export { fogDensityForShell, usesPuffyClouds } from './skyLook';

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
const AIR_HORIZON = new THREE.Color(0.48, 0.70, 0.94);
/**
 * Picture-book cyan, hotter than display range. The idyllic grade would
 * otherwise wash a 0–1 sky into grey-blue. Vector3 skips ColorManagement so
 * the values stay in working space.
 */
const MEADOW_HORIZON = new THREE.Vector3(0.34, 1.48, 2.72);
const MEADOW_ZENITH = new THREE.Vector3(0.1, 0.98, 2.85);

export const HAZE_COLOR = new THREE.Color(HAZE_RGB.r, HAZE_RGB.g, HAZE_RGB.b);
export const MEADOW_HAZE = new THREE.Color(MEADOW_HAZE_RGB.r, MEADOW_HAZE_RGB.g, MEADOW_HAZE_RGB.b);

export function hazeForShell(shell: WorldShell): THREE.Color {
  return usesPuffyClouds(shell) ? MEADOW_HAZE : HAZE_COLOR;
}

export function applyMeadowCloudTuning(material: THREE.ShaderMaterial, values: TuningValues): void {
  const edges = cloudSoftEdges(values.cloudSoftness);
  const u = material.uniforms;
  u.uCloudScale.value = values.cloudScale;
  u.uCloudBlur.value = values.cloudBlur;
  u.uCloudSquash.value = values.cloudSquash;
  u.uCloudSoftInner.value = edges.inner;
  u.uCloudSoftOuter.value = edges.outer;
  u.uCloudOpacity.value = values.cloudOpacity;
  u.uCloudCoverage.value = values.cloudCoverage;
  u.uCloudWhite.value = values.cloudWhite;
  (u.horizonColor.value as THREE.Vector3).set(
    values.skyHorizonR,
    values.skyHorizonG,
    values.skyHorizonB,
  );
  (u.zenithColor.value as THREE.Vector3).set(values.skyZenithR, values.skyZenithG, values.skyZenithB);
}

export function createSky(shell: WorldShell = 'garden'): THREE.Group {
  const hanging = isHangingShell(shell);
  const painted = usesPuffyClouds(shell);
  const group = new THREE.Group();
  group.name = 'sky';
  group.add(createDome(hanging, painted));
  group.add(createPlanetCore());
  const backdrop = new THREE.Group();
  backdrop.name = 'planet-backdrop';
  if (!hanging) backdrop.add(createDistantIsles());
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

function createDome(hanging = false, painted = false): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizonColor: { value: painted ? MEADOW_HORIZON : hanging ? AIR_HORIZON : HORIZON },
      zenithColor: { value: painted ? MEADOW_ZENITH : ZENITH },
      meadowSky: { value: painted ? 1 : 0 },
      uCloudScale: { value: 3.4 },
      uCloudBlur: { value: 0.056 },
      uCloudSquash: { value: 1.42 },
      uCloudSoftInner: { value: 0.2 },
      uCloudSoftOuter: { value: 0.92 },
      uCloudOpacity: { value: 0.76 },
      uCloudCoverage: { value: 0.38 },
      uCloudWhite: { value: 3 },
      uHorizonHaze: { value: painted && !hanging ? 1 : 0 },
      ...worldCurveUniforms,
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = normalize(world.xyz);
        vHeight = vDir.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      uniform float uPlanetAmount;
      uniform float meadowSky;
      uniform float uCloudScale;
      uniform float uCloudBlur;
      uniform float uCloudSquash;
      uniform float uCloudSoftInner;
      uniform float uCloudSoftOuter;
      uniform float uCloudOpacity;
      uniform float uCloudCoverage;
      uniform float uCloudWhite;
      uniform float uHorizonHaze;
      varying float vHeight;
      varying vec3 vDir;

      vec3 hash3(vec3 p) {
        p = vec3(
          dot(p, vec3(127.1, 311.7, 74.7)),
          dot(p, vec3(269.5, 183.3, 246.1)),
          dot(p, vec3(113.5, 271.9, 124.6))
        );
        return fract(sin(p) * 43758.5453123);
      }

      float cells3(vec3 p) {
        vec3 n = floor(p);
        vec3 f = fract(p);
        float d = 8.0;
        for (int z = -1; z <= 1; z++) {
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec3 g = vec3(float(x), float(y), float(z));
              vec3 o = hash3(n + g);
              vec3 r = g + o - f;
              r.y *= uCloudSquash;
              d = min(d, dot(r, r));
            }
          }
        }
        return sqrt(d);
      }

      float fieldAt(vec3 dir) {
        return 1.0 - cells3(dir * uCloudScale + vec3(0.5, -0.2, 1.0));
      }

      float meadowClouds(vec3 dir) {
        float b = uCloudBlur;
        float s = fieldAt(dir);
        s += fieldAt(normalize(dir + vec3(b, 0.44 * b, -0.44 * b)));
        s += fieldAt(normalize(dir + vec3(-0.76 * b, 0.53 * b, 0.67 * b)));
        s += fieldAt(normalize(dir + vec3(0.4 * b, -0.84 * b, 0.58 * b)));
        s *= 0.25;
        s += (uCloudCoverage - 0.5) * 0.7;
        return smoothstep(uCloudSoftInner, uCloudSoftOuter, s);
      }

      void main() {
        // Blue is brought lower than the Blender ramp had it. The playable
        // camera looks slightly down, so only the bottom of the dome is ever on
        // screen, and a ramp tuned for the full hemisphere leaves it all cream.
        float lifted = clamp(abs(vHeight), 0.0, 1.0) * 0.5 + 0.42;
        float h = mix(
          smoothstep(0.16, 0.60, lifted),
          smoothstep(0.08, 0.78, lifted + 0.08),
          meadowSky
        );
        // From the globe view we look down through the dome and would otherwise
        // see only the cream horizon — a white void around the planet.
        h = mix(h, 0.78, uPlanetAmount);
        vec3 sky = mix(horizonColor, zenithColor, h);

        vec3 dir = normalize(vDir);
        float lip = (1.0 - smoothstep(-0.08, 0.48, dir.y)) * uHorizonHaze;

        if (meadowSky > 0.5) {
          float cover = meadowClouds(dir) * (1.0 - lip * 0.92);
          vec3 cloud = vec3(uCloudWhite, uCloudWhite * 1.08, uCloudWhite * 1.28);
          sky = mix(sky, cloud, cover * uCloudOpacity);
        }

        sky = mix(sky, mix(horizonColor, vec3(1.35, 1.88, 2.35), 0.22), lip * 0.82);

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  if (painted) applyMeadowCloudTuning(material, tuning.get());

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 32), material);
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
    emissive: new THREE.Color(0.02, 0.04, 0.06),
    fog: true,
  });
  const cap = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0.38, 0.52, 0.34),
    emissive: new THREE.Color(0.02, 0.04, 0.04),
    fog: true,
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
