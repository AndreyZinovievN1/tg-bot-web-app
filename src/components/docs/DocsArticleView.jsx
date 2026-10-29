import { useTranslation } from '../../i18n/I18nContext.js';
import DocsCodeBlock from './DocsCodeBlock.jsx';
import RichText from './RichText.jsx';

/**
 * Готовая статья документации: тематический фон, шапка и блоки контента.
 * Используется и в пользовательском разделе, и в предпросмотре админки.
 */
function DocsArticleView({ article, children }) {
  const { t } = useTranslation();
  const blocks = Array.isArray(article?.blocks) ? article.blocks : [];

  return (
    <article className="docs-article" data-doc-theme={article?.theme || 'nebula'}>
      <div className="docs-article__glow" aria-hidden="true" />
      <div className="docs-article__stars" aria-hidden="true" />

      <header className="docs-article__head">
        {article?.icon ? <span className="docs-article__icon" aria-hidden="true">{article.icon}</span> : null}
        <h1>{article?.title || t('docs.untitled')}</h1>
        {article?.summary ? <p className="docs-article__summary">{article.summary}</p> : null}
        {children}
      </header>

      <div className="docs-article__body">
        {blocks.length > 0
          ? blocks.map((block, index) => <DocsBlockView key={block.id || index} block={block} />)
          : <p className="docs-article__empty">{t('docs.admin.noBlocksText')}</p>}
      </div>
    </article>
  );
}

/** Один блок статьи. Отдельный экспорт нужен редактору для предпросмотра. */
export function DocsBlockView({ block }) {
  const { t } = useTranslation();

  if (!block) {
    return null;
  }

  if (block.type === 'heading') {
    const Tag = block.level === 3 ? 'h3' : 'h2';

    return (
      <Tag className="docs-block docs-block--heading" style={{ textAlign: block.align || 'left' }}>
        <RichText text={block.text} />
      </Tag>
    );
  }

  if (block.type === 'text') {
    return (
      <p className={`docs-block docs-block--text ${block.size === 'lg' ? 'is-lg' : ''}`} style={{ textAlign: block.align || 'left' }}>
        <RichText text={block.text} />
      </p>
    );
  }

  if (block.type === 'list') {
    const items = (block.items || []).filter(item => String(item || '').trim());

    if (items.length === 0) {
      return null;
    }

    return (
      <ul className={`docs-block docs-block--list is-${block.style || 'bullet'}`}>
        {items.map((item, index) => (
          <li key={`item-${index}`}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === 'image') {
    if (!block.src) {
      return null;
    }

    return (
      <figure className={`docs-block docs-block--image is-${block.size || 'full'} ${block.rounded ? 'is-rounded' : ''}`} style={{ textAlign: block.align || 'left' }}>
        <img alt={block.alt || ''} loading="lazy" src={block.src} />
        {block.caption ? <figcaption><RichText text={block.caption} /></figcaption> : null}
      </figure>
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote className="docs-block docs-block--quote">
        <RichText text={block.text} />
        {block.author ? <cite>{block.author}</cite> : null}
      </blockquote>
    );
  }

  if (block.type === 'callout') {
    return (
      <aside className={`docs-block docs-block--callout is-${block.tone || 'info'}`}>
        {block.title ? <strong>{block.title}</strong> : null}
        <RichText text={block.text} />
      </aside>
    );
  }

  if (block.type === 'badges') {
    const items = (block.items || []).filter(item => String(item?.text || '').trim());

    if (items.length === 0) {
      return null;
    }

    return (
      <div className="docs-block docs-block--badges">
        {items.map((item, index) => (
          <span className={`docs-badge is-${item.tone || 'accent'}`} key={`badge-${index}`}>
            <RichText text={item.text} />
          </span>
        ))}
      </div>
    );
  }

  if (block.type === 'steps') {
    const items = (block.items || []).filter(item => String(item?.title || '').trim() || String(item?.text || '').trim());

    if (items.length === 0) {
      return null;
    }

    return (
      <ol className="docs-block docs-block--steps">
        {items.map((item, index) => (
          <li className="docs-step" key={`step-${index}`}>
            <span className="docs-step__num" aria-hidden="true">{index + 1}</span>
            <div className="docs-step__body">
              {item.title ? <strong className="docs-step__title"><RichText text={item.title} /></strong> : null}
              {item.text ? <p className="docs-step__text"><RichText text={item.text} /></p> : null}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === 'stats') {
    const items = (block.items || []).filter(item => String(item?.label || '').trim() || String(item?.value || '').trim());

    if (items.length === 0) {
      return null;
    }

    return (
      <div className="docs-block docs-block--stats">
        {items.map((item, index) => (
          <div className="docs-stat" key={`stat-${index}`}>
            {item.icon ? <span className="docs-stat__icon" aria-hidden="true">{item.icon}</span> : null}
            {item.value ? <strong className="docs-stat__value"><RichText text={item.value} /></strong> : null}
            {item.label ? <span className="docs-stat__label"><RichText text={item.label} /></span> : null}
          </div>
        ))}
      </div>
    );
  }

  if (block.type === 'spoiler') {
    return (
      <details className="docs-block docs-block--spoiler">
        <summary>{String(block.title || '').trim() || t('docs.spoilerOpen')}</summary>
        {block.text ? <div className="docs-spoiler__body"><RichText text={block.text} /></div> : null}
      </details>
    );
  }

  if (block.type === 'progress') {
    const max = Number(block.max) > 0 ? Number(block.max) : 100;
    const value = Math.max(0, Math.min(Number(block.value) || 0, max));
    const percent = Math.round((value / max) * 100);

    return (
      <div className={`docs-block docs-block--progress is-${block.tone || 'info'}`}>
        <div className="docs-progress__head">
          <span className="docs-progress__label"><RichText text={block.label} /></span>
          <span className="docs-progress__value">{percent}%</span>
        </div>
        <div
          aria-valuemax={max}
          aria-valuemin="0"
          aria-valuenow={value}
          className="docs-progress__track"
          role="progressbar"
        >
          <span className="docs-progress__fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  if (block.type === 'link') {
    if (!block.href) {
      return null;
    }

    return (
      <a
        className={`docs-block docs-block--link is-${block.tone || 'accent'}`}
        href={block.href}
        rel="noreferrer noopener"
        target="_blank"
      >
        {block.icon ? <span className="docs-link__icon" aria-hidden="true">{block.icon}</span> : null}
        <span className="docs-link__text">{String(block.text || '').trim() || block.href}</span>
      </a>
    );
  }

  if (block.type === 'code') {
    return <DocsCodeBlock code={block.code} language={block.language} />;
  }

  if (block.type === 'table') {
    const head = Array.isArray(block.head) ? block.head : [];
    const rows = Array.isArray(block.rows) ? block.rows : [];

    return (
      <div className="docs-block docs-block--table">
        <table>
          {head.length > 0 && (
            <thead>
              <tr>
                {head.map((cell, index) => <th key={`head-${index}`}><RichText text={cell} /></th>)}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`}><RichText text={cell} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === 'divider') {
    return <div className={`docs-block docs-block--divider is-${block.style || 'line'}`} role="separator" />;
  }

  return null;
}

export default DocsArticleView;
