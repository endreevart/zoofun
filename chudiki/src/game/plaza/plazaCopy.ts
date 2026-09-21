import { hasPersistedStill, portraitUrlOf } from '../drawing/portrait';
import { localPlazaMounds } from './plazaDig';

/** Copy and pick rules for the shared lawn (D-029). */

export const PLAZA_EMOTES = [
  { id: 'hello', src: '/plaza/reactions/hello.png', label: 'Привет' },
  { id: 'hooray', src: '/plaza/reactions/hooray.png', label: 'Ура' },
  { id: 'wow', src: '/plaza/reactions/wow.png', label: 'Вау' },
  { id: 'love', src: '/plaza/reactions/love.png', label: 'Люблю' },
  { id: 'laugh', src: '/plaza/reactions/laugh.png', label: 'Ха-ха' },
  { id: 'play', src: '/plaza/reactions/play.png', label: 'Играть' },
] as const;

export type PlazaEmoteId = (typeof PLAZA_EMOTES)[number]['id'];

/** Walkable radius and the grass disk diameter, in metres. */
export const PLAZA_WALK = 280;
export const PLAZA_PLANE = 960;
/** Shared lawn may hold more stamps than a private DIY garden. Oldest catalog trees yield. */
export const PLAZA_STAMP_CAP = 400;
/** Load and draw catalog meshes inside this radius of the child. */
export const PLAZA_LOAD_R = 78;
/** Phone/tablet camera sits farther back; keep trees in that view. */
export const PLAZA_LOAD_R_PAD = 160;
/** Walk metres per second on a mouse. */
export const PLAZA_WALK_SPEED = 7;
/** Stick walk on a phone or tablet. */
export const PLAZA_WALK_SPEED_PAD = 10;
/** Shadow casters only this close; farther trees stay unshaded. */
export const PLAZA_SHADOW_R = 26;
export const PLAZA_VIEW_CELL = 18;
/** Wider cells on a pad so a faster walk does not rebuild the grove more often. */
export const PLAZA_VIEW_CELL_PAD = 26;

export function plazaLoadRadius(pad: boolean): number {
  return pad ? PLAZA_LOAD_R_PAD : PLAZA_LOAD_R;
}

export function plazaWalkSpeed(pad: boolean): number {
  return pad ? PLAZA_WALK_SPEED_PAD : PLAZA_WALK_SPEED;
}

export function plazaViewCellSize(pad: boolean): number {
  return pad ? PLAZA_VIEW_CELL_PAD : PLAZA_VIEW_CELL;
}

/** Plaza-only haze so the disk rim melts into the sky. */
export const PLAZA_FOG = 0.0025;

export function plazaOnlineLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return 'Пока тихо';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} игрок сейчас`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} игрока сейчас`;
  return `${n} игроков сейчас`;
}

export function plazaPickMode(count: number): 'none' | 'one' | 'many' {
  if (count <= 0) return 'none';
  if (count === 1) return 'one';
  return 'many';
}

export const PLAZA_TOY_WAIT = 'Красим штуку';
export const PLAZA_TOY_BAKE = 'Готовим штуку';
export const PLAZA_TOY_PUT = 'Тапни сад — поставь штуку.';
export const PLAZA_TOY_READY = 'Вот что получилось';
export const PLAZA_TOY_PLACE = 'На поляну';
export const PLAZA_TOY_FAIL = 'Не получилось покрасить.';
export const PLAZA_TOY_AGAIN = 'Ещё раз';
export const PLAZA_TOY_REDRAW = 'Перерисовать';
export const PLAZA_TOY_NEXT = 'Далее';
export const PLAZA_GIFT_ASK = 'Посадить на общей поляне?';
export const PLAZA_GIFT_HINT = 'Рисунок станет объёмной штукой на общей поляне.';
export const PLAZA_GIFT_ADULT = 'Оплачивает взрослый';
export const PLAZA_GIFT_PROMO = 'Введите промокод';
export const PLAZA_GIFT_APPLY = 'Применить';
export const PLAZA_GIFT_PANEL = '/ui/meadow-gift/modal-panel.png';
export const PLAZA_GIFT_PLAQUE = '/ui/meadow-gift/title-plaque.png';
export const PLAZA_GIFT_FRAME = '/ui/meadow-gift/drawing-frame.png';
export const PLAZA_GIFT_CLOSE = '/ui/meadow-gift/close-button.png';
export const PLAZA_PICK_TITLE = 'С кем пойдёшь гулять?';
export const PLAZA_PICK_HINT = 'Выбери Зуфика';
export const PLAZA_PICK_WHERE = 'В общий зоопарк';
export const PLAZA_PICK_WIDE = 4;
export const PLAZA_PICK_SIGN = '/plaza/pick-sign.png';
export const PLAZA_PICK_HINT_ART = '/plaza/pick-hint.png';
export const PLAZA_PICK_PREV = '/plaza/pick-prev.png';
export const PLAZA_PICK_NEXT = '/plaza/pick-next.png';

