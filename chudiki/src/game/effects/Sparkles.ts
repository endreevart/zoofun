import * as THREE from 'three';
import { createToyMaterial } from '../core/geometry';

/**
 * Little bursts of confetti. Used when a creature arrives and when one answers
 * a tap, so something visibly happens even before the sound is heard.
 */

const POOL_SIZE = 220;

type Particle = {
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: number;
  baseScale: number;
};

export class Sparkles {
  readonly mesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private cursor = 0;
  private matrix = new THREE.Matrix4();
  private quaternion = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private position = new THREE.Vector3();
  private positions: THREE.Vector3[] = [];
  private colorAttribute: THREE.InstancedBufferAttribute;
  private tempColor = new THREE.Color();

  constructor() {
    const geometry = new THREE.OctahedronGeometry(0.09, 0);
    const material = createToyMaterial({ roughness: 0.4 });
    material.vertexColors = false;
    material.emissiveIntensity = 0.6;
    material.toneMapped = true;

    this.mesh = new THREE.InstancedMesh(geometry, material, POOL_SIZE);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sparkles';

    const colors = new Float32Array(POOL_SIZE * 3).fill(1);
    this.colorAttribute = new THREE.InstancedBufferAttribute(colors, 3);
    this.mesh.instanceColor = this.colorAttribute;

    for (let i = 0; i < POOL_SIZE; i++) {
      this.particles.push({
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        spin: 0,
        baseScale: 1,
      });
      this.positions.push(new THREE.Vector3());
      this.hide(i);
    }
  }

  /** Fires `count` particles upward and outward from a point. */
  burst(origin: THREE.Vector3, colors: string[], count = 26, power = 1) {
    for (let i = 0; i < count; i++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % POOL_SIZE;

      const particle = this.particles[index];
      const angle = Math.random() * Math.PI * 2;
      const spread = 1.4 + Math.random() * 2.2;

      particle.velocity.set(
        Math.cos(angle) * spread * power,
        (2.6 + Math.random() * 2.4) * power,
        Math.sin(angle) * spread * power,
      );
      particle.maxLife = 0.7 + Math.random() * 0.6;
      particle.life = particle.maxLife;
      particle.spin = (Math.random() - 0.5) * 14;
      particle.baseScale = 0.7 + Math.random() * 0.9;

      this.positions[index].copy(origin);

      this.tempColor.set(colors[Math.floor(Math.random() * colors.length)]).convertSRGBToLinear();
      this.colorAttribute.setXYZ(index, this.tempColor.r, this.tempColor.g, this.tempColor.b);
    }
    this.colorAttribute.needsUpdate = true;
  }

  update(dt: number) {
    let dirty = false;

    for (let i = 0; i < POOL_SIZE; i++) {
      const particle = this.particles[i];
      if (particle.life <= 0) continue;

      particle.life -= dt;
      if (particle.life <= 0) {
        this.hide(i);
        dirty = true;
        continue;
      }

      particle.velocity.y -= 9.2 * dt;
      particle.velocity.multiplyScalar(1 - 1.4 * dt);
      this.positions[i].addScaledVector(particle.velocity, dt);

      const t = particle.life / particle.maxLife;
      const scale = particle.baseScale * Math.min(1, t * 2.4);
      const spin = (1 - t) * particle.spin;

      this.quaternion.setFromEuler(new THREE.Euler(spin, spin * 0.7, spin * 1.3));
      this.scale.setScalar(scale);
      this.matrix.compose(this.positions[i], this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      dirty = true;
    }

    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  private hide(index: number) {
    this.position.set(0, -1000, 0);
    this.quaternion.identity();
    this.scale.setScalar(0.0001);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(index, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
