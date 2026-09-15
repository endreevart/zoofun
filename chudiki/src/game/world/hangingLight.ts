/** Desktop hanging trims fill so umbra still reads. Phone hanging keeps full fill. */
export function hangingLightScale(hanging: boolean, tier: 'high' | 'low') {
  if (!hanging || tier === 'low') return { sky: 1, fill: 1, bounce: 1 };
  return { sky: 0.88, fill: 0.78, bounce: 0.85 };
}
