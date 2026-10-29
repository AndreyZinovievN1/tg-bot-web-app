import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext.js';
import DocsAdminList from './DocsAdminList.jsx';
import DocsArticleEditor from './DocsArticleEditor.jsx';

/**
 * Раздел «Документация» в админке: список статей и визуальный редактор.
 * Все запросы идут через `adminRequest` с токеном админ-сессии.
 */
function DocsAdminPanel({ adminRequest, onMessage }) {
  const { t, locale } = useTranslation();
  const [articles, setArticles] = useState(null);
  const [article, setArticle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchList = useCallback(() => adminRequest('/api/admin/docs').then(payload => payload.articles || []), [adminRequest]);

  useEffect(() => {
    let cancelled = false;

    fetchList()
      .then(items => {
        if (!cancelled) {
          setArticles(items);
        }
      })
      .catch(requestError => {
        if (!cancelled) {
          setError(requestError.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  const loadList = useCallback(async () => {
    setArticles(await fetchList());
  }, [fetchList]);

  const loading = articles === null;

  const run = async (task, message) => {
    setBusy(true);
    setError('');

    try {
      await task();

      if (message) {
        onMessage?.(message);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const openArticle = id => run(async () => {
    const payload = await adminRequest(`/api/admin/docs/${id}`);
    setArticle(payload.article);
  });

  const createArticle = ({ title, locale: versionLocale }) => run(async () => {
    const payload = await adminRequest('/api/admin/docs', {
      method: 'POST',
      body: JSON.stringify({ title, locale: versionLocale, status: 'draft' }),
    });

    setArticle(payload.article);
    await loadList();
  }, t('docs.admin.created'));

  const saveArticle = payload => run(async () => {
    const response = await adminRequest(`/api/admin/docs/${article.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    setArticle(response.article);
    await loadList();
  }, t('docs.admin.saved'));

  const deleteArticle = id => run(async () => {
    const response = await adminRequest(`/api/admin/docs/${id}`, { method: 'DELETE' });

    setArticles(response.articles || []);
    setArticle(current => (current?.id === id ? null : current));
  }, t('docs.admin.deleted'));

  const moveArticle = (id, direction) => run(async () => {
    const response = await adminRequest(`/api/admin/docs/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    });

    setArticles(response.articles || []);
  });

  return (
    <div className="docs-admin-panel">
      {error ? <div className="inline-alert">{error}</div> : null}

      {article ? (
        <DocsArticleEditor
          key={article.id}
          article={article}
          busy={busy}
          onBack={() => setArticle(null)}
          onDelete={() => deleteArticle(article.id)}
          onSave={saveArticle}
        />
      ) : (
        <>
          {loading ? (
            <div className="docs-loading">
              <span className="loader-orbit" />
              <span>{t('docs.admin.loading')}</span>
            </div>
          ) : (
            <DocsAdminList
              articles={articles || []}
              busy={busy}
              language={locale}
              onCreate={createArticle}
              onDelete={deleteArticle}
              onMove={moveArticle}
              onOpen={openArticle}
            />
          )}
        </>
      )}
    </div>
  );
}

export default DocsAdminPanel;
