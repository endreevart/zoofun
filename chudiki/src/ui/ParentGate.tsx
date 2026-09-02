import { useMemo, useState } from 'react';

/**
 * Small arithmetic gate in front of destructive actions. Not security — just
 * enough that a three-year-old cannot delete the zoo by tapping around.
 */

export type ParentGateProps = {
  question: string;
  onCancel(): void;
  onPass(): void;
};

export function ParentGate({ question, onCancel, onPass }: ParentGateProps) {
  const [wrong, setWrong] = useState(false);

  const { prompt, answer, options } = useMemo(() => {
    const a = 3 + Math.floor(Math.random() * 7);
    const b = 4 + Math.floor(Math.random() * 8);
    const correct = a * b;
    const choices = new Set<number>([correct]);
    while (choices.size < 4) {
      choices.add(correct + (Math.floor(Math.random() * 21) - 10));
    }
    return {
      prompt: `${a} × ${b} = ?`,
      answer: correct,
      options: [...choices].sort(() => Math.random() - 0.5),
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="card gate" onClick={(event) => event.stopPropagation()}>
        <h2>Только для взрослых</h2>
        <p>{question}</p>
        <p style={{ fontSize: 32, fontWeight: 900, opacity: 1 }}>{prompt}</p>
        <div className="gate-options">
          {options.map((option) => (
            <button
              key={option}
              className="chip"
              onClick={() => (option === answer ? onPass() : setWrong(true))}
            >
              {option}
            </button>
          ))}
        </div>
        {wrong && <p style={{ marginTop: 14, color: '#c0392b' }}>Не тот ответ</p>}
        <div style={{ marginTop: 18 }}>
          <button className="icon-button wide" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
