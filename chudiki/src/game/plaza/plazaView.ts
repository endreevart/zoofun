import { PLAZA_LOAD_R, PLAZA_SHADOW_R, PLAZA_STAMP_CAP, PLAZA_VIEW_CELL } from './plazaCopy';

export { PLAZA_LOAD_R, PLAZA_SHADOW_R, PLAZA_STAMP_CAP, PLAZA_VIEW_CELL };

function isPaidPlazaToy(model: string): boolean {
  return model.startsWith('toy_') && model.length > 4;
}

export function plazaViewCell(x: number, z: number, size = PLAZA_VIEW_CELL): string {
  const step = Math.max(8, size);
  return `${Math.round(x / step)}:${Math.round(z / step)}`;
}

export function nearPlazaProps<T extends { x: number; z: number }>(
  props: readonly T[],
  x: number,
  z: number,
  radius = PLAZA_LOAD_R,
): T[] {
  const r2 = radius * radius;
  return props.filter((prop) => {
    const dx = prop.x - x;
    const dz = prop.z - z;
    return dx * dx + dz * dz <= r2;
  });
}

export function plazaCastsShadow(x: number, z: number, cx: number, cz: number, radius = PLAZA_SHADOW_R): boolean {
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz <= radius * radius;
}

/** Drop the oldest catalog stamps so a new one fits. Paid toys stay. */
export function takePlazaStampRoom<T extends { model: string }>(
  props: readonly T[],
  cap = PLAZA_STAMP_CAP,
): T[] {
  const limit = Math.max(1, Math.floor(cap));
  if (props.length <= limit) return [...props];
  let need = props.length - limit;
  const next: T[] = [];
  for (const row of props) {
    if (need > 0 && !isPaidPlazaToy(row.model)) {
      need -= 1;
      continue;
    }
    next.push(row);
  }
  return next;
}

/** Lawn is packed with paid toys; catalog cannot yield. */
export function plazaLawnLocked(
  props: readonly { model: string }[],
  cap = PLAZA_STAMP_CAP,
): boolean {
  return props.length >= cap && !props.some((row) => !isPaidPlazaToy(row.model));
}
