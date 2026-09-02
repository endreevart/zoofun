import * as THREE from 'three';
import { HERO_CAMERA, HERO_FOCUS } from '../world/layout';

/**
 * Camera controller tuned for small hands: orbit with one finger, pinch to get
 * closer, two fingers to walk the view across the zoo. It can never end up
 * underground, upside down or outside the park.
 */

const LIMITS = {
  minDistance: 3.2,
  maxDistance: 52,
  minPitch: 0.28,
  maxPitch: 1.32,
  panRadius: 24,
};

/** Seconds of no touch before the camera starts a slow lap of the island. */
const IDLE_AFTER = 9;
/** How long the camera lingers between two garden spots. */
const TOUR_SEGMENT = 8.2;

/**
 * A low walk through the park — ponds, bridge, gate, burrow — not a drone
 * shot. Distance stays near a child's eye-line above the grass.
 */
const TOUR_PATH: { x: number; z: number; distance: number; pitch: number }[] = [
  { x: -1.4, z: -5.2, distance: 8.6, pitch: 1.18 },
  { x: -3.6, z: -6.2, distance: 7.4, pitch: 1.12 },
  { x: -0.9, z: -2.5, distance: 6.8, pitch: 1.08 },
  { x: 4.2, z: 0.4, distance: 8.0, pitch: 1.14 },
  { x: 8.2, z: 5.4, distance: 7.2, pitch: 1.05 },
  { x: -3.3, z: 5.7, distance: 7.8, pitch: 1.1 },
  { x: -13.2, z: 0.6, distance: 8.4, pitch: 1.12 },
  { x: 7.4, z: -4.8, distance: 9.0, pitch: 1.16 },
  { x: 0.4, z: -2.0, distance: 8.2, pitch: 1.14 },
];

const OPENING = openingFromHero();

function openingFromHero() {
  const delta = HERO_CAMERA.clone().sub(HERO_FOCUS);
  const horizontal = Math.hypot(delta.x, delta.z);
  const distance = delta.length();
  return {
    target: HERO_FOCUS.clone(),
    yaw: Math.atan2(delta.x, delta.z),
    pitch: Math.atan2(horizontal, delta.y),
    distance,
  };
}

