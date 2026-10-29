import { docsExtraBlocks, docsPrimaryBlocks } from '../../config/docs.js';
import { useTranslation } from '../../i18n/I18nContext.js';

/**
 * Палитра типов блоков: сверху семь основных, редкие (таблицы, код, спойлеры
 * и т.д.) спрятаны под «Другие блоки» — так выбор не превращается в стену кнопок.
 */
function DocsBlockPalette({ onSelect, onClose }) {
  const { t } = useTranslation();

  const renderItem = item => (
    <button key={item.type} className="docs-sheet__item" type="button" onClick={() => onSelect(item.type)}>
      <span className="docs-sheet__icon" aria-hidden="true">{item.icon}</span>
      <strong>{t(item.labelKey)}</strong>
      <small>{t(item.hintKey)}</small>
    </button>
  );

  return (
    <div className="docs-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={t('docs.admin.blockPalette')}
        aria-modal="true"
        className="docs-sheet"
        role="dialog"
        onClick={event => event.stopPropagation()}
      >
        <span className="sheet-handle" />

        <div className="docs-sheet__head">
          <strong>{t('docs.admin.blockPalette')}</strong>
          <small>{t('docs.admin.blockPaletteHint')}</small>
        </div>

        <div className="docs-sheet__grid">{docsPrimaryBlocks.map(renderItem)}</div>

        {docsExtraBlocks.length > 0 ? (
          <details className="docs-sheet__more">
            <summary>
              {t('docs.admin.moreBlocks')}
              <small>{t('docs.admin.moreBlocksHint')}</small>
            </summary>
            <div className="docs-sheet__grid">{docsExtraBlocks.map(renderItem)}</div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export default DocsBlockPalette;
