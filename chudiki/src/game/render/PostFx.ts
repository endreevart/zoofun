import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { tuning, type TuningValues } from './tuning';
import { SunShaftsPass } from './SunShafts';
import { applyStylizedTuning } from './stylized';

/**
 * The pass stack that turns flat lit geometry into something that reads as a
 * rendered picture: ambient occlusion in the creases, a soft bloom on the
 * bright bits, then saturation and a vignette.
 *
 * Ambient occlusion is the expensive part, so it is skipped on weak devices.
 */

/**
 * The grade fitted in scripts/render-idyllic-world.py against measured
 * percentiles of the reference painting (p05/p25/median/p75/p95 and mean
 * saturation all landed within about 0.02). Live values come from
 * src/game/render/tuning.ts.
 *
 * The tone curve is `x / (x + midpoint)`, which is asymptotic to 1. An extended
 * Reinhard curve diverges above its white point and clipped every sunlit area
 * to pure white.
 */
const GradingShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    midpoint: { value: 0.35 },
    gamma: { value: 0.7 },
    /**
     * The reference is lower-contrast than a rendered scene: pulling values
     * toward mid grey lowers highlights and lifts quarter-tones at once, which
     * gamma alone cannot do.
     */
    contrast: { value: 0.75 },
    saturation: { value: 1.6 },
    warm: { value: new THREE.Vector3(1.035, 1.0, 0.955) },
    vignette: { value: 0.18 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float midpoint;
    uniform float gamma;
    uniform float contrast;
    uniform float saturation;
    uniform vec3 warm;
    uniform float vignette;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = max(texel.rgb, 0.0);

      color = color / (color + midpoint);
      color = pow(color, vec3(gamma));
      color = clamp(0.5 + (color - 0.5) * contrast, 0.0, 1.0);

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = clamp(mix(vec3(luma), color, saturation), 0.0, 1.0);
      color *= warm;

      vec2 offset = vUv - 0.5;
      color *= 1.0 - vignette * dot(offset, offset) * 2.0;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }
  `,
};

export type PostFxQuality = 'high' | 'low';

export class PostFx {
  readonly composer: EffectComposer;
  private gtao?: GTAOPass;
  private bloom: UnrealBloomPass;
  private shafts: SunShaftsPass;
  private grading: ShaderPass;
  private unsubscribe: () => void = () => {};

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    quality: PostFxQuality,
  ) {
    const size = renderer.getSize(new THREE.Vector2());

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    if (quality === 'high') {
      // Half-res AO: full-screen 12-sample GTAO on a retina canvas is what
      // made an empty lawn hitch. The creases still read; the cost halves.
      const gtao = new GTAOPass(scene, camera, Math.ceil(size.x / 2), Math.ceil(size.y / 2));
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({
        radius: 0.5,
        distanceExponent: 1.0,
        thickness: 1.0,
        scale: 1.1,
        samples: 8,
        screenSpaceRadius: false,
      });
      this.gtao = gtao;
      this.composer.addPass(gtao);
    }

    // Bloom runs before the grade, on linear values, exactly as the reference
    // pipeline did.
    this.bloom = new UnrealBloomPass(size, 0.14, 0.6, 0.72);
    this.composer.addPass(this.bloom);

    // Shafts read the still-linear frame, so their threshold means the same
    // thing as the bloom's and the grade compresses both together.
    this.shafts = new SunShaftsPass();
    this.composer.addPass(this.shafts);

    this.grading = new ShaderPass(GradingShader);
    this.composer.addPass(this.grading);

    this.composer.addPass(new OutputPass());
    this.apply(tuning.get());
    this.unsubscribe = tuning.subscribe((values) => this.apply(values));
  }

  /** Pushes tunable look parameters into the passes that own them. */
  apply(values: TuningValues) {
    this.bloom.strength = values.bloomStrength;
    this.bloom.threshold = values.bloomThreshold;
    this.bloom.radius = values.bloomRadius;
    if (this.gtao) this.gtao.blendIntensity = values.aoIntensity;
    this.shafts.apply(values);
    applyStylizedTuning(values);

    const uniforms = this.grading.uniforms;
    uniforms.midpoint.value = values.midpoint;
    uniforms.gamma.value = values.gamma;
    uniforms.contrast.value = values.contrast;
    uniforms.saturation.value = values.saturation;
    uniforms.vignette.value = values.vignette;
    (uniforms.warm.value as THREE.Vector3).set(values.warmRed, 1, values.warmBlue);
  }

  /** Picks a quality tier from what the device can plausibly sustain. */
  static suggestQuality(): PostFxQuality {
    const coarsePointer =
      typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (coarsePointer || cores <= 4 || (memory !== undefined && memory <= 8)) return 'low';
    return 'high';
  }

  /** Per-frame: the shafts need this frame's projected sun position. */
  updateSun(sun: THREE.DirectionalLight, camera: THREE.PerspectiveCamera) {
    if (this.shafts.enabled) this.shafts.update(sun, camera);
  }

  /** Dev readout: whether the sun-shaft pass can see the key light. */
  shaftDebug() {
    const u = this.shafts.uniforms;
    const sunUv = u.sunUv.value as THREE.Vector2;
    return {
      enabled: this.shafts.enabled,
      sunVisible: Number((u.sunVisible.value as number).toFixed(3)),
      shaftStrength: u.shaftStrength.value,
      sunHaze: u.sunHaze.value,
      sunUv: [Number(sunUv.x.toFixed(3)), Number(sunUv.y.toFixed(3))],
    };
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    this.gtao?.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    this.bloom.setSize(width, height);
    this.shafts.setSize(width, height);
  }

  render(delta: number) {
    this.composer.render(delta);
  }

  dispose() {
    this.unsubscribe();
    this.composer.dispose();
    void this.renderer;
  }
}
