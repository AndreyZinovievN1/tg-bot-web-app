import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext.js';
import { themeForAccent } from '../../utils/caseTheme.js';
import CaseEditor from './CaseEditor.jsx';
import CaseSpotlightAdmin from './CaseSpotlightAdmin.jsx';
import CasesAdminList from './CasesAdminList.jsx';

/**
 * Раздел «Кейсы» в админ-панели: список кейсов из БД и редактор.
 *
 * Ручки доступны только владельцу бота (`/api/admin/cases`), поэтому запросы идут
 * через `adminRequest` с токеном админ-сессии. Каждый ответ сервера возвращает
 * полный список кейсов и каталог (локали, акценты, типы призов, скины графика) —
 * их и раскладываем по состоянию.
 *
 * Новый кейс создаётся «на лету»: код владелец задаёт в списке, дальше открывается
 * пустой редактор, а запись (`POST`) уходит только по кнопке «Сохранить» — так
 * кейс не появится в приложении с пустыми текстами и одним призом.
 */
function CasesAdminPanel({ adminRequest, onMessage }) {
  const { t, locale } = useTranslation();
  const [cases, setCases] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [caseId, setCaseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchList = useCallback(
    () => adminRequest('/api/admin/cases').then(payload => ({
      cases: payload.cases || [],
      catalog: payload.catalog || null,
    })),
    [adminRequest],
  );

  useEffect(() => {
    let cancelled = false;

    fetchList()
      .then(payload => {
        if (!cancelled) {
          setCases(payload.cases);
          setCatalog(payload.catalog);
        }
      })
      .catch(requestError => {
        if (!cancelled) {
          setError(requestError.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  const loading = cases === null;
  const stored = caseId ? (cases || []).find(item => item.id === caseId) || null : null;
  // Кейса ещё нет в БД — редактор работает в режиме создания (`POST` вместо `PUT`).
  const isNew = Boolean(caseId) && !stored;
  const caseItem = stored || (isNew ? blankCase(caseId) : null);

  /** Обновление состояния из ответа сервера: он всегда присылает весь список. */
  const applyPayload = payload => {
    setCases(payload.cases || []);

    if (payload.catalog) {
      setCatalog(payload.catalog);
    }
  };

  const run = async (task, message) => {
    setBusy(true);
    setError('');

    try {
      await task();

      if (message) {
        onMessage?.(message);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  /** Сохранение из редактора: новый кейс создаём, существующий обновляем. */
  const saveCase = payload => run(async () => {
    const response = await adminRequest(
      isNew ? '/api/admin/cases' : `/api/admin/cases/${caseId}`,
      {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(payload),
      },
    );

    applyPayload(response);
  }, t(isNew ? 'admin.cases.created' : 'admin.cases.saved'));

  /** Тумблер строки: включённый кейс выключаем, выключенный — включаем. */
  const toggleCase = item => run(async () => {
    const response = await adminRequest(`/api/admin/cases/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...caseBody(item), active: !item.active }),
    });

    applyPayload(response);
  });

  const deleteCase = id => run(async () => {
    const response = await adminRequest(`/api/admin/cases/${id}`, { method: 'DELETE' });

    applyPayload(response);
    setCaseId(current => (current === id ? '' : current));
  }, t('admin.cases.deleted'));

  /**
   * Кейс в блоке «Кейс дня». Пустой id скрывает блок с экрана кейсов; сервер
   * сам снимает флаг с остальных кейсов, поэтому здесь просто один запрос.
   */
  const setSpotlight = caseId => run(async () => {
    const response = await adminRequest('/api/admin/cases/featured', {
      method: 'POST',
      body: JSON.stringify({ caseId }),
    });

    applyPayload(response);
  }, t('admin.cases.spotlightSaved'));

  /**
   * Фон блока «Кейс дня»: у кейса это его тема, поэтому сохраняем её тем же
   * `PUT`, что и редактор, но без картинки — она не должна гоняться по сети.
   */
  const saveCaseTheme = (id, theme) => run(async () => {
    const item = (cases || []).find(entry => entry.id === id);

    if (!item) {
      return;
    }

    const response = await adminRequest(`/api/admin/cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...caseBody(item), theme }),
    });

    applyPayload(response);
  }, t('admin.cases.spotlightThemeSaved'));

  /**
   * Кнопка «обновить каталог» в пикере подарков: у сервера каталог кешируется на
   * пять минут, а `?refresh=1` тянет его из юзербота заново. Тот же запрос
   * обновляет и подарки аккаунта — второй режим пикера. Обновляем только
   * каталог (список кейсов не подменяем), иначе черновик редактора сбросился бы
   * из ответа сервера вместе с несохранёнными правками наполнения.
   */
  const refreshGifts = () => run(async () => {
    const response = await adminRequest('/api/admin/cases?refresh=1');
    const gifts = response.catalog?.gifts || [];
    const savedGifts = response.catalog?.savedGifts || [];

    if (response.catalog) {
      setCatalog(response.catalog);
    }

    onMessage?.(t('admin.cases.giftRefreshed', { count: gifts.length, saved: savedGifts.length }));
  });

  return (
    <div className="docs-admin-panel">
      {error ? <div className="inline-alert">{error}</div> : null}

      {caseItem ? (
        <CaseEditor
          busy={busy}
          catalog={catalog}
          caseItem={caseItem}
          isNew={isNew}
          key={caseId}
          onBack={() => setCaseId('')}
          onDelete={deleteCase}
          onRefreshGifts={refreshGifts}
          onSave={saveCase}
          onToast={onMessage}
        />
      ) : (
        <>
          {loading ? (
            <div className="docs-loading">
              <span className="loader-orbit" />
              <span>{t('admin.cases.loading')}</span>
            </div>
          ) : (
            <>
              <CaseSpotlightAdmin
                busy={busy}
                cases={cases || []}
                onApply={setSpotlight}
                onSaveTheme={saveCaseTheme}
              />

              <CasesAdminList
                busy={busy}
                cases={cases || []}
                catalog={catalog}
                language={locale}
                onCreate={setCaseId}
                onOpen={setCaseId}
                onToggle={toggleCase}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Тело запроса из шаблона кейса (кроме картинки): используется в тумблере.
 * Картинку не отправляем — по контракту сервера отсутствующее поле означает
 * «оставить текущую», и тумблер не гоняет по сети 300 КБ data-URL.
 */
function caseBody(item) {
  return {
    id: item.id,
    titles: item.titles || {},
    texts: item.texts || {},
    accent: item.accent,
    // Тему шлём целиком: иначе сервер вернёт её к цвету по акценту.
    theme: item.theme,
    stars: item.stars,
    contents: Array.isArray(item.contents) ? item.contents : [],
    active: item.active,
    sortOrder: item.sortOrder,
  };
}

/**
 * Черновик нового кейса. Код задаёт владелец, всё остальное — стартовые значения:
 * состав из четырёх призов повторяет первый кейс из `caseDefaults`, поэтому новый
 * кейс сразу можно сохранить и открыть, а дальше владелец правит его под себя.
 */
function blankCase(id) {
  return {
    id,
    titles: {},
    texts: {},
    accent: 'cyan',
    theme: themeForAccent('cyan'),
    stars: 0,
    image: null,
    contents: [
      { id: 'coins', type: 'coins', weight: 70, min: 150, max: 900 },
      { id: 'starcoins', type: 'starcoins', weight: 25, min: 2, max: 12 },
      { id: 'shop_item', type: 'shop_item', weight: 4 },
      { id: 'gift', type: 'gift', weight: 1 },
    ],
    active: false,
    sortOrder: 100,
    featured: false,
    legacy: false,
    createdAt: null,
    updatedAt: null,
  };
}

export default CasesAdminPanel;
