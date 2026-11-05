import { categoryMeta, chartRingPalettes, chartSkinFiles } from '../config/shop.js';
import { t } from '../i18n/index.js';

export function getAvatarText(user, activeItems) {
  const activeEmoji = activeItems?.emoji;

  if (activeEmoji?.text_m && [...activeEmoji.text_m].length <= 3) {
    return activeEmoji.text_m;
  }

  return (user?.name || 'S').trim().slice(0, 1).toUpperCase();
}

/**
 * `custom_emoji_id` премиум-эмодзи Telegram лежит в `text_m` товара
 * (бот подставляет его же в `<tg-emoji emoji-id>`, см. `inventory.py`).
 * Обычные `emojis` хранят в `text_m` сам символ — их сюда не передаём.
 */
export function premiumEmojiId(item) {
  if (item?.category !== 'premium_emojis') {
    return '';
  }

  const id = String(item.text_m || item.text_f || '').trim();

  return /^\d{4,}$/.test(id) ? id : '';
}

export function itemName(item) {
  if (!item) {
    return t('shopItems.itemFallback');
  }

  if (item.category === 'premium_emojis') {
    // Если в `text_f` лежит короткая подпись (символ-заменитель или имя набора),
    // показываем её вместо технического номера товара.
    const label = String(item.text_f || '').trim();

    if (label && !/^\d+$/.test(label) && [...label].length <= 8) {
      return label;
    }

    return t('shopItems.premiumEmojiNumber', { id: item.id });
  }

  return item.text_m || item.text_f || t('shopItems.itemNumber', { id: item.id || t('shopItems.unknownId') });
}

export function previewText(item) {
  const name = itemName(item).trim();

  if (item.category === 'buttons') {
    return name.slice(0, 2);
  }

  if (item.category === 'emojis' && [...name].length <= 4) {
    return name;
  }

  return name.slice(0, 1).toUpperCase();
}

export function categoryLabel(category) {
  if (categoryMeta[category]) {
    return t(`shop.categories.${category}.label`);
  }

  return category ? String(category).replaceAll('_', ' ') : t('shop.categoryFallback');
}

export function categoryIcon(category) {
  return categoryMeta[category]?.icon || 'box';
}

export function categoryText(category) {
  return categoryMeta[category] ? t(`shop.categories.${category}.text`) : categoryLabel(category);
}

export function getChartSkinUrl(item) {
  if (!item?.category?.startsWith('chart_skin_')) {
    return '';
  }

  return chartSkinFiles[chartSkinKey(item)] || '';
}

/**
 * Три цвета неонового кольца для активной «Графики» из `chartRingPalettes`.
 * Пустой массив — для этого скина цвета ещё не прописаны вручную, и кольцо
 * остаётся в базовой гамме темы (см. `--ring-*` в styles.css).
 */
export function getChartRingPalette(item) {
  if (!item?.category?.startsWith('chart_skin_')) {
    return [];
  }

  return chartRingPalettes[chartSkinKey(item)] || [];
}

/** `text_f`/`text_m` из shop_items → ключ `chartSkinFiles`/`chartRingPalettes`. */
function chartSkinKey(item) {
  return String(item.text_f || item.text_m || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function compareCategories(left, right) {
  const order = [
    'buttons',
    'titles',
    'emojis',
    'premium_emojis',
    'greetings',
    'replies',
    'chart_skin_anime',
    'chart_skin_flags',
    'chart_skin_games',
    'chart_skin_space',
    'chart_skin_memes',
    'chart_skin_other',
  ];

  return categoryIndex(left, order) - categoryIndex(right, order);
}

export function isEquippable(category) {
  return (
    category in categoryMeta &&
    (['titles', 'emojis', 'premium_emojis', 'replies', 'greetings', 'buttons'].includes(category) ||
      category.startsWith('chart_skin_'))
  );
}

function categoryIndex(category, order) {
  const index = order.indexOf(category);
  return index === -1 ? 999 : index;
}
