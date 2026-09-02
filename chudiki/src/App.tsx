import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import {
  generateSpec,
  makeId,
  randomName,
  randomSeed,
  type ChudikSpec,
} from './game/creatures/ChudikSpec';
import type { DrawingData } from './game/creatures/ChudikSpec';
import { imageToChudik } from './game/drawing/imageToChudik';
import { stylizeDrawing } from './game/drawing/stylizeDrawing';
import {
  deleteVoiceRecording,
  saveVoiceRecording,
} from './game/persistence/zooStore';
import { DrawPad } from './ui/DrawPad';
import { NameSheet } from './ui/NameSheet';
import { CreatureCard } from './ui/CreatureCard';
import { RosterSheet } from './ui/RosterSheet';
import { TuningPanel } from './ui/TuningPanel';
import { LayoutEditor } from './ui/LayoutEditor';
import { isStudio } from './studioMode';
import { WalkPad } from './ui/WalkPad';
import { CareHud } from './ui/CareHud';
import { PilotChoice } from './ui/PilotChoice';

type Screen = 'zoo' | 'draw' | 'name' | 'roster';

type Pending = { drawing: DrawingData; previewUrl: string; seed: number };

const FAILURE_MESSAGES: Record<string, string> = {
  empty: 'Тут почти ничего не нарисовано. Нарисуй чудика побольше!',
  'too-small': 'Слишком маленький рисунок. Нарисуй на весь лист!',
  'too-thin': 'Замкни линию, чтобы получилось тело чудика.',
};

