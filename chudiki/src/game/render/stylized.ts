import * as THREE from 'three';
import { tuning, type TuningValues } from './tuning';
import { injectWorldCurve } from './worldCurve';

/**
 * The two things a plain MeshStandardMaterial cannot do, and the two things that
 * make hand-animated films read as soft rather than moulded:
 *
 * * a rim of sky light around every silhouette, so a creature separates from the
 *   bush behind it instead of merging into it;
 * * light bleeding through thin surfaces — leaf cards, ears, petals — when the
 *   sun is behind them.
 *
 * Both are added by patching the standard shader rather than by swapping in a
 * custom material, so shadows, fog, alpha cutout and the texture atlases keep
 * working untouched. Every patched material shares one uniform object, so the
 * sliders retune the whole scene in a single assignment.
 */

const sunDirectionView = new THREE.Vector3(0, 1, 0);

export const stylizedUniforms = {
  rimColor: { value: new THREE.Color(0.58, 0.76, 1.0) },
  rimStrength: { value: tuning.get().rimStrength },
  rimPower: { value: tuning.get().rimPower },
  translucentColor: { value: new THREE.Color(1.0, 0.86, 0.6) },
  translucency: { value: tuning.get().translucency },
  /** Sun direction in view space: the fragment shader has no world-space light. */
  sunDirectionView: { value: sunDirectionView },
};

/**
 * Materials that should also bleed light. Leaves and creature skin do; rock,
 * bark, dirt and painted wood do not, and giving them translucency makes them
 * glow like plastic lit from inside — the exact problem being fixed.
 */
export type StylizeOptions = { translucent?: boolean };

const DECLARATIONS = /* glsl */ `
  uniform vec3 rimColor;
  uniform float rimStrength;
  uniform float rimPower;
  uniform vec3 translucentColor;
  uniform float translucency;
  uniform vec3 sunDirectionView;
`;

/**
 * Injected after <opaque_fragment> has written gl_FragColor and before tone
 * mapping and fog, so the additions are graded and hazed like everything else.
 */
function body(translucent: boolean): string {
  const bleed = translucent
    ? /* glsl */ `
  {
    // Light reaching the camera through the surface: strongest where the sun is
    // behind the fragment and the camera is looking back toward the sun.
    float back = clamp(dot(-normalize(normal), sunDirectionView), 0.0, 1.0);
    float toward = clamp(dot(viewDirection, -sunDirectionView), 0.0, 1.0);
    float bleed = pow(back, 1.4) * (0.35 + 0.65 * pow(toward, 2.0));
    gl_FragColor.rgb += diffuseColor.rgb * translucentColor * translucency * bleed;
  }
`
    : '';

  return /* glsl */ `
  vec3 viewDirection = normalize(vViewPosition);
  {
    float fresnel = pow(1.0 - clamp(dot(normalize(normal), viewDirection), 0.0, 1.0), rimPower);
    // Scaled by the fragment's own brightness so the rim lifts lit edges and
    // leaves shadowed ones alone; an unscaled rim outlines everything and reads
    // as a cel-shader outline rather than as light.
    float lit = 0.35 + 0.65 * clamp(dot(gl_FragColor.rgb, vec3(0.333)), 0.0, 1.0);
    gl_FragColor.rgb += rimColor * fresnel * rimStrength * lit;
  }
${bleed}`;
}

/** Adds the rim and the optional bleed to a lit material, in place. */
export function stylize<T extends THREE.Material>(material: T, options: StylizeOptions = {}): T {
  const translucent = options.translucent ?? false;
  if ((material as { userData: { stylized?: boolean } }).userData.stylized) return material;
  material.userData.stylized = true;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, stylizedUniforms);
    injectWorldCurve(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${DECLARATIONS}\nvoid main() {`)
      .replace(
        '#include <tonemapping_fragment>',
        `${body(translucent)}\n#include <tonemapping_fragment>`,
      );
  };
  // Two variants of the patch exist, and Three keys the program cache on the
  // material's own parameters, not on the injected source.
  material.customProgramCacheKey = () => (translucent ? 'stylized-planet-t' : 'stylized-planet');
  return material;
}

/**
 * Applies the slider values. `matte` is handled per material rather than in the
 * shader because roughness participates in the shadow and env terms too, and
 * because each material's authored gloss is the sensible starting point.
 */
export function applyStylizedTuning(values: TuningValues) {
  stylizedUniforms.rimStrength.value = values.rimStrength;
  stylizedUniforms.rimPower.value = values.rimPower;
  stylizedUniforms.translucency.value = values.translucency;

  for (const [material, authored] of authoredRoughness) {
    material.roughness = THREE.MathUtils.lerp(authored, 1, values.matte);
  }
}

/** Materials whose original roughness the matte slider interpolates away from. */
const authoredRoughness = new Map<THREE.MeshStandardMaterial, number>();

export function trackRoughness(material: THREE.MeshStandardMaterial) {
  if (authoredRoughness.has(material)) return;
  authoredRoughness.set(material, material.roughness);
  material.roughness = THREE.MathUtils.lerp(material.roughness, 1, tuning.get().matte);
}

/** Called once per frame with the key light, which the bleed term needs. */
export function updateStylizedSun(sun: THREE.DirectionalLight, camera: THREE.Camera) {
  sunDirectionView
    .copy(sun.target.position)
    .sub(sun.position)
    .normalize()
    .transformDirection(camera.matrixWorldInverse);
}
