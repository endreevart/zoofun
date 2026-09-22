import * as THREE from 'three';

/**
 * Plaza-style reaction sprites. Garden taps reuse the same puff as the lawn.
 */

type Particle = {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  base: number;
};

export class EmotePuff {
  private particles: Particle[] = [];

  burst(scene: THREE.Scene, map: THREE.Texture, origin: THREE.Vector3, power = 1, count = 6) {
    const spread = 0.28 * power;
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 40;
      const size = (0.48 + Math.random() * 0.42) * power;
      sprite.scale.set(size, size, 1);
      sprite.position.set(
        origin.x + (Math.random() - 0.5) * spread,
        origin.y,
        origin.z + (Math.random() - 0.5) * spread,
      );
      sprite.visible = false;
      scene.add(sprite);
      this.particles.push({
        sprite,
        age: -i * 0.03,
        life: 0.9 + Math.random() * 0.55 * power,
        vx: (Math.random() - 0.5) * 1.6 * power,
        vy: 1.4 + Math.random() * 2.2 * power,
        vz: (Math.random() - 0.5) * 1.6 * power,
        base: size,
      });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const item = this.particles[i];
      item.age += dt;
      if (item.age < 0) {
        item.sprite.visible = false;
        continue;
      }
      item.sprite.visible = true;
      item.sprite.position.x += item.vx * dt;
      item.sprite.position.y += item.vy * dt;
      item.sprite.position.z += item.vz * dt;
      const t = item.age / item.life;
      const fade = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
      item.sprite.material.opacity = fade;
      const size = item.base * (0.92 + t * 0.5);
      item.sprite.scale.set(size, size, 1);
      if (t >= 1) {
        item.sprite.removeFromParent();
        item.sprite.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const item of this.particles) {
      item.sprite.removeFromParent();
      item.sprite.material.dispose();
    }
    this.particles.length = 0;
  }

  get count() {
    return this.particles.length;
  }
}
