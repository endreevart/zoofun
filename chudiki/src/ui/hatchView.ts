/** Which picture the hatch screen should show: studio toy vs generated garden. */

export function hatchPreviewSrc(
  still: string | null,
  postcard: string | null,
  wantGarden: boolean,
): string | null {
  if (wantGarden && postcard) return postcard;
  return still;
}

export function hatchPreviewMode(
  still: string | null,
  postcard: string | null,
  wantGarden: boolean,
): 'empty' | 'toy' | 'garden' {
  if (wantGarden && postcard) return 'garden';
  if (still) return 'toy';
  return 'empty';
}
