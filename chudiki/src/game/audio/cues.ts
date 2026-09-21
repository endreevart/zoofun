/**
 * Pre-recorded island voice-over. Clips are baked MP3s in `public/audio/cues/`.
 *
 * Generate them in ElevenLabs (same voice as the creature cards is fine), then
 * drop the files next to this list. The island plays them; it never calls
 * ElevenLabs. Missing files stay silent — synth taps still run.
 *
 * ElevenLabs: multilingual v2, one warm Russian narrator, ~0.9× speed, no
 * child names, no ad-lib. Export mp3 128 kbps, filename = `{id}.mp3`.
 *
 * Arcade batch (`arcade_*`): record every line in `UI_CUES` below. Repeat
 * `arcade_tree_more` / `arcade_tree_good` instead of unique tree takes.
 * Missing arcade files stay silent until dropped into `public/audio/cues/`.
 *
 * Plaza batch (`plaza_*`): the shared lawn (D-029). Same voice, no names, no
 * prices. Record every `plaza_*` line. Missing files stay silent; footsteps,
 * hops, emoji and stamps stay synth.
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
  | 'build'
  | 'arcade_hello'
  | 'arcade_look'
  | 'arcade_tree_give'
  | 'arcade_tree_why'
  | 'arcade_tree_more'
  | 'arcade_tree_good'
  | 'arcade_tree_done'
  | 'arcade_pond_give'
  | 'arcade_pond_why'
  | 'arcade_pond_done'
  | 'arcade_house_give'
  | 'arcade_house_who'
  | 'arcade_house_more'
  | 'arcade_house_done'
  | 'arcade_settle_free'
  | 'arcade_need_friends'
  | 'arcade_settle_lonely'
  | 'arcade_wrong'
  | 'arcade_pause'
  | 'arcade_resume'
  | 'plaza_hello'
  | 'plaza_look'
  | 'plaza_friends'
  | 'plaza_walk'
  | 'plaza_jump'
  | 'plaza_emote'
  | 'plaza_build'
  | 'plaza_things'
  | 'plaza_pick'
  | 'plaza_need'
  | 'plaza_save'
  | 'plaza_home'
  | 'plaza_dig'
  | 'plaza_found'
  | 'plaza_draw'
  | 'plaza_toy_wait'
  | 'still_after_first'
  | 'postcard_ready'
  | 'empty_still'
  | 'revive_need';

/** WAV files named `.mp3` from macOS `say`. Not the island voice. */
export const PLACEHOLDER_CUES: ReadonlySet<CueId> = new Set([
  'plaza_jump',
  'plaza_emote',
  'plaza_pick',
  'plaza_need',
  'plaza_save',
  'plaza_home',
  'plaza_dig',
  'empty_still',
]);

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
  arcade_hello: {
    file: 'arcade_hello.mp3',
    line: 'Привет, малыш. Это новый зоопарк. Давай приготовим его для будущих жителей.',
    when: 'Первый вход в аркаду на пустом саду.',
  },
  arcade_look: {
    file: 'arcade_look.mp3',
    line: 'Пока тут пусто. Скоро тут будут деревья, вода и домики.',
    when: 'Второй такт входа, если нужен.',
  },
  arcade_tree_give: {
    file: 'arcade_tree_give.mp3',
    line: 'Вот дерево. Посади его на землю.',
    when: 'Дерево в руке, ждём тап.',
  },
  arcade_tree_why: {
    file: 'arcade_tree_why.mp3',
    line: 'Оно вырастет. В тени зуфики будут отдыхать от солнышка.',
    when: 'Сразу после «вот дерево».',
  },
  arcade_tree_more: {
    file: 'arcade_tree_more.mp3',
    line: 'Ещё одно дерево. Тапни землю.',
    when: 'Нужно посадить ещё дерево.',
  },
  arcade_tree_good: {
    file: 'arcade_tree_good.mp3',
    line: 'Растёт! Ещё чуть-чуть тени.',
    when: 'После посадки дерева, если шаг не кончен.',
  },
  arcade_tree_done: {
    file: 'arcade_tree_done.mp3',
    line: 'Тени хватит. Зуфикам будет прохладно.',
    when: 'Три дерева стоят.',
  },
  arcade_pond_give: {
    file: 'arcade_pond_give.mp3',
    line: 'Теперь вода. Поставь пруд на землю.',
    when: 'Пруд в руке.',
  },
  arcade_pond_why: {
    file: 'arcade_pond_why.mp3',
    line: 'Тут будут пить и плескаться.',
    when: 'Сразу после «теперь вода».',
  },
  arcade_pond_done: {
    file: 'arcade_pond_done.mp3',
    line: 'Пруд готов. Можно смотреть, как блестит вода.',
    when: 'Пруд поставлен.',
  },
  arcade_house_give: {
    file: 'arcade_house_give.mp3',
    line: 'А это домик. Поставь его, куда тебе нравится.',
    when: 'Домик в руке.',
  },
  arcade_house_who: {
    file: 'arcade_house_who.mp3',
    line: 'Как думаешь, кто тут мог бы жить? Маленький, тёплый, свой.',
    when: 'После «это домик». Рисунок ещё не открываем.',
  },
  arcade_house_more: {
    file: 'arcade_house_more.mp3',
    line: 'Ещё один домик. Вдруг придут друзья.',
    when: 'Если домиков нужно больше одного.',
  },
  arcade_house_done: {
    file: 'arcade_house_done.mp3',
    line: 'Домики стоят. Кто-то уже хочет сюда переехать.',
    when: 'Домик поставлен, шаг заселения.',
  },
  arcade_settle_free: {
    file: 'arcade_settle_free.mp3',
    line: 'Остров готов. Пора заселить его. Нарисуй первого зуфика — он будет жить тут.',
    when: 'Аркада кончена, бесплатный слот ещё есть.',
  },
  arcade_need_friends: {
    file: 'arcade_need_friends.mp3',
    line: 'Ему будет скучно одному. Давай нарисуем друга.',
    when: 'После бесплатного вылупления на аркадном саду.',
  },
  arcade_settle_lonely: {
    file: 'arcade_settle_lonely.mp3',
    line: 'Остров готов. Но пустой остров скучает без жителей. Нарисуй зуфика для этого сада.',
    when: 'Аркада кончена, бесплатный слот уже потрачен.',
  },
  arcade_wrong: {
    file: 'arcade_wrong.mp3',
    line: 'Не сюда. Тапни зелёную землю.',
    when: 'Тап мимо земли во время аркады.',
  },
  arcade_pause: {
    file: 'arcade_pause.mp3',
    line: 'Сад запомнили. Продолжим потом.',
    when: 'Уход с острова посреди аркады.',
  },
  arcade_resume: {
    file: 'arcade_resume.mp3',
    line: 'Мы остановились тут. Посади ещё одно.',
    when: 'Возврат в незаконченную аркаду.',
  },
  plaza_hello: {
    file: 'plaza_hello.mp3',
    line: 'Это общий зоопарк. Сюда приходят зуфики из разных садов.',
    when: 'Первый вход на общую поляну в этой сессии.',
  },
  plaza_look: {
    file: 'plaza_look.mp3',
    line: 'Поляна большая. Гуляй, куда хочешь.',
    when: 'Сразу после plaza_hello.',
  },
  plaza_friends: {
    file: 'plaza_friends.mp3',
    line: 'Тут могут быть другие зуфики. Помаши им.',
    when: 'После plaza_look, про соседей на поляне.',
  },
  plaza_walk: {
    file: 'plaza_walk.mp3',
    line: 'Кружок внизу — иди.',
    when: 'Конец входной цепочки, про ходьбу.',
  },
  plaza_jump: {
    file: 'plaza_jump.mp3',
    line: 'Стрелка вверх — прыгни.',
    when: 'Первый прыжок на поляне в этой сессии.',
  },
  plaza_emote: {
    file: 'plaza_emote.mp3',
    line: 'Кружочек справа. Покажи, что чувствуешь.',
    when: 'Первое открытие лотка эмоций.',
  },
  plaza_build: {
    file: 'plaza_build.mp3',
    line: 'Каска. Выбери деревья, домик или штуки. Что поставишь — увидят все.',
    when: 'Первое открытие каски на общей поляне.',
  },
  plaza_things: {
    file: 'plaza_things.mp3',
    line: 'Штуки.',
    when: 'Группа предметов на общей поляне.',
  },
  plaza_pick: {
    file: 'plaza_pick.mp3',
    line: 'Кого возьмём с собой?',
    when: 'Экран выбора зуфика перед поляной.',
  },
  plaza_need: {
    file: 'plaza_need.mp3',
    line: 'У тебя ещё нет зуфика для общего зоопарка. Нарисуй или сфотографируй его — тогда можно зайти.',
    when: 'Тап «Общий зоопарк», пока нет живого зуфика.',
  },
  plaza_save: {
    file: 'plaza_save.mp3',
    line: 'Поляна запомнила.',
    when: 'После «Сохранить» на общей поляне.',
  },
  plaza_home: {
    file: 'plaza_home.mp3',
    line: 'Домой. Свой сад ждёт.',
    when: 'Тап «Домой» с общей поляны.',
  },
  plaza_dig: {
    file: 'plaza_dig.mp3',
    line: 'Ломай кристалл. Вдруг внутри сюрприз.',
    when: 'Первый раз подошли к кристаллу на поляне.',
  },
  plaza_found: {
    file: 'plaza_found.mp3',
    line: 'Ура! Билетик. Можно нарисовать ещё зуфика.',
    when: 'В кристалле нашёлся кредит генерации.',
  },
  plaza_draw: {
    file: 'plaza_draw.mp3',
    line: 'Нарисуем дерево или штуку для этого зоопарка.',
    when: 'Тап «Нарисовать» в лотке «Моё» в своём зоопарке для стройки.',
  },
  plaza_toy_wait: {
    file: 'plaza_toy_wait.mp3',
    line: 'Поставь картинку на поляну. Подожди чуть-чуть — и тут будет настоящая штука.',
    when: 'Картинка штуки уже в «Моём» или в саду, а Tripo ещё лепит GLB.',
  },
  still_after_first: {
    file: 'still_after_first.mp3',
    line: 'Он ожил! Можно нарисовать ещё друзей — они появятся картинками. Оживить можно потом.',
    when: 'Один раз после первого живого зуфика на аккаунте.',
  },
  postcard_ready: {
    file: 'postcard_ready.mp3',
    line: 'Вот открытка. Нажми Оживить — станет объёмным.',
    when: 'В саду появилась объёмная открытка без GLB.',
  },
  empty_still: {
    file: 'empty_still.mp3',
    line: 'Картинки закончились. Можно оживить тех, кто уже есть, или купить ещё.',
    when: 'Тап нарисовать, когда гармонизации кончились, а 3D ещё есть.',
  },
  revive_need: {
    file: 'revive_need.mp3',
    line: 'Позовём взрослого, чтобы оживить.',
    when: 'Тап Оживить без 3D-кредита.',
  },
};

/** Speak «поставь» only when the child picks a different catalog item. */
export function isNewPlacePick(holding: string | null | undefined, next: string): boolean {
  return next.length > 0 && next !== holding;
}
