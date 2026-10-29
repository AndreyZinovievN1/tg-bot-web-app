import { Fragment, useMemo, useState } from 'react';
import { FiArrowLeft, FiCopy, FiEye, FiFilePlus, FiPlus, FiSave, FiTrash2 } from 'react-icons/fi';
import { docsIcons, docsStatuses, docsTemplates, docsTopicMeta, docsTopics } from '../../config/docs.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { localeMeta } from '../../i18n/locales/index.js';
import {
  buildTemplateBlocks,
  createArticleVersion,
  createBlock,
  defaultArticleLocale,
  duplicateBlock,
  estimateReadingMinutes,
  missingLocales,
  moveInArray,
  normalizeArticleVersions,
  sortLocales,
} from '../../utils/docs.js';
import DocsArticleView from './DocsArticleView.jsx';
import DocsBlockCard from './DocsBlockCard.jsx';
import DocsBlockPalette from './DocsBlockPalette.jsx';
import DocsLanguageTabs from './DocsLanguageTabs.jsx';
import DocsThemePicker from './DocsThemePicker.jsx';

/**
 * Визуальный редактор статьи.
 *
 * Слева-сверху — метаданные (иконка, оформление, статус), дальше языковые вкладки
 * и «полотно» из блоков: блоки добавляются кнопкой «+», двигаются, дублируются и
 * удаляются, а каждый блок можно посмотреть так, как его увидит пользователь.
 */
