import { FiCheck } from 'react-icons/fi';
import { docsThemes } from '../../config/docs.js';
import { useTranslation } from '../../i18n/I18nContext.js';

/** Выбор тематического оформления статьи: градиенты, светлые и тёмные темы. */
function DocsThemePicker({ value, onChange }) {
  const { t } = useTranslation();

  return (
    <div className="docs-themes" role="radiogroup" aria-label={t('docs.admin.themeField')}>
      {docsThemes.map(theme => {
        const isActive = theme.id === value;

        return (
          <button
            key={theme.id}
            aria-checked={isActive}
            className={`docs-theme ${isActive ? 'is-active' : ''}`}
            data-doc-theme={theme.id}
            role="radio"
            type="button"
            onClick={() => onChange(theme.id)}
          >
            <span className="docs-theme__swatch" aria-hidden="true" />
            <span className="docs-theme__label">{t(theme.labelKey)}</span>
            {isActive ? <span className="docs-theme__check" aria-hidden="true"><FiCheck /></span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default DocsThemePicker;
