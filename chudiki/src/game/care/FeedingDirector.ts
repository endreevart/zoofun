import * as THREE from 'three';
import type { Chudik } from '../creatures/Chudik';
import { mulberry32 } from '../core/rng';
import type { WalkableQuery } from '../world/World';
import { ISLAND } from '../world/layout';
import {
  APPROACH_DEPTH,
  ARRIVE_RADIUS,
  ARRIVE_TIMEOUT,
  EAT_SECONDS,
  assignToFeeders,
  livePlace,
  slotBeside,
  type Assignment,
  type FeederSpot,
} from './feedingPlan';

/**
 * Sends chudiki to the harvest baskets in groups: one eater per feeder, the
 * next in line waiting a step back, everyone else staying put until they
 * move up. Each animal spends at most a second at the bowl.
 */
export class FeedingDirector {
  private assignments: Assignment[] = [];
  private feeders: FeederSpot[] = [];
  private finished = new Set<string>();
  private eating = new Set<string>();
  private world: WalkableQuery | null = null;
  private slots = new Map<string, THREE.Vector3>();
  private waited = new Map<string, number>();
  active = false;
  justFed = 0;

  start(creatures: readonly Chudik[], feeders: readonly FeederSpot[], world: WalkableQuery) {
    if (creatures.length === 0 || feeders.length === 0) return;
    this.world = world;
    this.feeders = [...feeders];
    this.finished.clear();
    this.eating.clear();
    this.slots.clear();
    this.waited.clear();
    this.justFed = 0;
    this.assignments = assignToFeeders(
      creatures.map((chudik) => ({ id: chudik.id, x: chudik.position.x, z: chudik.position.z })),
      this.feeders,
    );
    this.active = true;
    this.steer(creatures);
  }

  cancel(creatures: readonly Chudik[]) {
    for (const chudik of creatures) chudik.releaseCare();
    this.active = false;
    this.assignments = [];
    this.finished.clear();
    this.eating.clear();
  }

  update(dt: number, creatures: readonly Chudik[]): string[] {
    this.justFed = 0;
    if (!this.active) return [];
    const fed: string[] = [];
    const byId = new Map(creatures.map((chudik) => [chudik.id, chudik]));

    for (const row of this.assignments) {
      const chudik = byId.get(row.creatureId);
      if (!chudik || this.finished.has(chudik.id)) continue;
      const place = livePlace(this.assignments, chudik.id, this.finished);
      if (place === null) continue;

      if (place === 0 && !this.eating.has(chudik.id) && !chudik.finishedEating) {
        const waited = (this.waited.get(chudik.id) ?? 0) + dt;
        this.waited.set(chudik.id, waited);
        if (chudik.hasArrived || waited >= ARRIVE_TIMEOUT) {
          if (!chudik.hasArrived) {
            const slot = this.slotFor(row.feederIndex, 0);
            chudik.position.x = slot.x;
            chudik.position.z = slot.z;
          }
          chudik.startEating(EAT_SECONDS);
          this.eating.add(chudik.id);
        }
      }

      if (chudik.finishedEating) {
        this.finished.add(chudik.id);
        this.eating.delete(chudik.id);
        chudik.releaseCare();
        chudik.react();
        fed.push(chudik.id);
      }
    }

    this.justFed = fed.length;
    this.steer(creatures);

    if (this.finished.size >= this.assignments.length) {
      this.active = false;
    }

    void dt;
    return fed;
  }

  private steer(creatures: readonly Chudik[]) {
    const byId = new Map(creatures.map((chudik) => [chudik.id, chudik]));
    for (const row of this.assignments) {
      const chudik = byId.get(row.creatureId);
      if (!chudik || this.finished.has(chudik.id)) continue;
      if (this.eating.has(chudik.id) || chudik.finishedEating) continue;
      const place = livePlace(this.assignments, chudik.id, this.finished);
      if (place === null) continue;
      if (place >= APPROACH_DEPTH) {
        if (chudik.isOnCare) chudik.releaseCare();
        continue;
      }
      const slot = this.slotFor(row.feederIndex, place);
      const here = chudik.position;
      if (Math.hypot(here.x - slot.x, here.z - slot.z) < ARRIVE_RADIUS) continue;
      chudik.goTo(slot.x, slot.z);
    }
  }

  private slotFor(feederIndex: number, place: number): THREE.Vector3 {
    const key = `${feederIndex}:${place}`;
    const cached = this.slots.get(key);
    if (cached) return cached;
    const planned = slotBeside(this.feeders[feederIndex], place, {
      x: ISLAND.centerX,
      z: ISLAND.centerZ,
    });
    const world = this.world;
    const rng = mulberry32(((feederIndex + 1) * 917 + place * 31) >>> 0);
    const snapped = world
      ? world.findOpenSpot(rng, new THREE.Vector3(planned.x, 0, planned.z))
      : new THREE.Vector3(planned.x, 0, planned.z);
    this.slots.set(key, snapped);
    return snapped;
  }
}
