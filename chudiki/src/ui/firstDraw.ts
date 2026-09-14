/** Copy and timing for the huge draw/photo prompt. */

export function firstDrawCopy(again: boolean): {
  label: string;
  draw: string;
  photo: string;
} {
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

/** Empty garden, meadow, grove, or a DIY copy — same first draw/photo sheet. */
export function shouldOfferFirstDraw(worldId: string | null | undefined): boolean {
  return Boolean(worldId);
}

/** After the last credit is spent, open the first-friend pack sheet. */
export function shouldAskAnotherDraw(remaining: number | null | undefined): boolean {
  return remaining != null && remaining <= 0;
}
