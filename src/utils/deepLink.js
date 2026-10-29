import { docsTopicIds } from '../config/docs.js';

/**
 * Дип-линки Mini App из бота.
 *
 * Поддерживаются оба варианта кнопки «Документация» из меню /help:
 * - `https://ispacerobot.space/?tab=docs&topic=shop` — web_app-кнопка в личке,
 *   параметры видны в `window.location.search`;
 * - `https://t.me/iSpaceRobot?startapp=docs` — ссылка в группах, где
 *   web_app-кнопки запрещены, параметр приходит как `initDataUnsafe.start_param`
 *   (или в адресе, если Telegram передал его в строке запроса).
 *
 * Тема (`topic`) не обязательна: без неё открывается полный список статей.
 */
export function readDocsDeepLink(search = window.location.search, startParam = '') {
  const params = new URLSearchParams(search || '');
  const tab = String(params.get('tab') || '').toLowerCase();
  const start = String(params.get('startapp') || startParam || '').toLowerCase();
  const wantsDocs = tab === 'docs' || start === 'docs' || start.startsWith('docs_');

  if (!wantsDocs) {
    return { tab: '', topic: '' };
  }

  const topic = String(params.get('topic') || start.split('_')[1] || '').toLowerCase();

  return { tab: 'docs', topic: docsTopicIds.includes(topic) ? topic : '' };
}

/** Стартовый параметр Mini App, который передал Telegram. */
function telegramStartParam() {
  return window.Telegram?.WebApp?.initDataUnsafe?.start_param || '';
}

/** Вкладка, с которой открывается Mini App (по умолчанию — «Кейсы»). */
export function readInitialTab() {
  return readDocsDeepLink(window.location.search, telegramStartParam()).tab || 'cases';
}

/** Раздел документации из дип-линка; пустая строка — полный список статей. */
export function readInitialDocsTopic() {
  return readDocsDeepLink(window.location.search, telegramStartParam()).topic;
}
