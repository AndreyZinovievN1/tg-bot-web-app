import { Fragment } from 'react';
import { parseRichText } from '../../utils/richText.js';

/**
 * Инлайновый рендер текста с разметкой документации:
 * **жирный**, *курсив*, __подчёркнутый__, ~~зачёркнутый~~, `код`, [ссылки](…).
 * Переносы строк сохраняются, поэтому блоки «текст» можно писать абзацами.
 */
export function RichText({ text }) {
  const tokens = parseRichText(text);

  return (
    <>
      {tokens.map((token, index) => renderToken(token, index))}
    </>
  );
}

function renderToken(token, index) {
  const key = `${token.type}-${index}`;

  if (token.type === 'link') {
    return (
      <a key={key} href={token.href} rel="noreferrer noopener" target="_blank">
        {withLineBreaks(token.value, key)}
      </a>
    );
  }

  const content = withLineBreaks(token.value, key);

  if (token.type === 'bold') {
    return <strong key={key}>{content}</strong>;
  }

  if (token.type === 'italic') {
    return <em key={key}>{content}</em>;
  }

  if (token.type === 'underline') {
    return <u key={key}>{content}</u>;
  }

  if (token.type === 'strike') {
    return <s key={key}>{content}</s>;
  }

  if (token.type === 'code') {
    return <code key={key}>{content}</code>;
  }

  return <Fragment key={key}>{content}</Fragment>;
}

/** '\n' внутри токена превращается в <br>, чтобы абзацы не слипались. */
function withLineBreaks(value, key) {
  const lines = String(value ?? '').split('\n');

  if (lines.length === 1) {
    return value;
  }

  return lines.map((line, index) => (
    <Fragment key={`${key}-line-${index}`}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

export default RichText;
