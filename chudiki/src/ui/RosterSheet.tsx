import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';

/** The list of everyone living in the zoo. Tap one to fly to it. */
export type RosterSheetProps = {
  specs: ChudikSpec[];
  recordedIds: Set<string>;
  onClose(): void;
  onSelect(spec: ChudikSpec): void;
};

export function RosterSheet({ specs, recordedIds, onClose, onSelect }: RosterSheetProps) {
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
