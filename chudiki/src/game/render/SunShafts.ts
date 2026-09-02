import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { TuningValues } from './tuning';

/**
 * Warm sun haze and a few soft procedural streaks.
 *
 * An earlier pass smeared the colour buffer toward the sun. That is the usual
 * cheap god-ray trick, but this camera looks down into a bright lawn, so the
 * smear dragged grass and creatures into vertical bands and left coloured
 * noise on the ground. Nothing here reads the scene: the glow is drawn on
 * top, and it dies when the lens is pointed at the dirt.
 */

const SunShaftsShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    sunUv: { value: new THREE.Vector2(0.5, 0.88) },
    sunColor: { value: new THREE.Color(1.0, 0.84, 0.58) },
    sunVisible: { value: 0 },
    shaftStrength: { value: 0 },
    shaftLength: { value: 0.6 },
    sunHaze: { value: 0 },
    aspect: { value: 1.78 },
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
    uniform vec2 sunUv;
    uniform vec3 sunColor;
    uniform float sunVisible;
    uniform float shaftStrength;
    uniform float shaftLength;
    uniform float sunHaze;
    uniform float aspect;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = base.rgb;

      if (sunVisible > 0.002) {
        vec2 offset = (vUv - sunUv) * vec2(aspect, 1.0);
        float r2 = dot(offset, offset);
        // Tight disc in the sky, then a much wider, weaker veil. Neither
        // samples the frame, so nothing on the lawn gets dragged into a stripe.
        float core = exp(-r2 * mix(7.0, 3.6, shaftLength));
        float veil = exp(-r2 * 1.6);
        color += sunColor * core * sunHaze * sunVisible;
        color += sunColor * veil * shaftStrength * 0.18 * sunVisible;
      }

      gl_FragColor = vec4(color, base.a);
    }
  `,
};

const toSun = new THREE.Vector3();
const forward = new THREE.Vector3();
const worldSun = new THREE.Vector3();

export class SunShaftsPass extends ShaderPass {
  constructor() {
    super(SunShaftsShader);
  }

  apply(values: TuningValues) {
    this.uniforms.shaftStrength.value = values.shaftStrength;
    this.uniforms.shaftLength.value = values.shaftLength;
    this.uniforms.sunHaze.value = values.sunHaze;
    this.enabled = values.shaftStrength > 0.001 || values.sunHaze > 0.001;
  }

  /** Projects the key light and decides whether the sky is even in frame. */
  update(sun: THREE.DirectionalLight, camera: THREE.PerspectiveCamera) {
    toSun.copy(sun.position).sub(sun.target.position).normalize();
    camera.getWorldDirection(forward);

    // Behind the camera, or staring at the lawn: no sky, no shafts.
    const facing = THREE.MathUtils.smoothstep(toSun.dot(forward), 0.0, 0.35);
    // 1 while some sky is in frame (opening view), 0 when the lens is in the
    // grass. Inverted range would have been a no-op on the hero camera.
    const skyRoom = 1 - THREE.MathUtils.smoothstep(-forward.y, 0.38, 0.64);
    if (facing * skyRoom <= 0.002) {
      this.uniforms.sunVisible.value = 0;
      return;
    }

    worldSun.copy(camera.position).addScaledVector(toSun, 500).project(camera);
    const u = worldSun.x * 0.5 + 0.5;
    const v = worldSun.y * 0.5 + 0.5;

    (this.uniforms.sunUv.value as THREE.Vector2).set(
      THREE.MathUtils.clamp(u, 0.08, 0.92),
      THREE.MathUtils.clamp(v, 0.78, 1.05),
    );

    const horizOutside = Math.max(0, -u, u - 1);
    const onScreen = 1 - THREE.MathUtils.smoothstep(horizOutside, 0.25, 1.0);
    this.uniforms.sunVisible.value = facing * skyRoom * onScreen;
    (this.uniforms.sunColor.value as THREE.Color).copy(sun.color);
  }

  setSize(width: number, height: number) {
    this.uniforms.aspect.value = width / Math.max(1, height);
  }
}
