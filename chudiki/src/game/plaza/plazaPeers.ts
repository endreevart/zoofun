/** Eight seats around spawn so a full room does not stack on one mark. */
export const PLAZA_SEATS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 6.2, z: 3.4 },
  { x: -6.0, z: 3.8 },
  { x: 8.4, z: -2.2 },
  { x: -8.1, z: -1.8 },
  { x: 3.4, z: -7.2 },
  { x: -3.8, z: -7.6 },
  { x: 0.6, z: 8.4 },
  { x: 7.2, z: 7.0 },
];

export function seatWorld(seat: number): { x: number; z: number } {
  const n = PLAZA_SEATS.length;
  const index = ((Math.trunc(seat) % n) + n) % n;
  return PLAZA_SEATS[index];
}

export function peerModelPath(specId: string): string {
  return `/v1/plaza/models/${specId.trim()}`;
}
