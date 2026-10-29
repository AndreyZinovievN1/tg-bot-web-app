import {
  defaultLocale,
  dictionaries,
  intlLocale,
  localeMeta,
  normalizeLocale,
  supportedLocales,
} from './locales/index.js';

/**
 * Ядро i18n: не зависит от React.
 *
 * - `t(key, params)` — получить перевод с подстановками `{name}`.
 * - `tp(key, count, params)` — перевод с числительными
 *   (ключи вида `key_one/key_few/key_many/key_other`).
 * - `setLocale(code)` — переключение языка (сохраняется в localStorage).
 *
 * Определение языка при старте:
 *   1. явный выбор пользователя в приложении (localStorage);
 *   2. язык Telegram-клиента (`language_code`);
 *   3. язык пользователя из БД бота (`users.lang`, приходит в bootstrap);
 *   4. язык браузера;
 *   5. `defaultLocale`.
 */

const STORAGE_KEY = 'space.lang';

const listeners = new Set();
const pluralRules = new Map();
const missingKeyWarnings = new Set();

let storedLocale = readStoredLocale();
let currentLocale = storedLocale || detectFromEnvironment();

function readStoredLocale() {
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredLocale(locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Приватный режим или отключённое хранилище — просто не запоминаем выбор.
  }
}

function clearStoredLocale() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // см. writeStoredLocale
  }
}

/** Язык Telegram-клиента или браузера. */
export function detectFromEnvironment() {
  return (
    normalizeLocale(readTelegramLanguageCode()) ||
    normalizeLocale(readBrowserLanguage()) ||
    defaultLocale
  );
}

function readTelegramLanguageCode() {
  try {
    return window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || '';
  } catch {
    return '';
  }
}

function readBrowserLanguage() {
  if (typeof navigator === 'undefined') {
    return '';
  }

  return navigator.languages?.[0] || navigator.language || '';
}

export function getLocale() {
  return currentLocale;
}

export function getIntlLocale() {
  return intlLocale(currentLocale);
}

export function getSupportedLocales() {
  return [...supportedLocales];
}

export function getLocaleMeta(code = currentLocale) {
  return localeMeta[code] || localeMeta[defaultLocale];
}

/** Есть ли явный выбор пользователя (переключал язык вручную). */
export function hasExplicitLocale() {
  return Boolean(storedLocale);
}

export function subscribe(listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function setLocale(locale, { persist = true } = {}) {
  const next = normalizeLocale(locale) || defaultLocale;
  const persistChanged = Boolean(persist) !== Boolean(storedLocale);

  if (persist) {
    storedLocale = next;
    writeStoredLocale(next);
  }

  if (next === currentLocale && !persistChanged) {
    return currentLocale;
  }

  currentLocale = next;
  applyDocumentLang();
  listeners.forEach(listener => listener(currentLocale));

  return currentLocale;
}

/**
 * Синхронизация с языком пользователя из БД бота.
 * Явный выбор языка в приложении всегда приоритетнее.
 */
export function syncLocaleFromUser(userLang) {
  if (hasExplicitLocale()) {
    return currentLocale;
  }

  const normalized = normalizeLocale(userLang);

  if (!normalized || normalized === currentLocale) {
    return currentLocale;
  }

  currentLocale = normalized;
  applyDocumentLang();
  listeners.forEach(listener => listener(currentLocale));

  return currentLocale;
}

/** Сброс на автоопределение (возвращает язык Telegram/браузера). */
export function resetLocale() {
  clearStoredLocale();
  storedLocale = null;
  return setLocale(detectFromEnvironment(), { persist: false });
}

/** Значение по ключу `a.b.c` для конкретной локали (или undefined). */
function resolveValue(locale, key) {
  if (!key) {
    return undefined;
  }

  const dictionary = dictionaries[locale];

  if (!dictionary) {
    return undefined;
  }

  return String(key)
    .split('.')
    .reduce(
      (accumulator, part) => (accumulator && typeof accumulator === 'object' ? accumulator[part] : undefined),
      dictionary,
    );
}

function interpolate(template, params) {
  if (typeof template !== 'string' || !params) {
    return template;
  }

  return template.replaceAll(/\{(\w+)\}/g, (match, name) => (
    params[name] === undefined || params[name] === null ? match : String(params[name])
  ));
}

function warnMissingKey(key) {
  if (!key || missingKeyWarnings.has(key)) {
    return;
  }

  missingKeyWarnings.add(key);

  if (import.meta.env?.DEV) {
    console.warn(`[i18n] Нет перевода для ключа «${key}» (${currentLocale}).`);
  }
}

/** Перевод по ключу. Если ключа нет — берётся базовый язык, затем сам ключ. */
export function t(key, params) {
  const value = resolveValue(currentLocale, key) ?? resolveValue(defaultLocale, key);

  if (value === undefined) {
    warnMissingKey(key);
    return key;
  }

  return interpolate(value, params);
}

function pluralRule(count) {
  const locale = getIntlLocale();

  if (!pluralRules.has(locale)) {
    pluralRules.set(locale, new Intl.PluralRules(locale));
  }

  return pluralRules.get(locale).select(Number(count) || 0);
}

/** Перевод с числительными: ключ + суффикс `_one/_few/_many/_other`. */
export function tp(key, count, params) {
  const amount = Number(count) || 0;
  const rule = pluralRule(amount);
  const value =
    resolveValue(currentLocale, `${key}_${rule}`) ??
    resolveValue(defaultLocale, `${key}_${rule}`) ??
    resolveValue(currentLocale, `${key}_other`) ??
    resolveValue(defaultLocale, `${key}_other`);

  if (value === undefined) {
    warnMissingKey(`${key}_${rule}`);
    return t(key, { ...params, count: amount });
  }

  return interpolate(value, { ...params, count: amount });
}

/** Форматирование чисел/дат с учётом выбранной локали. */
export function localeNumberFormat(options) {
  return new Intl.NumberFormat(getIntlLocale(), options);
}

export function localeDateTimeFormat(options) {
  return new Intl.DateTimeFormat(getIntlLocale(), options);
}

/**
 * Проверка полноты словарей (только в dev-режиме).
 * Помогает не забыть ключи при добавлении нового языка.
 */
export function validateDictionaries() {
  if (!import.meta.env?.DEV) {
    return {};
  }

  const baseKeys = collectKeys(dictionaries[defaultLocale]);
  const report = {};

  supportedLocales.forEach(code => {
    if (code === defaultLocale) {
      return;
    }

    const keys = collectKeys(dictionaries[code]);
    const missing = baseKeys.filter(key => !keys.includes(key));
    const extra = keys.filter(key => !baseKeys.includes(key));

    if (missing.length || extra.length) {
      report[code] = { missing, extra };
      console.warn(
        `[i18n] Локаль «${code}»: не хватает ${missing.length} ключей, лишних ${extra.length}.`,
        { missing, extra },
      );
    }
  });

  return report;
}

function collectKeys(source, prefix = '') {
  return Object.entries(source || {}).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object') {
      return collectKeys(value, path);
    }

    return path;
  });
}

export function applyDocumentLang() {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.lang = currentLocale;
}

// Применяем язык к атрибуту <html lang> сразу при загрузке модуля.
applyDocumentLang();
