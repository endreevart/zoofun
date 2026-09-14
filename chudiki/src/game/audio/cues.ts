/**
 * Pre-recorded island voice-over. Clips are baked MP3s in `public/audio/cues/`.
 *
 * Generate them in ElevenLabs (same voice as the creature cards is fine), then
 * drop the files next to this list. The island plays them; it never calls
 * ElevenLabs. Missing files stay silent — synth taps still run.
 *
 * ElevenLabs: multilingual v2, one warm Russian narrator, ~0.9× speed, no
 * child names, no ad-lib. Export mp3 128 kbps, filename = `{id}.mp3`.
 */

export type CueId =
  | 'welcome_garden'
  | 'welcome_diy'
  | 'worlds'
  | 'draw'
  | 'photo'
  | 'menu'
  | 'feed'
  | 'wash'
  | 'born'
  | 'empty_quota'
  | 'error'
  | 'walk'
  | 'stop'
  | 'egg'
  | 'puzzle'
  | 'roster'
  | 'zoo'
  | 'record'
  | 'shop'
  | 'worlds_back'
  | 'plants'
  | 'houses'
  | 'place'
  | 'move'
  | 'trash'
  | 'save'
  | 'diy_full'
  | 'build';

export type CueSpec = {
  file: string;
  line: string;
  when: string;
};

export const UI_CUES: Record<CueId, CueSpec> = {
  welcome_garden: {
    file: 'welcome_garden.mp3',
    line: 'Привет! Нарисуй своего зуфуньчика или сфотографируй рисунок.',
    when: 'Обычный сад, пока нет своего зуфуньчика. Первый тап не по кнопке создания.',
  },
  welcome_diy: {
    file: 'welcome_diy.mp3',
    line: 'Это твой остров. Поставь домик, куда хочешь.',
    when: 'Первый вход на DIY-остров.',
  },
  worlds: {
    file: 'worlds.mp3',
    line: 'Выбери сад.',
    when: 'Экран выбора мира.',
  },
  draw: {
    file: 'draw.mp3',
    line: 'Рисуем зуфуньчика!',
    when: 'Тап «Нарисовать».',
  },
  photo: {
    file: 'photo.mp3',
    line: 'Сфотографируй рисунок.',
    when: 'Тап «Загрузить фото».',
  },
  menu: {
    file: 'menu.mp3',
    line: 'Что сделаем?',
    when: 'Открытие мобильной кнопки действий.',
  },
  feed: {
    file: 'feed.mp3',
    line: 'Кушать!',
    when: 'Кормление.',
  },
  wash: {
    file: 'wash.mp3',
    line: 'Помоем!',
    when: 'Мытьё.',
  },
  born: {
    file: 'born.mp3',
    line: 'Зуфуньчик родился!',
    when: 'Существо появилось в саду после генерации.',
  },
  empty_quota: {
    file: 'empty_quota.mp3',
    line: 'В зоопарке больше нет мест. Позовём взрослого.',
    when: 'Кредиты кончились, открывается пополнение.',
  },
  error: {
    file: 'error.mp3',
    line: 'Не получилось. Давай ещё раз.',
    when: 'Рисунок не разобрался или запрос не прошёл.',
  },
  walk: {
    file: 'walk.mp3',
    line: 'Пойдём гулять!',
    when: 'Тап «Вести».',
  },
  stop: {
    file: 'stop.mp3',
    line: 'Хватит ходить.',
    when: 'Тап «Отпустить».',
  },
  egg: {
    file: 'egg.mp3',
    line: 'Яйцо. Скоро зуфуньчик.',
    when: 'Первый тап по яйцу в этой сессии.',
  },
  puzzle: {
    file: 'puzzle.mp3',
    line: 'Сложи картинку.',
    when: 'Открытие пазла.',
  },
  roster: {
    file: 'roster.mp3',
    line: 'Твои зуфики.',
    when: 'Тап «Мои Зуфики».',
  },
  zoo: {
    file: 'zoo.mp3',
    line: 'Весь зоопарк.',
    when: 'Тап «Весь зоопарк».',
  },
  record: {
    file: 'record.mp3',
    line: 'Скажи голос зуфуньчика.',
    when: 'Старт записи голоса на карточке.',
  },
  shop: {
    file: 'shop.mp3',
    line: 'Позовём взрослого.',
    when: 'Тап «Пополнить».',
  },
  worlds_back: {
    file: 'worlds_back.mp3',
    line: 'Другой зоопарк.',
    when: 'Тап «В миры».',
  },
  plants: {
    file: 'plants.mp3',
    line: 'Растения.',
    when: 'Открытие группы растений на DIY.',
  },
  houses: {
    file: 'houses.mp3',
    line: 'Домики.',
    when: 'Открытие группы домиков на DIY.',
  },
  place: {
    file: 'place.mp3',
    line: 'Тапни землю — поставлю.',
    when: 'Выбрали новую фигурку в каталоге, не каждый штамп на землю.',
  },
  move: {
    file: 'move.mp3',
    line: 'Зажми и тащи.',
    when: 'Первый раз зажали стрелки переноса в этой сессии.',
  },
  trash: {
    file: 'trash.mp3',
    line: 'Убрать.',
    when: 'Корзина на DIY.',
  },
  save: {
    file: 'save.mp3',
    line: 'Сад сохранён.',
    when: 'После успешного «Сохранить».',
  },
  diy_full: {
    file: 'diy_full.mp3',
    line: 'Вещей больше не влезет.',
    when: 'Сад заполнен, попытка взять новую фигурку.',
  },
  build: {
    file: 'build.mp3',
    line: 'Строим сад.',
    when: 'Открытие DIY-лотка на телефоне.',
  },
};

/** Speak «поставь» only when the child picks a different catalog item. */
export function isNewPlacePick(holding: string | null | undefined, next: string): boolean {
  return next.length > 0 && next !== holding;
}
