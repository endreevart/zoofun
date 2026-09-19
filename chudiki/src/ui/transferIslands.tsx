import { assetUrl } from '../assetUrl';
import { gardenArt, kindOfWorld } from '../game/world/kinds';
import type { GardenWorld } from '../game/world/gardens';

export function TransferPic({ name, className }: { name: 'check' | 'arrow'; className?: string }) {
  return <img className={className} src={assetUrl(`ui/transfer/${name}.png`)} alt="" draggable={false} />;
}

function HerePin() {
  return (
    <svg className="transfer-pin" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5c-3.6 0-6.5 2.8-6.5 6.3 0 4.6 6.5 12.2 6.5 12.2s6.5-7.6 6.5-12.2c0-3.5-2.9-6.3-6.5-6.3zm0 8.6a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IslandCard({
  garden,
  here,
  picked,
  onPick,
}: {
  garden: GardenWorld;
  here: boolean;
  picked: boolean;
  onPick?: () => void;
}) {
  const style = kindOfWorld(garden.id, garden.sku).styleTitle;
  const art = assetUrl(gardenArt(garden.id, garden.sku));
  const className = `transfer-island${here ? ' is-here' : ''}${picked ? ' is-picked' : ''}`;
  const inner = (
    <>
      <div className="transfer-island-art">
        <img src={art} alt="" />
        {picked ? <TransferPic name="check" className="transfer-check" /> : null}
      </div>
      <div className="transfer-island-meta">
        <strong>{garden.title}</strong>
        <span className="transfer-style">Стиль: {style}</span>
        {here ? (
          <span className="transfer-badge is-here">
            <HerePin />
            Сейчас здесь
          </span>
        ) : picked ? (
          <span className="transfer-badge is-on">
            <TransferPic name="check" />
            Выбрано
          </span>
        ) : (
          <span className="transfer-badge is-slot" />
        )}
      </div>
    </>
  );
  if (here || !onPick) {
    return <div className={className}>{inner}</div>;
  }
  return (
    <button type="button" className={className} onClick={onPick}>
      {inner}
    </button>
  );
}
