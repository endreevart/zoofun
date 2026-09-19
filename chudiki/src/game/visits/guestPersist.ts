/** Guest walk is a snapshot (D-028). Host toys never enter the visitor's zoo. */

export function mayWriteFamilyZoo(input: { guestVisit: boolean }): boolean {
  return !input.guestVisit;
}
