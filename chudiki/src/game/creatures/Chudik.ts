import * as THREE from 'three';
import { mulberry32, range, type Rng } from '../core/rng';
import type { WalkableQuery } from '../world/World';
import { buildChudik, type ChudikRig } from './ChudikBuilder';
import { buildDrawingChudik } from './DrawingChudikBuilder';
import type { ChudikSpec, DrawingData } from './ChudikSpec';
import { crackAmount, hatchFromTap, hatchFromWait, warmEgg } from './hatch';

type Behaviour = 'idle' | 'walk' | 'react' | 'arriving';

type CareTask =
  | { kind: 'goto'; x: number; z: number }
  | { kind: 'eat'; remaining: number }
  | { kind: 'done' };

/**
 * A living chudik: the puppet plus the small amount of brain it needs to
 * wander the zoo, notice the camera and answer a tap.
 */
export class Chudik {
  readonly spec: ChudikSpec;
  rig: ChudikRig;

  private world: WalkableQuery;
  private rng: Rng;

  private behaviour: Behaviour = 'idle';
  private behaviourTimer = 0;
  private target = new THREE.Vector3();
  private yaw = 0;
  private targetYaw = 0;
  private speed = 0;
  private walkPhase = 0;

  private blinkTimer: number;
  private blinkProgress = 1;
  private lookWeight = 0;

  private reactTimer = 0;
  private reactDuration = 0;
  private arriveProgress = 0;
  private rescued = false;
  private careTask: CareTask | null = null;
  /** 1 = just ate, ~0.2 = a bit peckish. Never empty: no one suffers. */
  fullness = 0.42;
  private driven = false;
  private driveForward = 0;
  private driveRight = 0;
  private driveYaw = 0;

  private phaseOffset: number;
  private hopHeight: number;
  private walkSpeed: number;

  /**
   * World scale of the puppet. The rig is authored at 1.0, which is roughly
   * elephant-sized next to the Idyllic trees, so the garden sets it instead.
   */
  private scale = 1;
  /**
   * Ground speed does not scale linearly with size — a fully scaled-down step
   * looks like a stuck animation — so it follows the square root instead.
   */
  private moveScale = 1;
  private hatchHeat = 0;
  private hatchWait = 0;
  private hatchKick = 0;
  private hatchReady: DrawingData | null = null;

  constructor(spec: ChudikSpec, world: WalkableQuery, spawn: THREE.Vector3) {
    this.spec = spec;
    this.world = world;
    this.rng = mulberry32(spec.seed ^ 0xbeef);

    this.rig = spec.drawing ? buildDrawingChudik(spec, spec.drawing) : buildChudik(spec);
    this.rig.root.userData.chudik = this;

    this.rig.root.position.copy(spawn);
    this.rig.root.position.y = world.heightAt(spawn.x, spawn.z);
    this.yaw = range(this.rng, 0, Math.PI * 2);
    this.targetYaw = this.yaw;
    this.rig.root.rotation.y = this.yaw;

    this.phaseOffset = range(this.rng, 0, Math.PI * 2);
    this.blinkTimer = range(this.rng, 1, 5);
    this.hopHeight = spec.legCount === 0 ? 0.06 : range(this.rng, 0.1, 0.26) * spec.size;
    this.walkSpeed = range(this.rng, 0.7, 1.5) * (spec.legCount === 0 ? 0.6 : 1);

    this.target.copy(this.rig.root.position);
    this.behaviourTimer = range(this.rng, 0.2, 2.5);
    if (this.isHatching && spec.drawing && !spec.drawing.placeholder) {
      this.hatchReady = spec.drawing;
    }
  }

  get isHatching(): boolean {
    return this.spec.hatching === true;
  }

  get id(): string {
    return this.spec.id;
  }

  get object3D(): THREE.Group {
    return this.rig.root;
  }

  get position(): THREE.Vector3 {
    return this.rig.root.position;
  }

  /** Height in world units, so nameplates and sparkles follow the scale. */
  get height(): number {
    return this.rig.height * this.scale;
  }

  setScale(scale: number) {
    if (this.scale === scale) return;
    this.scale = scale;
    this.moveScale = Math.sqrt(scale);
    this.rig.root.scale.setScalar(scale);
  }

