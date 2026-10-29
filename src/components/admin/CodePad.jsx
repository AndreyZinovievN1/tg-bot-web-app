import { FiDelete, FiX } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Ввод числового кода доступа (4 или 8 цифр) с экранной клавиатуры.
 *
 * Значение полностью контролируется родителем: `value` — уже введённые цифры,
 * `onChange` приходит на каждое нажатие, `onComplete` — когда набрана последняя
 * цифра (тогда родитель отправляет код на проверку). `status` подсвечивает
 * ошибку ввода анимацией.
 */
function CodePad({ disabled, length = 4, status = 'idle', value, onChange, onComplete }) {
  const { t } = useTranslation();
  const slots = Array.from({ length }, (_, index) => index);

  const press = digit => {
    if (disabled || value.length >= length) {
      return;
    }

    const next = `${value}${digit}`;

    onChange?.(next);

    if (next.length === length) {
      onComplete?.(next);
    }
  };

  const erase = () => {
    if (disabled) {
      return;
    }

    onChange?.(value.slice(0, -1));
  };

  const clear = () => {
    if (disabled) {
      return;
    }

    onChange?.('');
  };

  return (
    <div className={`code-pad is-${status}`}>
      <div className="code-pad__slots" aria-hidden="true">
        {slots.map(index => (
          <span className={`code-pad__slot${index < value.length ? ' is-filled' : ''}`} key={index} />
        ))}
      </div>

      <div className="code-pad__keys">
        {DIGITS.map(digit => (
          <button
            className="code-pad__key"
            disabled={disabled}
            key={digit}
            type="button"
            onClick={() => press(digit)}
          >
            {digit}
          </button>
        ))}

        <button
          aria-label={t('admin.codeClear')}
          className="code-pad__key is-ghost"
          disabled={disabled || value.length === 0}
          title={t('admin.codeClear')}
          type="button"
          onClick={clear}
        >
          <FiX />
        </button>

        <button
          className="code-pad__key"
          disabled={disabled}
          type="button"
          onClick={() => press('0')}
        >
          0
        </button>

        <button
          aria-label={t('admin.codeErase')}
          className="code-pad__key is-ghost"
          disabled={disabled || value.length === 0}
          title={t('admin.codeErase')}
          type="button"
          onClick={erase}
        >
          <FiDelete />
        </button>
      </div>
    </div>
  );
}

export default CodePad;
