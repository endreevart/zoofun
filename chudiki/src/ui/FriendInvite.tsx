import { CreatureMenuIcon } from './CreatureMenuIcon';
import { HudIcon } from './HudIcon';

type Props = {
  onCreate(): void;
  onClose(): void;
};

/** Huge button after the last credit. Closing it leaves the lawn chip. */
export function FriendInvite({ onCreate, onClose }: Props) {
  return (
    <div className="first-draw friend-invite" role="dialog" aria-label="Создать друга">
      <button className="first-draw-close" type="button" aria-label="Закрыть" onClick={onClose}>
        <CreatureMenuIcon name="close" />
      </button>
      <div className="first-draw-actions">
        <button
          className="big-button primary first-draw-btn friend-invite-btn"
          type="button"
          onClick={onCreate}
        >
          <span className="friend-invite-pics" aria-hidden>
            <HudIcon name="roster" />
            <HudIcon name="draw" />
          </span>
          <span>Создать друга</span>
        </button>
      </div>
    </div>
  );
}
