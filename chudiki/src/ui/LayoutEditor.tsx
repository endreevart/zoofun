import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import type { LayoutState } from '../game/interaction/LayoutStudio';
import { catalogForShell, bakedLayoutFile, layoutDownloadName, parseLayoutDocument, propLabel } from '../game/world/layoutAuthored';
import { studioKindHref } from '../studioMode';
import { isHangingShell, type WorldShell } from '../game/world/kinds';

export function pickLayoutFile(onDoc: (doc: ReturnType<typeof parseLayoutDocument>) => void | Promise<void>) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        void onDoc(parseLayoutDocument(JSON.parse(text)));
      } catch {
        /* ignore a broken dump */
      }
    });
  };
  input.click();
}

export function StudioWorldSwitch({
  shell,
  onDownload,
  onOpen,
}: {
  shell: WorldShell;
  onDownload?: () => void;
  onOpen?: () => void;
}) {
  return (
    <>
      <div className="layout-worlds">
        <button
          type="button"
          className={shell === 'garden' ? 'is-on' : ''}
          onClick={() => switchStudioWorld('garden', shell)}
        >
          Остров
        </button>
        <button
          type="button"
          className={shell === 'meadow' ? 'is-on' : ''}
          onClick={() => switchStudioWorld('meadow', shell)}
        >
          Луг
        </button>
        <button
          type="button"
          className={shell === 'grove' ? 'is-on' : ''}
          onClick={() => switchStudioWorld('grove', shell)}
        >
          Куболесье
        </button>
      </div>
      {onOpen || onDownload ? (
        <div className="layout-files">
          {onOpen ? (
            <button type="button" title="Открыть JSON раскладки" onClick={onOpen}>
              Открыть
            </button>
          ) : null}
          {onDownload ? (
            <button type="button" title="Скачать JSON раскладки" onClick={onDownload}>
              ⬇
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

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
  const [catalogBusy, setCatalogBusy] = useState(false);
  const shell = game.worldShell;

  useEffect(() => studio.subscribe(() => setState(studio.getState())), [studio]);

  useEffect(() => {
    if (!state.enabled) return;
    const names = catalogModelsSafe(game).filter((name) => game.library.has(name));
    if (!names.length) return;
    setThumbs((prev) => ({ ...prev, ...game.captureCatalogThumbs(names) }));
  }, [game, state.enabled, catalogBusy]);

  if (!state.enabled) {
    return (
      <div className="layout-launch">
        <StudioWorldSwitch shell={shell} />
        <button
          className="layout-toggle"
          disabled={opening}
          onClick={() => {
            void (async () => {
              setOpening(true);
              try {
                const catalog = [...catalogForShell(shell)];
                if (isHangingShell(shell)) {
                  studio.setEnabled(true);
                  setCatalogBusy(true);
                  const quick = catalog.filter(
                    (name) => name.startsWith('lp_') || name.startsWith('rock') || name === 'mosslit-stones',
                  );
                  if (quick.length) {
                    await game.library.ensureAll(quick);
                    setThumbs(game.captureCatalogThumbs(quick));
                  }
                  await game.library.ensureAll(catalog);
                  setThumbs(game.captureCatalogThumbs(catalog));
                  setCatalogBusy(false);
                } else {
                  await game.library.ensureAll(catalog);
                  studio.setEnabled(true);
                }
              } finally {
                setOpening(false);
                setCatalogBusy(false);
              }
            })();
          }}
          title="Расставить объекты"
        >
          {opening ? '…' : '🌲'}
        </button>
      </div>
    );
  }

  const selected = studio.selected();
  const selectedPath = studio.selectedPath();
  const selectedSpawn = studio.selectedSpawn();

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
      <StudioWorldSwitch shell={shell} />

      {catalogBusy ? <p className="layout-help">Модели луга ещё грузятся — можно ставить, как появятся.</p> : null}

      <p className="layout-help">
        {state.tool === 'path'
          ? 'Веди по земле — появится тропинка. Клик по готовой выделяет. Delete стирает. − = ширина. Esc отменяет штрих. Пробел — камера. Расстановка пишется сама.'
          : state.tool === 'spawn'
            ? 'Клик по земле — круг, внутри которого будет появляться яйцо. Клик по кругу выделяет, перетаскивание двигает. − = радиус, Delete убирает. Кругов может быть сколько угодно: чем шире круг, тем чаще в нём яйцо. Без кругов яйцо ложится на главную поляну, как раньше.'
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
        <button
          className={state.tool === 'spawn' ? 'is-on' : ''}
          onClick={() => studio.setTool('spawn')}
          title="Где появляется новое яйцо"
        >
          Место яйца
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

      {state.tool === 'spawn' && (
        <div className="layout-path-width">
          <span>Радиус</span>
          <button onClick={() => studio.setSpawnRadius(state.spawnRadius * 0.85)}>−</button>
          <span className="layout-width-value">{state.spawnRadius.toFixed(1)}</span>
          <button onClick={() => studio.setSpawnRadius(state.spawnRadius * 1.15)}>+</button>
        </div>
      )}

      {state.tool !== 'path' && state.tool !== 'spawn' && (
        <div className="layout-catalog">
          {state.catalog.map((model) => (
            <button
              key={model}
              type="button"
              className={`layout-card${state.activeModel === model ? ' is-on' : ''}`}
              onClick={() => {
                void (async () => {
                  if (!game.library.has(model)) await game.library.ensure(model);
                  studio.setActiveModel(model);
                  setThumbs((prev) => ({ ...prev, ...game.captureCatalogThumbs([model]) }));
                })();
              }}
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

      {selectedSpawn && (
        <div className="layout-selected">
          <span>Место яйца · {selectedSpawn.radius.toFixed(1)} м</span>
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
          {state.spawnCount ? ` · ${state.spawnCount} ${circles(state.spawnCount)} для яйца` : ''}
          {state.dirty ? ' · пишется…' : ' · в браузере'}
        </span>
        <div className="layout-actions">
          <button
            type="button"
            title={`Открыть скачанный ${layoutDownloadName(shell)}`}
            onClick={() =>
              pickLayoutFile((doc) => {
                studio.importDocument(doc);
              })
            }
          >
            Открыть
          </button>
          <button onClick={() => studio.resetProcedural()} title="Вернуть зафиксированный старт острова">
            Сброс
          </button>
          <button
            onClick={() => studio.save()}
            title={`Скачать JSON. Положи его в public/${bakedLayoutFile(shell)} — тогда раскладка будет в проекте, не только в этом браузере.`}
          >
            Скачать
          </button>
        </div>
      </footer>
    </div>
  );
}

function circles(count: number): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return 'кругов';
  switch (count % 10) {
    case 1:
      return 'круг';
    case 2:
    case 3:
    case 4:
      return 'круга';
    default:
      return 'кругов';
  }
}

function catalogModelsSafe(game: Game): string[] {
  try {
    return game.layoutStudio.getState().catalog;
  } catch {
    return [...catalogForShell(game.worldShell)];
  }
}

function switchStudioWorld(kind: WorldShell, current: WorldShell) {
  if (kind === current) return;
  window.location.assign(studioKindHref(kind));
}
