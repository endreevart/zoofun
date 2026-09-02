import { useEffect, useState } from 'react';
import {
  TUNING_GROUPS,
  tuning,
  type TuningValues,
} from '../game/render/tuning';

/**
 * Development-only slider panel for the look parameters. Changes apply live and
 * survive a reload; "Скопировать" yields a code block to paste over
 * TUNING_DEFAULTS once the values are settled.
 */
export function TuningPanel() {
  const [values, setValues] = useState<TuningValues>(tuning.get());
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => tuning.subscribe(setValues), []);

  if (!open) {
    return (
      <button className="tuning-toggle" onClick={() => setOpen(true)} title="Настройка картинки">
        🎛
      </button>
    );
  }

  const copy = async () => {
    const snippet = tuning.snippet();
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      // Clipboard needs a secure context; the console is a reliable fallback.
      console.info(snippet);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="tuning-panel">
      <header>
        <strong>Картинка</strong>
        <div className="tuning-actions">
          <button onClick={() => void copy()}>{copied ? 'Скопировано' : 'Скопировать'}</button>
          <button onClick={() => tuning.reset()}>Сброс</button>
          <button onClick={() => setOpen(false)}>✕</button>
        </div>
      </header>

      <div className="tuning-body">
        {TUNING_GROUPS.map((group) => (
          <section key={group.title}>
            <h4>{group.title}</h4>
            {group.controls.map((control) => (
              <label key={control.key}>
                <span className="tuning-name">{control.label}</span>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={values[control.key]}
                  onChange={(event) => tuning.set(control.key, Number(event.target.value))}
                />
                <span className="tuning-value">{format(values[control.key], control.step)}</span>
              </label>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function format(value: number, step: number): string {
  const places = step >= 1 ? 0 : step >= 0.01 ? 2 : step >= 0.001 ? 3 : 4;
  return value.toFixed(places);
}
