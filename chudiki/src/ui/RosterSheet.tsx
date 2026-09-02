import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';

/** The list of everyone living in the zoo. Tap one to fly to it. */
export type RosterSheetProps = {
  specs: ChudikSpec[];
  recordedIds: Set<string>;
  onClose(): void;
  onSelect(spec: ChudikSpec): void;
};

export function RosterSheet({ specs, recordedIds, onClose, onSelect }: RosterSheetProps) {
  const mine = specs.filter((spec) => spec.origin === 'drawing');
  const residents = specs.filter((spec) => spec.origin !== 'drawing');

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
        {mine.length > 0 && (
          <>
            <p className="section-label">Мои рисунки ({mine.length})</p>
            <div className="roster">
              {mine.map((spec) => (
                <RosterItem
                  key={spec.id}
                  spec={spec}
                  recorded={recordedIds.has(spec.id)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </>
        )}

        <p className="section-label">Уже жили здесь ({residents.length})</p>
        <div className="roster">
          {residents.map((spec) => (
            <RosterItem
              key={spec.id}
              spec={spec}
              recorded={recordedIds.has(spec.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
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
