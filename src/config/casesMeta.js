import bearImage from '../imgs/bear.png';
import homelessImage from '../imgs/homeless.png';
import marchImage from '../imgs/march_8th.png';
import premiumImage from '../imgs/premium.png';
import springImage from '../imgs/spring.png';
import standardImage from '../imgs/standard.png';
import unusualImage from '../imgs/unusual.png';

/**
 * Кейсы.
 *
 * Сейчас кейсы живут в БД (`mini_app_cases`) и правятся в админке: каталог
 * приходит в bootstrap как `data.caseCatalog` и раскладывается в карту
 * `src/utils/caseCatalog.js`. Описанные здесь шесть кейсов — стартовый набор:
 * их id совпадают с колонками `case_balances` (их читает бот), поэтому порядок
 * и картинки остаются запасным вариантом, пока владелец не заполнит свои поля.
 *
 * Тексты (`titleKey/shortKey/textKey`) берутся из словаря только тогда, когда в
 * БД для кейса нет своего названия (см. `src/utils/caseText.js`).
 */
export const caseTypes = {
  homeless: {
    titleKey: 'cases.types.homeless.title',
    shortKey: 'cases.types.homeless.short',
    textKey: 'cases.types.homeless.text',
    image: homelessImage,
    accent: 'amber',
    theme: { mode: 'gradient', from: 'amber', to: 'gold' },
    stars: 25,
    odds: { coins: 65, starcoins: 24, shopItem: 7, vip: 3.2, gift: 0.8 },
  },
  standard: {
    titleKey: 'cases.types.standard.title',
    shortKey: 'cases.types.standard.short',
    textKey: 'cases.types.standard.text',
    image: standardImage,
    accent: 'cyan',
    theme: { mode: 'gradient', from: 'ice', to: 'indigo' },
    stars: 65,
    odds: { coins: 60, starcoins: 25, shopItem: 9, vip: 5, gift: 1 },
  },
  unusual: {
    titleKey: 'cases.types.unusual.title',
    shortKey: 'cases.types.unusual.short',
    textKey: 'cases.types.unusual.text',
    image: unusualImage,
    accent: 'violet',
    theme: { mode: 'gradient', from: 'accent', to: 'indigo' },
    stars: 120,
    odds: { coins: 56, starcoins: 27, shopItem: 10, vip: 5.7, gift: 1.3 },
  },
  premium: {
    titleKey: 'cases.types.premium.title',
    shortKey: 'cases.types.premium.short',
    textKey: 'cases.types.premium.text',
    image: premiumImage,
    accent: 'pink',
    theme: { mode: 'gradient', from: 'pink', to: 'accent-2' },
    stars: 240,
    odds: { coins: 52, starcoins: 28, shopItem: 10, vip: 8.2, gift: 1.8 },
  },
  spring: {
    titleKey: 'cases.types.spring.title',
    shortKey: 'cases.types.spring.short',
    textKey: 'cases.types.spring.text',
    image: springImage,
    accent: 'green',
    theme: { mode: 'gradient', from: 'green', to: 'ice' },
    stars: 95,
    odds: { coins: 58, starcoins: 26, shopItem: 9, vip: 5.8, gift: 1.2 },
  },
  march_8th: {
    titleKey: 'cases.types.march_8th.title',
    shortKey: 'cases.types.march_8th.short',
    textKey: 'cases.types.march_8th.text',
    image: marchImage,
    accent: 'pink',
    theme: { mode: 'gradient', from: 'pink', to: 'accent' },
    stars: 110,
    odds: { coins: 57, starcoins: 26, shopItem: 9, vip: 6.6, gift: 1.4 },
  },
};

export const giftTypes = {
  bear: {
    titleKey: 'cases.giftTypes.bear',
    image: bearImage,
  },
};

/**
 * Акценты карточки кейса: класс `loot-card--<accent>`. Список дублирует сервер
 * (`caseAccents` в server/casesApi.js) — при изменении правь оба места.
 */
export const caseAccents = ['amber', 'cyan', 'violet', 'pink', 'green'];

/** Стартовые шесть кейсов: их балансы лежат в колонках `case_balances`. */
export const legacyCaseOrder = ['homeless', 'standard', 'unusual', 'premium', 'spring', 'march_8th'];

/** Сколько строк наполнения можно повесить на один кейс (дубль сервера). */
export const caseContentLimit = 24;

/**
 * Лимит картинки в символах data-URL: сервер принимает до 400 000 символов
 * (`caseImageMax`), клиент ужимает PNG примерно до 300 КБ.
 */
export const caseImageLimit = 380000;

/**
 * Тот же лимит в килобайтах: в редакторе владельцу показываем «PNG до N КБ», а
 * не длину data-URL в символах.
 */
