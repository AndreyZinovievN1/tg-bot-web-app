import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import { localeMeta } from '../../i18n/locales/index.js';

/**
 * Табы языковых версий статьи.
 * Здесь же добавляются отсутствующие языки и удаляется активная версия —
 * админ сам решает, какие языки вести (например только RU и EN).
 */
function DocsLanguageTabs({ locales, active, missing, onSelect, onAdd, onRemove }) {
  const { t } = useTranslation();
  const available = Array.isArray(locales) ? locales : [];

  return (
    <div className="docs-lang">
      <div className="docs-lang__tabs" role="tablist" aria-label={t('docs.admin.languageVersions')}>
        {available.map(code => {
          const meta = localeMeta[code] || { short: code, label: code, flag: '🏳' };
          const isActive = code === active;

          return (
            <button
              key={code}
              aria-selected={isActive}
              className={`docs-lang__tab ${isActive ? 'is-active' : ''}`}
              role="tab"
              type="button"
              onClick={() => onSelect(code)}
            >
              <span className="docs-lang__flag" aria-hidden="true">{meta.flag}</span>
              <span className="docs-lang__code">{meta.short}</span>
              <small>{meta.label}</small>
            </button>
          );
        })}
      </div>

      <div className="docs-lang__extra">
        {(missing || []).map(code => {
          const meta = localeMeta[code] || { short: code, flag: '🏳' };

          return (
            <button key={code} className="docs-lang__add" type="button" onClick={() => onAdd(code)}>
              <FiPlus />
              {t('docs.admin.addLanguage')}
              <span aria-hidden="true">{meta.flag} {meta.short}</span>
            </button>
          );
        })}

        {onRemove && available.length > 1 ? (
          <button className="docs-lang__remove" type="button" onClick={onRemove}>
            <FiTrash2 />
            {t('docs.admin.removeLanguage')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default DocsLanguageTabs;
