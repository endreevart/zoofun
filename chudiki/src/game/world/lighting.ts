import * as THREE from 'three';
import type { TuningValues } from '../render/tuning';
import { quality, type QualitySettings } from '../render/quality';

/**
 * Lighting ported from build_scene() in scripts/render-idyllic-world.py.
 *
 * The reference painting has a narrow histogram: soft, even light with colour
 * doing the work, not a hard sun. So the key is gentle and low, the sky carries
 * most of the illumination, and the fills stay deliberately weak — strong fills
 * flatten the frame, and the reference's depth comes from the range between lit
 * canopy tops and dark bases.
 *
 * Every intensity here is live-tunable; see src/game/render/tuning.ts.
 */

/** Golden key from the render script; `sunWarmth` blends toward plain white. */
const SUN_WARM = new THREE.Color(1.0, 0.72, 0.36);
const SUN_WHITE = new THREE.Color(1, 1, 1);

/** Stands in for the gradient sky dome's contribution to bounce light. */
const SKY_AMBIENT = new THREE.Color(0.74, 0.82, 1.0);
const GROUND_BOUNCE = new THREE.Color(0.36, 0.42, 0.16);

const FILL_COLOR = new THREE.Color(0.62, 0.8, 1.0);
const BOUNCE_COLOR = new THREE.Color(1.0, 0.84, 0.58);

/** Point the shadow frustum at the middle of the meadow, not the world origin. */
const FOCUS = new THREE.Vector3(0, 0, -4);
const SUN_DISTANCE = 45;

export class Lighting {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private sky: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private bounce: THREE.DirectionalLight;
  private hanging = false;

  constructor(look: QualitySettings = quality(), hanging = false) {
    this.group.name = 'lighting';

    this.sun = new THREE.DirectionalLight(SUN_WARM.clone(), 1);
    this.sun.target.position.copy(FOCUS);
    this.sun.castShadow = look.shadows;
    this.sun.shadow.mapSize.set(look.shadowMapSize, look.shadowMapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    // Island is ~80 m across; a tight frustum clipped the shadow map and
    // striped the lawn. 2048 over 96 m is still fine for a park view.
    this.sun.shadow.camera.left = -48;
    this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -48;
    // Garden's thick Meshy isle can take a fat bias. Grove paints shadows on a
    // thin catcher: 14 cm of normalBias pushes the umbra clean off that disc.
    // Do not infer hanging from a cheap shadow map: phones use 1024 PCF on
    // every shell, including the fat garden.
    this.hanging = hanging;
    this.sun.shadow.bias = this.hanging ? -0.0006 : -0.0012;
    this.sun.shadow.normalBias = this.hanging ? 0.06 : 0.14;
    const shadow = this.sun.shadow as { intensity?: number };
    if (shadow.intensity !== undefined || this.hanging) shadow.intensity = this.hanging ? 0.72 : 1;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.sky = new THREE.HemisphereLight(SKY_AMBIENT, GROUND_BOUNCE, 1);
    this.group.add(this.sky);

    // Cool fill from camera-left, matching the render's blue area light.
    this.fill = new THREE.DirectionalLight(FILL_COLOR, 1);
    this.fill.position.set(-24, 22, 26);
    this.group.add(this.fill);

    // Warm bounce off the ground in front of the camera.
    this.bounce = new THREE.DirectionalLight(BOUNCE_COLOR, 1);
    this.bounce.position.set(4, 7, 22);
    this.group.add(this.bounce);
  }

  apply(values: TuningValues) {
    this.sun.intensity = values.sunIntensity;
    this.sun.color.copy(SUN_WHITE).lerp(SUN_WARM, values.sunWarmth);
    this.sun.shadow.radius = Math.max(0.001, values.shadowSoftness);

    const azimuth = THREE.MathUtils.degToRad(values.sunAzimuth);
    const elevation = THREE.MathUtils.degToRad(values.sunElevation);
    const horizontal = Math.cos(elevation);
    // Minus Z: azimuth 0 puts the sun in the sky the camera looks at (behind
    // the park). The old plus-Z placed it behind the lens, so shafts and haze
    // had nothing on screen to smear toward and those sliders appeared dead.
    this.sun.position.set(
      FOCUS.x + Math.sin(azimuth) * horizontal * SUN_DISTANCE,
      FOCUS.y + Math.sin(elevation) * SUN_DISTANCE,
      FOCUS.z - Math.cos(azimuth) * horizontal * SUN_DISTANCE,
    );

    // A little less fill than the garden so umbra still reads, but not ink.
    this.sky.intensity = values.skyIntensity * (this.hanging ? 0.88 : 1);
    this.fill.intensity = values.fillIntensity * (this.hanging ? 0.78 : 1);
    this.bounce.intensity = values.bounceIntensity * (this.hanging ? 0.85 : 1);
  }
}
