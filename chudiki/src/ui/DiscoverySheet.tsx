import { assetUrl } from '../assetUrl';
import { discoveryProgress } from './discoveryCopy';

type Props = {
  title: string;
  body: string;
  opened: number;
  total: number;
  onClose(): void;
};

/** Parent reads the fact aloud. No voice on the island yet (D-036). */
export function DiscoverySheet({ title, body, opened, total, onClose }: Props) {
  const progress = discoveryProgress(opened, total);
  return (
    <>
      <button className="discovery-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
      <div className="discovery-sheet" role="dialog" aria-label="Открытия ЗУФАН">
        <div className="discovery-sheet-top">
          <img
            className="discovery-sheet-art"
            src={assetUrl('/ui/discovery-chest.png')}
            alt=""
            draggable={false}
          />
          <div className="discovery-sheet-meta">
            <p className="discovery-sheet-kicker">Открытия ЗУФАН</p>
            {progress ? <span className="discovery-sheet-count">{progress}</span> : null}
          </div>
          <button className="discovery-sheet-close" type="button" aria-label="Закрыть" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <h2 className="discovery-sheet-title">{title}</h2>
        <p className="discovery-sheet-body">{body}</p>
        <button className="discovery-sheet-back" type="button" onClick={onClose}>
          Вернуться в зоопарк
        </button>
      </div>
    </>
  );
}
