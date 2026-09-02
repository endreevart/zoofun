import { useEffect, useRef, useState } from 'react';
import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';
import { VoiceRecorder } from '../game/audio/VoiceRecorder';
import { ParentGate } from './ParentGate';

/**
 * A creature's own page: hear its voice, record a new one, find it in the zoo.
 * Deleting is behind a parent gate.
 */

const MAX_RECORDING_SECONDS = 5;

export type CreatureCardProps = {
  spec: ChudikSpec;
  hasRecording: boolean;
  onClose(): void;
  onPlayVoice(): void;
  onFind(): void;
  onPilot(): void;
  onSaveRecording(recording: { bytes: ArrayBuffer; mimeType: string }): void;
  onClearRecording(): void;
  onDelete(): void;
};

export function CreatureCard({
  spec,
  hasRecording,
  onClose,
  onPlayVoice,
  onFind,
  onPilot,
  onSaveRecording,
  onClearRecording,
  onDelete,
}: CreatureCardProps) {
  const kind = kindById(spec.kindId);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(MAX_RECORDING_SECONDS);
  const [problem, setProblem] = useState<string | null>(null);
  const [showGate, setShowGate] = useState(false);

  // Never leave the microphone open behind us.
  useEffect(() => () => recorderRef.current?.cancel(), []);

  useEffect(() => {
    if (!recording) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const left = MAX_RECORDING_SECONDS - (performance.now() - started) / 1000;
      setCountdown(Math.max(0, left));
      if (left <= 0) void stopRecording();
    }, 100);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = async () => {
    setProblem(null);
    const recorder = new VoiceRecorder();
    recorderRef.current = recorder;
    const state = await recorder.start();

    if (state !== 'recording') {
      setProblem(
        state === 'denied'
          ? 'Микрофон не разрешён. Разреши доступ в настройках браузера.'
          : 'Этот браузер не умеет записывать звук.',
      );
      recorderRef.current = null;
      return;
    }

    setCountdown(MAX_RECORDING_SECONDS);
    setRecording(true);
  };

  const stopRecording = async () => {
    const recorder = recorderRef.current;
    setRecording(false);
    if (!recorder) return;

    const result = await recorder.stop();
    recorderRef.current = null;

    if (!result) {
      setProblem('Ничего не записалось. Попробуй ещё раз.');
      return;
    }
    onSaveRecording(result);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card" onClick={(event) => event.stopPropagation()}>
        <div className="card-head">
          <span className="emoji">{kind.emoji}</span>
          <div style={{ flex: 1 }}>
            <h2>{spec.name}</h2>
            <p>
              {kind.label}
              {spec.origin === 'drawing' ? ' · из твоего рисунка' : ' · живёт тут давно'}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">
            ✖️
          </button>
        </div>

        <div className="card-actions">
          <button className="action" onClick={onPlayVoice}>
            <span className="icon">🔊</span>
            <span>{hasRecording ? 'Послушать твой звук' : 'Послушать голос'}</span>
          </button>

          {recording ? (
            <button className="action recording" onClick={() => void stopRecording()}>
              <span className="icon">⏹️</span>
              <span>Стоп · {countdown.toFixed(1)} с</span>
            </button>
          ) : (
            <button className="action" onClick={() => void startRecording()}>
              <span className="icon">🎤</span>
              <span>{hasRecording ? 'Записать заново' : 'Записать свой звук'}</span>
            </button>
          )}

          {hasRecording && !recording && (
            <button className="action" onClick={onClearRecording}>
              <span className="icon">↩️</span>
              <span>Вернуть его родной голос</span>
            </button>
          )}

          <button className="action" onClick={onFind}>
            <span className="icon">🔍</span>
            <span>Найти в зоопарке</span>
          </button>

          <button className="action" onClick={onPilot}>
            <span className="icon">🕹️</span>
            <span>Вести от третьего лица</span>
          </button>

          <button className="action danger" onClick={() => setShowGate(true)}>
            <span className="icon">👋</span>
            <span>Отпустить домой</span>
          </button>
        </div>

        {problem && (
          <p style={{ marginTop: 14, fontWeight: 800, color: '#c0392b' }}>{problem}</p>
        )}

        {recording && (
          <p style={{ marginTop: 14, fontWeight: 800 }}>
            Говори в микрофон — этот звук чудик будет издавать при нажатии.
          </p>
        )}

        {showGate && (
          <ParentGate
            question={`Отпустить ${spec.name} из зоопарка? Это навсегда.`}
            onCancel={() => setShowGate(false)}
            onPass={() => {
              setShowGate(false);
              onDelete();
            }}
          />
        )}
      </div>
    </div>
  );
}
