import { assetUrl } from '../assetUrl';

export type DrawToolIconName = 'brush' | 'erase' | 'fill' | 'clear' | 'sparkle';

type Props = {
  name: DrawToolIconName;
  className?: string;
};

/** Clay pictures on the drawing bar so a pre-reader can pick a tool by sight. */
export function DrawToolIcon({ name, className }: Props) {
  return (
    <img
      className={className ?? 'draw-tool-ico'}
      src={assetUrl(`ui/draw/${name}.png`)}
      alt=""
      draggable={false}
    />
  );
}
