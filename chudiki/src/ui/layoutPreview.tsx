import { generateSpec, type ChudikSpec } from '../game/creatures/ChudikSpec';
import type { PlazaToy } from '../game/plaza/plazaApi';
import { WORLD_DIY_GROVE, WORLD_DIY_MEADOW, WORLD_DIY_SKU } from '../game/world/kinds';
import type { GardenWorld } from '../game/world/gardens';
import { PlazaPick } from './PlazaPick';
import { MoveCreaturesSheet } from './MoveCreaturesSheet';
import { HatchPreview } from './HatchPreview';
import { WorldFullPrompt } from './WorldFullPrompt';

export type LayoutPreviewMode = 'hub' | 'pick' | 'move' | 'full' | 'hatch';

export function readLayoutPreview(
  search = typeof window === 'undefined' ? '' : window.location.search,
  live = Boolean(import.meta.env?.DEV),
): LayoutPreviewMode | null {
  if (!live) return null;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (!params.has('ui')) return null;
    const value = params.get('ui')?.trim() || 'hub';
    if (value === 'pick' || value === 'move' || value === 'full' || value === 'hatch' || value === 'hub') return value;
    return 'hub';
  } catch {
    return null;
  }
}

export const PREVIEW_TOYS: PlazaToy[] = [
  { spec_id: 'p1', name: 'Прыгуша', portrait: '/ui/apple.png' },
  { spec_id: 'p2', name: 'Зубастик', portrait: '/ui/berry.png' },
  { spec_id: 'p3', name: 'Лапа', portrait: '/ui/golden.png' },
  { spec_id: 'p4', name: 'Бусик', portrait: '/ui/heart.png' },
  { spec_id: 'p5', name: 'Ушастик', portrait: '/ui/sock.png' },
];

const NAMES = ['Прыгуша', 'Зубастик', 'Бусик', 'Зигзаг', 'Тыква', 'Шлеп-Шлеп', 'Ушастик', 'Пуфик', 'Мурзик', 'Зюзя'];

export function previewMoveSpecs(): ChudikSpec[] {
  return NAMES.map((name, index) =>
    generateSpec({
      id: `preview_move_${index}`,
      name,
      seed: 11 + index,
      kindId: 'jumper',
      origin: 'drawing',
      worldId: WORLD_DIY_SKU,
    }),
  );
}

export const PREVIEW_FULL_WORLDS: GardenWorld[] = [
  { id: WORLD_DIY_MEADOW, title: 'Висячий луг', sku: WORLD_DIY_MEADOW },
  { id: WORLD_DIY_GROVE, title: 'Куболесье', sku: WORLD_DIY_GROVE },
  { id: WORLD_DIY_SKU, title: 'Сад 1', sku: WORLD_DIY_SKU },
  { id: `${WORLD_DIY_GROVE}_copy`, title: 'Куболесье 1', sku: WORLD_DIY_GROVE },
];

function go(mode: LayoutPreviewMode) {
  const url = new URL(window.location.href);
  url.searchParams.set('ui', mode);
  window.location.assign(`${url.pathname}?${url.searchParams.toString()}`);
}

type Props = { mode: LayoutPreviewMode };

/** Dev-only: look at the phone sheets without booting the garden. */
export function LayoutPreview({ mode }: Props) {
  if (mode === 'pick') {
    return <PlazaPick toys={PREVIEW_TOYS} onJoin={() => go('hub')} onClose={() => go('hub')} />;
  }
  if (mode === 'move') {
    return (
      <MoveCreaturesSheet
        destTitle="Куболесье"
        specs={previewMoveSpecs()}
        onLater={() => go('hub')}
        onMove={() => go('hub')}
      />
    );
  }
  if (mode === 'hatch') {
    return (
      <HatchPreview
        src="/ui/golden.png"
        name="Пушок"
        stillRemaining={3}
        canDrawAnother
        meshCooking={false}
        onDrawAnother={() => go('hub')}
        onForward={() => go('hub')}
        onPuzzle={() => go('hub')}
      />
    );
  }
  if (mode === 'full') {
    return (
      <WorldFullPrompt
        currentId={WORLD_DIY_SKU}
        worlds={PREVIEW_FULL_WORLDS}
        onClose={() => go('hub')}
        onBuy={() => go('hub')}
        onPickDest={() => go('hub')}
      />
    );
  }
  return (
    <div className="sheet" style={{ gap: 16, padding: 24 }}>
      <h1 className="sheet-title">Проверка экранов</h1>
      <p className="section-label">Телефонная вёрстка карусели, переноса и полного острова.</p>
      <div className="move-actions" style={{ gridTemplateColumns: '1fr', maxWidth: 360, margin: '0 auto' }}>
        <button className="big-button primary" type="button" onClick={() => go('pick')}>
          Карусель зуфика
        </button>
        <button className="big-button" type="button" onClick={() => go('move')}>
          Перенос зуфиков
        </button>
        <button className="big-button" type="button" onClick={() => go('full')}>
          Остров полный
        </button>
        <button className="big-button" type="button" onClick={() => go('hatch')}>
          Появление зуфика
        </button>
      </div>
    </div>
  );
}
