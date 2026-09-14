import { useState } from 'react';
import { assetUrl } from '../assetUrl';
import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';
import { gardenArt, kindOfWorld } from '../game/world/kinds';
import { gardenById, moveDestinations, type GardenWorld } from '../game/world/gardens';
import { CreatureMenuIcon } from './CreatureMenuIcon';
import { defaultMoveDestId, transferSummary, transferTitle } from './transferView';

type Props = {
  spec: ChudikSpec;
  pic: string | null;
  currentId: string;
  worlds: GardenWorld[];
  onMove(id: string): void;
  onCancel(): void;
};

function TransferPic({ name, className }: { name: 'check' | 'arrow'; className?: string }) {
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

function IslandCard({
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
        ) : null}
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

/** Choose which owned lawn a creature should move to, then confirm. */
export function WorldDestSheet({ spec, pic, currentId, worlds, onMove, onCancel }: Props) {
  const kind = kindById(spec.kindId);
  const here = gardenById(currentId, worlds);
  const dests = moveDestinations(currentId, worlds);
  const [picked, setPicked] = useState(() => defaultMoveDestId(dests));
  const dest = dests.find((item) => item.id === picked) ?? null;
  const title = transferTitle(spec.name);

  return (
    <>
      <button className="transfer-scrim" type="button" aria-label="Закрыть" onClick={onCancel} />
      <div className="transfer-sheet" role="dialog" aria-label={title}>
        <div className="transfer-head">
          {pic ? (
            <img className="transfer-face" src={pic} alt="" />
          ) : (
            <span className="transfer-face is-emoji">{kind.emoji}</span>
          )}
          <div className="transfer-titles">
            <h2>{title}</h2>
            <p>Выберите остров, куда он переедет</p>
          </div>
          <button className="pilot-tool" type="button" onClick={onCancel} aria-label="Закрыть">
            <CreatureMenuIcon name="close" />
          </button>
        </div>

        <div className="transfer-islands">
          <IslandCard garden={here} here picked={false} />
          {dests.map((garden) => (
            <IslandCard
              key={garden.id}
              garden={garden}
              here={false}
              picked={garden.id === picked}
              onPick={() => setPicked(garden.id)}
            />
          ))}
        </div>

        <div className="transfer-foot">
          <div className="transfer-summary">
            <div className="transfer-path" aria-hidden>
              <img src={assetUrl(gardenArt(here.id, here.sku))} alt="" />
              <TransferPic name="arrow" className="transfer-arrow" />
              {dest ? <img src={assetUrl(gardenArt(dest.id, dest.sku))} alt="" /> : <span className="transfer-path-gap" />}
            </div>
            <div className="transfer-copy">
              <p className="transfer-lead">{dest ? transferSummary(spec.name, dest.title) : 'Выберите остров'}</p>
              <p className="transfer-note">Все его настройки сохранятся</p>
            </div>
          </div>
          <div className="transfer-actions">
            <button className="transfer-btn is-cancel" type="button" onClick={onCancel}>
              Отмена
            </button>
            <button
              className="transfer-btn is-go"
              type="button"
              disabled={!picked}
              onClick={() => picked && onMove(picked)}
            >
              Переместить
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
