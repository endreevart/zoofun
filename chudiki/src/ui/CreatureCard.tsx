import { useEffect, useRef, useState } from 'react';
import { kindById, type ChudikSpec } from '../game/creatures/ChudikSpec';
import { isParkResidentId } from '../game/creatures/residents';
import { VoiceRecorder } from '../game/audio/VoiceRecorder';
import { CreatureMenuIcon, type CreatureMenuIconName } from './CreatureMenuIcon';
import { ParentGate } from './ParentGate';

/**
 * Extra settings for one creature: voice, find, walk, move, or send home.
 * Opened from the gear on the tap tray (the long press still works too).
 */

const MAX_RECORDING_SECONDS = 5;

export type CreatureCardProps = {
  spec: ChudikSpec;
  pic: string | null;
  hasRecording: boolean;
  onClose(): void;
  onPlayVoice(): void;
  onFind(): void;
  onPilot(): void;
  onSaveRecording(recording: { bytes: ArrayBuffer; mimeType: string }): void;
  onClearRecording(): void;
  onDelete(): void;
  onMove?: () => void;
  onGardenQuiet?(quiet: boolean): void;
  onSpeak?(id: 'record'): void;
};

export function CreatureCard({
  spec,
  pic,
  hasRecording,
  onClose,
  onPlayVoice,
  onFind,
  onPilot,
  onSaveRecording,
  onClearRecording,
  onDelete,
  onMove,
  onGardenQuiet,
  onSpeak,
}: CreatureCardProps) {
  const kind = kindById(spec.kindId);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const gardenQuietRef = useRef(onGardenQuiet);
  gardenQuietRef.current = onGardenQuiet;
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(MAX_RECORDING_SECONDS);
  const [problem, setProblem] = useState<string | null>(null);
  const [showGate, setShowGate] = useState(false);
  const park = isParkResidentId(spec.id);

  // Never leave the microphone open behind us.
  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      gardenQuietRef.current?.(false);
    },
    [],
  );

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
    onSpeak?.('record');
    onGardenQuiet?.(true);
    const recorder = new VoiceRecorder();
    recorderRef.current = recorder;
    const state = await recorder.start();

    if (state !== 'recording') {
      onGardenQuiet?.(false);
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
    onGardenQuiet?.(false);
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
    <>
      <button className="creature-sheet-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
      <div
        className="creature-sheet"
        role="dialog"
        aria-label={`Настройки ${spec.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="creature-sheet-head">
          {pic ? (
            <img className="creature-sheet-face" src={pic} alt="" />
          ) : (
            <span className="creature-sheet-face is-emoji">{kind.emoji}</span>
          )}
          <div className="creature-sheet-titles">
            <h2>{spec.name}</h2>
            <p>Настройки зуфуньчика</p>
          </div>
          <button className="pilot-tool" type="button" onClick={onClose} aria-label="Закрыть">
            <CreatureMenuIcon name="close" />
          </button>
        </div>

        <p className="creature-sheet-label">Голос</p>
        <div className="creature-sheet-group">
          <SheetRow
            icon="listen"
            label={hasRecording ? 'Послушать твой звук' : 'Послушать голос'}
            onClick={onPlayVoice}
          />
          {recording ? (
            <SheetRow
              icon="record"
              label={`Стоп · ${countdown.toFixed(1)} с`}
              onClick={() => void stopRecording()}
              recording
            />
          ) : (
            <SheetRow
              icon="record"
              label={hasRecording ? 'Записать заново' : 'Записать свой звук'}
              onClick={() => void startRecording()}
            />
          )}
          {hasRecording && !recording ? (
            <SheetRow icon="listen" label="Вернуть его родной голос" onClick={onClearRecording} />
          ) : null}
        </div>

        <p className="creature-sheet-label">Управление</p>
        <div className="creature-sheet-group">
          <SheetRow icon="find" label="Найти в зоопарке" onClick={onFind} />
          <SheetRow icon="lead" label="Вести от третьего лица" onClick={onPilot} />
          {park || !onMove ? null : (
            <SheetRow icon="move" label="Переместить в другой мир" onClick={onMove} />
          )}
        </div>

        {park ? null : (
          <button className="creature-sheet-home" type="button" onClick={() => setShowGate(true)}>
            <CreatureMenuIcon name="release" />
            <span>Отпустить домой</span>
          </button>
        )}

        {problem ? <p className="creature-sheet-problem">{problem}</p> : null}

        {recording ? (
          <p className="creature-sheet-hint">
            Говори в микрофон — этот звук зуфуньчик будет издавать при нажатии.
          </p>
        ) : null}
      </div>

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
    </>
  );
}

function SheetRow({
  icon,
  label,
  onClick,
  recording,
}: {
  icon: CreatureMenuIconName;
  label: string;
  onClick(): void;
  recording?: boolean;
}) {
  return (
    <button
      className={`creature-sheet-row${recording ? ' is-recording' : ''}`}
      type="button"
      onClick={onClick}
    >
      <CreatureMenuIcon name={icon} className="creature-sheet-row-ico" />
      <span>{label}</span>
      <CreatureMenuIcon name="chevron" className="creature-sheet-chevron" />
    </button>
  );
}
