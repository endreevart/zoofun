import { HudIcon } from './HudIcon';

type Props = {
  image?: string;
  lonely?: boolean;
  onTap(): void;
};

/** Paper on the lawn. A drawing opens the shop; a blank sheet opens the pad. */
export function WaitingFriend({ image, lonely, onTap }: Props) {
  if (!image) {
    return (
      <button className="waiting-friend" type="button" onClick={onTap}>
        <span className="waiting-friend-art waiting-friend-blank" aria-hidden>
          <HudIcon name="draw" />
        </span>
        <span className="waiting-friend-go">Создать друга</span>
      </button>
    );
  }
  return (
    <button className="waiting-friend" type="button" onClick={onTap}>
      <img className="waiting-friend-art" src={image} alt="" draggable={false} />
      <span className="waiting-friend-go">Оживить</span>
      {lonely ? <span className="waiting-friend-lonely">Ему будет скучно</span> : null}
    </button>
  );
}
