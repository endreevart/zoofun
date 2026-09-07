/**
 * Puzzle cut from the hatch still. Pure grid logic; the component owns
 * pointers, rendering, and the seeded rng. Cells are addressed row-major.
 */

export type PuzzlePiece = { index: number; row: number; col: number };

export function makePieces(cols: number, rows: number): PuzzlePiece[] {
  const pieces: PuzzlePiece[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      pieces.push({ index: row * cols + col, row, col });
    }
  }
  return pieces;
}

/** Tray order. Never the solved order, so there is always something to do. */
export function shuffledOrder(count: number, rng: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (count < 2 || order.some((value, index) => value !== index)) break;
  }
  return order;
}

/** Which cell a point lands in, or null outside the board. */
export function cellAt(
  x: number,
  y: number,
  width: number,
  height: number,
  cols: number,
  rows: number,
): { row: number; col: number } | null {
  if (width <= 0 || height <= 0) return null;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return {
    col: Math.min(cols - 1, Math.floor((x / width) * cols)),
    row: Math.min(rows - 1, Math.floor((y / height) * rows)),
  };
}

export function isRightCell(
  piece: PuzzlePiece,
  cell: { row: number; col: number } | null,
): boolean {
  return cell !== null && cell.row === piece.row && cell.col === piece.col;
}
