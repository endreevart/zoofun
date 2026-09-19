import type { CueId } from '../audio/cues';
import type { ArcadeQuest, ArcadeStep } from './arcadeQuest';

export const ARCADE_CUE_IDS: CueId[] = [
  'arcade_hello',
  'arcade_look',
  'arcade_tree_give',
  'arcade_tree_why',
  'arcade_tree_more',
  'arcade_tree_good',
  'arcade_tree_done',
  'arcade_pond_give',
  'arcade_pond_why',
  'arcade_pond_done',
  'arcade_house_give',
  'arcade_house_who',
  'arcade_house_more',
  'arcade_house_done',
  'arcade_settle_free',
  'arcade_need_friends',
  'arcade_settle_lonely',
  'arcade_wrong',
  'arcade_pause',
  'arcade_resume',
];

export function arcadeEnterCues(quest: ArcadeQuest): CueId[] {
  if (quest.step === 'settle') return [];
  if (!quest.greeted && quest.step === 'trees' && quest.count === 0) {
    return ['arcade_hello', 'arcade_look', 'arcade_tree_give', 'arcade_tree_why'];
  }
  if (quest.step === 'trees') return ['arcade_resume', 'arcade_tree_more'];
  if (quest.step === 'pond') return ['arcade_pond_give', 'arcade_pond_why'];
  if (quest.step === 'houses') return ['arcade_house_give', 'arcade_house_who'];
  return [];
}

export function arcadeStampCues(previous: ArcadeQuest, next: ArcadeQuest): CueId[] {
  if (previous.step === next.step) {
    if (next.step === 'trees') return ['arcade_tree_good', 'arcade_tree_more'];
    if (next.step === 'houses') return ['arcade_house_more'];
    return [];
  }
  if (next.step === 'pond') return ['arcade_tree_done', 'arcade_pond_give', 'arcade_pond_why'];
  if (next.step === 'houses') return ['arcade_pond_done', 'arcade_house_give', 'arcade_house_who'];
  if (next.step === 'settle') return ['arcade_house_done'];
  return [];
}

export function arcadeSettleCue(freeSlot: boolean): CueId {
  return freeSlot ? 'arcade_settle_free' : 'arcade_settle_lonely';
}

export function arcadeStepPayload(quest: ArcadeQuest): { step: ArcadeStep; count: number } {
  return { step: quest.step, count: quest.count };
}
