import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FiCheck, FiHash, FiLock, FiShield, FiTrash2, FiUnlock, FiX } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import CodePad from './CodePad.jsx';
import PatternLock from './PatternLock.jsx';

/** Доступные длины числового кода — как в ботах: короткий и длинный. */
const CODE_LENGTHS = [4, 8];

/**
 * Окно «Доступ в админку»: владелец выбирает способ входа (фигура или код),
 * длину кода (4 или 8 цифр), задаёт новое значение в два шага или удаляет способ.
 *
 * Вверху — тумблер защиты: «С паролем» (фигура/код) и «Без пароля» (админка
 * открывается сразу владельцу бота, хеши при этом сохраняются).
 *
 * Все изменения отправляются на `POST /api/admin/access` (нужна активная сессия
 * админки), ответ считается актуальным состоянием способов входа.
 */
function AdminAccessModal({ access, adminRequest, busy, onClose, onMessage, onSaved }) {
  const { t } = useTranslation();
  const methods = access?.methods || { pattern: false, code: false };
  const [type, setType] = useState(() => (methods.code && !methods.pattern ? 'code' : 'pattern'));
  const [codeLength, setCodeLength] = useState(access?.codeLength || CODE_LENGTHS[0]);
  /** Первый ввод: строка кода или точки фигуры, склеенные через дефис. */
  const [firstValue, setFirstValue] = useState('');
  const [step, setStep] = useState('new');
  const [codeInput, setCodeInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [notice, setNotice] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  /** Защита выключена: «вход без пароля». Локальная копия, чтобы окно сразу реагировало. */
  const [disabled, setDisabled] = useState(Boolean(access?.disabled));

  const configured = Boolean(methods[type]);
  const otherMethod = type === 'code' ? methods.pattern : methods.code;
  const methodLabel = type === 'code' ? t('admin.methodCode') : t('admin.methodPattern');
  const ready = step === 'repeat' && status === 'success' && firstValue !== '';
  const working = localBusy || busy;

  const resetInput = () => {
    setFirstValue('');
    setStep('new');
    setCodeInput('');
    setStatus('idle');
    setNotice('');
    setConfirmRemove(false);
  };

  /**
   * Тумблер защиты. Пишем сразу на сервер и остаёмся в окне, чтобы владелец видел
   * результат: фигура и код при этом не стираются — вернув пароль, он получит
   * прежний способ входа.
   */
  const setProtection = async next => {
    if (working || next === disabled) {
      return;
    }

    setLocalBusy(true);
    try {
      const payload = await adminRequest('/api/admin/access', {
        method: 'POST',
        body: JSON.stringify({ disabled: next })
      });

      resetInput();
      setDisabled(Boolean(payload.disabled));
      setStatus('success');
      setNotice(next ? t('admin.accessFreeOn') : t('admin.accessFreeOff'));
      onSaved?.(payload);
    } catch (error) {
      setStatus('error');
      setNotice(error.message);
    } finally {
      setLocalBusy(false);
    }
  };

  const selectType = nextType => {
    if (nextType === type) {
      return;
    }

    setType(nextType);
    resetInput();
  };

  const selectLength = nextLength => {
    if (nextLength === codeLength) {
      return;
    }

    setCodeLength(nextLength);
    resetInput();
  };

  /** Значение собрано: первый ввод запоминаем, второй сверяем. */
  const acceptValue = value => {
    setCodeInput('');

    if (step === 'new') {
      setFirstValue(value);
      setStep('repeat');
      setStatus('idle');
      setNotice(t('admin.accessRepeat'));
      return;
    }

    if (value !== firstValue) {
      setFirstValue('');
      setStep('new');
      setStatus('error');
      setNotice(t('admin.accessMismatch'));
      return;
    }

    setStatus('success');
    setNotice(t('admin.accessReady'));
  };

  const save = async () => {
    if (!ready || working) {
      return;
    }

    setLocalBusy(true);
    setNotice('');
    try {
      const payload = await adminRequest('/api/admin/access', {
        method: 'POST',
        body: JSON.stringify({
          type,
          value: type === 'code' ? firstValue : firstValue.split('-').map(Number)
        })
      });

      onSaved?.(payload);
      onMessage?.(t('admin.accessSaved', { method: methodLabel }));
      onClose?.();
    } catch (error) {
      setStatus('error');
      setNotice(error.message);
    } finally {
      setLocalBusy(false);
    }
  };

  const remove = async () => {
    if (!configured || !otherMethod || working) {
      return;
    }

    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }

    setLocalBusy(true);
    setNotice('');
    try {
      const payload = await adminRequest('/api/admin/access', {
        method: 'POST',
        body: JSON.stringify({ type, remove: true })
      });

      onSaved?.(payload);
      onMessage?.(t('admin.accessRemoved', { method: methodLabel }));
      onClose?.();
    } catch (error) {
      setStatus('error');
      setNotice(error.message);
    } finally {
      setLocalBusy(false);
    }
  };

  return createPortal(
    <div className="admin-access-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={t('admin.accessTitle')}
        aria-modal="true"
        className="admin-access"
        role="dialog"
        onClick={event => event.stopPropagation()}
      >
        <span className="sheet-handle" />

        <button
          aria-label={t('admin.accessClose')}
          className="admin-access__close"
          title={t('admin.accessClose')}
          type="button"
          onClick={onClose}
        >
          <FiX />
        </button>

        <header className="admin-access__head">
          <h3>{t('admin.accessTitle')}</h3>
          <p>{t('admin.accessHint')}</p>
        </header>

        {/* Тумблер защиты: «С паролем» — фигура или код, «Без пароля» — вход без них. */}
        <div className="admin-access__switch" role="tablist">
          <button
            aria-selected={!disabled}
            className={!disabled ? 'is-active' : ''}
            disabled={working}
            role="tab"
            type="button"
            onClick={() => setProtection(false)}
          >
            <FiLock /> {t('admin.accessProtected')}
          </button>
          <button
            aria-selected={disabled}
            className={disabled ? 'is-active is-off' : ''}
            disabled={working}
            role="tab"
            type="button"
            onClick={() => setProtection(true)}
          >
            <FiUnlock /> {t('admin.accessFree')}
          </button>
        </div>

        {disabled ? (
          <div className="admin-access__free">
            <FiUnlock />
            <span>{t('admin.accessFreeHint')}</span>
          </div>
        ) : (
          <>
            <div className="admin-methods" role="tablist">
              <button
                aria-selected={type === 'pattern'}
                className={type === 'pattern' ? 'is-active' : ''}
                role="tab"
                type="button"
                onClick={() => selectType('pattern')}
              >
                <FiShield /> {t('admin.methodPattern')}
              </button>
              <button
                aria-selected={type === 'code'}
                className={type === 'code' ? 'is-active' : ''}
                role="tab"
                type="button"
                onClick={() => selectType('code')}
              >
                <FiHash /> {t('admin.methodCode')}
              </button>
            </div>

            <div className="admin-access__chips">
              <span className={`admin-access__chip${configured ? ' is-on' : ''}`}>
                {configured ? <FiCheck /> : null}
                {configured
                  ? t('admin.accessConfigured', { method: methodLabel })
                  : t('admin.accessNotConfigured', { method: methodLabel })}
              </span>
              {type === 'code' && (
                <span className="admin-access__chip">{t('admin.accessLengthChip', { length: codeLength })}</span>
              )}
            </div>

            {type === 'code' && (
              <div className="admin-code-length" role="tablist">
                {CODE_LENGTHS.map(option => (
                  <button
                    aria-selected={codeLength === option}
                    className={codeLength === option ? 'is-active' : ''}
                    key={option}
                    role="tab"
                    type="button"
                    onClick={() => selectLength(option)}
                  >
                    {t('admin.codeLengthOption', { length: option })}
                  </button>
                ))}
              </div>
            )}

            <p className="admin-hint admin-hint--center">
              {step === 'new'
                ? (type === 'code' ? t('admin.codeHint', { length: codeLength }) : t('admin.patternHint'))
                : t('admin.accessRepeat')}
            </p>

            {type === 'code' ? (
              <CodePad
                disabled={working}
                length={codeLength}
                status={status}
                value={codeInput}
                onChange={setCodeInput}
                onComplete={acceptValue}
              />
            ) : (
              <PatternLock
                disabled={working}
                status={status}
                onComplete={pattern => acceptValue(pattern.join('-'))}
              />
            )}

            <div className="admin-access__actions">
              <button
                className="admin-access__remove"
                disabled={working || !configured || !otherMethod}
                title={configured && !otherMethod ? t('admin.accessLastMethod') : t('admin.accessRemove')}
                type="button"
                onClick={remove}
              >
                <FiTrash2 /> {confirmRemove ? t('admin.accessRemoveConfirm') : t('admin.accessRemove')}
              </button>
              <button
                className="admin-access__save"
                disabled={!ready || working}
                type="button"
                onClick={save}
              >
                <FiCheck /> {t('admin.accessSave')}
              </button>
            </div>
          </>
        )}

        {notice && <div className={`admin-access__notice is-${status}`}>{notice}</div>}
      </div>
    </div>,
    document.body
  );
}

export default AdminAccessModal;
