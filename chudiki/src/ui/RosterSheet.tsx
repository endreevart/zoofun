import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';
import { downloadPortrait, portraitFileName, portraitUrlOf } from '../game/drawing/portrait';
import { composePostcard, postcardFileName } from '../game/drawing/postcard';

/** The list of everyone living in the zoo. Tap one to fly to it. */
export type RosterSheetProps = {
  specs: ChudikSpec[];
  recordedIds: Set<string>;
  onClose(): void;
  onSelect(spec: ChudikSpec): void;
};

export function RosterSheet({ specs, recordedIds, onClose, onSelect }: RosterSheetProps) {
  const portraits = specs
    .map((spec) => {
      const url = portraitUrlOf(spec.drawing);
      return url ? { spec, url } : null;
    })
    .filter((item): item is { spec: ChudikSpec; url: string } => item !== null);

  return (
    <div className="sheet">
      <div className="sheet-header">
        <button className="icon-button" onClick={onClose} aria-label="Назад">
          ⬅️
        </button>
        <h1 className="sheet-title">Мои чудики · {specs.length}</h1>
        <div style={{ width: 62 }} />
      </div>

      <div className="sheet-body">
        {specs.length === 0 ? (
          <p className="section-label">Пока никого. Нарисуй первого чудика!</p>
        ) : (
          <div className="roster-scroll">
            <div className="roster">
              {specs.map((spec) => (
                <RosterItem
                  key={spec.id}
                  spec={spec}
                  recorded={recordedIds.has(spec.id)}
                  onSelect={onSelect}
                />
              ))}
            </div>
            {portraits.length > 0 ? (
              <section className="roster-gallery">
                <h2 className="section-label">Рисунки</h2>
                <div className="roster-gallery-grid">
                  {portraits.map(({ spec, url }) => (
                    <article key={spec.id} className="roster-portrait">
                      <button
                        type="button"
                        className="roster-portrait-pic"
                        onClick={() => onSelect(spec)}
                      >
                        <img src={url} alt="" />
                      </button>
                      <div className="roster-portrait-bar">
                        <span className="roster-portrait-name">{spec.name}</span>
                        <button
                          type="button"
                          className="roster-download"
                          aria-label={`Скачать рисунок ${spec.name}`}
                          onClick={() => void downloadPortrait(url, portraitFileName(spec.name))}
                        >
                          ⬇️
                        </button>
                        <button
                          type="button"
                          className="roster-download"
                          aria-label={`Скачать открытку из сада с ${spec.name}`}
                          onClick={() => {
                            // Real generated postcard when the backend painted
                            // one; local meadow composition for older chudiks.
                            const generated = spec.drawing?.postcardUrl;
                            void (generated
                              ? downloadPortrait(generated, postcardFileName(spec.name))
                              : composePostcard(url).then((card) =>
                                  downloadPortrait(card, postcardFileName(spec.name)),
                                ));
                          }}
                        >
                          🖼️
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function RosterItem({
  spec,
  recorded,
  onSelect,
}: {
  spec: ChudikSpec;
  recorded: boolean;
  onSelect(spec: ChudikSpec): void;
}) {
  const kind = kindById(spec.kindId);
  return (
    <button className="roster-item" onClick={() => onSelect(spec)}>
      <span className="emoji">{kind.emoji}</span>
      <span className="name">{spec.name}</span>
      <span className="kind">{kind.label}</span>
      {recorded && <span className="badge">🎤 свой звук</span>}
    </button>
  );
}
