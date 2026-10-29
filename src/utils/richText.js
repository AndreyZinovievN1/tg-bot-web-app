/**
 * Мини-разметка текстовых блоков документации.
 *
 * Поддерживается:
 *   **жирный**   *курсив*   __подчёркнутый__   ~~зачёркнутый~~
 *   `код`        [ссылка](https://…)
 *
 * Разметка хранится в виде простого текста, а не HTML — так её невозможно
 * «сломать» в редакторе и невозможно подсунуть опасную разметку в статью.
 */

const TOKEN_SOURCE = [
  '\\*\\*(?:(?!\\*\\*)[^\\n])+\\*\\*',
  '__(?:(?!__)[^\\n])+__',
  '~~(?:(?!~~)[^\\n])+~~',
  '\\*(?:(?!\\*)[^\\n])+\\*',
  '`[^`\\n]+`',
  '\\[[^\\]\\n]+\\]\\(\\S+?\\)',
].join('|');

const TOKEN_REGEX = new RegExp(TOKEN_SOURCE, 'g');
const LINK_REGEX = /^\[([^\]\n]+)\]\((\S+?)\)$/;
const SAFE_PROTOCOLS = ['http://', 'https://', 'tg://', 'mailto:'];

/** Разбирает текст на плоский список токенов: текст, жирный, курсив, ссылка и т. д. */
export function parseRichText(value) {
  const source = String(value ?? '');

  if (!source) {
    return [];
  }

  const tokens = [];
  let lastIndex = 0;

  TOKEN_REGEX.lastIndex = 0;

  let match = TOKEN_REGEX.exec(source);

  while (match) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: source.slice(lastIndex, match.index) });
    }

    tokens.push(classifyToken(match[0]));
    lastIndex = match.index + match[0].length;
    match = TOKEN_REGEX.exec(source);
  }

  if (lastIndex < source.length) {
    tokens.push({ type: 'text', value: source.slice(lastIndex) });
  }

  return tokens;
}

function classifyToken(token) {
  const double = token.slice(0, 2);

  if (double === '**') {
    return { type: 'bold', value: token.slice(2, -2) };
  }

  if (double === '__') {
    return { type: 'underline', value: token.slice(2, -2) };
  }

  if (double === '~~') {
    return { type: 'strike', value: token.slice(2, -2) };
  }

  if (token[0] === '*') {
    return { type: 'italic', value: token.slice(1, -1) };
  }

  if (token[0] === '`') {
    return { type: 'code', value: token.slice(1, -1) };
  }

  const link = token.match(LINK_REGEX);

  if (link) {
    const href = link[2];
    const isSafe = SAFE_PROTOCOLS.some(protocol => href.toLowerCase().startsWith(protocol));

    return isSafe
      ? { type: 'link', value: link[1], href }
      : { type: 'text', value: `${link[1]} (${href})` };
  }

  return { type: 'text', value: token };
}

/** Текст без разметки — для поиска по статьям и подсчёта слов. */
export function richTextToPlainText(value) {
  return parseRichText(value).map(token => token.value).join('');
}

/** Обёртка выделения маркерами: **жирный**, *курсив*, `код` и т. д. */
export function applyMarkup({ value, selectionStart, selectionEnd, before, after = before }) {
  const start = Math.min(selectionStart ?? 0, selectionEnd ?? 0);
  const end = Math.max(selectionStart ?? 0, selectionEnd ?? 0);
  const selected = value.slice(start, end);
  const nextValue = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;

  return {
    value: nextValue,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + selected.length,
  };
}

/**
 * Вставка ссылки. Если выделения нет — подставляется подпись по умолчанию,
 * которая сразу остаётся выделенной, чтобы её можно было переписать.
 */
export function insertLinkMarkup({ value, selectionStart, selectionEnd, href, label }) {
  const start = Math.min(selectionStart ?? 0, selectionEnd ?? 0);
  const end = Math.max(selectionStart ?? 0, selectionEnd ?? 0);
  const selected = value.slice(start, end) || label;
  const inserted = `[${selected}](${href})`;
  const nextValue = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
  const labelStart = start + 1;

  return {
    value: nextValue,
    selectionStart: labelStart,
    selectionEnd: labelStart + selected.length,
  };
}