export type CameraRigOptions = {
  domElement: HTMLElement;
  camera: THREE.PerspectiveCamera;
  groundHeightAt(x: number, z: number): number;
};

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private element: HTMLElement;
  private groundHeightAt: (x: number, z: number) => number;

  private target = OPENING.target.clone();
  private desiredTarget = this.target.clone();

  private yaw = OPENING.yaw;
  private pitch = OPENING.pitch;
  private distance = OPENING.distance;
  private desiredYaw = this.yaw;
  private desiredPitch = this.pitch;
  private desiredDistance = this.distance;
  /** How far the pitch tilts down when flying in close on one creature. */
  private closePitch = 0.86;

  private pointers = new Map<number, THREE.Vector2>();
  private lastPinchDistance = 0;
  private lastPanCenter = new THREE.Vector2();
  private dragging = false;
  private autoSpin = 0;
  private primaryOrbit = true;
  private walkForward = 0;
  private walkRight = 0;
  private followTarget: THREE.Vector3 | null = null;
  private idleTimer = 0;
  private touring = false;
  private tourTime = 0;

  private flight: {
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromDistance: number;
    toDistance: number;
    progress: number;
    duration: number;
  } | null = null;

  constructor(options: CameraRigOptions) {
    this.camera = options.camera;
    this.element = options.domElement;
    this.groundHeightAt = options.groundHeightAt;

    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('pointerdown', this.wake, { passive: true });
    window.addEventListener('keydown', this.wake, { passive: true });

    this.apply(1);
  }

  /** True while the user is actively moving the camera, so taps can be ignored. */
  get isDragging(): boolean {
    return this.dragging;
  }

  /** Slow drift used on the very first launch, before anyone touches anything. */
  setAutoSpin(speed: number) {
    this.autoSpin = speed;
  }

  /** Any play action: stop the idle tour and wait again. */
  wake = () => {
    this.idleTimer = 0;
    this.touring = false;
    this.autoSpin = 0;
  };

  /** When false, one-finger drag is left to the layout editor. Pinch still pans. */
  setPrimaryOrbit(enabled: boolean) {
    this.primaryOrbit = enabled;
  }

  /**
   * Hold-to-walk on the ground plane. +forward is into the picture,
   * +right is camera-right. Values are usually -1 / 0 / 1.
   */
  get yawAngle(): number {
    return this.yaw;
  }

  /**
   * Third-person: look-at sticks to this point (usually a creature). Orbit
   * and pinch still work; walking the park does not.
   */
  follow(target: THREE.Vector3 | null) {
    const attaching = target !== null && this.followTarget !== target;
    this.followTarget = target;
    if (attaching) {
      this.wake();
      this.flight = null;
      this.walkForward = 0;
      this.walkRight = 0;
      this.desiredDistance = 5;
      this.desiredPitch = 0.82;
    }
  }

  setWalk(forward: number, right: number) {
    this.walkForward = THREE.MathUtils.clamp(forward, -1, 1);
    this.walkRight = THREE.MathUtils.clamp(right, -1, 1);
    if (this.walkForward !== 0 || this.walkRight !== 0) {
      this.wake();
      this.flight = null;
    }
  }

  /** Smoothly moves the view to frame a creature. */
  flyTo(position: THREE.Vector3, distance = 9, duration = 1.1) {
    this.wake();
    this.desiredPitch = this.closePitch;
    this.flight = {
      fromTarget: this.desiredTarget.clone(),
      toTarget: new THREE.Vector3(position.x, position.y + 0.8, position.z),
      fromDistance: this.desiredDistance,
      toDistance: THREE.MathUtils.clamp(distance, LIMITS.minDistance, LIMITS.maxDistance),
      progress: 0,
      duration,
    };
  }

  /** How far the orbit currently sits, so the world can wrap into a globe. */
  get orbitDistance(): number {
    return this.distance;
  }

  /** Pulls back high enough to see the whole park, not so far the world wraps. */
  showWholeZoo() {
    this.wake();
    this.followTarget = null;
    this.desiredPitch = 0.72;
    this.flight = {
      fromTarget: this.desiredTarget.clone(),
      toTarget: new THREE.Vector3(-0.4, 0.5, -3.2),
      fromDistance: this.desiredDistance,
      toDistance: 46,
      progress: 0,
      duration: 1.5,
    };
  }

  private onPointerDown = (event: PointerEvent) => {
    this.element.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.lastPinchDistance = a.distanceTo(b);
      this.lastPanCenter.copy(a).add(b).multiplyScalar(0.5);
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;

    const current = new THREE.Vector2(event.clientX, event.clientY);

    if (this.pointers.size === 1 && this.primaryOrbit) {
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 1.5) {
        this.dragging = true;
        this.wake();
        this.flight = null;
        this.desiredYaw -= dx * 0.006;
        this.desiredPitch = THREE.MathUtils.clamp(
          this.desiredPitch - dy * 0.005,
          LIMITS.minPitch,
          LIMITS.maxPitch,
        );
      }
    }

    this.pointers.set(event.pointerId, current);

    if (this.pointers.size === 2) {
      this.dragging = true;
      this.wake();
      this.flight = null;

      const [a, b] = [...this.pointers.values()];
      const pinch = a.distanceTo(b);
      if (this.lastPinchDistance > 0) {
        const ratio = this.lastPinchDistance / pinch;
        this.desiredDistance = THREE.MathUtils.clamp(
          this.desiredDistance * ratio,
          LIMITS.minDistance,
          LIMITS.maxDistance,
        );
      }
      this.lastPinchDistance = pinch;

      const center = a.clone().add(b).multiplyScalar(0.5);
      const shift = center.clone().sub(this.lastPanCenter);
      this.lastPanCenter.copy(center);
      if (!this.followTarget) this.panBy(-shift.x, -shift.y);
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.lastPinchDistance = 0;
    }
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.wake();
    this.flight = null;
    this.desiredDistance = THREE.MathUtils.clamp(
      this.desiredDistance * (1 + Math.sign(event.deltaY) * 0.12),
      LIMITS.minDistance,
      LIMITS.maxDistance,
    );
  };

  /** Moves the look-at point across the ground plane, in screen space. */
  private panBy(screenX: number, screenY: number) {
    const speed = this.desiredDistance * 0.0016;
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    this.desiredTarget.addScaledVector(right, screenX * speed);
    this.desiredTarget.addScaledVector(forward, -screenY * speed);
    this.clampTarget();
  }

  /** Walk the look-at point: forward/back and left/right, in metres this frame. */
  private walkStep(dt: number) {
    if (this.walkForward === 0 && this.walkRight === 0) return;
    const speed = this.desiredDistance * 0.85 * dt;
    const heading = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(heading.z, 0, -heading.x);
    this.desiredTarget.addScaledVector(heading, -this.walkForward * speed);
    this.desiredTarget.addScaledVector(right, this.walkRight * speed);
    this.clampTarget();
  }

  private clampTarget() {
    const flat = new THREE.Vector2(this.desiredTarget.x, this.desiredTarget.z);
    if (flat.length() > LIMITS.panRadius) {
      flat.setLength(LIMITS.panRadius);
      this.desiredTarget.x = flat.x;
      this.desiredTarget.z = flat.y;
    }
  }

  update(dt: number) {
    if (this.followTarget) {
      this.desiredTarget.set(
        this.followTarget.x,
        this.followTarget.y + 0.55,
        this.followTarget.z,
      );
      this.idleTimer = 0;
      this.touring = false;
    } else {
      this.walkStep(dt);
      this.updateIdleTour(dt);
    }
    if (this.autoSpin !== 0) this.desiredYaw += this.autoSpin * dt;

    if (this.flight) {
      this.flight.progress = Math.min(1, this.flight.progress + dt / this.flight.duration);
      const t = easeInOut(this.flight.progress);
      this.desiredTarget.lerpVectors(this.flight.fromTarget, this.flight.toTarget, t);
      this.desiredDistance = THREE.MathUtils.lerp(
        this.flight.fromDistance,
        this.flight.toDistance,
        t,
      );
      if (this.flight.progress >= 1) this.flight = null;
    }

    const smoothing = 1 - Math.pow(this.touring ? 0.018 : 0.0015, dt);
    this.apply(smoothing);
  }

  private apply(smoothing: number) {
    this.yaw += (this.desiredYaw - this.yaw) * smoothing;
    this.pitch += (this.desiredPitch - this.pitch) * smoothing;
    this.distance += (this.desiredDistance - this.distance) * smoothing;
    this.target.lerp(this.desiredTarget, smoothing);

    // Keep the look-at point sitting just above the ground it hovers over.
    const groundY = this.groundHeightAt(this.target.x, this.target.z);
    this.target.y += (groundY + 0.8 - this.target.y) * smoothing;

    const horizontal = Math.sin(this.pitch) * this.distance;
    const position = new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.cos(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontal,
    );

    // Never let the camera dip below the terrain it is flying over.
    const minY = this.groundHeightAt(position.x, position.z) + 1.4;
    position.y = Math.max(position.y, minY);

    this.camera.position.copy(position);
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('pointerdown', this.wake);
    window.removeEventListener('keydown', this.wake);
  }

  private updateIdleTour(dt: number) {
    const busy =
      !this.primaryOrbit ||
      this.pointers.size > 0 ||
      this.walkForward !== 0 ||
      this.walkRight !== 0;
    if (busy) {
      this.idleTimer = 0;
      this.touring = false;
      return;
    }

    this.idleTimer += dt;
    if (!this.touring && this.idleTimer >= IDLE_AFTER) {
      this.touring = true;
      this.tourTime = 0;
      this.flight = null;
    }
    if (!this.touring) return;

    this.tourTime += dt;
    const shot = sampleTour(this.tourTime);
    this.desiredTarget.x = shot.x;
    this.desiredTarget.z = shot.z;
    this.desiredDistance = shot.distance;
    this.desiredPitch = shot.pitch;
    this.desiredYaw = unwrapAngle(this.desiredYaw, shot.yaw);
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function unwrapAngle(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta;
}

function sampleTour(time: number) {
  const count = TOUR_PATH.length;
  const span = count * TOUR_SEGMENT;
  const u = ((time % span) + span) % span;
  const index = Math.floor(u / TOUR_SEGMENT) % count;
  const next = (index + 1) % count;
  const t = easeInOut((u - index * TOUR_SEGMENT) / TOUR_SEGMENT);
  const a = TOUR_PATH[index];
  const b = TOUR_PATH[next];
  const sway = Math.sin(time * 0.4) * 0.035;
  const ahead = TOUR_PATH[(index + 2) % count];
  const lookX = THREE.MathUtils.lerp(b.x, ahead.x, t * 0.35) - a.x;
  const lookZ = THREE.MathUtils.lerp(b.z, ahead.z, t * 0.35) - a.z;
  return {
    x: THREE.MathUtils.lerp(a.x, b.x, t),
    z: THREE.MathUtils.lerp(a.z, b.z, t),
    distance: THREE.MathUtils.lerp(a.distance, b.distance, t) + Math.sin(time * 0.55) * 0.35,
    pitch: THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(a.pitch, b.pitch, t) + sway,
      LIMITS.minPitch,
      LIMITS.maxPitch,
    ),
    yaw: Math.atan2(-lookX, -lookZ),
  };
}
