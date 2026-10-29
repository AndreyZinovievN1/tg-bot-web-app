import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FiCheck, FiGlobe } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';

/**
 * Переключатель языка.
 * Сегментированный список — используется в профиле и в шите из шапки.
 * Новый язык появится здесь автоматически после регистрации в src/i18n/locales.
 */
export function LanguageSwitcher({ onSelect }) {
  const { locale, locales, setLocale, t } = useTranslation();

  return (
    <div className="lang-switch" role="radiogroup" aria-label={t('lang.aria')}>
      {locales.map(option => {
        const isActive = option.code === locale;

        return (
          <button
            aria-checked={isActive}
            className={`lang-switch__btn ${isActive ? 'is-active' : ''}`}
            key={option.code}
            role="radio"
            type="button"
            onClick={() => {
              setLocale(option.code);

              if (onSelect) {
                onSelect(option.code);
              }
            }}
          >
            <span className="lang-switch__flag" aria-hidden="true">{option.flag}</span>
            <span className="lang-switch__label">{option.label}</span>
            <span className="lang-switch__check" aria-hidden="true">{isActive ? <FiCheck /> : null}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Компактная кнопка для шапки: открывает шит с выбором языка.
 */
export function HeaderLanguageButton() {
  const [open, setOpen] = useState(false);
  const { meta, t } = useTranslation();

  return (
    <>
      <button
        aria-label={t('lang.open')}
        className="app-header__lang"
        title={t('lang.current', { label: meta.label })}
        type="button"
        onClick={() => setOpen(true)}
      >
        <FiGlobe />
        <span>{meta.short}</span>
      </button>

      {open
        ? createPortal(
            // Портал: шапка имеет transform и overflow, поэтому шит рендерим в body,
            // иначе position: fixed считался бы от шапки и обрезался бы по её краям.
            <div className="lang-sheet-backdrop" role="presentation" onClick={() => setOpen(false)}>
              <div
                aria-label={t('lang.title')}
                aria-modal="true"
                className="lang-sheet"
                role="dialog"
                onClick={event => event.stopPropagation()}
              >
                <div className="lang-sheet__head">
                  <FiGlobe />
                  <div>
                    <strong>{t('lang.title')}</strong>
                    <small>{t('lang.subtitle')}</small>
                  </div>
                </div>

                <LanguageSwitcher onSelect={() => setOpen(false)} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export default LanguageSwitcher;
