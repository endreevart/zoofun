import type { GardenWorld } from '../game/world/gardens';
import { GardenPickRow } from './GardenPickRow';

type Props = {
  destinations: GardenWorld[];
  onBuy(): void;
  onPickDest(id: string): void;
};

/** The open lawn is full. Offer another garden, not a dump of everyone onto it. */
export function WorldFullPrompt({ destinations, onBuy, onPickDest }: Props) {
  return (
    <div className="sheet world-full" role="dialog" aria-label="Места нет">
      <h1 className="sheet-title">На острове кончилось место</h1>
      <p className="section-label">
        {destinations.length > 0
          ? 'Можно купить новый сад или перенести зуфунят.'
          : 'Можно купить новый сад и строить там.'}
      </p>
      {destinations.length > 0 ? (
        <div className="sheet-body">
          <GardenPickRow gardens={destinations} action="Перенести" onPick={onPickDest} />
        </div>
      ) : null}
      <div className="move-actions">
        <button className="big-button primary" type="button" onClick={onBuy}>
          Купить сад
        </button>
      </div>
    </div>
  );
}
