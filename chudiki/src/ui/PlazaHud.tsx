import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CueId } from '../game/audio/cues';
import { isNewPlacePick } from '../game/audio/cues';
import { claimCueOnce } from '../game/audio/mix';
import type { PlazaStudio } from '../game/plaza/plazaStudio';
import { catalogGroup, propLabel, type CatalogGroupId } from '../game/world/layoutAuthored';
import { displayStillUrl } from '../game/drawing/portrait';
import { isPlazaToyModel, isPlazaToyPreparing, type PlazaLawnToy } from '../game/plaza/plazaToy';
import { HudIcon } from './HudIcon';
import { pinPropActions } from './propActionsPin';

type TrayGroup = CatalogGroupId | 'mine';

type Props = {
  studio: PlazaStudio;
  building: boolean;
  toys?: PlazaLawnToy[];
  wantMine?: number;
  onSetBuild(on: boolean): void;
  onSpeak(id: CueId): void;
  onDrawToy?(): void;
  onPicking?(on: boolean): void;
};

const GROUPS: { id: TrayGroup; icon: string; label: string }[] = [
  { id: 'plants', icon: '🌿', label: 'Растения' },
  { id: 'houses', icon: '🏠', label: 'Домики' },
  { id: 'objects', icon: '🧺', label: 'Предметы' },
  { id: 'mine', icon: '✏️', label: 'Моё' },
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

export function PlazaHud({
  studio,
  building,
  toys = [],
  wantMine = 0,
  onSetBuild,
  onSpeak,
  onDrawToy,
  onPicking,
}: Props) {
  const phone = usePhoneHud();
  const trayOpen = building;
  const [state, setState] = useState(studio.getState());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<TrayGroup | null>(null);
  const [hud, setHud] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => studio.subscribe(() => setState(studio.getState())), [studio]);

  const pickGroup = useCallback((next: TrayGroup | null, opts?: { silent?: boolean }) => {
    onPicking?.(Boolean(next));
    setGroup(next);
    if (opts?.silent) return;
    if (next === 'plants') onSpeak('plants');
    if (next === 'houses') onSpeak('houses');
    if (next === 'objects' || next === 'mine') onSpeak('plaza_things');
  }, [onPicking, onSpeak]);

  useEffect(() => {
    if (!trayOpen) pickGroup(null);
  }, [trayOpen, pickGroup]);

  useEffect(() => {
    if (!wantMine || !trayOpen || phone) return;
    pickGroup('mine', { silent: true });
  }, [wantMine, trayOpen, phone, pickGroup]);

  useEffect(() => () => onPicking?.(false), [onPicking]);

  const catalogKey = state.catalog.join(',');
  useEffect(() => {
    if (!trayOpen || !group || group === 'mine') return;
    const names = catalogKey
      ? catalogKey.split(',').filter((model) => catalogGroup(model) === group)
      : [];
    if (!names.length) return;
    let cancelled = false;
    void studio.ensure(names).then(() => {
      if (cancelled) return;
      setThumbs((prev) => ({ ...prev, ...studio.thumbs(names) }));
    });
    return () => {
      cancelled = true;
    };
  }, [trayOpen, group, studio, catalogKey]);

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
    () =>
      group && group !== 'mine' ? state.catalog.filter((model) => catalogGroup(model) === group) : [],
    [group, state.catalog],
  );
  const mineToys = toys;

  const groupLabel = GROUPS.find((item) => item.id === group)?.label ?? '';
  const selected = studio.selected();
  const canEdit = Boolean(selected && (!isPlazaToyModel(selected.model) || selected.mine !== false));
  const picking = Boolean(group);
  const full = state.cap > 0 && state.count >= state.cap;
  const fill = state.cap > 0 ? Math.min(1, state.count / state.cap) : 0;
  const pin = selected && canEdit ? pinPropActions(hud, propActionsRect()) : null;

  const pickModel = (model: string) => {
    if (full && state.holdingModel !== model) {
      if (claimCueOnce('diy_full')) onSpeak('diy_full');
      return;
    }
    if (isNewPlacePick(state.holdingModel, model)) onSpeak('place');
    void (async () => {
      if (!studio) return;
      await studio.ensure([model]);
      studio.setActiveModel(model);
      setThumbs((prev) => ({ ...prev, ...studio.thumbs([model]) }));
    })();
    if (phone) pickGroup(null);
  };

    const pickToy = (toy: PlazaLawnToy) => {
    if (full && state.holdingModel !== toy.model) {
      if (claimCueOnce('diy_full')) onSpeak('diy_full');
      return;
    }
    if (isNewPlacePick(state.holdingModel, toy.model)) onSpeak('place');
    studio.holdToy(toy.model, toy.still_url, toy.height, toy.model_url);
    if (phone) pickGroup(null);
  };

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
        {group === 'mine' ? (
          <>
            <button
              type="button"
              className="diy-card diy-card-plus"
              aria-label="Нарисовать штуку"
              onClick={() => {
                onDrawToy?.();
                if (phone) pickGroup(null);
              }}
            >
              <span aria-hidden="true">+</span>
            </button>
            {mineToys.map((toy) => {
              const src = displayStillUrl(toy.still_url) ?? '';
              const preparing = isPlazaToyPreparing(toy);
              return (
                <button
                  key={toy.id}
                  type="button"
                  aria-busy={preparing || undefined}
                  aria-disabled={full && state.holdingModel !== toy.model}
                  className={`diy-card${state.holdingModel === toy.model ? ' is-on' : ''}${preparing ? ' is-preparing' : ''}`}
                  onClick={() => pickToy(toy)}
                >
                  {src ? <img src={src} alt="" /> : <span className="diy-card-fallback" />}
                </button>
              );
            })}
          </>
        ) : (
          items.map((model) => (
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
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`diy-hud plaza-hud${building ? '' : ' is-play'}${picking ? ' is-open' : ''}${phone && picking ? ' is-picking' : ''}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {catalog}

      {pin
        ? createPortal(
            <div
              className={`diy-prop-actions${pin.top < 160 ? ' is-below' : ''}`}
              style={pin}
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
                  if (claimCueOnce('move')) onSpeak('move');
                  studio.beginMoveHold();
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
              <button className="diy-icon" type="button" aria-label="Повернуть влево" onClick={() => studio.rotateSelected(0.2)}>
                ↺
              </button>
              <button className="diy-icon" type="button" aria-label="Повернуть вправо" onClick={() => studio.rotateSelected(-0.2)}>
                ↻
              </button>
              <button className="diy-icon" type="button" aria-label="Меньше" onClick={() => studio.scaleSelected(0.9)}>
                −
              </button>
              <button className="diy-icon" type="button" aria-label="Больше" onClick={() => studio.scaleSelected(1.1)}>
                +
              </button>
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
            </div>,
            propActionsHost(),
          )
        : null}

      <div className="diy-side">
        <div className="diy-rail">
          <button
            className={`diy-icon${trayOpen ? ' diy-close' : ''}`}
            type="button"
            onClick={() => {
              pickGroup(null);
              if (!trayOpen) onSpeak('plaza_build');
              onSetBuild(!trayOpen);
            }}
            aria-label={trayOpen ? 'Играть' : 'Строить'}
          >
            {trayOpen ? '✕' : <HudIcon name="build" />}
          </button>
          {trayOpen
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
          {trayOpen ? (
            <span className="diy-fill" aria-hidden="true">
              <span className="diy-fill-bar" style={{ width: `${Math.round(fill * 100)}%` }} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function propActionsHost(): Element {
  return document.querySelector('.plaza-lawn') ?? document.querySelector('.app') ?? document.body;
}

function propActionsRect() {
  const host = propActionsHost();
  if (host instanceof HTMLElement) return host.getBoundingClientRect();
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
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