export const caseImageLimitKb = Math.floor(caseImageLimit / 1024);

/**
 * Типы призов внутри кейса — та же таблица, что `caseContentCatalog` на сервере.
 * Нужна редактору как запасной вариант, если каталог админки не загрузился:
 * `amount` — диапазон количества, `unit` — единица для подписи, `item` — выбор
 * предмета из маркета (скины графика), `gift` — подарок Telegram (строка хранит
 * `giftId`), `implemented: false` — заготовка.
 */
export const caseFallbackContentTypes = [
  { type: 'coins', implemented: true, amount: true, maxAmount: 1000000 },
  { type: 'starcoins', implemented: true, amount: true, maxAmount: 100000 },
  { type: 'vip', implemented: true, amount: true, maxAmount: 365, unit: 'days' },
  { type: 'shop_item', implemented: true, amount: false },
  { type: 'chart_skin', implemented: true, amount: false, item: true },
  { type: 'gift', implemented: true, amount: false, gift: true },
  { type: 'tg_gift', implemented: false },
  { type: 'nft', implemented: false },
];

/**
 * Иконки призов кейса: понятный эмодзи вместо типографских символов.
 * Используются в редакторе наполнения и в списке кейсов админки.
 */
export const caseContentVisuals = {
  coins: '🪙',
  starcoins: '🪐',
  vip: '⭐',
  shop_item: '💎',
  chart_skin: '🎨',
  gift: '🎁',
  tg_gift: '✈️',
  nft: '🖼️',
};

/**
 * Вехи дня: за какой объём XP выдаётся подарочный кейс.
 * Пороги дублируются на сервере (`missionMilestones` в server/index.js) — при
 * изменении правь оба места. Максимум XP за день = 1000 (сумма всех ежедневных
 * заданий), поэтому последняя веха стоит ровно в конце шкалы дня.
 * `quantity` — сколько кейсов выдаётся за веху.
 */
export const missionMilestones = [
  { xp: 250, caseType: 'homeless', quantity: 1 },
  { xp: 500, caseType: 'homeless', quantity: 2 },
  { xp: 750, caseType: 'standard', quantity: 1 },
  { xp: 1000, caseType: 'unusual', quantity: 1 },
];

/** Сколько XP можно собрать за день (нужно для шкалы прогресса). */
export const missionDailyXpGoal = 1000;


/**
 * Иконки наград: понятные эмодзи вместо типографских символов (◍ ♄ ◆ ✦ ◇).
 * `tone` красит иконку в истории открытий, `tier` — уровень редкости: от него
 * зависит анимация выпадения в `CaseWheelModal`.
 */
export const rewardVisuals = {
  coins: { labelKey: 'cases.rewards.coins', icon: '🪙', tone: 'amber', tier: 'common' },
  starcoins: { labelKey: 'cases.rewards.starcoins', icon: '🪐', tone: 'cyan', tier: 'uncommon' },
  shop_item: { labelKey: 'cases.rewards.shop_item', icon: '💎', tone: 'violet', tier: 'rare' },
  chart_skin: { labelKey: 'cases.rewards.chart_skin', icon: '🎨', tone: 'violet', tier: 'rare' },
  vip: { labelKey: 'cases.rewards.vip', icon: '⭐', tone: 'pink', tier: 'epic' },
  gift: { labelKey: 'cases.rewards.gift', icon: '🎁', tone: 'green', tier: 'legendary' },
  // Подарок Telegram и NFT пока не выдаются (в наполнении это заготовки), но
  // подписи нужны: скин графика и подарок могут прийти из старых записей.
  tg_gift: { labelKey: 'cases.rewards.tg_gift', icon: '✈️', tone: 'cyan', tier: 'epic' },
  nft: { labelKey: 'cases.rewards.nft', icon: '🖼️', tone: 'pink', tier: 'legendary' },
};

/**
 * Уровни редкости награды: чем реже дроп, тем громче его выпадение.
 * `sparks` — сколько искр разлетается в момент выдачи (позиции считает
 * `CaseWheelModal` детерминированно, без случайности). Цвет уровня живёт в CSS
 * классами `.tier-*` (там же собраны лучи, волны и вспышка), поэтому палитра
 * берётся из `src/theme/colors.js`, а не дублируется здесь.
 */
export const rewardRarities = {
  common: { labelKey: 'cases.rarity.common', sparks: 8 },
  uncommon: { labelKey: 'cases.rarity.uncommon', sparks: 12 },
  rare: { labelKey: 'cases.rarity.rare', sparks: 18 },
  epic: { labelKey: 'cases.rarity.epic', sparks: 24 },
  legendary: { labelKey: 'cases.rarity.legendary', sparks: 32 },
};
