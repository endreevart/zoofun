import { assetUrl } from '../assetUrl';

export type HudIconName = 'zoo' | 'draw' | 'feed' | 'photo' | 'roster';

/** Clay pictures on the zoo buttons so a pre-reader can pick by sight. */
export function HudIcon({ name }: { name: HudIconName }) {
  return (
    <img
      className="icon-pic"
      src={assetUrl(`hud/hud-${name}.png`)}
      alt=""
      draggable={false}
    />
  );
}
