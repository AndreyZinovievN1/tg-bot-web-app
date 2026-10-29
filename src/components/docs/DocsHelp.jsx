import { FiExternalLink, FiHelpCircle, FiPlus } from 'react-icons/fi';
import { docsSupportUrl } from '../../config/docs.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { DocsBlockView } from './DocsArticleView.jsx';

/**
 * Заметный блок помощи на экране документации: частые вопросы (раскрываются
 * прямо здесь) и связь с поддержкой.
 *
 * Частые вопросы — это обычные статьи с флагом «Частый вопрос» (`is_faq`),
 * поэтому ответы редактируются в админке тем же визуальным редактором.
 */
function DocsHelp({ faqs, onToggle, onOpenArticle }) {
  const { t } = useTranslation();
  const items = Array.isArray(faqs) ? faqs : [];

  return (
    <section className="docs-help">
      <div className="docs-help__glow" aria-hidden="true" />

      <div className="docs-help__head">
        <span className="docs-help__icon" aria-hidden="true">
          <FiHelpCircle />
        </span>
        <div>
          <strong>{t('docs.helpTitle')}</strong>
          <small>{t('docs.helpSubtitle')}</small>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="docs-faq">
          {items.map(({ id, title, open, detail }) => (
            <article className={`docs-faq__item ${open ? 'is-open' : ''}`} key={id}>
              <button
                aria-expanded={open}
                className="docs-faq__q"
                type="button"
                onClick={() => onToggle(id)}
              >
                <span className="docs-faq__q-text">{title}</span>
                <FiPlus className="docs-faq__mark" aria-hidden="true" />
              </button>

              {open ? (
                <div className="docs-faq__a" data-doc-theme={detail?.article?.theme || 'nebula'}>
                  {detail?.error ? <div className="inline-alert">{detail.error}</div> : null}

                  {detail?.article ? (
                    <>
                      {detail.article.isFallback ? (
                        <p className="docs-article__notice">
                          {t('docs.versionFallback', { label: detail.article.locale.toUpperCase() })}
                        </p>
                      ) : null}

                      {(detail.article.blocks || []).length > 0 ? (
                        (detail.article.blocks || []).map((block, index) => (
                          <DocsBlockView block={block} key={block.id || `faq-${id}-${index}`} />
                        ))
                      ) : (
                        <p className="docs-faq__empty">{t('docs.emptyAnswer')}</p>
                      )}

                      <button className="btn btn-ghost btn-small" type="button" onClick={() => onOpenArticle(id)}>
                        {t('docs.openFull')}
                      </button>
                    </>
                  ) : (
                    <div className="docs-faq__loading">
                      <span className="loader-orbit" />
                      <span>{t('docs.loading')}</span>
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="docs-help__empty">
          <strong>{t('docs.helpEmpty')}</strong>
          <small>{t('docs.helpEmptyText')}</small>
        </div>
      )}

      <div className="docs-help__support">
        <span className="docs-help__support-icon" aria-hidden="true">💌</span>
        <div>
          <strong>{t('docs.helpSupportTitle')}</strong>
          <small>{docsSupportUrl ? t('docs.helpSupportText') : t('docs.helpSupportHint')}</small>
        </div>

        {docsSupportUrl ? (
          <a className="docs-help__support-btn" href={docsSupportUrl} rel="noreferrer" target="_blank">
            <FiExternalLink aria-hidden="true" />
            {t('docs.helpSupportAction')}
          </a>
        ) : null}
      </div>
    </section>
  );
}

export default DocsHelp;