  /** Plays the arrival animation: pops out of nothing and looks around. */
  playArrival() {
    this.behaviour = 'arriving';
    this.arriveProgress = 0;
    this.rig.squash.scale.setScalar(0.001);
  }

  /** Tap response. The voice itself is triggered by the caller. */
  react() {
    this.behaviour = 'react';
    this.reactDuration = range(this.rng, 0.75, 1.1);
    this.reactTimer = 0;
    this.blinkProgress = 1;
    this.speed = 0;
  }

  get isReacting(): boolean {
    return this.behaviour === 'react';
  }

  get isDriven(): boolean {
    return this.driven;
  }

  setDriven(on: boolean) {
    this.driven = on;
    this.driveForward = 0;
    this.driveRight = 0;
    if (on && this.behaviour === 'react') {
      this.rig.bounce.position.y = 0;
      this.rig.squash.scale.setScalar(1);
      this.behaviour = 'idle';
    }
    if (!on && this.behaviour !== 'react' && this.behaviour !== 'arriving') {
      this.behaviour = 'idle';
      this.behaviourTimer = 0.4;
      this.speed = 0;
    }
  }

  setDriveInput(forward: number, right: number, cameraYaw: number) {
    this.driveForward = THREE.MathUtils.clamp(forward, -1, 1);
    this.driveRight = THREE.MathUtils.clamp(right, -1, 1);
    this.driveYaw = cameraYaw;
  }

  get isOnCare(): boolean {
    return this.careTask !== null && this.careTask.kind !== 'done';
  }

  get hasArrived(): boolean {
    if (!this.careTask) return false;
    if (this.careTask.kind === 'eat' || this.careTask.kind === 'done') return true;
    const dx = this.rig.root.position.x - this.careTask.x;
    const dz = this.rig.root.position.z - this.careTask.z;
    return Math.hypot(dx, dz) < 0.5 * this.moveScale;
  }

  get finishedEating(): boolean {
    return this.careTask?.kind === 'done';
  }

  /** Walk to a point and stay there. Wander does not interrupt this. */
  goTo(x: number, z: number) {
    if (
      this.careTask?.kind === 'goto' &&
      Math.hypot(this.careTask.x - x, this.careTask.z - z) < 0.05
    ) {
      return;
    }
    this.careTask = { kind: 'goto', x, z };
    this.target.set(x, 0, z);
    this.behaviour = 'walk';
    this.behaviourTimer = 30;
  }

  startEating(seconds: number) {
    this.careTask = { kind: 'eat', remaining: seconds };
    this.behaviour = 'idle';
    this.speed = 0;
  }

  releaseCare() {
    this.careTask = null;
    if (this.behaviour !== 'react' && this.behaviour !== 'arriving') {
      this.behaviour = 'idle';
      this.behaviourTimer = 0.35;
    }
  }

  /** Child tapped the egg. Returns true when it should open now. */
  nudgeHatch(): boolean {
    if (!this.isHatching) return false;
    this.hatchHeat = warmEgg(this.hatchHeat);
    this.hatchKick = 1;
    this.rig.setHatchLook?.(crackAmount(this.hatchHeat, this.hatchReady !== null));
    return hatchFromTap(this.hatchHeat, this.hatchReady !== null);
  }

  /** The finished puppet is ready; the egg can open when tapped or after a beat. */
  prepareHatch(drawing: DrawingData) {
    this.hatchReady = drawing;
    this.rig.setHatchLook?.(crackAmount(this.hatchHeat, true));
  }

  takeHatch(): DrawingData | null {
    const drawing = this.hatchReady;
    this.hatchReady = null;
    return drawing;
  }

  wantsHatch(): boolean {
    return hatchFromWait(this.hatchWait, this.hatchHeat, this.hatchReady !== null);
  }