export function App() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('zoo');
  const [specs, setSpecs] = useState<ChudikSpec[]>([]);
  const [recordedIds, setRecordedIds] = useState<Set<string>>(new Set());
  const [cardSpec, setCardSpec] = useState<ChudikSpec | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [joy, setJoy] = useState(0.42);
  const [feeding, setFeeding] = useState(false);
  const [offerSpec, setOfferSpec] = useState<ChudikSpec | null>(null);
  const [driving, setDriving] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const game = new Game(stage, {
      onRosterChanged: (next) => setSpecs(next),
      onCreatureTapped: (spec) => setOfferSpec(spec),
      onCreatureHeld: (spec) => setCardSpec(spec),
      onCareChanged: (state) => {
        setJoy(state.joy);
        setFeeding(state.feeding);
      },
    });
    gameRef.current = game;

    void game.start().then(() => {
      setReady(true);
      setRecordedIds(new Set(game.getRecordedIds()));
    });

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setShowHint(false), 7000);
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!offerSpec) return;
    const timer = window.setTimeout(() => setOfferSpec(null), 8000);
    return () => window.clearTimeout(timer);
  }, [offerSpec]);

  const startPilot = useCallback((id: string) => {
    if (!gameRef.current?.controlCreature(id)) return;
    setDriving(true);
    setOfferSpec(null);
    setCardSpec(null);
    setShowHint(false);
  }, []);

  const stopPilot = useCallback(() => {
    gameRef.current?.releaseControl();
    setDriving(false);
  }, []);

  useEffect(() => {
    if (!ready || screen !== 'zoo') {
      if (ready) gameRef.current?.setWalkKeys(0, 0);
      return;
    }

    const held = new Set<string>();
    const apply = () => {
      const forward = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) +
        (held.has('KeyS') || held.has('ArrowDown') ? -1 : 0);
      const right = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) +
        (held.has('KeyA') || held.has('ArrowLeft') ? -1 : 0);
      gameRef.current?.setWalkKeys(forward, right);
    };

    const onDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        return;
      }
      event.preventDefault();
      held.add(event.code);
      apply();
    };
    const onUp = (event: KeyboardEvent) => {
      if (!held.has(event.code)) return;
      held.delete(event.code);
      apply();
    };
    const halt = () => {
      held.clear();
      gameRef.current?.setWalkKeys(0, 0);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', halt);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', halt);
      halt();
    };
  }, [ready, screen]);

  const walkPad = useCallback((forward: number, right: number) => {
    gameRef.current?.setWalkPad(forward, right);
  }, []);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  /** Shared by the drawing pad and the photo picker. */
  const processArtwork = useCallback(
    async (source: HTMLCanvasElement | HTMLImageElement) => {
      setBusy('Смотрим на рисунок...');
      try {
        // One frame for the spinner to paint before the heavy pixel work.
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const local = await imageToChudik(source);

        if (!local.ok) {
          setBusy(null);
          setScreen('draw');
          flash(FAILURE_MESSAGES[local.reason] ?? 'Не получилось разобрать рисунок.');
          return;
        }

        setBusy('Нейронка рисует чудика...');
        const styled = await stylizeDrawing(source);
        const fromStyle = styled ? await imageToChudik(styled) : null;
        const result = fromStyle?.ok ? fromStyle : local;

        setPending({
          drawing: result.drawing,
          previewUrl: result.previewUrl,
          seed: randomSeed(),
        });
        setScreen('name');
      } catch (error) {
        console.error('[drawing] processing failed', error);
        flash('Что-то пошло не так с рисунком.');
        setScreen('zoo');
      } finally {
        setBusy(null);
      }
    },
    [flash],
  );

  const handlePhoto = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('image decode failed'));
          image.src = url;
        });
        await processArtwork(image);
      } catch {
        flash('Не удалось открыть фото.');
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [flash, processArtwork],
  );

  const confirmCreature = useCallback(
    async ({ name, kindId }: { name: string; kindId: string }) => {
      const game = gameRef.current;
      if (!game || !pending) return;

      const spec = generateSpec({
        id: makeId(),
        name,
        seed: pending.seed,
        kindId,
        origin: 'drawing',
        drawing: pending.drawing,
      });

      setPending(null);
      setScreen('zoo');
      setBusy('Выпускаем в зоопарк...');
      try {
        await game.addCreature(spec);
      } finally {
        setBusy(null);
      }
    },
    [pending],
  );

  const saveRecording = useCallback(
    async (spec: ChudikSpec, recording: { bytes: ArrayBuffer; mimeType: string }) => {
      const game = gameRef.current;
      if (!game) return;

      await saveVoiceRecording(spec.id, recording.bytes, recording.mimeType);
      game.setRecording(spec.id, recording);
      setRecordedIds(new Set(game.getRecordedIds()));
      game.playVoice(spec.id);
      flash(`Теперь ${spec.name} говорит твоим звуком!`);
    },
    [flash],
  );

  const clearRecording = useCallback(
    async (spec: ChudikSpec) => {
      const game = gameRef.current;
      if (!game) return;

      await deleteVoiceRecording(spec.id);
      game.setRecording(spec.id, null);
      setRecordedIds(new Set(game.getRecordedIds()));
      game.playVoice(spec.id);
    },
    [],
  );

  const removeCreature = useCallback(
    async (spec: ChudikSpec) => {
      const game = gameRef.current;
      if (!game) return;
      setCardSpec(null);
      await game.removeCreature(spec.id);
      setRecordedIds(new Set(game.getRecordedIds()));
      flash(`${spec.name} ушёл домой.`);
    },
    [flash],
  );

  return (
    <div className="app">
      <div className="stage" ref={stageRef} />

      {screen === 'zoo' && ready && (
        <>
          {showHint && !driving && (
            <div className="hint">Тапни чудика — он тебе ответит 👆</div>
          )}

          <WalkPad onWalk={walkPad} />

          {offerSpec && !driving && (
            <PilotChoice
              spec={offerSpec}
              onPilot={() => startPilot(offerSpec.id)}
              onDismiss={() => setOfferSpec(null)}
            />
          )}

          {driving && (
            <button className="pilot-stop" type="button" onClick={stopPilot}>
              <span className="icon">✋</span>
              <span>Отпустить</span>
            </button>
          )}

          <div className="toolbar">
            <button
              className="big-button ghost"
              onClick={() => {
                stopPilot();
                gameRef.current?.showWholeZoo();
              }}
            >
              <span className="icon">🔭</span>
              <span>Весь зоопарк</span>
            </button>

            <button className="big-button primary" onClick={() => setScreen('draw')}>
              <span className="icon">🎨</span>
              <span>Нарисовать</span>
            </button>

            <CareHud
              joy={joy}
              feeding={feeding}
              onFeed={() => {
                stopPilot();
                const ok = gameRef.current?.feedZoo();
                if (ok === false) flash('Поставьте корзинку в парке — туда придут кушать.');
              }}
            />

            <button className="big-button" onClick={() => fileInputRef.current?.click()}>
              <span className="icon">📷</span>
              <span>Фото рисунка</span>
            </button>

            <button className="big-button ghost" onClick={() => setScreen('roster')}>
              <span className="icon">🐾</span>
              <span>Мои чудики</span>
            </button>
          </div>
        </>
      )}

      {screen === 'draw' && (
        <DrawPad
          onCancel={() => setScreen('zoo')}
          onDone={(canvas) => void processArtwork(canvas)}
        />
      )}

      {screen === 'name' && pending && (
        <NameSheet
          previewUrl={pending.previewUrl}
          suggestedName={randomName(pending.seed)}
          onCancel={() => {
            setPending(null);
            setScreen('draw');
          }}
          onConfirm={(result) => void confirmCreature(result)}
        />
      )}

      {screen === 'roster' && (
        <RosterSheet
          specs={specs}
          recordedIds={recordedIds}
          onClose={() => setScreen('zoo')}
          onSelect={(spec) => {
            setScreen('zoo');
            gameRef.current?.focusOn(spec.id);
            setCardSpec(spec);
          }}
        />
      )}

      {cardSpec && (
        <CreatureCard
          spec={cardSpec}
          hasRecording={recordedIds.has(cardSpec.id)}
          onClose={() => setCardSpec(null)}
          onPlayVoice={() => gameRef.current?.poke(cardSpec.id)}
          onFind={() => {
            setCardSpec(null);
            gameRef.current?.focusOn(cardSpec.id);
          }}
          onPilot={() => startPilot(cardSpec.id)}
          onSaveRecording={(recording) => void saveRecording(cardSpec, recording)}
          onClearRecording={() => void clearRecording(cardSpec)}
          onDelete={() => void removeCreature(cardSpec)}
        />
      )}

      {busy && (
        <div className="busy">
          <div className="spinner" />
          <span>{busy}</span>
        </div>
      )}

      {!ready && (
        <div className="busy">
          <div className="spinner" />
          <span>Открываем зоопарк...</span>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {isStudio() && ready && gameRef.current && <LayoutEditor game={gameRef.current} />}

      {isStudio() && ready && <TuningPanel />}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handlePhoto(file);
        }}
      />
    </div>
  );
}
