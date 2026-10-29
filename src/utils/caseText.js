import { getLocale, t } from '../i18n/index.js';

/**
 * Хелперы для текстов кейсов и наград.
 *
 * Название и описание кейса может лежать в двух местах:
 *   1) в БД (`titles`/`texts` по языкам) — их заполняет владелец в админке;
 *   2) в словаре приложения — ключи `titleKey/shortKey/textKey` конфига для
 *      стартовых шести кейсов.
 *
 * Поэтому тексты сначала берутся из БД (язык интерфейса → русский → любой
 * заполненный), а словарь остаётся запасным вариантом.
 */

/** Текст из БД для текущего языка, с откатом на русский и первый заполненный. */
function storedText(value) {
  const source = value && typeof value === 'object' ? value : {};
  const locale = getLocale();
  const text = source[locale] || source.ru || Object.values(source).find(item => String(item || '').trim());

  return String(text || '').trim();
}

export function caseTitle(cases, caseType) {
  const meta = cases?.[caseType];

  if (!meta) {
    return String(caseType || '');
  }

  return storedText(meta.titles) || (meta.titleKey ? t(meta.titleKey) : '') || String(caseType);
}

export function caseShortTitle(cases, caseType) {
  const meta = cases?.[caseType];

  if (!meta) {
    return String(caseType || '');
  }

  // Кейс из админки: коротким именем становится название владельца — в журнале
  // открытий игрок должен узнавать тот же кейс, что и в рейке.
  return storedText(meta.titles) || (meta.shortKey ? t(meta.shortKey) : '') || caseTitle(cases, caseType);
}

export function caseDescription(cases, caseType) {
  const meta = cases?.[caseType];

  if (!meta) {
    return '';
  }

  return storedText(meta.texts) || (meta.textKey ? t(meta.textKey) : '');
}

/**
 * Сколько всего кейсов лежит у пользователя (сумма по всем типам).
 * `cases` приходит из bootstrap как `{ homeless: 1, standard: 0, ... }`.
 */
export function totalCaseBalance(cases) {
  if (!cases || typeof cases !== 'object') {
    return 0;
  }

  return Object.values(cases).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function giftTitle(gifts, code) {
  const meta = gifts?.[code];

  return meta?.titleKey ? t(meta.titleKey) : String(code || '');
}

export function rewardLabel(visuals, type) {
  const meta = visuals?.[type];

  return meta?.labelKey ? t(meta.labelKey) : t('cases.rewardLabelFallback');
}

