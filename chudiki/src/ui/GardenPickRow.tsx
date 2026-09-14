import { assetUrl } from '../assetUrl';
import { gardenArt } from '../game/world/kinds';
import type { GardenWorld } from '../game/world/gardens';

type Props = {
  gardens: GardenWorld[];
  action?: string;
  onPick(id: string): void;
};

/** Picture-first garden buttons so a pre-reader can pick a lawn. */
export function GardenPickRow({ gardens, action = 'Сюда', onPick }: Props) {
  if (gardens.length === 0) return null;
  return (
    <div className="world-picker-row">
      {gardens.map((garden) => (
        <div className="world-choice" key={garden.id}>
          <button className="world-card" type="button" onClick={() => onPick(garden.id)}>
            <img className="world-card-art" src={assetUrl(gardenArt(garden.id, garden.sku))} alt="" />
            <span className="world-card-label">{garden.title}</span>
          </button>
          <button className="world-card-action" type="button" onClick={() => onPick(garden.id)}>
            {action}
          </button>
        </div>
      ))}
    </div>
  );
}