function DocsArticleEditor({ article, busy, onSave, onBack, onDelete }) {
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState(() => buildDraft(article, locale));
  const [activeLocale, setActiveLocale] = useState(() => (
    defaultArticleLocale((article.translations || []).map(version => version.locale), locale)
  ));
  const [paletteIndex, setPaletteIndex] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLocale, setConfirmLocale] = useState(false);
  const [lastAddedId, setLastAddedId] = useState(null);
  const [pendingLocale, setPendingLocale] = useState(null);

  const versions = draft.translations;
  const locales = useMemo(() => sortLocales(versions.map(version => version.locale)), [versions]);
  const active = versions.find(version => version.locale === activeLocale) || versions[0];
  const blocks = active?.blocks || [];

  const patch = changes => setDraft(current => ({ ...current, ...changes }));

  const patchVersion = changes => setDraft(current => ({
    ...current,
    translations: current.translations.map(version => (
      version.locale === activeLocale ? { ...version, ...changes } : version
    )),
  }));

  const setBlocks = nextBlocks => patchVersion({ blocks: nextBlocks });

  const addBlock = type => {
    const next = createBlock(type);
    const index = paletteIndex === null ? blocks.length : paletteIndex;
    const nextBlocks = [...blocks];

    nextBlocks.splice(index, 0, next);
    setBlocks(nextBlocks);
    setPaletteIndex(null);
    setLastAddedId(next.id);
  };

  // Пустая статья — предлагаем готовые основы вместо пустого полотна.
  const applyTemplate = template => {
    const templateBlocks = buildTemplateBlocks(template, t);

    if (templateBlocks.length === 0) {
      return;
    }

    setBlocks([...blocks, ...templateBlocks]);
    setLastAddedId(templateBlocks[templateBlocks.length - 1].id);
  };

  /**
   * Добавляет языковую версию. При `copyFrom` переносим заголовок, описание и
   * блоки готовой версии — перевод не нужно собирать с нуля.
   */
  const addVersion = (code, options = {}) => {
    const source = options.copyFrom ? versions.find(version => version.locale === options.copyFrom) : null;

    setDraft(current => {
      const version = createArticleVersion(code);

      if (source) {
        version.title = source.title;
        version.summary = source.summary;
        version.blocks = source.blocks.map(block => duplicateBlock(block));
      }

      return { ...current, translations: [...current.translations, version] };
    });

    setActiveLocale(code);
    setPendingLocale(null);
  };

  const removeVersion = () => {
    if (versions.length <= 1) {
      return;
    }

    const next = versions.filter(version => version.locale !== activeLocale);

    patch({ translations: next });
    setActiveLocale(next[0].locale);
    setConfirmLocale(false);
  };

  if (previewMode) {
    return (
      <section className="docs-editor">
        <div className="docs-editor__bar">
          <button className="docs-editor__back" type="button" onClick={() => setPreviewMode(false)}>
            <FiArrowLeft /> {t('docs.admin.exitPreview')}
          </button>
          <span className="docs-editor__status">{t('docs.admin.previewHint')}</span>
        </div>

        <DocsArticleView
          article={{
            icon: draft.icon,
            theme: draft.theme,
            title: active?.title,
            summary: active?.summary,
            blocks,
          }}
        />
      </section>
    );
  }

  const readingMinutes = estimateReadingMinutes(blocks);

  const save = () => onSave({
    icon: draft.icon,
    theme: draft.theme,
    status: draft.status,
    topic: draft.topic,
    isFaq: draft.isFaq,
    translations: draft.translations.map(version => ({
      locale: version.locale,
      title: version.title,
      summary: version.summary,
      blocks: version.blocks,
    })),
  });

  return (
    <section className="docs-editor">
      <div className="docs-editor__bar">
        <button className="docs-editor__back" type="button" onClick={onBack}>
          <FiArrowLeft /> {t('docs.admin.backToList')}
        </button>

        <div className="docs-editor__actions">
          <button
            className="docs-ico"
            title={t('docs.admin.preview')}
            type="button"
            onClick={() => setPreviewMode(true)}
          >
            <FiEye />
          </button>
          <button className="btn btn-primary btn-small" disabled={busy} type="button" onClick={save}>
            <FiSave /> {busy ? t('docs.admin.saving') : t('docs.admin.save')}
          </button>
        </div>
      </div>

      <div className="docs-meta">
        <div className="docs-meta__top">
          <button className="docs-meta__icon" title={t('docs.admin.iconField')} type="button" onClick={() => setIconOpen(current => !current)}>
            {draft.icon}
          </button>

          <input
            className="docs-input docs-input--title"
            placeholder={t('docs.admin.titlePlaceholder')}
            value={active?.title || ''}
            onChange={event => patchVersion({ title: event.target.value })}
          />

          <button
            className="docs-ico is-danger"
            title={t('docs.admin.delete')}
            type="button"
            onClick={() => setConfirmDelete(true)}
          >
            <FiTrash2 />
          </button>
        </div>

        {iconOpen && (
          <div className="docs-icon-grid">
            {docsIcons.map(icon => (
              <button
                key={icon}
                className={icon === draft.icon ? 'is-active' : ''}
                type="button"
                onClick={() => {
                  patch({ icon });
                  setIconOpen(false);
                }}
              >
                {icon}
              </button>
            ))}
          </div>
        )}

        <textarea
          className="docs-input docs-input--summary"
          placeholder={t('docs.admin.summaryPlaceholder')}
          rows={2}
          value={active?.summary || ''}
          onChange={event => patchVersion({ summary: event.target.value })}
        />

        <div className="docs-meta__row">
          <div className="docs-seg">
            {docsStatuses.map(status => (
              <button
                key={status}
                className={`docs-seg__btn ${draft.status === status ? 'is-active' : ''}`}
                type="button"
                onClick={() => patch({ status })}
              >
                {t(status === 'published' ? 'docs.admin.statusPublished' : 'docs.admin.statusDraft')}
              </button>
            ))}
          </div>

          <span className="docs-editor__stat">
            {t('docs.admin.stats', { blocks: blocks.length, minutes: readingMinutes })}
          </span>
        </div>

        {/* Раздел справки, «Частые вопросы» и оформление по умолчанию свёрнуты:
            так редактор целиком помещается на экране телефона. */}
        <details className="docs-more">
          <summary>
            <span>{t('docs.admin.moreSettings')}</span>
            <small>
              {t(docsTopicMeta(draft.topic).labelKey)}
              {draft.isFaq ? ` · ${t('docs.admin.faqBadge')}` : ''}
            </small>
          </summary>

          <div className="docs-more__body">
            <div className="docs-field">
              <span className="docs-field__label">{t('docs.admin.topicField')}</span>
              <div className="docs-field__body">
                <div className="docs-topics is-compact">
                  {docsTopics.map(meta => (
                    <button
                      className={`docs-topic ${draft.topic === meta.id ? 'is-active' : ''}`}
                      key={meta.id}
                      type="button"
                      onClick={() => patch({ topic: meta.id })}
                    >
                      <span className="docs-topic__icon" aria-hidden="true">{meta.icon}</span>
                      {t(meta.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="admin-hint">{t('docs.admin.topicHint')}</p>

            <label className="docs-check">
              <input checked={Boolean(draft.isFaq)} type="checkbox" onChange={event => patch({ isFaq: event.target.checked })} />
              {t('docs.admin.faqField')}
            </label>
            <p className="admin-hint">{t('docs.admin.faqHint')}</p>

            <div className="docs-field">
              <span className="docs-field__label">{t('docs.admin.themeField')}</span>
              <DocsThemePicker value={draft.theme} onChange={theme => patch({ theme })} />
            </div>
            <p className="admin-hint">{t('docs.admin.themeHint')}</p>
          </div>
        </details>

        {confirmDelete && (
          <div className="docs-confirm">
            <span>{t('docs.admin.deleteConfirm', { title: active?.title || t('docs.admin.untitled') })}</span>
            <div>
              <button className="btn btn-small docs-danger" type="button" onClick={onDelete}>
                {t('docs.admin.delete')}
              </button>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setConfirmDelete(false)}>
                {t('docs.admin.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="docs-panel">
        <div className="docs-panel__head">
          <h3>{t('docs.admin.languageVersions')}</h3>
          <small>{t('docs.admin.languageHint')}</small>
        </div>

        <DocsLanguageTabs
          active={activeLocale}
          locales={locales}
          missing={missingLocales(locales)}
          onAdd={setPendingLocale}
          onRemove={() => setConfirmLocale(true)}
          onSelect={setActiveLocale}
        />

        {confirmLocale && (
          <div className="docs-confirm">
            <span>{t('docs.admin.removeLanguageConfirm', { label: localeMeta[activeLocale]?.label || activeLocale })}</span>
            <div>
              <button className="btn btn-small docs-danger" type="button" onClick={removeVersion}>
                {t('docs.admin.removeLanguage')}
              </button>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setConfirmLocale(false)}>
                {t('docs.admin.cancel')}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="docs-panel">
        <div className="docs-panel__head">
          <h3>{t('docs.admin.blocksTitle')}</h3>
          <small>{t('docs.admin.blocksHint', { label: localeMeta[activeLocale]?.label || activeLocale })}</small>
        </div>

        {blocks.length === 0 ? (
          <div className="docs-start">
            <strong>{t('docs.admin.startTitle')}</strong>
            <small>{t('docs.admin.startHint')}</small>
            <div className="docs-start__grid">
              {docsTemplates.map(template => (
                <button key={template.id} className="docs-start__item" type="button" onClick={() => applyTemplate(template)}>
                  <span className="docs-start__icon" aria-hidden="true">{template.icon}</span>
                  <strong>{t(template.labelKey)}</strong>
                  <small>{t(template.hintKey)}</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="docs-canvas">
            {blocks.map((block, index) => (
              <Fragment key={block.id}>
                <button
                  className="docs-canvas__insert"
                  title={t('docs.admin.insertBlock')}
                  type="button"
                  onClick={() => setPaletteIndex(index)}
                >
                  <FiPlus />
                </button>

                <DocsBlockCard
                  block={block}
                  index={index}
                  initiallyOpen={block.id === lastAddedId}
                  theme={draft.theme}
                  total={blocks.length}
                  onChange={next => setBlocks(blocks.map((current, position) => (position === index ? next : current)))}
                  onDuplicate={() => setBlocks([...blocks.slice(0, index + 1), duplicateBlock(block), ...blocks.slice(index + 1)])}
                  onMove={offset => setBlocks(moveInArray(blocks, index, offset))}
                  onRemove={() => setBlocks(blocks.filter((_, position) => position !== index))}
                />
              </Fragment>
            ))}
          </div>
        )}

        <button className="docs-add-block" type="button" onClick={() => setPaletteIndex(blocks.length)}>
          <FiPlus /> {t('docs.admin.addBlock')}
        </button>
      </section>

      {paletteIndex !== null && <DocsBlockPalette onClose={() => setPaletteIndex(null)} onSelect={addBlock} />}

      {pendingLocale ? (
        <div className="docs-sheet-backdrop" role="presentation" onClick={() => setPendingLocale(null)}>
          <div
            aria-label={t('docs.admin.addLanguage')}
            aria-modal="true"
            className="docs-sheet"
            role="dialog"
            onClick={event => event.stopPropagation()}
          >
            <span className="sheet-handle" />

            <div className="docs-sheet__head">
              <strong>{t('docs.admin.addLanguageSheet', { label: localeMeta[pendingLocale]?.label || pendingLocale })}</strong>
              <small>{t('docs.admin.addLanguageSheetHint')}</small>
            </div>

            <div className="docs-start__grid">
              <button className="docs-start__item" type="button" onClick={() => addVersion(pendingLocale)}>
                <span className="docs-start__icon" aria-hidden="true"><FiFilePlus /></span>
                <strong>{t('docs.admin.versionEmpty')}</strong>
                <small>{t('docs.admin.versionEmptyHint')}</small>
              </button>
              <button
                className="docs-start__item"
                type="button"
                onClick={() => addVersion(pendingLocale, { copyFrom: activeLocale })}
              >
                <span className="docs-start__icon" aria-hidden="true"><FiCopy /></span>
                <strong>{t('docs.admin.versionCopy', { label: localeMeta[activeLocale]?.short || activeLocale })}</strong>
                <small>{t('docs.admin.versionCopyHint')}</small>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function buildDraft(article, locale) {
  return {
    id: article.id,
    icon: article.icon || '📘',
    theme: article.theme || 'nebula',
    status: docsStatuses.includes(article.status) ? article.status : 'draft',
    // Раздел справки (кнопка «?» в приложении) и попадание в блок «Частые вопросы».
    topic: article.topic || docsTopics[0].id,
    isFaq: Boolean(article.isFaq),
    translations: normalizeArticleVersions(
      Array.isArray(article.translations) && article.translations.length > 0
        ? article.translations
        : [createArticleVersion(locale || 'ru')],
    ),
  };
}

export default DocsArticleEditor;
