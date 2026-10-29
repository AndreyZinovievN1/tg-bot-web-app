import { useState } from 'react';
import { FiArrowDown, FiArrowUp, FiEdit3, FiPlus, FiTrash2 } from 'react-icons/fi';
import { docsLocaleOrder, docsTopicMeta } from '../../config/docs.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { localeMeta } from '../../i18n/locales/index.js';

/**
 * Список статей документации в админке: создание новой статьи,
 * порядок вывода, статус публикации и удаление.
 */
function DocsAdminList({ articles, busy, language, onCreate, onDelete, onMove, onOpen }) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [locale, setLocale] = useState(language || 'ru');
  const [confirmId, setConfirmId] = useState(null);

  const submit = event => {
    event.preventDefault();

    if (!title.trim() || busy) {
      return;
    }

    onCreate({ title: title.trim(), locale });
    setTitle('');
    setCreating(false);
  };

  return (
    <section className="profile-panel docs-admin">
      <div className="profile-panel__head">
        <h3>{t('docs.admin.listTitle')}</h3>
        <span className="docs-admin__count">{articles.length}</span>
      </div>

      <div className="profile-panel__body">
        {creating ? (
          <form className="docs-creator" onSubmit={submit}>
            <p className="admin-hint">{t('docs.admin.createHint')}</p>

            <input
              autoFocus
              className="docs-input"
              placeholder={t('docs.admin.titlePlaceholder')}
              value={title}
              onChange={event => setTitle(event.target.value)}
            />

            <div className="docs-seg">
              {docsLocaleOrder.map(code => (
                <button
                  key={code}
                  className={`docs-seg__btn ${code === locale ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => setLocale(code)}
                >
                  {localeMeta[code]?.flag} {localeMeta[code]?.short}
                </button>
              ))}
            </div>

            <div className="docs-creator__actions">
              <button className="btn btn-primary btn-small" disabled={busy || !title.trim()} type="submit">
                {t('docs.admin.create')}
              </button>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setCreating(false)}>
                {t('docs.admin.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <button className="docs-create-btn" type="button" onClick={() => setCreating(true)}>
            <FiPlus /> {t('docs.admin.newArticle')}
          </button>
        )}

        {articles.length === 0 && !creating ? (
          <div className="docs-empty">
            <strong>{t('docs.admin.empty')}</strong>
            <small>{t('docs.admin.emptyText')}</small>
          </div>
        ) : null}

        <div className="docs-articles">
          {articles.map((article, index) => {
            const version = article.translations.find(item => item.locale === language) || article.translations[0];

            return (
              <article className="docs-article-row" key={article.id} data-doc-theme={article.theme}>
                <button className="docs-article-row__main" type="button" onClick={() => onOpen(article.id)}>
                  <span className="docs-article-row__icon" aria-hidden="true">{article.icon}</span>
                  <span className="docs-article-row__body">
                    <strong>{version?.title || t('docs.admin.untitled')}</strong>
                    <small>
                      {article.translations.map(item => localeMeta[item.locale]?.short || item.locale).join(' · ') || t('docs.admin.noVersions')}
                      {' · '}
                      {t('docs.admin.blocksCount', { count: version?.blockCount || 0 })}
                    </small>

                    <span className="docs-chips">
                      <span className="docs-chip is-topic">{t(docsTopicMeta(article.topic).labelKey)}</span>
                      {article.isFaq ? <span className="docs-chip is-faq">{t('docs.admin.faqBadge')}</span> : null}
                    </span>
                  </span>
                  <span className={`docs-badge ${article.status === 'published' ? 'is-published' : 'is-draft'}`}>
                    {article.status === 'published' ? t('docs.admin.statusPublished') : t('docs.admin.statusDraft')}
                  </span>
                  <FiEdit3 />
                </button>

                <div className="docs-article-row__tools">
                  <button
                    aria-label={t('docs.admin.moveUp')}
                    className="docs-ico"
                    disabled={busy || index === 0}
                    title={t('docs.admin.moveUp')}
                    type="button"
                    onClick={() => onMove(article.id, 'up')}
                  >
                    <FiArrowUp />
                  </button>
                  <button
                    aria-label={t('docs.admin.moveDown')}
                    className="docs-ico"
                    disabled={busy || index === articles.length - 1}
                    title={t('docs.admin.moveDown')}
                    type="button"
                    onClick={() => onMove(article.id, 'down')}
                  >
                    <FiArrowDown />
                  </button>
                  <button
                    aria-label={t('docs.admin.delete')}
                    className="docs-ico is-danger"
                    title={t('docs.admin.delete')}
                    type="button"
                    onClick={() => setConfirmId(current => (current === article.id ? null : article.id))}
                  >
                    <FiTrash2 />
                  </button>
                </div>

                {confirmId === article.id ? (
                  <div className="docs-confirm">
                    <span>{t('docs.admin.deleteConfirm', { title: version?.title || t('docs.admin.untitled') })}</span>
                    <div>
                      <button
                        className="btn btn-small docs-danger"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          setConfirmId(null);
                          onDelete(article.id);
                        }}
                      >
                        {t('docs.admin.delete')}
                      </button>
                      <button className="btn btn-ghost btn-small" type="button" onClick={() => setConfirmId(null)}>
                        {t('docs.admin.cancel')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

      </div>
    </section>
  );
}

export default DocsAdminList;
