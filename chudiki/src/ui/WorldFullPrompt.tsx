import { useState } from 'react';
import { assetUrl } from '../assetUrl';
import { gardenArt } from '../game/world/kinds';
import { gardenById, moveDestinations, type GardenWorld } from '../game/world/gardens';
import { CreatureMenuIcon } from './CreatureMenuIcon';
import { IslandCard, TransferPic } from './transferIslands';
import { defaultMoveDestId, fullMoveSummary } from './transferView';

type Props = {
  currentId: string;
  worlds: GardenWorld[];
  onBuy(): void;
  onPickDest(id: string): void;
  onClose(): void;
};

/** The open lawn is full. Same island picker as teleport, then a garden shop. */
export function WorldFullPrompt({ currentId, worlds, onBuy, onPickDest, onClose }: Props) {
  const here = gardenById(currentId, worlds);
  const dests = moveDestinations(currentId, worlds);
  const [picked, setPicked] = useState(() => defaultMoveDestId(dests));
  const dest = dests.find((item) => item.id === picked) ?? null;

  return (
    <>
      <div className="transfer-scrim is-hold" />
      <div className="transfer-sheet is-hold" role="dialog" aria-label="Места нет">
        <div className="transfer-head">
          <div className="transfer-titles">
            <h2>На острове кончилось место</h2>
            <p>
              {dests.length > 0
                ? 'Можно купить новый сад или перенести зуфунят.'
                : 'Можно купить новый сад и строить там.'}
            </p>
          </div>
          <button className="pilot-tool transfer-close" type="button" onClick={onClose} aria-label="Закрыть">
            <CreatureMenuIcon name="close" />
          </button>
        </div>

        {dests.length > 0 ? (
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
        ) : null}

        <div className="transfer-foot">
          {dests.length > 0 ? (
            <div className="transfer-summary">
              <div className="transfer-path" aria-hidden>
                <img src={assetUrl(gardenArt(here.id, here.sku))} alt="" />
                <TransferPic name="arrow" className="transfer-arrow" />
                {dest ? (
                  <img src={assetUrl(gardenArt(dest.id, dest.sku))} alt="" />
                ) : (
                  <span className="transfer-path-gap" />
                )}
              </div>
              <div className="transfer-copy">
                <p className="transfer-lead">{dest ? fullMoveSummary(dest.title) : 'Выберите остров'}</p>
                <p className="transfer-note">Потом можно тыкнуть кого взять</p>
              </div>
            </div>
          ) : null}
          <div className={`transfer-actions${dests.length > 0 ? '' : ' is-solo'}`}>
            <button className="transfer-btn is-shop" type="button" onClick={onBuy}>
              Купить сад
            </button>
            {dests.length > 0 ? (
              <button
                className="transfer-btn is-go"
                type="button"
                disabled={!picked}
                onClick={() => picked && onPickDest(picked)}
              >
                Перенести
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
