import type { GardenWorld } from '../game/world/gardens';

export function defaultMoveDestId(dests: readonly GardenWorld[]): string | null {
  return dests[0]?.id ?? null;
}

export function transferTitle(name: string): string {
  return `Переместить ${name}`;
}

export function transferSummary(name: string, destTitle: string): string {
  return `${name} переедет в «${destTitle}»`;
}
