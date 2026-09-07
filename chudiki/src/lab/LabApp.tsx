import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../api';
import { paperizeCanvas } from '../game/drawing/paperize';
import { DrawPad } from '../ui/DrawPad';
import { LabViewer } from './LabViewer';
import './lab.css';

type MeshSlot = {
  id: string;
  title: string;
  group: string;
  chosen?: boolean;
  fallback?: boolean;
  provider?: string;
  status: string;
  error?: string | null;
  meshy_s?: number | null;
  model_url?: string | null;
};

type LabCard = {
  id: string;
  title: string;
  why: string;
  status: string;
  error?: string | null;
  openrouter_s?: number | null;
  meshy_s?: number | null;
  mesh_id?: string | null;
  still_url?: string | null;
  model_url?: string | null;
  glb_bytes?: number | null;
  model_id?: string;
  model_slug?: string;
  prompt_id?: string;
  meshes?: MeshSlot[];
};

type LabRun = {
  run_id: string;
  status: string;
  cards: LabCard[];
};

type Catalog = {
  models: { id: string; slug: string; title: string }[];
  prompts: { id: string; title: string; why: string }[];
  meshes: {
    id: string;
    title: string;
    group: string;
    chosen?: boolean;
    fallback?: boolean;
    provider?: string;
  }[];
};

type SavedRun = {
  run_id: string;
  stills: number;
  meshes: number;
  has_flux_contour: boolean;
};

function labUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

function seconds(value?: number | null): string {
  if (typeof value !== 'number') return '—';
  return `${value.toFixed(1)} с`;
}

function isLive(run: LabRun | null): boolean {
  if (!run) return false;
  return run.cards.some(
    (card) =>
      card.status === 'queued' ||
      card.status === 'paint' ||
      card.status === 'mesh' ||
      (card.meshes ?? []).some((slot) => slot.status === 'mesh'),
  );
}

function toggleId(current: string[], id: string): string[] {
  if (current.includes(id)) {
    const next = current.filter((item) => item !== id);
    return next.length ? next : current;
  }
  return [...current, id];
}

