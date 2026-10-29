import ru from './ru.js';
import uk from './uk.js';
import en from './en.js';

/**
 * Реестр локалей.
 *
 * Чтобы добавить новый язык:
 *   1. создай рядом файл словаря (например `de.js`) с той же структурой ключей;
 *   2. импортируй его и добавь запись в `dictionaries` и `localeMeta`.
 * Больше нигде в приложении править ничего не нужно: переключатель языка,
 * форматирование чисел/дат и определение языка по Telegram подтянутся сами.
 *
 * `aliases` — префиксы, которые считаются этим языком при автоопределении
 * (значения Telegram `language_code`, браузера или колонки `users.lang` бота).
 */
export const localeMeta = {
  ru: {
    code: 'ru',
    label: 'Русский',
    short: 'RU',
    flag: '🇷🇺',
    intl: 'ru-RU',
    aliases: ['ru', 'be', 'kk', 'ky', 'uz', 'hy', 'ka', 'az'],
  },
  uk: {
    code: 'uk',
    label: 'Українська',
    short: 'UK',
    flag: '🇺🇦',
    intl: 'uk-UA',
    aliases: ['uk', 'ua'],
  },
  en: {
    code: 'en',
    label: 'English',
    short: 'EN',
    flag: '🇬🇧',
    intl: 'en-US',
    aliases: ['en'],
  },
};

export const dictionaries = { ru, uk, en };

export const supportedLocales = Object.keys(localeMeta);

export const defaultLocale = 'ru';

export function isSupportedLocale(value) {
  return typeof value === 'string' && supportedLocales.includes(value);
}

/** 'uk-UA' | 'UK' | 'en_GB' | 'ua' → 'uk' | 'uk' | 'en' | 'uk' */
export function normalizeLocale(value) {
  if (!value) {
    return null;
  }

  const base = String(value).trim().toLowerCase().replaceAll('_', '-').split('-')[0];

  if (isSupportedLocale(base)) {
    return base;
  }

  return supportedLocales.find(code => localeMeta[code].aliases.includes(base)) || null;
}

export function intlLocale(code) {
  return localeMeta[code]?.intl || localeMeta[defaultLocale].intl;
}

export function localeLabel(code) {
  return localeMeta[code]?.label || code;
}
