import { createContext, useContext } from 'react';

/**
 * Контекст i18n.
 * Живёт отдельно от провайдера, чтобы хук `useTranslation` можно было
 * импортировать в любых модулях (в т.ч. вне React-компонентов).
 */
export const I18nContext = createContext(null);

/**
 * Хук доступа к переводам.
 * Возвращает `{ t, tp, locale, intlLocale, meta, locales, setLocale }`.
 */
export function useTranslation() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useTranslation нужно вызывать внутри <I18nProvider>');
  }

  return context;
}
