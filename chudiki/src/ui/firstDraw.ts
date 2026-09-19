/** Copy and timing for the huge draw/photo prompt. */

export function firstDrawCopy(again: boolean, settle = false): {
  label: string;
  draw: string;
  photo: string;
} {
  if (settle) {
    return {
      label: 'Заселить остров',
      draw: 'Нарисовать зуфика',
      photo: 'Фото рисунка или зверя',
    };
  }
  if (again) {
    return {
      label: 'Нарисуй ещё зуфуньчика',
      draw: 'Нарисовать ещё',
      photo: 'Фото рисунка или зверя',
    };
  }
  return {
    label: 'Создай зуфуньчика',
    draw: 'Нарисовать зуфуньчика',
    photo: 'Фото рисунка или зверя',
  };
}

/** Shared lawn with no living Zufik yet. */
export function plazaNeedCopy(): { label: string; draw: string; photo: string } {
  return {
    label: 'Нужен зуфик',
    draw: 'Нарисовать',
    photo: 'Сфотографировать',
  };
}

/** Empty garden, meadow, grove, or a DIY copy — same first draw/photo sheet. */
export function shouldOfferFirstDraw(worldId: string | null | undefined): boolean {
  return Boolean(worldId);
}

/** Last stills are spent. Parent may top up; the child draws a friend first. */
export function shouldAskAnotherDraw(stillRemaining: number | null | undefined): boolean {
  return stillRemaining != null && stillRemaining <= 0;
}

/** Overlay after a hatch that spent the last still, if no waiting paper yet. */
export function shouldOfferFriendInvite(
  stillRemaining: number | null | undefined,
  hasDraft: boolean,
): boolean {
  return stillRemaining != null && stillRemaining <= 0 && !hasDraft;
}

/** Lawn «Создать друга» until they draw or a credit lands. */
export function shouldKeepFriendLawn(
  stillRemaining: number | null | undefined,
  hasCreature: boolean,
  hasDraft: boolean,
): boolean {
  return stillRemaining != null && stillRemaining <= 0 && hasCreature && !hasDraft;
}
