const LABELS: Record<string, string> = {
  "session.start": "Зашёл на остров",
  "session.heartbeat": "Ещё на острове",
  "world.open": "Открыл луг",
  "creature.view": "Открыл зверя",
  "creature.add": "Нарисовал зверя",
  "creature.feed": "Покормил",
  "creature.walk": "Погулял",
  "creature.wash": "Помыл",
  "shop.open": "Открыл магазин",
  "shop.view": "Показал витрину пакетов",
  "draw.open": "Открыл рисовалку",
  "page.view": "Открыл страницу",
  "play.open": "Нажал «играть» на сайте",
};

export function eventLabel(event: string) {
  return LABELS[event] || event;
}
