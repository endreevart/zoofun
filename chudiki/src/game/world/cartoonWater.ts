import * as THREE from 'three';
import { assetUrl } from '../../assetUrl';

/**
 * Shared cartoon water: the child's turquoise tile, scrolling caustics and
 * ripple strokes. Ocean and the lotus-pond water pixels both sample this.
 */

export const cartoonWaterUniforms = {
  time: { value: 0 },
  waterBodyMap: { value: null as THREE.Texture | null },
  waterCausticMap: { value: null as THREE.Texture | null },
  waterRippleMap: { value: null as THREE.Texture | null },
};

export const CARTOON_WATER_GLSL = /* glsl */ `
uniform sampler2D waterBodyMap;
uniform sampler2D waterCausticMap;
uniform sampler2D waterRippleMap;
uniform float time;

vec3 cartoonWater(vec2 xz) {
  vec2 uvA = xz * 0.07 + vec2(time * 0.014, time * 0.008);
  vec2 uvB = xz * 0.12 + vec2(-time * 0.01, time * 0.012);
  vec3 body = texture2D(waterBodyMap, uvA).rgb;
  vec3 body2 = texture2D(waterBodyMap, uvB + 0.33).rgb;
  body = mix(body, body2, 0.38);

  vec2 cUV = xz * 0.1 + vec2(time * 0.028, -time * 0.02);
  vec2 cUV2 = xz * 0.065 + vec2(-time * 0.016, time * 0.024);
  vec3 causticA = texture2D(waterCausticMap, cUV).rgb;
  vec3 causticB = texture2D(waterCausticMap, cUV2).rgb;
  float caustic = max(dot(causticA, vec3(0.3, 0.5, 0.2)), dot(causticB, vec3(0.3, 0.5, 0.2)));
  body += vec3(0.45, 0.88, 0.95) * caustic * 0.55;

  vec2 rUV = xz * 0.15 + vec2(time * 0.035, time * 0.012);
  vec4 ripple = texture2D(waterRippleMap, rUV);
  body = mix(body, vec3(0.82, 0.96, 1.0), ripple.a * 0.7);

  return body;
}
`;

let loaded = false;

function tile(texture: THREE.Texture, srgb: boolean) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Loads the three maps once. Safe to call from Water and from the library. */
export function loadCartoonWaterTextures() {
  if (loaded) return;
  loaded = true;
  const loader = new THREE.TextureLoader();
  cartoonWaterUniforms.waterBodyMap.value = tile(loader.load(assetUrl('textures/water/water-body.jpg')), true);
  cartoonWaterUniforms.waterCausticMap.value = tile(loader.load(assetUrl('textures/water/water-caustic.jpg')), false);
  cartoonWaterUniforms.waterRippleMap.value = tile(loader.load(assetUrl('textures/water/water-ripple.png')), true);
}

/**
 * On the lotus pond atlas, replace blue water pixels with the animated tile
 * so pads and stones stay painted.
 */
export function dressLotusWater(material: THREE.MeshStandardMaterial) {
  loadCartoonWaterTextures();
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, cartoonWaterUniforms);
    if (!shader.vertexShader.includes('vCartoonWorld')) {
      shader.vertexShader = `varying vec3 vCartoonWorld;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        'gl_Position = projectionMatrix * mvPosition;',
        'vCartoonWorld = worldPos.xyz;\ngl_Position = projectionMatrix * mvPosition;',
      );
    }
    if (!shader.fragmentShader.includes('cartoonWater(')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying vec3 vCartoonWorld;\n${CARTOON_WATER_GLSL}\nvoid main() {`,
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */ `
#include <color_fragment>
      {
        float blueLead = diffuseColor.b - max(diffuseColor.r, diffuseColor.g);
        float water = smoothstep(0.2, 0.4, blueLead);
        if (water > 0.04) {
          vec3 pond = cartoonWater(vCartoonWorld.xz * 0.72);
          pond = mix(pond, vec3(0.16, 0.3, 0.26), 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, pond, water * 0.7);
        }
      }
`,
    );
  };
  const previousKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousKey?.() ?? ''}lotus-water`;
}

export function updateCartoonWater(elapsed: number) {
  cartoonWaterUniforms.time.value = elapsed;
}
