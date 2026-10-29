import { caseTypes as legacyCaseTypes, legacyCaseOrder } from '../config/casesMeta.js';
import { themeForAccent } from './caseTheme.js';

/**
 * Каталог кейсов из bootstrap (`data.caseCatalog`).
 *
 * Сервер отдаёт кейсы из БД: `{ id, titles, texts, accent, stars, imageUrl,
 * active, sortOrder, odds }`. Здесь они превращаются в карту, совместимую с
 * `caseTypes` из конфига, поэтому все хелперы (`caseTitle`, `caseDescription`)
 * и компоненты карточки работают одинаково и для кейсов из БД, и для старых
 * шести, описанных в `src/config/casesMeta.js`.
 *
 * Стартовые тексты и картинки legacy-кейсов остаются запасным вариантом: пока
 * владелец не заполнил свои поля в админке, приложение показывает словарь и
 * встроенные PNG.
 */
export function buildCaseTypes(catalog, base = legacyCaseTypes) {
  const types = { ...base };

  for (const item of Array.isArray(catalog) ? catalog : []) {
    if (!item?.id) {
      continue;
    }

    const fallback = base[item.id] || {};

    types[item.id] = {
      ...fallback,
      ...item,
      titles: item.titles || {},
      texts: item.texts || {},
      accent: item.accent || fallback.accent || 'cyan',
      stars: Number(item.stars || 0),
      image: item.imageUrl || fallback.image || '',
      // Тема блока «Кейс дня»: сервер всегда отдаёт её; без неё берём тему по
      // акценту, поэтому даже стартовые кейсы окрашены в свой цвет.
      theme: item.theme || fallback.theme || themeForAccent(item.accent || fallback.accent),
      featured: item.featured === true,
      odds: item.odds || fallback.odds || {},
      // Состав капсулы: из него детальная страница кейса собирает слоты призов,
      // а `odds` остаётся сводкой шансов. У стартовых кейсов состава нет.
      contents: Array.isArray(item.contents) ? item.contents : (fallback.contents || []),
    };
  }

  return types;
}

/**
 * Порядок кейсов в приложении: каталог БД по `sortOrder` (как в админке), а без
 * каталога — стартовый список из конфига. Кейсы, выключенные владельцем, в
 * `caseCatalog` не приходят и в рейке не показываются.
 */
export function caseOrderFrom(catalog, fallback = legacyCaseOrder) {
  const items = (Array.isArray(catalog) ? catalog : []).filter(item => item?.id);

  if (items.length === 0) {
    return [...fallback];
  }

  return [...items]
    .sort((left, right) => (
      Number(left.sortOrder ?? 100) - Number(right.sortOrder ?? 100)
      || String(left.id).localeCompare(String(right.id))
    ))
    .map(item => item.id);
}