export function LabApp() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const sourceBlob = useRef<Blob | null>(null);
  const [run, setRun] = useState<LabRun | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelIds, setModelIds] = useState(['flux2', 'seedream', 'gemini25']);
  const [promptIds, setPromptIds] = useState(['contour', 'alive']);
  const [saved, setSaved] = useState<SavedRun[]>([]);

  useEffect(() => {
    void fetch(`${API_BASE}/v1/lab/recipes`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Catalog | null) => {
        if (body) setCatalog(body);
      });
    void fetch(`${API_BASE}/v1/lab/runs`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { runs?: SavedRun[] } | null) => {
        if (body?.runs) setSaved(body.runs);
      });
  }, []);

  const takeBlob = useCallback((blob: Blob) => {
    sourceBlob.current = blob;
    setSourceUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(blob);
    });
    setRun(null);
    setError(null);
  }, []);

  const onDraw = useCallback(
    (canvas: HTMLCanvasElement) => {
      paperizeCanvas(canvas).toBlob((blob) => {
        if (blob) takeBlob(blob);
        setDrawing(false);
      }, 'image/png');
    },
    [takeBlob],
  );

  const start = useCallback(async () => {
    if (!sourceBlob.current) {
      setError('Сначала нарисуй или загрузи рисунок.');
      return;
    }
    const total = modelIds.length * promptIds.length;
    setBusy(
      total === 1
        ? 'Красим картинку. Мэш не трогаю.'
        : `Красим ${total} картинок. Мэш не трогаю.`,
    );
    setError(null);
    const body = new FormData();
    body.append('file', sourceBlob.current, 'drawing.png');
    modelIds.forEach((id) => body.append('models', id));
    promptIds.forEach((id) => body.append('prompts', id));
    const started = await fetch(`${API_BASE}/v1/lab/compare`, { method: 'POST', body });
    if (!started.ok) {
      setBusy(null);
      setError(started.status === 404 ? 'Лаба только на локальном API.' : 'Не вышло начать сравнение.');
      return;
    }
    setRun((await started.json()) as LabRun);
  }, [modelIds, promptIds]);

  const openRun = useCallback(async (runId: string) => {
    setBusy('Открываю прогон…');
    setError(null);
    const opened = await fetch(`${API_BASE}/v1/lab/compare/${runId}`);
    if (!opened.ok) {
      setBusy(null);
      setError('Не вышло открыть прогон.');
      return;
    }
    setRun((await opened.json()) as LabRun);
    setBusy(null);
  }, []);

  const sculpt = useCallback(async (cardId: string, preset: string) => {
    if (!run) return;
    const started = await fetch(`${API_BASE}/v1/lab/compare/${run.run_id}/${cardId}/mesh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset }),
    });
    if (!started.ok) {
      setError('Не вышло слепить.');
      return;
    }
    setRun((await started.json()) as LabRun);
  }, [run]);

  useEffect(() => {
    if (!isLive(run) || !run) {
      if (run && !isLive(run)) setBusy(null);
      return;
    }
    const timer = window.setInterval(() => {
      void fetch(`${API_BASE}/v1/lab/compare/${run.run_id}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((next: LabRun | null) => {
          if (next) setRun(next);
        });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [run]);

  const cardsById = useMemo(() => {
    const map = new Map<string, LabCard>();
    run?.cards.forEach((card) => map.set(card.id, card));
    return map;
  }, [run]);

  const visibleCards =
    run?.cards.filter(
      (card) =>
        (!card.model_id || modelIds.includes(card.model_id)) &&
        (!card.prompt_id || promptIds.includes(card.prompt_id)),
    ) ?? [];
  const painted = visibleCards.filter((card) => card.still_url).length;
  const failed = visibleCards.filter((card) => card.status === 'failed').length;
  const total = visibleCards.length || modelIds.length * promptIds.length;
  const shownModels = (catalog?.models ?? []).filter(
    (model) =>
      modelIds.includes(model.id) &&
      (!run || run.cards.some((card) => card.model_id === model.id)),
  );
  const shownPrompts = (catalog?.prompts ?? []).filter(
    (prompt) =>
      promptIds.includes(prompt.id) &&
      (!run || run.cards.some((card) => card.prompt_id === prompt.id)),
  );
  const catRun =
    saved.find((item) => item.run_id === '7079558840f344bb842a92bd29e03b7d') ??
    saved.find((item) => item.has_flux_contour);
  const lastRun = saved.find((item) => item.run_id !== catRun?.run_id);

  return (
    <div className="lab-app">
      <h1>Стенд гармонизации</h1>
      <p className="lab-lead">
        Три картинки × два промпта: прод-контур и живой чудик без пейзажа.
        На каждую карточку — свой набор 3D. Жми «Слепить» на нужном.
      </p>

      <div className="lab-picks">
        <div>
          <span>Модель</span>
          {(catalog?.models ?? []).map((model) => (
            <button
              key={model.id}
              type="button"
              className={modelIds.includes(model.id) ? 'is-on' : ''}
              onClick={() => setModelIds((current) => toggleId(current, model.id))}
            >
              {model.title}
            </button>
          ))}
        </div>
        <div>
          <span>Промпт</span>
          {(catalog?.prompts ?? []).map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              className={promptIds.includes(prompt.id) ? 'is-on' : ''}
              onClick={() => setPromptIds((current) => toggleId(current, prompt.id))}
            >
              {prompt.title}
            </button>
          ))}
        </div>
      </div>

      <div className="lab-actions">
        <button type="button" onClick={() => setDrawing(true)}>
          Нарисовать
        </button>
        <label>
          Загрузить рисунок
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) takeBlob(file);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" onClick={() => void start()} disabled={!sourceBlob.current || isLive(run)}>
          Нарисовать игрушку
        </button>
        {catRun ? (
          <button
            type="button"
            onClick={() => {
              setModelIds(['flux2', 'seedream', 'gemini25']);
              setPromptIds(['contour']);
              void openRun(catRun.run_id);
            }}
            disabled={isLive(run)}
          >
            Открыть кота
          </button>
        ) : null}
        {lastRun ? (
          <button type="button" onClick={() => void openRun(lastRun.run_id)} disabled={isLive(run)}>
            Последний прогон
          </button>
        ) : null}
      </div>

      {sourceUrl ? <img className="lab-source" src={sourceUrl} alt="Исходный рисунок" /> : null}
      {busy ? <p className="lab-status">{busy}</p> : null}
      {run ? (
        <p className="lab-status">
          Готово {painted} из {total}{failed ? `, ошибок ${failed}` : ''}
        </p>
      ) : null}
      {error ? <p className="lab-error">{error}</p> : null}

      {run && catalog ? (
        <div className="lab-cards">
          {shownPrompts.flatMap((prompt) =>
            shownModels.map((model) => {
              const card = cardsById.get(`${model.id}__${prompt.id}`);
              if (!card) return null;
              const still = labUrl(card.still_url);
              const slots: MeshSlot[] = card.meshes?.length
                ? card.meshes
                : catalog.meshes.map((mesh) => ({ ...mesh, status: 'idle' }));
              return (
                <article className="lab-card" key={card.id}>
                  <div className="lab-card-row">
                    <div className="lab-still">
                      {still ? <img src={still} alt={card.title} /> : <p>Картинка ещё нет</p>}
                      <div className="lab-times">
                        <span>{model.title}</span>
                        <span>{prompt.title}</span>
                        <span>OR {seconds(card.openrouter_s)}</span>
                      </div>
                    </div>
                    <div className="lab-meshes">
                      {slots.map((slot) => {
                        const mesh = labUrl(slot.model_url);
                        const mark = slot.chosen ? 'наш' : slot.fallback ? 'запасной' : null;
                        return (
                          <div
                            className={`lab-mesh-slot${slot.chosen ? ' is-pick' : ''}${slot.fallback ? ' is-spare' : ''}`}
                            key={slot.id}
                          >
                            <strong>
                              {slot.title}
                              {mark ? <em>{mark}</em> : null}
                            </strong>
                            <small>{slot.group}</small>
                            {mesh ? <LabViewer url={mesh} /> : <div className="lab-mesh-empty">Ещё нет</div>}
                            <div className="lab-times">
                              <span>{slot.status}</span>
                              {slot.meshy_s != null ? <span>{seconds(slot.meshy_s)}</span> : null}
                            </div>
                            {card.still_url && slot.status !== 'mesh' ? (
                              <button type="button" onClick={() => void sculpt(card.id, slot.id)}>
                                Слепить
                              </button>
                            ) : null}
                            {slot.error ? <p className="lab-error">{slot.error}</p> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            }),
          )}
        </div>
      ) : null}

      {drawing ? (
        <div className="lab-draw-host">
          <DrawPad
            title="Рисунок для сравнения"
            doneLabel="Дальше"
            onCancel={() => setDrawing(false)}
            onDone={onDraw}
          />
        </div>
      ) : null}
    </div>
  );
}
