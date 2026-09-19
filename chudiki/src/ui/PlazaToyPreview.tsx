import {
  PLAZA_TOY_BAKE,
  PLAZA_TOY_NEXT,
  PLAZA_TOY_READY,
  PLAZA_TOY_REDRAW,
  PLAZA_TOY_WAIT,
} from '../game/plaza/plazaCopy';

type Props = {
  src: string | null;
  error?: string | null;
  busy?: boolean;
  onNext(): void;
  onRedraw(): void;
};

function ReloadMark() {
  return (
    <svg className="plaza-toy-reload" viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 5a11 11 0 1 0 10.4 14.6h-3.2A8 8 0 1 1 16 8v4.2L23 7 16 .8V5z"
      />
    </svg>
  );
}

/** Painted lawn object after «Далее». Pay (or a local slot) starts Tripo. */
export function PlazaToyPreview({ src, error, busy, onNext, onRedraw }: Props) {
  if (error) {
    return (
      <div className="hatch-preview plaza-toy-preview" role="dialog" aria-label={error}>
        <p className="hatch-preview-lead">{error}</p>
        <button className="big-button hatch-preview-go" type="button" onClick={onRedraw}>
          <ReloadMark />
          <span>{PLAZA_TOY_REDRAW}</span>
        </button>
      </div>
    );
  }
  if (busy) {
    return (
      <div className="hatch-preview plaza-toy-preview" role="dialog" aria-label={PLAZA_TOY_BAKE}>
        {src ? <img className="hatch-preview-art" src={src} alt="" /> : <div className="spinner" />}
        <div className="spinner" />
        <p className="hatch-preview-lead">{PLAZA_TOY_BAKE}</p>
      </div>
    );
  }
  return (
    <div
      className="hatch-preview plaza-toy-preview"
      role="dialog"
      aria-label={src ? PLAZA_TOY_READY : PLAZA_TOY_WAIT}
    >
      {src ? (
        <>
          <p className="hatch-preview-lead">{PLAZA_TOY_READY}</p>
          <img className="hatch-preview-art" src={src} alt="" />
          <div className="plaza-toy-actions">
            <button className="big-button hatch-preview-go" type="button" onClick={onRedraw}>
              <ReloadMark />
              <span>{PLAZA_TOY_REDRAW}</span>
            </button>
            <button className="big-button go hatch-preview-go" type="button" onClick={onNext}>
              <span>{PLAZA_TOY_NEXT}</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="spinner" />
          <p className="hatch-preview-lead">{PLAZA_TOY_WAIT}</p>
        </>
      )}
    </div>
  );
}
