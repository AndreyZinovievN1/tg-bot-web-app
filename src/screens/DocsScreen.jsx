import { useEffect, useMemo, useState } from 'react';
import { FiChevronRight, FiSearch, FiX } from 'react-icons/fi';
import { apiRequest } from '../api/client.js';
import DocsArticleView from '../components/docs/DocsArticleView.jsx';
import DocsHelp from '../components/docs/DocsHelp.jsx';
import { docsTopicMeta, docsTopics } from '../config/docs.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { localeMeta } from '../i18n/locales/index.js';
import { estimateReadingMinutes } from '../utils/docs.js';
import { formatDate } from '../utils/formatters.js';

/** Стабильная ссылка на пустой список: не создаём новый массив на каждом рендере. */
const emptyDocsList = [];

/**
 * Пользовательская документация.
 *
 * Экран открывается вкладкой нижнего меню (полный список статей) или кнопкой «?»
 * с любого экрана — тогда приходит `topic`, и список сразу отфильтрован по разделу
 * справки. Сверху всегда заметный блок помощи: частые вопросы (статьи с флагом
 * `is_faq`, редактируются в админке) и связь с поддержкой.
 *
 * Список и статья запрашиваются на текущем языке Web App (`?lang=`).
 * Если у статьи нет версии на этом языке, сервер отдаёт ближайшую доступную
 * и помечает ответ флагом `isFallback` — тогда показываем подсказку и чипы
 * для быстрого переключения языка.
 */
