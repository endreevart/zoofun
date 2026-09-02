import { useEffect, useState } from 'react';
import { renderCatalogThumbs } from '../game/assets/catalogThumbs';
import type { Game } from '../game/Game';
import type { LayoutState } from '../game/interaction/LayoutStudio';
import { CATALOG_MODELS, parseLayoutDocument, propLabel } from '../game/world/layoutAuthored';

type Props = {
  game: Game;
};

/**
 * Adult layout tool. Stamps autosave in the browser. «Сохранить» downloads a
 * JSON we can later freeze into public/layout/island-layout.json.
 */
export function LayoutEditor({ game }: Props) {
  const studio = game.layoutStudio;
  const [state, setState] = useState<LayoutState>(studio.getState());
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState(false);

  useEffect(() => studio.subscribe(() => setState(studio.getState())), [studio]);

  useEffect(() => {
    if (!state.enabled || Object.keys(thumbs).length) return;
    const names = catalogModelsSafe(game);
    if (!names.length) return;
    setThumbs(renderCatalogThumbs(game.library, names));
  }, [game, state.enabled, thumbs]);

  if (!state.enabled) {
    return (
      <button
        className="layout-toggle"
        disabled={opening}
        onClick={() => {
          void (async () => {
            setOpening(true);
            try {
              await game.library.ensureAll(CATALOG_MODELS);
              studio.setEnabled(true);
            } finally {
              setOpening(false);
            }
          })();
        }}
        title="Расставить объекты"
      >
        {opening ? '…' : '🌲'}
      </button>
    );
  }

  const selected = studio.selected();
  const selectedPath = studio.selectedPath();

  return (
    <div
      className="layout-panel"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header>
        <strong>Расстановка</strong>
        <div className="layout-actions">
          <button onClick={() => studio.setEnabled(false)}>✕</button>
        </div>
      </header>

      <p className="layout-help">
        {state.tool === 'path'
          ? 'Веди по земле — появится тропинка. Клик по готовой выделяет. Delete стирает. − = ширина. Esc отменяет штрих. Пробел — камера. Расстановка пишется сама.'
          : 'Клик по земле ставит, перетаскивание двигает. Delete убирает. [ ] поворот, − = размер. Пробел — камера. Расстановка пишется сама — перезагрузка её не сотрёт.'}
      </p>

      <div className="layout-tools">
        <button
          className={state.tool === 'place' ? 'is-on' : ''}
          onClick={() => studio.setTool('place')}
        >
          Ставить
        </button>
        <button
          className={state.tool === 'select' ? 'is-on' : ''}
          onClick={() => studio.setTool('select')}
        >
          Двигать
        </button>
        <button
          className={state.tool === 'path' ? 'is-on' : ''}
          onClick={() => studio.setTool('path')}
        >
          Тропинка
        </button>
      </div>

      {state.tool === 'path' && (
        <div className="layout-path-width">
          <span>Ширина</span>
          <button onClick={() => studio.setPathWidth(state.pathWidth * 0.85)}>−</button>
          <span className="layout-width-value">{state.pathWidth.toFixed(1)}</span>
          <button onClick={() => studio.setPathWidth(state.pathWidth * 1.15)}>+</button>
        </div>
      )}

      {state.tool !== 'path' && (
        <div className="layout-catalog">
          {state.catalog.map((model) => (
            <button
              key={model}
              type="button"
              className={`layout-card${state.activeModel === model ? ' is-on' : ''}`}
              onClick={() => studio.setActiveModel(model)}
            >
              {thumbs[model] ? (
                <img src={thumbs[model]} alt="" />
              ) : (
                <span className="layout-card-fallback" />
              )}
              <span>{propLabel(model)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="layout-selected">
          <span>{propLabel(selected.model)}</span>
          <div className="layout-actions">
            <button onClick={() => studio.rotateSelected(0.2)}>↺</button>
            <button onClick={() => studio.rotateSelected(-0.2)}>↻</button>
            <button onClick={() => studio.scaleSelected(0.9)}>−</button>
            <button onClick={() => studio.scaleSelected(1.1)}>+</button>
            <button onClick={() => studio.deleteSelected()}>Удалить</button>
          </div>
        </div>
      )}

      {selectedPath && (
        <div className="layout-selected">
          <span>Тропинка</span>
          <div className="layout-actions">
            <button onClick={() => studio.scaleSelected(0.9)}>−</button>
            <button onClick={() => studio.scaleSelected(1.1)}>+</button>
            <button onClick={() => studio.deleteSelected()}>Удалить</button>
          </div>
        </div>
      )}

      <footer>
        <span>
          {state.count} шт.
          {state.pathCount ? ` · ${state.pathCount} дор.` : ''}
          {state.dirty ? ' · пишется…' : ' · в браузере'}
        </span>
        <div className="layout-actions">
          <button
            type="button"
            title="Открыть скачанный island-layout.json"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'application/json';
              input.onchange = () => {
                const file = input.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  try {
                    studio.importDocument(parseLayoutDocument(JSON.parse(text)));
                  } catch {
                    /* ignore a broken dump */
                  }
                });
              };
              input.click();
            }}
          >
            Открыть
          </button>
          <button onClick={() => studio.resetProcedural()} title="Вернуть зафиксированный старт острова">
            Сброс
          </button>
          <button
            onClick={() => studio.save()}
            title="Скачать JSON. Положи его в public/layout/island-layout.json — тогда парк будет в проекте, не только в этом браузере."
          >
            Скачать
          </button>
        </div>
      </footer>
    </div>
  );
}

function catalogModelsSafe(game: Game): string[] {
  try {
    return game.layoutStudio.getState().catalog;
  } catch {
    return [];
  }
}
