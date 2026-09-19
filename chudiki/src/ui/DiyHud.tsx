import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Game } from '../game/Game';
import type { LayoutState } from '../game/interaction/LayoutStudio';
import { catalogGroup, propLabel, type CatalogGroupId } from '../game/world/layoutAuthored';
import { HudIcon } from './HudIcon';
import type { CueId } from '../game/audio/cues';
import { isNewPlacePick } from '../game/audio/cues';
import { claimCueOnce } from '../game/audio/mix';

type Props = {
  game: Game;
  building: boolean;
  arcade?: boolean;
  onSetBuild(on: boolean): void;
  onPicking?(on: boolean): void;
  onSave(): Promise<boolean>;
  onSpeak(id: CueId): void;
};

const GROUPS: { id: CatalogGroupId; icon: string; label: string }[] = [
  { id: 'plants', icon: '🌿', label: 'Растения' },
  { id: 'houses', icon: '🏠', label: 'Домики' },
  { id: 'objects', icon: '🧺', label: 'Предметы' },
];

const PHONE_HUD = '(max-width: 719px)';

function usePhoneHud() {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_HUD).matches);
  useEffect(() => {
    const media = window.matchMedia(PHONE_HUD);
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return phone;
}

export function DiyHud({ game, building, arcade = false, onSetBuild, onPicking, onSave, onSpeak }: Props) {
  const studio = game.layoutStudio;
  const phone = usePhoneHud();
  const trayOpen = building;
  const [state, setState] = useState<LayoutState>(studio.getState());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<CatalogGroupId | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [hud, setHud] = useState<{ x: number; y: number } | null>(null);
  const saveTimer = useRef(0);
  const saving = useRef(false);

  useEffect(() => studio.subscribe(() => setState(studio.getState())), [studio]);

  const pickGroup = useCallback((next: CatalogGroupId | null) => {
    onPicking?.(Boolean(next));
    setGroup(next);
    if (next === 'plants') onSpeak('plants');
    if (next === 'houses') onSpeak('houses');
  }, [onPicking, onSpeak]);

  useEffect(() => {
    if (!trayOpen) pickGroup(null);
  }, [trayOpen, pickGroup]);

  useEffect(() => () => onPicking?.(false), [onPicking]);

  const catalogKey = state.catalog.join(',');
  useEffect(() => {
    if (!trayOpen || !group) return;
    const names = catalogKey
      ? catalogKey.split(',').filter((model) => catalogGroup(model) === group)
      : [];
    if (!names.length) return;
    let cancelled = false;
    void (async () => {
      for (const name of names) {
        await game.library.ensure(name);
        if (cancelled) return;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        setThumbs((prev) => ({ ...prev, ...game.captureCatalogThumbs([name]) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trayOpen, group, game, catalogKey]);

  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const selectedId = state.selectedId;
  useEffect(() => {
    if (!selectedId) {
      setHud(null);
      return;
    }
    let frame = 0;
    const tick = () => {
      setHud(studio.selectedScreen());
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, studio]);

  const items = useMemo(
    () => (group ? state.catalog.filter((model) => catalogGroup(model) === group) : []),
    [group, state.catalog],
  );

  const groupLabel = GROUPS.find((item) => item.id === group)?.label ?? '';
  const selected = studio.selected();
  const picking = Boolean(group);
  const full = state.cap > 0 && state.count >= state.cap;
  const fill = state.cap > 0 ? Math.min(1, state.count / state.cap) : 0;

  const saveGarden = async () => {
    if (saving.current) return;
    saving.current = true;
    setSaveState('busy');
    const ok = await onSave();
    setSaveState(ok ? 'done' : 'idle');
    saving.current = false;
    if (ok) {
      onSpeak('save');
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => setSaveState('idle'), 1800);
    }
  };

  const pickModel = (model: string) => {
    if (full && state.holdingModel !== model) {
      if (claimCueOnce('diy_full')) onSpeak('diy_full');
      return;
    }
    if (isNewPlacePick(state.holdingModel, model)) onSpeak('place');
    void (async () => {
      if (!game.library.has(model)) await game.library.ensure(model);
      studio.setActiveModel(model);
      setThumbs((prev) => ({ ...prev, ...game.captureCatalogThumbs([model]) }));
    })();
    if (phone) pickGroup(null);
  };

  if (arcade) return null;

  const catalog = group ? (
    <div className={`diy-catalog${phone ? ' is-sheet' : ''}`} role="listbox" aria-label={groupLabel}>
      {phone ? (
        <div className="diy-picker-head">
          <button type="button" className="diy-icon diy-close" onClick={() => pickGroup(null)} aria-label="Закрыть">
            ✕
          </button>
          <span>{groupLabel}</span>
        </div>
      ) : null}
      <div className="diy-catalog-grid">
        {items.map((model) => (
          <button
            key={model}
            type="button"
            aria-disabled={full && state.holdingModel !== model}
            className={`diy-card${state.holdingModel === model ? ' is-on' : ''}`}
            onClick={() => pickModel(model)}
          >
            {thumbs[model] ? (
              <img src={thumbs[model]} alt={propLabel(model)} />
            ) : (
              <span className="diy-card-fallback" />
            )}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`diy-hud${building ? '' : ' is-play'}${picking ? ' is-open' : ''}${phone && picking ? ' is-picking' : ''}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {catalog}

      {selected && hud
        ? createPortal(
            <div
              className={`diy-prop-actions${hud.y < 160 ? ' is-below' : ''}`}
              style={{
                left: Math.min(window.innerWidth - 120, Math.max(120, hud.x)),
                top: hud.y,
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                className={`diy-icon diy-move${state.moveArmed ? ' is-on' : ''}`}
                type="button"
                aria-label="Зажми и перетащи"
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse' && event.button !== 0) return;
                  event.stopPropagation();
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    /* already released */
                  }
                  studio.beginMoveHold();
                  if (claimCueOnce('move')) onSpeak('move');
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  studio.dragMoveHold(event.clientX, event.clientY);
                }}
                onPointerUp={() => studio.endMoveHold()}
                onPointerCancel={() => studio.endMoveHold()}
              >
                <MoveArrows />
              </button>
              <button
                className="diy-icon"
                type="button"
                aria-label="Повернуть влево"
                onClick={() => studio.rotateSelected(0.2)}
              >
                ↺
              </button>
              <button
                className="diy-icon"
                type="button"
                aria-label="Повернуть вправо"
                onClick={() => studio.rotateSelected(-0.2)}
              >
                ↻
              </button>
              <button
                className="diy-icon"
                type="button"
                aria-label="Меньше"
                onClick={() => studio.scaleSelected(0.9)}
              >
                −
              </button>
              <button
                className="diy-icon"
                type="button"
                aria-label="Больше"
                onClick={() => studio.scaleSelected(1.1)}
              >
                +
              </button>
              {arcade ? null : (
                <button
                  className="diy-icon diy-trash"
                  type="button"
                  aria-label="Убрать"
                  onClick={() => {
                    onSpeak('trash');
                    studio.deleteSelected();
                  }}
                >
                  🗑️
                </button>
              )}
            </div>,
            document.querySelector('.app') ?? document.body,
          )
        : null}

      <div className="diy-side">
        <div className="diy-rail">
          {arcade ? null : (
          <button
            className={`diy-icon${trayOpen ? ' diy-close' : ''}`}
            type="button"
            onClick={() => {
              pickGroup(null);
              if (!trayOpen) onSpeak('build');
              onSetBuild(!trayOpen);
            }}
            aria-label={trayOpen ? 'Играть' : 'Строить'}
          >
            {trayOpen ? '✕' : <HudIcon name="build" />}
          </button>
          )}
          {trayOpen && !arcade
            ? GROUPS.map((item) => (
                <button
                  key={item.id}
                  className={`diy-group${group === item.id ? ' is-on' : ''}`}
                  type="button"
                  aria-label={item.label}
                  aria-pressed={group === item.id}
                  onClick={() => pickGroup(group === item.id ? null : item.id)}
                >
                  {item.icon}
                </button>
              ))
            : null}
          {trayOpen && !arcade ? (
            <span className="diy-fill" aria-hidden="true">
              <span className="diy-fill-bar" style={{ width: `${Math.round(fill * 100)}%` }} />
            </span>
          ) : null}
        </div>
        {trayOpen && !arcade ? (
          <button
            className={`diy-save${saveState === 'done' ? ' is-saved' : ''}`}
            type="button"
            disabled={saveState === 'busy'}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0) return;
              void saveGarden();
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (event.detail === 0) void saveGarden();
            }}
          >
            <span aria-hidden="true">{saveState === 'done' ? '✅' : '💾'}</span>
            <span>{saveState === 'done' ? 'Готово' : 'Сохранить'}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MoveArrows() {
  return (
    <svg className="diy-move-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 2l5 7h-3v5h5v-3l7 5-7 5v-3h-5v5h3l-5 7-5-7h3v-5H9v3L2 16l7-5v3h5V9h-3z"
      />
    </svg>
  );
}
