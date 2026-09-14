import { assetUrl } from '../assetUrl';

export type CreatureMenuIconName =
  | 'lead'
  | 'wash'
  | 'feed'
  | 'puzzle'
  | 'gear'
  | 'close'
  | 'chevron'
  | 'listen'
  | 'record'
  | 'find'
  | 'move'
  | 'release';

type Props = {
  name: CreatureMenuIconName;
  className?: string;
};

/** Clay pictures on the tap tray and the extra-settings sheet. */
export function CreatureMenuIcon({ name, className }: Props) {
  return (
    <img
      className={className ?? 'creature-menu-ico'}
      src={assetUrl(`ui/creature/${name}.png`)}
      alt=""
      draggable={false}
    />
  );
}
