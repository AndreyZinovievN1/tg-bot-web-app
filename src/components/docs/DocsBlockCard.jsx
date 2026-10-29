import { useState } from 'react';
import { FiArrowDown, FiArrowUp, FiChevronDown, FiCopy, FiEye, FiEyeOff, FiTrash2 } from 'react-icons/fi';
import { docsBlockTypes } from '../../config/docs.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { blockSummary } from '../../utils/docs.js';
import { DocsBlockView } from './DocsArticleView.jsx';
import DocsBlockFields from './DocsBlockFields.jsx';

/**
 * Карточка одного блока статьи в редакторе.
 *
 * Свёрнутая карточка — это одна строка с типом и кратким описанием и ни одной
 * кнопки: длинную статью видно целиком. Клик по строке раскрывает поля, и уже
 * там доступны действия — предпросмотр «как в статье», порядок, копия и удаление.
 */
function DocsBlockCard({ block, index, total, theme, onChange, onRemove, onDuplicate, onMove, initiallyOpen }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(Boolean(initiallyOpen));
  const [preview, setPreview] = useState(false);
  const meta = docsBlockTypes.find(item => item.type === block.type) || docsBlockTypes[1];
  const summary = blockSummary(block, t);
  const previewLabel = preview ? t('docs.admin.editBlock') : t('docs.admin.previewBlock');

  return (
    <section className={`docs-blockcard is-${block.type} ${open ? 'is-open' : ''}`}>
      <button
        aria-expanded={open}
        className="docs-blockcard__head"
        type="button"
        onClick={() => setOpen(current => !current)}
      >
        <span className="docs-blockcard__icon" aria-hidden="true">{meta.icon}</span>
        <span className="docs-blockcard__name">{t(meta.labelKey)}</span>
        <span className="docs-blockcard__index">{index + 1}</span>
        {summary ? <span className="docs-blockcard__summary">{summary}</span> : null}
        <FiChevronDown className="docs-blockcard__chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="docs-blockcard__body">
          {preview ? (
            <div className="docs-blockcard__preview" data-doc-theme={theme || 'nebula'}>
              <DocsBlockView block={block} />
            </div>
          ) : (
            <DocsBlockFields block={block} onChange={onChange} />
          )}

          <div className="docs-blockcard__actions">
            <button
              aria-label={previewLabel}
              className={`docs-ico ${preview ? 'is-active' : ''}`}
              title={previewLabel}
              type="button"
              onClick={() => setPreview(current => !current)}
            >
              {preview ? <FiEyeOff /> : <FiEye />}
            </button>
            <button
              aria-label={t('docs.admin.moveBlockUp')}
              className="docs-ico"
              disabled={index === 0}
              title={t('docs.admin.moveBlockUp')}
              type="button"
              onClick={() => onMove(-1)}
            >
              <FiArrowUp />
            </button>
            <button
              aria-label={t('docs.admin.moveBlockDown')}
              className="docs-ico"
              disabled={index === total - 1}
              title={t('docs.admin.moveBlockDown')}
              type="button"
              onClick={() => onMove(1)}
            >
              <FiArrowDown />
            </button>
            <button
              aria-label={t('docs.admin.duplicateBlock')}
              className="docs-ico"
              title={t('docs.admin.duplicateBlock')}
              type="button"
              onClick={onDuplicate}
            >
              <FiCopy />
            </button>
            <button
              aria-label={t('docs.admin.deleteBlock')}
              className="docs-ico is-danger"
              title={t('docs.admin.deleteBlock')}
              type="button"
              onClick={onRemove}
            >
              <FiTrash2 />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default DocsBlockCard;