  update(dt: number, elapsed: number, cameraPosition: THREE.Vector3) {
    if (this.isHatching) {
      this.updateEgg(dt, elapsed);
      this.applyGround();
      return;
    }
    if (this.behaviour === 'arriving') {
      this.updateArrival(dt);
    } else if (this.behaviour === 'react' && !this.driven) {
      this.updateReaction(dt);
    } else if (this.careTask) {
      this.updateCare(dt);
    } else if (this.driven) {
      this.updateDrive(dt);
    } else {
      this.updateWander(dt);
    }

    this.applyGround();
    this.applyIdleMotion(elapsed);
    this.updateBlink(dt);
    this.updateGaze(dt, cameraPosition);
  }

  private updateEgg(dt: number, elapsed: number) {
    if (this.behaviour === 'arriving') {
      this.updateArrival(dt);
      return;
    }
    if (this.hatchReady) this.hatchWait += dt;
    this.hatchKick = Math.max(0, this.hatchKick - dt * 3.2);
    const sway = Math.sin(elapsed * 2.4 + this.phaseOffset) * 0.05;
    const tap = this.hatchKick * Math.sin(this.hatchKick * Math.PI) * 0.22;
    this.rig.squash.rotation.z = sway + tap;
    this.rig.squash.scale.set(1 + this.hatchKick * 0.08, 1 - this.hatchKick * 0.06, 1 + this.hatchKick * 0.08);
    this.rig.bounce.position.y = Math.abs(tap) * 0.35;
    this.rig.setHatchLook?.(crackAmount(this.hatchHeat, this.hatchReady !== null));
  }

  private updateArrival(dt: number) {
    this.arriveProgress = Math.min(1, this.arriveProgress + dt / 0.85);
    const t = this.arriveProgress;
    // Overshoot then settle: reads as "pop!" rather than a fade-in.
    const eased = t < 0.6 ? 1.25 * Math.sin((t / 0.6) * (Math.PI / 2)) : 1 + Math.sin((t - 0.6) / 0.4 * Math.PI) * 0.12;
    this.rig.squash.scale.set(eased * (2 - eased), eased, eased * (2 - eased));
    this.rig.bounce.position.y = Math.sin(t * Math.PI) * 0.5;

    if (t >= 1) {
      this.rig.squash.scale.setScalar(1);
      this.rig.bounce.position.y = 0;
      this.behaviour = 'idle';
      this.behaviourTimer = 2.5;
      this.lookWeight = 1;
    }
  }

  private updateReaction(dt: number) {
    this.reactTimer += dt;
    const t = Math.min(1, this.reactTimer / this.reactDuration);

    // One big hop with a squash on take-off and on landing.
    const hop = Math.sin(t * Math.PI);
    this.rig.bounce.position.y = hop * 0.75 * this.spec.size;

    const stretch = t < 0.12 ? 1 - (t / 0.12) * 0.25 : t > 0.88 ? 1 - ((t - 0.88) / 0.12) * 0.3 : 1 + hop * 0.14;
    this.rig.squash.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    // A cheeky little spin.
    this.yaw += dt * 2.4 * Math.sin(t * Math.PI);
    this.rig.root.rotation.y = this.yaw;

    for (const ear of this.rig.ears) {
      ear.rotation.x = -Math.sin(t * Math.PI * 2) * 0.6;
    }
    for (const wing of this.rig.wings) {
      wing.rotation.z = Math.sin(t * Math.PI * 8) * 0.7;
    }

    this.lookWeight = Math.min(1, this.lookWeight + dt * 6);

    if (t >= 1) {
      this.rig.bounce.position.y = 0;
      this.rig.squash.scale.setScalar(1);
      this.behaviour = 'idle';
      this.behaviourTimer = range(this.rng, 1.2, 2.8);
    }
  }

  private updateCare(dt: number) {
    const task = this.careTask;
    if (!task) return;

    if (task.kind === 'eat') {
      task.remaining -= dt;
      const chomp = 0.5 + 0.5 * Math.sin(task.remaining * 12);
      this.rig.bounce.position.y = chomp * 0.34 * this.spec.size;
      const squash = 1 - chomp * 0.22;
      this.rig.squash.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      for (const ear of this.rig.ears) {
        ear.rotation.x = -Math.sin(task.remaining * 14) * 0.5;
      }
      if (task.remaining <= 0) {
        this.rig.bounce.position.y = 0;
        this.rig.squash.scale.setScalar(1);
        this.careTask = { kind: 'done' };
        this.fullness = 1;
      }
      return;
    }

    if (task.kind === 'done') {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 6);
      return;
    }