export function plazaPickWindow(selected: number, total: number, size = PLAZA_PICK_WIDE): number {
  const n = Math.max(0, Math.floor(total));
  const i = Math.max(0, Math.floor(selected));
  const span = Math.max(1, Math.floor(size));
  if (n <= span) return 0;
  if (i < span) return 0;
  return Math.min(i - span + 1, n - span);
}

export function plazaEnterLabel(name: string): string {
  const raw = name.trim() || 'зуфиком';
  return `Войти с ${plazaInstrumental(raw)}`;
}

export function plazaInstrumental(name: string): string {
  const n = name.trim();
  if (!n) return 'зуфиком';
  if (/[аА]$/.test(n)) return `${n.slice(0, -1)}ой`;
  if (/[яЯ]$/.test(n)) return `${n.slice(0, -1)}ей`;
  if (/[оО]$/.test(n)) return `${n.slice(0, -1)}ом`;
  if (/[йЙьЬ]$/.test(n)) return `${n.slice(0, -1)}ем`;
  if (/[жшчщц]$/i.test(n)) return `${n}ем`;
  return `${n}ом`;
}

export type PlazaReadySpec = {
  id?: string;
  hatching?: boolean;
  drawing?: {
    placeholder?: boolean;
    portraitUrl?: string;
    textureUrl?: string;
    postcardUrl?: string;
    modelUrl?: string;
    meshDeferred?: boolean;
  };
};

export function isPlazaReadySpec(spec: PlazaReadySpec | undefined): boolean {
  if (!spec?.id || spec.id.startsWith('resident_')) return false;
  if (spec.hatching) return false;
  const drawing = spec.drawing;
  if (!drawing || drawing.placeholder) return false;
  if (drawing.meshDeferred && !drawing.modelUrl?.trim()) return false;
  return hasPersistedStill(drawing) || Boolean(drawing.modelUrl && drawing.modelUrl.trim());
}

export type PlazaToyRow = {
  spec_id: string;
  name: string;
  portrait: string;
};

/** Picker tile: garden postcard, else the family postcard route. */
export function plazaToyStill(spec: PlazaReadySpec): string {
  const postcard = spec.drawing?.postcardUrl?.trim() ?? '';
  if (postcard && /^(https?:|\/v1\/)/i.test(postcard)) return postcard;
  const id = spec.id?.trim();
  if (id) return `/v1/zoo/creatures/${id}/postcard`;
  return portraitUrlOf(spec.drawing) ?? '';
}

export function mergePlazaToys(local: PlazaToyRow[], remote: PlazaToyRow[]): PlazaToyRow[] {
  const byId = new Map<string, PlazaToyRow>();
  for (const toy of local) byId.set(toy.spec_id, toy);
  for (const toy of remote) {
    const prev = byId.get(toy.spec_id);
    byId.set(
      toy.spec_id,
      prev ? { ...prev, name: toy.name || prev.name, portrait: toy.portrait || prev.portrait } : toy,
    );
  }
  return [...byId.values()];
}

export function soloPlazaRoom(toy: PlazaToyRow): {
  room_id: number;
  seat: number;
  online: number;
  stamps_rev: number;
  mounds: ReturnType<typeof localPlazaMounds>;
  tickets: ReturnType<typeof localPlazaMounds>;
  peers: Array<{
    seat: number;
    spec_id: string;
    name: string;
    portrait: string;
    model?: string;
    emote: string;
    self: boolean;
  }>;
} {
  return {
    room_id: 0,
    seat: 0,
    online: 1,
    stamps_rev: 0,
    mounds: localPlazaMounds(),
    tickets: [],
    peers: [
      {
        seat: 0,
        spec_id: toy.spec_id,
        name: toy.name,
        portrait: toy.portrait,
        emote: '',
        self: true,
      },
    ],
  };
}
