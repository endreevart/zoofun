import { useState } from 'react';
import { assetUrl } from '../assetUrl';
import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';
import { gardenArt } from '../game/world/kinds';
import { gardenById, moveDestinations, type GardenWorld } from '../game/world/gardens';
import { CreatureMenuIcon } from './CreatureMenuIcon';
import { IslandCard, TransferPic } from './transferIslands';
import { defaultMoveDestId, transferSummary, transferTitle } from './transferView';

type Props = {
  spec: ChudikSpec;
  pic: string | null;
  currentId: string;
  worlds: GardenWorld[];
  onMove(id: string): void;
  onCancel(): void;
};

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
          <button className="pilot-tool transfer-close" type="button" onClick={onCancel} aria-label="Закрыть">
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
