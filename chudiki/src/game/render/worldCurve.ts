import * as THREE from 'three';
import { HERO_FOV } from '../world/layout';

/**
 * Wraps the flat park onto a little globe when the camera pulls far back.
 * Close play stays unbent: the amount is zero until the orbit is high enough
 * that a child is looking at the whole zoo, not walking through it.
 *
 * Gameplay, pathfinding and taps stay in the flat plane. Only the drawn
 * vertices move, so a chudik still stands where the child put it.
 */

const PLAY_DISTANCE = 74;
const PLANET_DISTANCE = 112;

export const worldCurveUniforms = {
  uPlanetAmount: { value: 0 },
  uPlanetRadius: { value: 36 },
  uPlanetCenter: { value: new THREE.Vector3(0, 0, -4) },
};

/** Shared GLSL: bend a world-space point (and a direction) around the planet. */
export const WORLD_CURVE_GLSL = /* glsl */ `
uniform float uPlanetAmount;
uniform float uPlanetRadius;
uniform vec3 uPlanetCenter;

vec3 curveWorld(vec3 pos) {
  if (uPlanetAmount < 0.001) return pos;
  vec3 p = pos - uPlanetCenter;
  float dist = length(p.xz);
  float angle = (dist / uPlanetRadius) * uPlanetAmount;
  if (angle < 0.0001) return pos;
  vec2 dir = p.xz / max(dist, 1e-5);
  float s = sin(angle);
  float c = cos(angle);
  float r = uPlanetRadius + p.y;
  return uPlanetCenter + vec3(dir.x * s * r, c * r - uPlanetRadius, dir.y * s * r);
}

vec3 curveWorldDir(vec3 pos, vec3 dir) {
  if (uPlanetAmount < 0.001) return dir;
  vec3 p = pos - uPlanetCenter;
  float dist = length(p.xz);
  float angle = (dist / uPlanetRadius) * uPlanetAmount;
  if (angle < 0.0001) return dir;
  vec2 d = p.xz / max(dist, 1e-5);
  vec3 axis = vec3(-d.y, 0.0, d.x);
  float s = sin(angle);
  float c = cos(angle);
  return dir * c + cross(axis, dir) * s + axis * dot(axis, dir) * (1.0 - c);
}
`;

const PROJECT_VERTEX = /* glsl */ `
  vec4 objectPos = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    objectPos = batchingMatrix * objectPos;
  #endif
  #ifdef USE_INSTANCING
    objectPos = instanceMatrix * objectPos;
  #endif
  vec4 worldPos = modelMatrix * objectPos;
  mat3 viewToWorld = transpose(mat3(viewMatrix));
  vec3 worldN = normalize(viewToWorld * transformedNormal);
  worldN = curveWorldDir(worldPos.xyz, worldN);
  worldPos.xyz = curveWorld(worldPos.xyz);
  transformedNormal = mat3(viewMatrix) * worldN;
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
`;

const WORLD_POS_VERTEX = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    worldPosition = batchingMatrix * worldPosition;
  #endif
  #ifdef USE_INSTANCING
    worldPosition = instanceMatrix * worldPosition;
  #endif
  worldPosition = modelMatrix * worldPosition;
  worldPosition.xyz = curveWorld(worldPosition.xyz);
#endif
`;

/** Patches a compiled standard-material shader so its vertices ride the globe. */
export function injectWorldCurve(shader: { uniforms: Record<string, unknown>; vertexShader: string }) {
  Object.assign(shader.uniforms, worldCurveUniforms);
  if (!shader.vertexShader.includes('curveWorld(')) {
    shader.vertexShader = `${WORLD_CURVE_GLSL}\n${shader.vertexShader}`;
  }
  shader.vertexShader = shader.vertexShader
    .replace('#include <project_vertex>', PROJECT_VERTEX)
    .replace('#include <worldpos_vertex>', WORLD_POS_VERTEX);
}

export function planetAmountFromDistance(distance: number): number {
  // Three's smoothstep is (x, min, max). GLSL's is the other way around.
  return THREE.MathUtils.smoothstep(distance, PLAY_DISTANCE, PLANET_DISTANCE);
}

/**
 * Drive the wrap from the current orbit, and ease the lens and haze so the
 * globe does not vanish into fog the moment it becomes visible.
 */
export function updateWorldCurve(
  distance: number,
  camera: THREE.PerspectiveCamera,
  fog: THREE.FogExp2 | null,
  baseFogDensity: number,
  planetCore?: THREE.Object3D | null,
  backdrop?: THREE.Object3D | null,
) {
  const amount = planetAmountFromDistance(distance);
  worldCurveUniforms.uPlanetAmount.value = amount;
  camera.fov = THREE.MathUtils.lerp(HERO_FOV, 54, amount);
  camera.updateProjectionMatrix();
  if (fog) fog.density = baseFogDensity * (1 - amount * 0.85);

  // The hill ellipsoids tear into white pills once they wrap: each blob is
  // tens of metres across, so opposite vertices land on different sides of
  // the globe. Hide them as soon as the bend starts; the core takes over.
  if (backdrop) backdrop.visible = amount < 0.35;

  if (planetCore) {
    const radius = worldCurveUniforms.uPlanetRadius.value;
    const center = worldCurveUniforms.uPlanetCenter.value;
    planetCore.position.set(center.x, center.y - radius, center.z);
    const visible = THREE.MathUtils.smoothstep(amount, 0.2, 0.65);
    planetCore.scale.setScalar(radius * 1.02 * visible + 0.001);
    planetCore.visible = visible > 0.02;
  }
}
