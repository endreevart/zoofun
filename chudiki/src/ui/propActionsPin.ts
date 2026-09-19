export function pinPropActions(
  hud: { x: number; y: number } | null,
  rect: { left: number; top: number; width: number; height: number },
) {
  const x = (hud?.x ?? rect.left + rect.width / 2) - rect.left;
  const y = (hud?.y ?? rect.top + 140) - rect.top;
  return {
    left: Math.min(rect.width - 120, Math.max(120, x)),
    top: Math.min(rect.height - 160, Math.max(72, y)),
  };
}
