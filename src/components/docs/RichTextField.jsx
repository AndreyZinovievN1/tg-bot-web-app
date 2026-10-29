import { useRef, useState } from 'react';
import { FiBold, FiCheck, FiCode, FiEye, FiEyeOff, FiItalic, FiLink, FiUnderline, FiX } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import { applyMarkup, insertLinkMarkup } from '../../utils/richText.js';
import RichText from './RichText.jsx';

/**
 * Текстовое поле с форматированием.
 *
 * Разметка хранится обычным текстом, поэтому кнопки тулбара только оборачивают
 * выделение маркерами, а режим предпросмотра показывает результат «как в статье».
 * Такой подход работает на любых WebView и не ломает сохранение на сервере.
 */
function RichTextField({ value, onChange, placeholder, rows = 4, compact = false }) {
  const { t } = useTranslation();
  const areaRef = useRef(null);
  const [preview, setPreview] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('https://');

  const writeResult = result => {
    onChange(result.value);

    window.requestAnimationFrame(() => {
      const element = areaRef.current;

      if (!element) {
        return;
      }

      element.focus();
      element.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const wrap = (before, after) => {
    const element = areaRef.current;

    if (!element) {
      return;
    }

    writeResult(applyMarkup({
      value: element.value,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
      before,
      after: after ?? before,
    }));
  };

  const applyLink = () => {
    const href = linkValue.trim();
    const element = areaRef.current;

    setLinkOpen(false);
    setLinkValue('https://');

    if (!href || href === 'https://' || !element) {
      return;
    }

    writeResult(insertLinkMarkup({
      value: element.value,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
      href,
      label: t('docs.admin.linkLabel'),
    }));
  };

  const keepFocus = event => event.preventDefault();

  return (
    <div className={`docs-rt ${compact ? 'is-compact' : ''}`}>
      <div className="docs-rt__toolbar">
        <button className="docs-rt__btn" type="button" title={t('docs.admin.markBold')} onMouseDown={keepFocus} onClick={() => wrap('**')}>
          <FiBold />
        </button>
        <button className="docs-rt__btn" type="button" title={t('docs.admin.markItalic')} onMouseDown={keepFocus} onClick={() => wrap('*')}>
          <FiItalic />
        </button>
        <button className="docs-rt__btn" type="button" title={t('docs.admin.markUnderline')} onMouseDown={keepFocus} onClick={() => wrap('__')}>
          <FiUnderline />
        </button>
        <button className="docs-rt__btn docs-rt__btn--strike" type="button" title={t('docs.admin.markStrike')} onMouseDown={keepFocus} onClick={() => wrap('~~')}>
          S
        </button>
        <button className="docs-rt__btn" type="button" title={t('docs.admin.markCode')} onMouseDown={keepFocus} onClick={() => wrap('`')}>
          <FiCode />
        </button>
        <button className="docs-rt__btn" type="button" title={t('docs.admin.markLink')} onMouseDown={keepFocus} onClick={() => setLinkOpen(current => !current)}>
          <FiLink />
        </button>

        <span className="docs-rt__spacer" />

        <button
          className={`docs-rt__btn ${preview ? 'is-active' : ''}`}
          type="button"
          title={preview ? t('docs.admin.hidePreview') : t('docs.admin.showPreview')}
          onMouseDown={keepFocus}
          onClick={() => setPreview(current => !current)}
        >
          {preview ? <FiEyeOff /> : <FiEye />}
        </button>
      </div>

      {linkOpen && (
        <div className="docs-rt__link">
          <input
            autoFocus
            inputMode="url"
            placeholder="https://"
            value={linkValue}
            onChange={event => setLinkValue(event.target.value)}
          />
          <button className="docs-rt__btn" type="button" title={t('docs.admin.linkApply')} onClick={applyLink}>
            <FiCheck />
          </button>
          <button className="docs-rt__btn" type="button" title={t('docs.admin.cancel')} onClick={() => setLinkOpen(false)}>
            <FiX />
          </button>
        </div>
      )}

      <textarea
        ref={areaRef}
        className="docs-rt__area"
        placeholder={placeholder}
        rows={rows}
        value={value}
        onChange={event => onChange(event.target.value)}
      />

      {preview && (
        <div className="docs-rt__preview">
          <RichText text={value || t('docs.admin.nothingToPreview')} />
        </div>
      )}
    </div>
  );
}

export default RichTextField;
