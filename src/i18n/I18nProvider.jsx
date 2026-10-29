import { useCallback, useEffect, useMemo, useState } from 'react';
import { I18nContext } from './I18nContext.js';
import {
  getIntlLocale,
  getLocale,
  getLocaleMeta,
  getSupportedLocales,
  setLocale as setI18nLocale,
  subscribe,
  t as translate,
  tp as translatePlural,
  validateDictionaries,
} from './index.js';
import { localeMeta } from './locales/index.js';

/**
 * Провайдер i18n. Оборачивает приложение и перерисовывает его при смене языка,
 * поэтому перевод подхватывается мгновенно, без перезагрузки страницы.
 */
export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(getLocale);

  useEffect(() => subscribe(setLocaleState), []);

  // В dev-режиме сразу видно, каких ключей не хватает в словарях.
  useEffect(() => {
    validateDictionaries();
  }, []);

  const setLocale = useCallback(code => setI18nLocale(code), []);

  const value = useMemo(() => ({
    locale,
    intlLocale: getIntlLocale(),
    meta: getLocaleMeta(locale),
    locales: getSupportedLocales().map(code => localeMeta[code]),
    setLocale,
    t: translate,
    tp: translatePlural,
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export default I18nProvider;
