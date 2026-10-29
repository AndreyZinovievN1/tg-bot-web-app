import { useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';

/** Блок «код»: моноширинный листинг с кнопкой копирования. */
function DocsCodeBlock({ code, language }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(code || ''));

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Буфер обмена может быть недоступен в WebView — просто не показываем подтверждение.
    }
  };

  return (
    <div className="docs-block docs-block--code">
      <div className="docs-code__head">
        <span>{language || t('docs.codeFallback')}</span>
        <button className="docs-code__copy" type="button" onClick={copy}>
          {copied ? <FiCheck /> : <FiCopy />}
          {copied ? t('docs.copied') : t('docs.copy')}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default DocsCodeBlock;
