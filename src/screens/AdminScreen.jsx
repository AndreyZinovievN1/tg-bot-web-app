import { useCallback, useEffect, useRef, useState } from 'react';
import { FiBookOpen, FiHash, FiKey, FiLock, FiLogOut, FiPackage, FiSearch, FiShield, FiTarget, FiTool, FiUnlock, FiUser } from 'react-icons/fi';
import { apiRequest } from '../api/client.js';
import DocsAdminPanel from '../components/docs/DocsAdminPanel.jsx';
import AdminAccessModal from '../components/admin/AdminAccessModal.jsx';
import CasesAdminPanel from '../components/admin/CasesAdminPanel.jsx';
import CodePad from '../components/admin/CodePad.jsx';
import MissionsAdminPanel from '../components/admin/MissionsAdminPanel.jsx';
import PatternLock from '../components/admin/PatternLock.jsx';
import Fact from '../components/common/Fact.jsx';
import { caseTypes } from '../config/casesMeta.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { caseShortTitle } from '../utils/caseText.js';
import { formatActivity, formatDate, formatMarriageDate, formatNumber } from '../utils/formatters.js';

function AdminScreen({ initData }) {
  const { t } = useTranslation();
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('spaceAdminToken') || '');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  const [searchId, setSearchId] = useState('');
  const [userInfo, setUserInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState('users');
  /** Выбранный способ входа: `pattern` — фигура, `code` — числовой код. */
  const [method, setMethod] = useState('pattern');
  const [codeInput, setCodeInput] = useState('');
  const [patternLength, setPatternLength] = useState(0);
  const [loginStatus, setLoginStatus] = useState('idle');
  /** Настроенные способы входа с сервера: `{ methods, codeLength, disabled }`. */
  const [access, setAccess] = useState(null);
  const [accessError, setAccessError] = useState('');
  const [accessOpen, setAccessOpen] = useState(false);
  /** Режим «тех. работы»: `{ enabled }` с сервера, кнопка — в шапке админки. */
  const [maintenance, setMaintenance] = useState(null);

  useEffect(() => {
    if (!lockedUntil) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  /**
   * Способы входа знает сервер: по ним выбираем подходящую вкладку входа,
   * а `disabled` сообщает, что защита выключена и пароль не нужен вовсе.
   */
  useEffect(() => {
    let cancelled = false;

    apiRequest('/api/admin/access', {}, initData)
      .then(payload => {
        if (!cancelled) {
          setAccess({
            methods: payload.methods,
            codeLength: payload.codeLength,
            disabled: Boolean(payload.disabled)
          });
          setAccessError('');
        }
      })
      .catch(error => {
        if (!cancelled) {
          setAccess(null);
          setAccessError(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initData]);

  const lockLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = lockLeft > 0;

  /**
   * Вход по фигуре или по числовому коду. Сервер сам знает, какие способы
   * настроены, и вместе с ошибкой отдаёт `methods` — тогда переключаем вкладку
   * на доступный способ и показываем подсказку.
   */
  const login = async (type, value) => {
    if (locked || busy) {
      return;
    }

    setBusy(true);
    setMessage('');
    setLoginStatus('idle');

    try {
      const payload = await apiRequest('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify(type === 'code' ? { code: value } : { pattern: value })
      }, initData);

      setAdminToken(payload.token);
      sessionStorage.setItem('spaceAdminToken', payload.token);
      setAttempts(0);
      setLoginStatus('success');
      if (payload.methods) {
        setAccess(current => ({
          methods: payload.methods,
          codeLength: payload.codeLength || current?.codeLength || 4,
          disabled: Boolean(payload.disabled)
        }));
      }
      setMessage(t('admin.loggedIn'));
    } catch (error) {
      const retryAfter = Number(error.payload?.retryAfter || 0);
      const attemptsLeft = Number(error.payload?.attemptsLeft);
      const methods = error.payload?.methods;

      setLoginStatus('error');
      // Цифры кода держим на экране во время проверки, а после ошибки очищаем.
      setCodeInput('');

      if (retryAfter > 0) {
        setLockedUntil(Date.now() + retryAfter * 1000);
        setAttempts(0);
      } else if (Number.isFinite(attemptsLeft)) {
        setAttempts(Math.max(0, 3 - attemptsLeft));
      }

      if (methods) {
        setAccess(current => ({
          methods,
          codeLength: error.payload?.codeLength || current?.codeLength || 4,
          disabled: Boolean(error.payload?.disabled)
        }));
        setMethod(currentMethod => (methods[currentMethod] ? currentMethod : (methods.code ? 'code' : 'pattern')));
      }

      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const findUser = async event => {
    event.preventDefault();
    if (!searchId.trim()) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const payload = await adminRequest(`/api/admin/users/${encodeURIComponent(searchId.trim())}`);
      setUserInfo(payload);
    } catch (error) {
      setUserInfo(null);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const grantCase = async (chatId, caseType) => {
    setBusy(true);
    setMessage('');
    try {
      const payload = await adminRequest(`/api/admin/users/${encodeURIComponent(chatId)}/cases`, {
        method: 'POST',
        body: JSON.stringify({ caseType, quantity: 1 })
      });
      setUserInfo(current => current ? { ...current, cases: payload.cases } : current);
      setMessage(t('admin.caseGranted'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  /** Ответ окна «Доступ»: сервер вернул актуальные способы входа и тумблер. */
  const handleAccessSaved = payload => {
    if (payload?.methods) {
      setAccess({
        methods: payload.methods,
        codeLength: payload.codeLength || 4,
        disabled: Boolean(payload.disabled)
      });
    }
  };

  const logout = () => {
    setAdminToken('');
    setUserInfo(null);
    sessionStorage.removeItem('spaceAdminToken');
  };

  const adminRequest = useCallback((path, options = {}) => apiRequest(path, {
    ...options,
    headers: {
      'x-admin-token': adminToken,
      ...(options.headers || {})
    }
  }, initData), [adminToken, initData]);

  /**
   * Флаг тех. работ подтягиваем после входа в админку: до логина шапки с кнопкой
   * нет, а после выхода состояние сбрасывается и кнопка пропадает.
   */
  useEffect(() => {
    if (!adminToken) {
      setMaintenance(null);
      return undefined;
    }

    let cancelled = false;

    adminRequest('/api/admin/maintenance')
      .then(payload => {
        if (!cancelled) {
          setMaintenance({ enabled: Boolean(payload.enabled) });
        }
      })
      .catch(() => {
        // Ручка недоступна (старый сервер, нет прав) — просто не показываем кнопку.
        if (!cancelled) {
          setMaintenance(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adminToken, adminRequest]);

  /** Тумблер тех. работ: закрывает приложение всем, кроме владельца бота. */
  const toggleMaintenance = async () => {
    if (busy || !maintenance) {
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const payload = await adminRequest('/api/admin/maintenance', {
        method: 'POST',
        body: JSON.stringify({ enabled: !maintenance.enabled })
      });

      setMaintenance({ enabled: Boolean(payload.enabled) });
      setMessage(t(payload.enabled ? 'admin.maintenanceEnabled' : 'admin.maintenanceDisabled'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Вход без пароля: тело запроса пустое, а сервер видит выключенную защиту и
   * сам пускает владельца бота. Отдельный колбэк (а не `login`) — чтобы его можно
   * было вызвать и из кнопки, и из эффекта авто-входа без лишних перерисовок.
   */
  const openWithoutPassword = useCallback(async () => {
    setBusy(true);
    setMessage('');
    setLoginStatus('idle');

    try {
      const payload = await apiRequest('/api/admin/login', { method: 'POST' }, initData);

      setAdminToken(payload.token);
      sessionStorage.setItem('spaceAdminToken', payload.token);
      setLoginStatus('success');
    } catch (error) {
      setLoginStatus('error');
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }, [initData]);

  /** Защита выключена тумблером «Без пароля»: владельцу нечего вводить. */
  const passwordless = Boolean(access?.disabled);
  /** Авто-вход пробуем один раз, чтобы ошибка сети не крутила экран бесконечно. */
  const autoLoginTried = useRef(false);

  useEffect(() => {
    if (!passwordless || adminToken || autoLoginTried.current) {
      return;
    }

    autoLoginTried.current = true;
    openWithoutPassword();
  }, [passwordless, adminToken, openWithoutPassword]);

  /** Ни один способ ещё не задан: сервер разрешит задать его первым вводом. */
  const nothingConfigured = !access || (!access.methods.pattern && !access.methods.code);
  /** Показываем настроенный способ: если выбранного нет — доступный. */
  const activeMethod = nothingConfigured || access.methods[method]
    ? method
    : (access.methods.code ? 'code' : 'pattern');
  const codeLength = access?.codeLength || 4;
  /** Переключатель нужен, когда доступны оба способа или ещё ни один не задан. */
  const switchVisible = nothingConfigured || (access.methods.pattern && access.methods.code);

  if (!adminToken) {
    // Защита выключена («вход без пароля»): фигуру и код не спрашиваем — владельцу
    // бота достаточно нажать «Войти» (и это же делает авто-вход выше).
    if (passwordless) {
      return (
        <section className="screen admin-screen">
          <div className="admin-hero">
            <div className="admin-hero__icon"><FiUnlock /></div>
            <h2>{t('admin.panelTitle')}</h2>
            <p>{t('admin.openSubtitle')}</p>
          </div>

          <section className="profile-panel">
            <div className="profile-panel__head">
              <h3><FiUnlock /> {t('admin.openTitle')}</h3>
            </div>
            <div className="profile-panel__body admin-login">
              <p className="admin-hint admin-hint--center">{t('admin.openHint')}</p>
              <button
                className="admin-open__btn"
                disabled={busy}
                type="button"
                onClick={openWithoutPassword}
              >
                <FiUnlock /> {t('admin.openEnter')}
              </button>
              {message && <div className="admin-message">{message}</div>}
              {accessError && <div className="admin-message">{accessError}</div>}
            </div>
          </section>
        </section>
      );
    }

    return (
      <section className="screen admin-screen">
        <div className="admin-hero">
          <div className="admin-hero__icon"><FiShield /></div>
          <h2>{t('admin.panelTitle')}</h2>
          <p>{t(switchVisible ? 'admin.loginSubtitle' : 'admin.loginSubtitleSingle')}</p>
        </div>

        <section className="profile-panel">
          <div className="profile-panel__head">
            <h3><FiLock /> {t('admin.loginTitle')}</h3>
          </div>
          <div className="profile-panel__body admin-login">
            {switchVisible ? (
              <div className="admin-methods" role="tablist">
                <button
                  aria-selected={activeMethod === 'pattern'}
                  className={activeMethod === 'pattern' ? 'is-active' : ''}
                  disabled={locked || busy}
                  role="tab"
                  type="button"
                  onClick={() => setMethod('pattern')}
                >
                  <FiShield /> {t('admin.methodPattern')}
                </button>
                <button
                  aria-selected={activeMethod === 'code'}
                  className={activeMethod === 'code' ? 'is-active' : ''}
                  disabled={locked || busy}
                  role="tab"
                  type="button"
                  onClick={() => setMethod('code')}
                >
                  <FiHash /> {t('admin.methodCode')}
                </button>
              </div>
            ) : (
              <div className={`admin-methods is-single is-${activeMethod}`}>
                {activeMethod === 'code' ? <FiHash /> : <FiShield />}
                <span>{activeMethod === 'code' ? t('admin.methodCode') : t('admin.methodPattern')}</span>
              </div>
            )}

            {nothingConfigured && (
              <p className="admin-hint admin-hint--center">{t('admin.bootstrapHint')}</p>
            )}

            {activeMethod === 'code' ? (
              <>
                <p className="admin-hint admin-hint--center">{t('admin.codeHint', { length: codeLength })}</p>
                <CodePad
                  disabled={locked || busy}
                  length={codeLength}
                  status={loginStatus}
                  value={codeInput}
                  onChange={setCodeInput}
                  onComplete={value => login('code', value)}
                />
              </>
            ) : (
              <>
                <p className="admin-hint admin-hint--center">{t('admin.patternHint')}</p>
                <PatternLock
                  disabled={locked || busy}
                  status={loginStatus}
                  onChange={path => setPatternLength(path.length)}
                  onComplete={pattern => login('pattern', pattern)}
                />
              </>
            )}

            <div className="admin-status">
              {activeMethod === 'pattern' && patternLength > 0
                ? t('admin.patternDots', { count: patternLength })
                : locked
                  ? t('admin.lockLeft', { seconds: lockLeft })
                  : t('admin.attemptsLeft', { count: Math.max(0, 3 - attempts) })}
            </div>
            {message && <div className="admin-message">{message}</div>}
            {accessError && <div className="admin-message">{accessError}</div>}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="screen admin-screen">
      <div className="admin-hero">
        <div className="admin-hero__icon"><FiShield /></div>
        <h2>{t('admin.panelTitle')}</h2>
        <p>{t(ADMIN_SECTION_SUBTITLES[section] || 'admin.manageSubtitle')}</p>
        <div className="admin-hero__actions">
          {maintenance && (
            <button
              className={maintenance.enabled ? 'admin-maintenance is-on' : 'admin-maintenance'}
              disabled={busy}
              type="button"
              onClick={toggleMaintenance}
            >
              <FiTool /> {t(maintenance.enabled ? 'admin.maintenanceDisable' : 'admin.maintenanceEnable')}
            </button>
          )}
          <button className="admin-access-open" type="button" onClick={() => setAccessOpen(true)}>
            <FiKey /> {t('admin.accessButton')}
          </button>
          <button className="admin-logout" type="button" onClick={logout}>
            <FiLogOut /> {t('admin.logout')}
          </button>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        <button
          aria-selected={section === 'users'}
          className={section === 'users' ? 'is-active' : ''}
          role="tab"
          type="button"
          onClick={() => setSection('users')}
        >
          <FiUser /> {t('admin.sectionUsers')}
        </button>
        <button
          aria-selected={section === 'missions'}
          className={section === 'missions' ? 'is-active' : ''}
          role="tab"
          type="button"
          onClick={() => setSection('missions')}
        >
          <FiTarget /> {t('admin.sectionMissions')}
        </button>
        <button
          aria-selected={section === 'cases'}
          className={section === 'cases' ? 'is-active' : ''}
          role="tab"
          type="button"
          onClick={() => setSection('cases')}
        >
          <FiPackage /> {t('admin.sectionCases')}
        </button>
        <button
          aria-selected={section === 'docs'}
          className={section === 'docs' ? 'is-active' : ''}
          role="tab"
          type="button"
          onClick={() => setSection('docs')}
        >
          <FiBookOpen /> {t('admin.sectionDocs')}
        </button>
      </div>

      {section === 'users' && (
        <>
      <section className="profile-panel">
        <div className="profile-panel__head">
          <h3><FiSearch /> {t('admin.searchTitle')}</h3>
        </div>
        <div className="profile-panel__body">
          <form className="admin-search" onSubmit={findUser}>
            <input
              inputMode="numeric"
              placeholder={t('admin.searchPlaceholder')}
              value={searchId}
              onChange={event => setSearchId(event.target.value)}
            />
            <button className="admin-search__btn" disabled={busy} type="submit">
              {t('admin.find')}
            </button>
          </form>
          {message && <div className="admin-message">{message}</div>}
        </div>
      </section>

      {userInfo?.user && (
        <AdminUserDetails payload={userInfo} busy={busy} onGrantCase={grantCase} />
      )}
        </>
      )}

      {section === 'missions' && (
        <MissionsAdminPanel adminRequest={adminRequest} onMessage={setMessage} />
      )}

      {section === 'cases' && (
        <CasesAdminPanel adminRequest={adminRequest} onMessage={setMessage} />
      )}

      {section === 'docs' && (
        <DocsAdminPanel adminRequest={adminRequest} onMessage={setMessage} />
      )}

      {accessOpen && (
        <AdminAccessModal
          access={access}
          adminRequest={adminRequest}
          busy={busy}
          onClose={() => setAccessOpen(false)}
          onMessage={setMessage}
          onSaved={handleAccessSaved}
        />
      )}
    </section>
  );
}

function AdminUserDetails({ payload, busy, onGrantCase }) {
  const { t } = useTranslation();
  const { user, ban, spam, marriage, inventoryCount, cases } = payload;
  return (
    <section className="profile-panel">
      <div className="profile-panel__head">
        <h3><FiUser /> {user.name}</h3>
        <span className={`admin-badge ${ban ? 'is-ban' : spam ? 'is-spam' : 'is-ok'}`}>
          {ban ? 'BAN' : spam ? 'SPAM' : 'OK'}
        </span>
      </div>
      <div className="profile-panel__body">
        <p className="admin-hint">{user.username ? `@${user.username}` : t('admin.usernameMissing')}</p>

        <div className="facts-grid">
          <Fact label="Chat ID" value={user.chat_id} />
          <Fact label={t('admin.factCoins')} value={formatNumber(user.coins)} />
          <Fact label={t('admin.factBanana')} value={formatNumber(user.banana)} />
          <Fact label={t('admin.factStarcoins')} value={formatNumber(user.starcoins)} />
          <Fact label={t('admin.factMessages')} value={formatNumber(user.msg_count)} />
          <Fact label={t('admin.factItems')} value={inventoryCount} />
          <Fact label={t('admin.factCreated')} value={formatDate(user.created_at)} />
          <Fact label={t('admin.factActivity')} value={formatActivity(user.last_activity)} />
        </div>

        <div className="admin-status-blocks">
          <StatusBlock title={t('admin.banlist')} row={ban} />
          <StatusBlock title={t('admin.spamlist')} row={spam} />
        </div>

        {marriage && (
          <div className="admin-marriage">
            <span>{t('admin.relationship')}</span>
            <strong>{marriage.partner_name || marriage.partner_username || marriage.partner_chat_id}</strong>
            <small>{formatMarriageDate(marriage.marriage_datetime)}</small>
          </div>
        )}

        <div className="admin-cases">
          <span className="admin-cases__title">{t('admin.userCases')}</span>
          <div className="admin-cases__grid">
            {CASE_OPTIONS.map(option => (
              <div className="admin-case" key={option}>
                <span className="admin-case__name">{caseShortTitle(caseTypes, option)}</span>
                <span className="admin-case__count">{formatNumber(cases?.[option] || 0)}</span>
                <button
                  className="admin-case__btn"
                  disabled={busy}
                  type="button"
                  onClick={() => onGrantCase(user.chat_id, option)}
                >
                  +1
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Подзаголовок в шапке админки: у каждой вкладки свой. */
const ADMIN_SECTION_SUBTITLES = {
  users: 'admin.manageSubtitle',
  missions: 'admin.manageMissionsSubtitle',
  cases: 'admin.manageCasesSubtitle',
  docs: 'docs.admin.manageSubtitle',
};

/** Короткие имена кейсов берутся из словаря по id (см. config/casesMeta.js). */
const CASE_OPTIONS = ['homeless', 'standard', 'unusual', 'premium', 'spring', 'march_8th'];

function StatusBlock({ title, row }) {
  const { t } = useTranslation();

  return (
    <div className="admin-status-block">
      <span>{title}</span>
      <strong>{row ? t('admin.inList') : t('admin.notInList')}</strong>
      {row?.created_at && <small>{t('admin.since', { date: formatDate(row.created_at) })}</small>}
      {row?.reason && <small>{row.reason}</small>}
    </div>
  );
}

export default AdminScreen;