    const toTarget = this.target.clone().sub(this.rig.root.position);
    toTarget.y = 0;
    const distance = toTarget.length();
    if (distance < 0.5 * this.moveScale) {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 8);
      this.turnTowards(dt);
      this.walkPhase += dt * (4 + this.speed * 3.2);
      this.applyWalkCycle();
      return;
    }

    this.targetYaw = Math.atan2(toTarget.x, toTarget.z);
    const turned = this.turnTowards(dt);
    const align = Math.max(0, 1 - Math.abs(turned) / 0.9);
    this.speed = THREE.MathUtils.lerp(this.speed, this.walkSpeed * 1.85 * align, dt * 4);
    const step = Math.max(this.speed * this.moveScale * dt, 0.02);
    const here = this.rig.root.position;
    const tryStep = (yaw: number) => {
      const nextX = here.x + Math.sin(yaw) * step;
      const nextZ = here.z + Math.cos(yaw) * step;
      if (!this.world.isWalkable(nextX, nextZ)) return false;
      here.x = nextX;
      here.z = nextZ;
      return true;
    };
    if (!tryStep(this.yaw)) {
      const dodge = this.rng() > 0.5 ? 1 : -1;
      if (!tryStep(this.yaw + dodge * 0.7) && !tryStep(this.yaw - dodge * 0.7)) {
        this.yaw += dodge * 0.9;
        this.targetYaw = this.yaw;
      }
    }
    this.walkPhase += dt * (4 + this.speed * 3.2);
    this.applyWalkCycle();
  }

  /** Third-person: move camera-relative, stay on walkable ground. */
  private updateDrive(dt: number) {
    const steer = Math.abs(this.driveForward) + Math.abs(this.driveRight);
    if (steer < 0.05) {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 8);
      this.walkPhase += dt * (4 + this.speed * 3.2);
      this.applyWalkCycle();
      return;
    }

    const heading = new THREE.Vector3(Math.sin(this.driveYaw), 0, Math.cos(this.driveYaw));
    const right = new THREE.Vector3(heading.z, 0, -heading.x);
    const dir = heading
      .multiplyScalar(-this.driveForward)
      .add(right.multiplyScalar(this.driveRight));
    if (dir.lengthSq() > 1e-6) {
      dir.normalize();
      this.targetYaw = Math.atan2(dir.x, dir.z);
    }

    const turned = this.turnTowards(dt);
    const align = Math.max(0.35, 1 - Math.abs(turned) / 1.2);
    this.speed = THREE.MathUtils.lerp(this.speed, this.walkSpeed * 1.35 * align, dt * 6);
    const step = Math.max(this.speed * this.moveScale * dt, 0.02);
    const here = this.rig.root.position;
    const tryStep = (yaw: number) => {
      const nextX = here.x + Math.sin(yaw) * step;
      const nextZ = here.z + Math.cos(yaw) * step;
      if (!this.world.isWalkable(nextX, nextZ)) return false;
      here.x = nextX;
      here.z = nextZ;
      return true;
    };
    if (!tryStep(this.yaw)) {
      const dodge = this.driveRight >= 0 ? 1 : -1;
      tryStep(this.yaw + dodge * 0.7) || tryStep(this.yaw - dodge * 0.7);
    }
    this.walkPhase += dt * (4 + this.speed * 3.2);
    this.applyWalkCycle();
  }

  private updateWander(dt: number) {
    const here = this.rig.root.position;
    if (this.world.isWalkable(here.x, here.z)) {
      this.rescued = false;
    } else if (!this.rescued) {
      this.rescued = true;
      const safe = this.world.findOpenSpot(this.rng, here);
      here.copy(safe);
      this.target.copy(here);
      this.speed = 0;
    }

    this.behaviourTimer -= dt;

    if (this.behaviourTimer <= 0) {
      if (this.behaviour === 'walk') {
        this.behaviour = 'idle';
        this.behaviourTimer = range(this.rng, 1.0, 4.5);
        this.speed = 0;
      } else {
        this.chooseNewTarget();
      }
    }

    if (this.behaviour === 'walk') {
      const toTarget = this.target.clone().sub(this.rig.root.position);
      toTarget.y = 0;
      const distance = toTarget.length();

      if (distance < 0.35 * this.moveScale) {
        this.behaviour = 'idle';
        this.behaviourTimer = range(this.rng, 0.8, 3.5);
        this.speed = 0;
      } else {
        this.targetYaw = Math.atan2(toTarget.x, toTarget.z);
        const turned = this.turnTowards(dt);

        // Walk only once roughly facing the target, so nobody crab-walks.
        const align = Math.max(0, 1 - Math.abs(turned) / 0.9);
        this.speed = THREE.MathUtils.lerp(this.speed, this.walkSpeed * align, dt * 4);

        const step = this.speed * this.moveScale * dt;
        const nextX = this.rig.root.position.x + Math.sin(this.yaw) * step;
        const nextZ = this.rig.root.position.z + Math.cos(this.yaw) * step;

        if (this.world.isWalkable(nextX, nextZ)) {
          this.rig.root.position.x = nextX;
          this.rig.root.position.z = nextZ;
        } else {
          // Blocked: give up on this target and look for another.
          this.behaviour = 'idle';
          this.behaviourTimer = range(this.rng, 0.4, 1.2);
          this.speed = 0;
        }
      }
    } else {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, dt * 6);
      this.turnTowards(dt);
    }

    this.walkPhase += dt * (4 + this.speed * 3.2);
    this.applyWalkCycle();
  }

  private chooseNewTarget() {
    for (let i = 0; i < 24; i++) {
      const angle = range(this.rng, 0, Math.PI * 2);
      const distance = range(this.rng, 2.5, 9);
      const x = this.rig.root.position.x + Math.cos(angle) * distance;
      const z = this.rig.root.position.z + Math.sin(angle) * distance;

      if (this.world.isWalkable(x, z)) {
        this.target.set(x, 0, z);
        this.behaviour = 'walk';
        this.behaviourTimer = range(this.rng, 3, 9);
        return;
      }
    }

    // Nowhere to go: turn on the spot and try again shortly.
    this.targetYaw = this.yaw + range(this.rng, -2, 2);
    this.behaviour = 'idle';
    this.behaviourTimer = range(this.rng, 0.6, 1.6);
  }

  /** Rotates towards `targetYaw`; returns the remaining signed error. */
  private turnTowards(dt: number): number {
    let delta = this.targetYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const maxTurn = 3.2 * dt;
    this.yaw += THREE.MathUtils.clamp(delta, -maxTurn, maxTurn);
    this.rig.root.rotation.y = this.yaw;
    return delta;
  }

  private applyWalkCycle() {
    const moving = this.speed > 0.05;
    if (!moving) {
      this.rig.bounce.position.y = THREE.MathUtils.lerp(this.rig.bounce.position.y, 0, 0.2);
      return;
    }

    const t = this.walkPhase;
    if (this.spec.legCount === 0) {
      // Legless creatures glide with a lazy bob and a slight roll.
      this.rig.bounce.position.y = (Math.sin(t) * 0.5 + 0.5) * this.hopHeight;
      this.rig.squash.rotation.z = Math.sin(t * 0.5) * 0.06;
    } else {
      const hop = Math.abs(Math.sin(t));
      this.rig.bounce.position.y = hop * this.hopHeight;
      // Squash at the bottom of the hop, stretch at the top.
      const squash = 1 + (hop - 0.4) * 0.14;
      this.rig.squash.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      this.rig.squash.rotation.x = Math.cos(t) * 0.05;
    }

    for (let i = 0; i < this.rig.ears.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.rig.ears[i].rotation.x = -Math.cos(t) * 0.34;
      this.rig.ears[i].rotation.z += (side * 0.22 - this.rig.ears[i].rotation.z) * 0.1;
    }
    if (this.rig.tail) {
      this.rig.tail.rotation.z = Math.sin(t * 1.5) * 0.3;
    }
    for (const wing of this.rig.wings) {
      wing.rotation.z = Math.sin(t * 3) * 0.35;
    }
  }

  private applyGround() {
    const p = this.rig.root.position;
    p.y = this.world.heightAt(p.x, p.z);
  }

  /** Breathing and ear sway that run no matter what else is happening. */
  private applyIdleMotion(elapsed: number) {
    if (this.behaviour === 'react' || this.behaviour === 'arriving') return;
    if (this.careTask?.kind === 'eat') return;
    if (this.speed > 0.05) return;

    const breathe = Math.sin(elapsed * 1.9 + this.phaseOffset) * 0.035;
    this.rig.squash.scale.set(1 - breathe * 0.6, 1 + breathe, 1 - breathe * 0.6);
    this.rig.squash.rotation.x = 0;
    this.rig.squash.rotation.z = Math.sin(elapsed * 0.7 + this.phaseOffset) * 0.02;

    for (let i = 0; i < this.rig.ears.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.rig.ears[i].rotation.x = Math.sin(elapsed * 1.3 + this.phaseOffset + i) * 0.08;
      this.rig.ears[i].rotation.z = side * 0.22 + Math.sin(elapsed * 0.9 + i * 2) * 0.05;
    }
    if (this.rig.tail) {
      this.rig.tail.rotation.z = Math.sin(elapsed * 1.1 + this.phaseOffset) * 0.12;
    }
    for (const wing of this.rig.wings) {
      wing.rotation.z = Math.sin(elapsed * 2.2 + this.phaseOffset) * 0.12;
    }
  }

  private updateBlink(dt: number) {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkProgress = 0;
      this.blinkTimer = range(this.rng, 2.2, 7);
    }

    if (this.blinkProgress < 1) {
      this.blinkProgress = Math.min(1, this.blinkProgress + dt / 0.14);
      // Down and back up over the blink window.
      const closed = Math.sin(this.blinkProgress * Math.PI);
      const openness = 1 - closed * 0.92;
      for (const eye of this.rig.eyes) eye.scale.y = openness;
    } else {
      for (const eye of this.rig.eyes) {
        eye.scale.y = THREE.MathUtils.lerp(eye.scale.y, this.behaviour === 'react' ? 1.18 : 1, 0.2);
      }
    }
  }

  /** Pupils drift towards the camera when it is close: they notice you. */
  private updateGaze(dt: number, cameraPosition: THREE.Vector3) {
    const distance = this.rig.root.position.distanceTo(cameraPosition);
    const wants = this.behaviour === 'react' ? 1 : distance < 12 ? 0.75 : 0.15;
    this.lookWeight = THREE.MathUtils.lerp(this.lookWeight, wants, dt * 2.5);

    const toCamera = cameraPosition.clone().sub(this.rig.root.position).normalize();
    // Express the direction in the creature's own frame.
    const localX = toCamera.x * Math.cos(-this.yaw) - toCamera.z * Math.sin(-this.yaw);
    const localY = toCamera.y;

    for (const pupil of this.rig.pupils) {
      const base = pupil.userData.baseZ ?? pupil.position.z;
      pupil.userData.baseZ = base;
      const reach = base * 0.55 * this.lookWeight;
      pupil.position.x = THREE.MathUtils.clamp(localX, -1, 1) * reach;
      pupil.position.y = THREE.MathUtils.clamp(localY * 0.8, -1, 1) * reach;
    }
  }

  /** Swap the puppet after a neural restyle. Keeps place, heading, and scale. */
  replaceDrawing(drawing: ChudikSpec['drawing']) {
    if (!drawing) return;
    const parent = this.rig.root.parent;
    const position = this.rig.root.position.clone();
    const oldRoot = this.rig.root;
    this.rig.dispose();
    oldRoot.removeFromParent();

    this.spec.drawing = drawing;
    this.spec.hatching = false;
    const next = buildDrawingChudik(this.spec, drawing);
    next.root.userData.chudik = this;
    next.root.position.copy(position);
    next.root.position.y = this.world.heightAt(position.x, position.z);
    next.root.rotation.y = this.yaw;
    next.root.scale.setScalar(this.scale);
    parent?.add(next.root);
    this.rig = next;
  }

  dispose() {
    this.rig.root.removeFromParent();
    this.rig.dispose();
  }
}
