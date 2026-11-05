import { rewardVisuals } from '../config/casesMeta.js';
import { formatNumber } from './formatters.js';
import { giftIdText } from './giftCatalog.js';

/**
 * Слоты призов кейса — общий разбор наполнения для экрана детали.
 *
 * Кейс из БД отдаёт `contents` (`{ id, type, weight, min, max, itemId, giftId }`)
 * вместе с готовой сводкой шансов `odds` (`type:itemId` → проценты). Стартовые
 * шесть кейсов из `src/config/casesMeta.js` живут без наполнения — только с
 * `odds`, где ключ это тип (`{ coins: 65, starItems: … }`). Оба варианта
 * превращаются в один список слотов, поэтому детальная страница не знает, из
 * чего собран кейс.
 */

/** Старые ключи шансов из конфига против типов наполнения в БД. */
const prizeTypeAliases = {
  shopItem: 'shop_item',
  chartSkin: 'chart_skin',
  tgGift: 'tg_gift',
};

/** Тип приза в каноническом виде (`shopItem` из конфига → `shop_item`). */
export function prizeType(type) {
  const key = String(type || '').trim();

  return prizeTypeAliases[key] || key;
}

/** Оформление приза из конфига наград: иконка, тон и ключ подписи. */
export function prizeVisual(type) {
  return rewardVisuals[prizeType(type)] || rewardVisuals.coins;
}

/** Do not compare different currencies. Equal tiers are grouped by reward type. */
export function orderCaseDrops(drops, best, gifts = []) {
  const ranks = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const rows = (Array.isArray(drops) ? drops : []).filter(row => row && !row.demo)
    .map(row => ({ ...row, type: prizeType(row.type) }));
  if (!best) return rows;
  const value = row => row.type === 'gift'
    ? Number(findGift(gifts, row.giftId)?.stars || 0)
    : Number(row.amount || row.days || 0);
  return rows.sort((a, b) =>
    ranks.indexOf(rewardVisuals[b.type]?.tier) - ranks.indexOf(rewardVisuals[a.type]?.tier)
    || a.type.localeCompare(b.type)
    || value(b) - value(a));
}

/** Local simulation only: same thousandth weights as the server, no economy calls. */
export function sampleDemoReward(meta, random = Math.random) {
  const pool = (Array.isArray(meta?.contents) ? meta.contents : []).map(row => ({
    row, weight: Math.max(0, Math.round(Number(row.weight || 0) * 1000)),
  })).filter(item => Number.isFinite(item.weight) && item.weight > 0);
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return null;
  let roll = Math.floor(random() * total);
  const row = pool.find(item => { roll -= item.weight; return roll < 0; })?.row;
  if (!row) return null;
  const defaults = { coins: [100, 500], starcoins: [5, 25], vip: [1, 3] };
  const range = defaults[row.type];
  const payload = {};
  if (range) {
    const min = Math.max(0, Math.round(Number(row.min ?? range[0])));
    const max = Math.max(min, Math.round(Number(row.max ?? range[1])));
    const amount = min + Math.floor(random() * (max - min + 1));
    payload[row.type === 'vip' ? 'days' : 'amount'] = row.type === 'vip' ? Math.max(1, amount) : amount;
  }
  return { type: row.type, giftId: row.giftId, giftKind: row.giftKind,
    giftNum: row.giftNum, payload, demo: true };
}

/** Целое количество приза (0 — у типа нет числа: предмет, скин, подарок). */
function prizeAmount(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

/** Шанс строки: сводка `odds` с сервера, а без неё — доля веса от суммы весов. */
function rowChance(odds, row, totalWeight) {
  const direct = Number(odds[`${row?.type}:${row?.itemId || row?.id || ''}`]);

  if (Number.isFinite(direct)) {
    return direct;
  }

  const weight = Math.max(0, Number(row?.weight || 0));

  return totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
}

/**
 * Слоты призов кейса в порядке наполнения. У строки из БД сохраняются
 * количество, `giftId` (конкретный подарок Telegram) и шанс.
 */
export function buildCasePrizes(meta) {
  const contents = Array.isArray(meta?.contents) ? meta.contents : [];
  const odds = meta?.odds && typeof meta.odds === 'object' ? meta.odds : {};

  if (contents.length === 0) {
    return Object.entries(odds).map(([key, chance]) => ({
      key,
      type: prizeType(key.split(':')[0]),
      min: 0,
      max: 0,
      giftId: '',
      chance: Number(chance) || 0,
    }));
  }

  const totalWeight = contents.reduce((sum, row) => sum + Math.max(0, Number(row?.weight || 0)), 0);

  return contents.map((row, index) => ({
    key: `${row?.id || row?.type || 'row'}-${index}`,
    type: prizeType(row?.type),
    min: prizeAmount(row?.min),
    max: prizeAmount(row?.max),
    // Id подарка — строка цифр: девятнадцать знаков число не переживает, а по нему
    // ищется анимация (`giftIdText` в `src/utils/giftCatalog.js`).
    giftId: giftIdText(row?.giftId),
    // Уникальный подарок (взят с аккаунта юзербота): слот показывает его модель и
    // номер, а в каталоге Telegram такого экземпляра нет.
    giftKind: row?.giftKind === 'unique' ? 'unique' : '',
    giftNum: Math.max(0, Math.trunc(Number(row?.giftNum) || 0)),
    chance: rowChance(odds, row, totalWeight),
  }));
}

/**
 * Количество приза для слота: диапазон («150–900»), дни VIP («7 дн.») или
 * пустая строка у типов без числа. `tp` — plural-хелпер из i18n.
 */
export function prizeAmountText(prize, tp) {
  const { min, max } = prize;

  if (prize.type === 'vip' && (min || max)) {
    return tp('cases.days', max || min);
  }

  if (!min && !max) {
    return '';
  }

  if (max > min && min > 0) {
    return `${formatNumber(min)}–${formatNumber(max)}`;
  }

  return formatNumber(max || min);
}

/** Шанс для подписи слота: целые без хвоста, дробные — до одного знака. */
export function prizeChanceText(chance) {
  const value = Number(chance) || 0;

  if (value >= 10) {
    return String(Math.round(value));
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Подарок из каталога юзербота по id: `null`, если каталога нет или он неизвестен. */
export function findGift(gifts, giftId) {
  const id = giftIdText(giftId);

  if (!id || !Array.isArray(gifts)) {
    return null;
  }

  return gifts.find(item => giftIdText(item) === id) || null;
}
