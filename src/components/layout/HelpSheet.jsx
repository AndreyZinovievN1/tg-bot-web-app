import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiBookOpen, FiCheck, FiX } from 'react-icons/fi';
import { helpSectionMeta, helpTipsCount } from '../../config/help.js';
import { useTranslation } from '../../i18n/I18nContext.js';

/**
 * Всплывающее окно «?»: короткая справка по текущему разделу.
 *
 * Пользователь не уходит со страницы: полная документация открывается
 * отдельной кнопкой. Закрывается крестиком, кликом по фону и клавишей Esc.
 */
function HelpSheet({ sectionId, onClose, onOpenDocs }) {
  const { t } = useTranslation();
  const meta = helpSectionMeta(sectionId);
  const Icon = meta.icon;
  const tips = Array.from({ length: helpTipsCount }, (_, index) => t(`${meta.textKey}.tips.${index}`));

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="help-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={t(`${meta.textKey}.title`)}
        aria-modal="true"
        className={`help-sheet help-sheet--${meta.tone}`}
        role="dialog"
        onClick={event => event.stopPropagation()}
      >
        <span className="help-sheet__glow" aria-hidden="true" />
        <span className="sheet-handle" />

        <div className="help-sheet__head">
          <span className="help-sheet__icon" aria-hidden="true">
            <Icon />
          </span>

          <span className="help-sheet__titles">
            <strong>{t(`${meta.textKey}.title`)}</strong>
            <small>{t('help.subtitle')}</small>
          </span>

          <button
            aria-label={t('help.close')}
            className="help-sheet__close"
            title={t('help.close')}
            type="button"
            onClick={onClose}
          >
            <FiX />
          </button>
        </div>

        <p className="help-sheet__text">{t(`${meta.textKey}.text`)}</p>

        <ul className="help-sheet__tips">
          {tips.map((tip, index) => (
            <li key={`tip-${index}`}>
              <FiCheck aria-hidden="true" />
              <span>{tip}</span>
            </li>
          ))}
        </ul>

        {onOpenDocs ? (
          <div className="help-sheet__footer">
            <button className="help-sheet__docs" type="button" onClick={() => onOpenDocs(meta.topic)}>
              <FiBookOpen />
              {t('help.openDocs')}
            </button>
            <small>{t('help.docsHint')}</small>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export default HelpSheet;
