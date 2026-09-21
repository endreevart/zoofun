import type { CueId } from '../audio/cues';

export const PLAZA_CUE_IDS: CueId[] = [
  'plaza_hello',
  'plaza_look',
  'plaza_friends',
  'plaza_walk',
  'plaza_jump',
  'plaza_emote',
  'plaza_build',
  'plaza_things',
  'plaza_pick',
  'plaza_need',
  'plaza_save',
  'plaza_home',
  'plaza_dig',
  'plaza_found',
  'plaza_draw',
  'plaza_toy_wait',
];

/** First visit: what this lawn is, who is here, how to walk. The rest waits for a tap. */
export function plazaEnterCues(): CueId[] {
  return ['plaza_hello', 'plaza_look', 'plaza_friends', 'plaza_walk'];
}

export const PLAZA_INTRO_COMPASS = '/ui/walk-hint/compass.png';

export type PlazaIntroSpec = {
  title: string;
  titleArt?: string;
  icon?: string | false;
};

/** How long «Скоро штука» stays if nobody taps Понятно. */
export const PLAZA_TOY_WAIT_MS = 5500;

export function plazaToyWaitLocked(waiting: boolean, dismissed: boolean): boolean {
  return waiting && dismissed;
}

/** Welcome plaques on the shared lawn. Look keeps the wooden title board. */
export function plazaIntroSpec(cue: string): PlazaIntroSpec | null {
  if (cue === 'plaza_hello') return { title: 'Общий зоопарк' };
  if (cue === 'plaza_look') {
    return {
      title: 'Свободная прогулка',
      titleArt: '/ui/walk-hint/title-free-walk.png',
    };
  }
  if (cue === 'plaza_friends') return { title: 'Друзья' };
  if (cue === 'plaza_walk') return { title: 'Как ходить' };
  if (cue === 'plaza_toy_wait') return { title: 'Скоро штука', icon: false };
  return null;
}

/** Home stays on the lawn unless a welcome plaque is actually on screen. */
export function plazaHidesHome(intro: string | null | undefined): boolean {
  return Boolean(intro && plazaIntroSpec(intro));
}

/** Shared lawn has no garden `world`, but the bed should keep playing. */
export function plazaKeepsGardenBed(screen: string, world?: string | null): boolean {
  return screen === 'plaza' || Boolean(world);
}

/** Shared lawn stays in code; the worlds picker hides the banner until this is true. */
export const PLAZA_PUBLIC = false;

/** Lawn-toy paper stays on the shared lawn. Do not show the world picker. */
export function plazaCoversWorlds(screen: string, drawingToy = false, toyLook = false): boolean {
  return screen === 'plaza' || drawingToy || toyLook;
}