function DocsScreen({ initData, topic }) {
  const { t, locale, setLocale } = useTranslation();
  const [list, setList] = useState(null);
  const [listError, setListError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [reader, setReader] = useState({ id: null, article: null, error: '' });
  /** Раздел справки: приходит из кнопки «?», дальше переключается чипами. */
  const [topicFilter, setTopicFilter] = useState(topic || 'all');
  const [openFaqId, setOpenFaqId] = useState(null);
  const [faqDetails, setFaqDetails] = useState({});

  useEffect(() => {
    let cancelled = false;

    apiRequest(`/api/docs?lang=${encodeURIComponent(locale)}`, {}, initData)
      .then(payload => {
        if (!cancelled) {
          setList(payload.articles || []);
          setListError('');
        }
      })
      .catch(error => {
        if (!cancelled) {
          setList([]);
          setListError(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initData, locale]);

  useEffect(() => {
    if (!selectedId) {
      return undefined;
    }

    let cancelled = false;

    apiRequest(`/api/docs/${selectedId}?lang=${encodeURIComponent(locale)}`, {}, initData)
      .then(payload => {
        if (!cancelled) {
          setReader({ id: selectedId, article: payload.article, error: '' });
        }
      })
      .catch(error => {
        if (!cancelled) {
          setReader({ id: selectedId, article: null, error: error.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initData, locale, selectedId]);

  // Ответ частого вопроса грузим лениво: пока вопрос не раскрыт, блоков у нас нет.
  // Кэш держим по паре «статья:язык», чтобы переключение языка обновило ответ.
  const faqKey = openFaqId ? `${openFaqId}:${locale}` : '';

  useEffect(() => {
    if (!faqKey || faqDetails[faqKey]) {
      return undefined;
    }

    let cancelled = false;

    apiRequest(`/api/docs/${openFaqId}?lang=${encodeURIComponent(locale)}`, {}, initData)
      .then(payload => {
        if (!cancelled) {
          setFaqDetails(current => ({ ...current, [faqKey]: { article: payload.article, error: '' } }));
        }
      })
      .catch(error => {
        if (!cancelled) {
          setFaqDetails(current => ({ ...current, [faqKey]: { article: null, error: error.message } }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [faqDetails, faqKey, initData, locale, openFaqId]);

  // Пока список не пришёл, показываем лоадер; статья считается загруженной,
  // когда ответ относится к текущему выбранному id.
  const listLoading = list === null;
  const readerReady = Boolean(selectedId) && reader.id === selectedId;
  const article = readerReady ? reader.article : null;
  const articleLoading = Boolean(selectedId) && !readerReady;
  const articleError = readerReady ? reader.error : '';

  /** Частые вопросы живут в блоке помощи, остальные статьи — в списке. */
  const faqItems = useMemo(() => (list || emptyDocsList).filter(item => item.isFaq), [list]);
  const articles = useMemo(() => (list || emptyDocsList).filter(item => !item.isFaq), [list]);

  /** Чипы разделов показываем только для тех, где статьи есть. */
  const topicOptions = useMemo(
    () => docsTopics.filter(meta => articles.some(item => item.topic === meta.id)),
    [articles],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Во время поиска ищем по всем разделам, иначе фильтр «съест» результаты.
    const activeTopic = needle ? 'all' : topicFilter;

    return articles.filter(item => {
      if (activeTopic !== 'all' && item.topic !== activeTopic) {
        return false;
      }

      return !needle || `${item.title} ${item.summary}`.toLowerCase().includes(needle);
    });
  }, [articles, query, topicFilter]);

  /** Модели для блока помощи: вопрос, состояние раскрытия и загруженный ответ. */
  const faqs = useMemo(
    () => faqItems.map(item => ({
      id: item.id,
      title: item.title || t('docs.untitled'),
      open: item.id === openFaqId,
      detail: faqDetails[`${item.id}:${locale}`],
    })),
    [faqDetails, faqItems, locale, openFaqId, t],
  );

  const toggleFaq = id => setOpenFaqId(current => (current === id ? null : id));

  /**
   * Переключение языка статьи: меняем язык приложения, поэтому раздел
   * (и открытая статья, и ответы FAQ) перечитывается с нужной версией.
   */
  const setLang = code => {
    if (code && code !== locale) {
      setLocale(code);
    }
  };

  const topicMeta = topicFilter === 'all' ? null : docsTopicMeta(topicFilter);

  return (
    <section className="screen docs-screen">
      <div className="docs-hero">
        <div className="docs-hero__glow" aria-hidden="true" />

        <h1>{t('docs.title')}</h1>
        <p>{t('docs.subtitle')}</p>

        {topicMeta && !selectedId ? (
          <p className="docs-hero__topic">{t('docs.helpFor', { label: t(topicMeta.labelKey) })}</p>
        ) : null}

        {!selectedId && (
          <div className="docs-search">
            <FiSearch />
            <input
              inputMode="search"
              placeholder={t('docs.searchPlaceholder')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            {query ? (
              <button aria-label={t('docs.clearSearch')} type="button" onClick={() => setQuery('')}>
                <FiX />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {listError ? <div className="inline-alert">{listError}</div> : null}
      {articleError ? <div className="inline-alert">{articleError}</div> : null}

      {selectedId ? (
        <>
          {articleLoading && !article ? (
            <div className="docs-loading">
              <span className="loader-orbit" />
              <span>{t('docs.loading')}</span>
            </div>
          ) : null}

          {article ? (
            <>
              <DocsArticleView article={article}>
                <div className="docs-article__meta">
                  <span>{t('docs.readMinutes', { minutes: estimateReadingMinutes(article.blocks) })}</span>
                  {article.updatedAt ? <span>{t('docs.updated', { date: formatDate(article.updatedAt) })}</span> : null}
                  <span>{t(docsTopicMeta(article.topic).labelKey)}</span>
                </div>

                {article.isFallback ? (
                  <p className="docs-article__notice">
                    {t('docs.versionFallback', { label: localeMeta[article.locale]?.label || article.locale })}
                  </p>
                ) : null}
              </DocsArticleView>

              <div className="docs-reader__footer">
                <span className="docs-reader__title">{t('docs.readIn')}</span>

                <div className="docs-chips">
                  {(article.availableLocales || []).map(code => (
                    <button
                      key={code}
                      className={`docs-chip ${code === article.locale ? 'is-current' : ''}`}
                      type="button"
                      onClick={() => setLang(code)}
                    >
                      {localeMeta[code]?.flag} {localeMeta[code]?.short || code}
                    </button>
                  ))}
                </div>

                <button className="btn btn-ghost" type="button" onClick={() => setSelectedId(null)}>
                  {t('docs.toList')}
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          {listLoading ? (
            <div className="docs-loading">
              <span className="loader-orbit" />
              <span>{t('docs.loading')}</span>
            </div>
          ) : null}

          {!listLoading ? (
            <DocsHelp faqs={faqs} onOpenArticle={setSelectedId} onToggle={toggleFaq} />
          ) : null}

          {!listLoading && topicOptions.length > 0 ? (
            <div className="docs-topics">
              <button
                className={`docs-topic ${topicFilter === 'all' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setTopicFilter('all')}
              >
                {t('docs.topicAll')}
              </button>

              {topicOptions.map(meta => (
                <button
                  className={`docs-topic ${topicFilter === meta.id ? 'is-active' : ''}`}
                  key={meta.id}
                  type="button"
                  onClick={() => setTopicFilter(meta.id)}
                >
                  <span className="docs-topic__icon" aria-hidden="true">{meta.icon}</span>
                  {t(meta.labelKey)}
                </button>
              ))}
            </div>
          ) : null}

          {!listLoading && !listError && filtered.length === 0 ? (
            <div className="docs-empty">
              <strong>{query ? t('docs.searchEmpty') : topicFilter === 'all' ? t('docs.empty') : t('docs.topicEmpty')}</strong>
              <small>
                {query
                  ? t('docs.searchEmptyHint')
                  : topicFilter === 'all' ? t('docs.emptyText') : t('docs.topicEmptyText')}
              </small>

              {!query && topicFilter !== 'all' ? (
                <button className="btn btn-ghost btn-small" type="button" onClick={() => setTopicFilter('all')}>
                  {t('docs.topicAllArticles')}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="docs-list">
            {filtered.map(item => (
              <button
                className="docs-card"
                data-doc-theme={item.theme}
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
              >
                <span className="docs-card__icon" aria-hidden="true">{item.icon}</span>

                <span className="docs-card__body">
                  <strong>{item.title || t('docs.untitled')}</strong>
                  {item.summary ? <small>{item.summary}</small> : null}

                  <span className="docs-chips">
                    {docsTopicMeta(item.topic).id === 'common' ? null : (
                      <span className="docs-chip is-topic">{t(docsTopicMeta(item.topic).labelKey)}</span>
                    )}
                    {(item.availableLocales || []).map(code => (
                      <span className={`docs-chip ${code === item.locale ? 'is-current' : ''}`} key={code}>
                        {localeMeta[code]?.short || code}
                      </span>
                    ))}
                    {item.isFallback ? <span className="docs-chip is-fallback">{t('docs.fallbackShort')}</span> : null}
                  </span>
                </span>

                <FiChevronRight />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default DocsScreen;