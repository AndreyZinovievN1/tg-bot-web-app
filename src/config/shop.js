/**
 * Метаданные категорий маркета.
 * Подписи и описания лежат в словарях: `shop.categories.<id>.label` / `.text`,
 * поэтому при добавлении языка править этот файл не нужно.
 */
export const categoryMeta = {
  titles: { icon: 'award' },
  emojis: { icon: 'smile' },
  premium_emojis: { icon: 'diamond' },
  greetings: { icon: 'log-in' },
  buttons: { icon: 'grid' },
  replies: { icon: 'message-circle' },
  chart_skin_anime: { icon: 'image' },
  chart_skin_flags: { icon: 'flag' },
  chart_skin_games: { icon: 'play' },
  chart_skin_space: { icon: 'globe' },
  chart_skin_memes: { icon: 'meh' },
  chart_skin_other: { icon: 'layers' },
};

/** Слоты активного оформления профиля (ключи словаря `shop.activeLabels`). */
export const activeLabelKeys = ['title', 'emoji', 'reply', 'greeting', 'button', 'chart'];

export const chartSkinFiles = {
  ai: '/skins/anime/ai.jpg',
  honey_pie: '/skins/anime/honey_pie_extended.jpg',
  honey_pie_extended: '/skins/anime/honey_pie_extended.jpg',
  levi_ackerman: '/skins/anime/levi_ackerman.jpg',
  lucy: '/skins/anime/lucy.jpg',
  miku: '/skins/anime/miku.jpg',
  armenia: '/skins/flags/armenia.jpg',
  azerbaijan: '/skins/flags/azerbaijan.jpg',
  bashkortostan: '/skins/flags/bashkortostan.jpg',
  belarus: '/skins/flags/belarus.jpg',
  canada: '/skins/flags/canada.jpg',
  chechnya: '/skins/flags/chechnya.jpg',
  china: '/skins/flags/china.jpg',
  dagestan: '/skins/flags/dagestan.jpg',
  georgia: '/skins/flags/georgia.jpg',
  germany: '/skins/flags/germany.jpg',
  italy: '/skins/flags/italy.jpg',
  japan: '/skins/flags/japan.jpg',
  kazakhstan: '/skins/flags/kazakhstan.jpg',
  kyrgyzstan: '/skins/flags/kyrgyzstan.jpg',
  russia: '/skins/flags/russia.jpg',
  south_korea: '/skins/flags/south_korea.jpg',
  tajikistan: '/skins/flags/tajikistan.jpg',
  turkey: '/skins/flags/turkey.jpg',
  uk: '/skins/flags/uk.jpg',
  ukraine: '/skins/flags/ukraine.jpg',
  usa: '/skins/flags/usa.jpg',
  ussr: '/skins/flags/ussr.jpg',
  uzbekistan: '/skins/flags/uzbekistan.jpg',
  cyberpunk: '/skins/games/cyberpunk.jpg',
  paper: '/skins/other/paper.jpg',
  rog: '/skins/other/rog.jpg',
  six_seven: '/skins/other/six_seven.jpg',
  synthwave: '/skins/other/synthwave.jpg',
};

/**
 * Палитра неонового кольца вокруг аватарки — свой набор на каждую «Графику».
 *
 * Ключи совпадают с `chartSkinFiles`, три цвета идут по кругу
 * (`conic-gradient`: старт → середина → третий стоп → снова старт), поэтому
 * подобраны вручную под палитру самой картинки: у флагов — цвета флага, у
 * аниме — цвета персонажа, у неона — его акценты.
 *
 * Добавляешь новую графику: файл в `chartSkinFiles` + три цвета сюда.
 * Пока ключа нет, кольцо светится базовой гаммой темы (`--accent`/`--pink`/
 * `--ice`), так что новый скин не ломается — но своей палитры не получает.
 */
export const chartRingPalettes = {
  // аниме
  ai: ['#ff2d95', '#ffd166', '#8b5cff'],
  honey_pie: ['#ff6fae', '#ffe0ef', '#c95b8c'],
  honey_pie_extended: ['#ff6fae', '#ffe0ef', '#c95b8c'],
  levi_ackerman: ['#ff1025', '#f5f5f5', '#8c0a14'],
  lucy: ['#fcee0a', '#9dfbff', '#3f5d78'],
  miku: ['#39c5bb', '#ff007f', '#d8fffb'],
  // флаги
  armenia: ['#d32f2f', '#f57c00', '#3949ab'],
  azerbaijan: ['#29b6e6', '#e53935', '#18b857'],
  bashkortostan: ['#1e88ff', '#ffd700', '#11aa44'],
  belarus: ['#d6001c', '#ffffff', '#008c45'],
  canada: ['#ff2b2b', '#ffffff', '#ff8f8f'],
  chechnya: ['#1faa59', '#ffffff', '#ff2b2b'],
  china: ['#ffd700', '#ff2b2b', '#ffe79a'],
  dagestan: ['#1e88e5', '#e53935', '#43a047'],
  georgia: ['#ff2b2b', '#ffffff', '#ff8a8a'],
  germany: ['#ffcc00', '#ff3b30', '#d0d0d0'],
  italy: ['#009246', '#ffffff', '#ce2b37'],
  japan: ['#ff3b30', '#ffffff', '#ff9a94'],
  kazakhstan: ['#00afca', '#f4c20d', '#7ad7e8'],
  kyrgyzstan: ['#e53935', '#ffca28', '#ffd54f'],
  russia: ['#3d5aa9', '#ffffff', '#d54432'],
  south_korea: ['#e53935', '#1e5eff', '#ffffff'],
  tajikistan: ['#d61f26', '#1f9d3a', '#f2c94c'],
  turkey: ['#ff2b2b', '#ffffff', '#ff8b8b'],
  uk: ['#ff3b30', '#1f5eff', '#ffffff'],
  ukraine: ['#ffd500', '#1976d2', '#fff3a8'],
  usa: ['#e53935', '#ffffff', '#2f5fb3'],
  ussr: ['#d50000', '#ffcc00', '#ff5252'],
  uzbekistan: ['#00a3c7', '#27ae60', '#ff4d4f'],
  // игры и прочее
  cyberpunk: ['#00ff9f', '#ff007f', '#3de1ff'],
  paper: ['#3b4d61', '#0056b3', '#e8e1d3'],
  rog: ['#00dbff', '#ff003c', '#7a0018'],
  six_seven: ['#22dfff', '#ffffff', '#0b7a8c'],
  synthwave: ['#ff007f', '#00f3ff', '#bc13fe'],
};
