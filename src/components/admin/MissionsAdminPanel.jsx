import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext.js';
import MissionEditor from './MissionEditor.jsx';
import MissionsAdminList from './MissionsAdminList.jsx';

/**
 * Раздел «Задания» в админ-панели: список заданий из БД и редактор.
 *
 * Ручки доступны только владельцу бота (`/api/admin/missions`), поэтому запросы
 * идут через `adminRequest` с токеном админ-сессии. Каждый ответ сервера
 * возвращает полный список заданий — его и раскладываем по состоянию.
 */
function MissionsAdminPanel({ adminRequest, onMessage }) {
  const { t, locale } = useTranslation();
  const [missions, setMissions] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [missionId, setMissionId] = useState('');
  const [cadenceOverride, setCadenceOverride] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchList = useCallback(
    () => adminRequest('/api/admin/missions').then(payload => ({
      missions: payload.missions || [],
      catalog: payload.catalog || null,
    })),
    [adminRequest],
  );

  useEffect(() => {
    let cancelled = false;

    fetchList()
      .then(payload => {
        if (!cancelled) {
          setMissions(payload.missions);
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

  const loading = missions === null;
  const mission = missionId ? (missions || []).find(item => item.id === missionId) || null : null;

  /** Обновление состояния из ответа сервера: он всегда присылает весь список. */
  const applyPayload = payload => {
    setMissions(payload.missions || []);

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

  /** Тело запроса из шаблона задания: используется в сохранении, переносе и тумблере. */
  const missionBody = item => ({
    kind: item.kind,
    action: item.action,
    titles: item.titles || {},
    texts: item.texts || {},
    goal: item.goal,
    xp: item.xp,
    rewardCase: item.rewardCase || '',
    difficulty: item.difficulty,
    color: item.color,
    refreshHours: item.refreshHours,
    repeatable: item.repeatable,
    active: item.active,
    sortOrder: item.sortOrder,
    // Список целей «подписка» уезжает в каждом запросе: сервер заменяет его
    // целиком, поэтому без него тумблер или цель стёрли бы настройки задания.
    targets: item.targets || [],
  });

  const saveMission = payload => run(async () => {
    const response = await adminRequest(`/api/admin/missions/${missionId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    applyPayload(response);
  }, t('admin.missions.saved'));

  /**
   * Тумблер строки: включённое задание выключаем, выключенное — включаем, а если
   * задания в базе ещё нет (например, владелец удалил его) — заводим его заново
   * с настройками по умолчанию из каталога действий.
   */
  const toggleMission = row => run(async () => {
    if (!row.mission) {
      const response = await adminRequest('/api/admin/missions', {
        method: 'POST',
        body: JSON.stringify({
          id: row.action.code,
          action: row.action.code,
          kind: row.action.code.startsWith('week_') ? 'weekly' : 'daily',
          goal: row.action.defaultGoal || 1,
          active: true,
        }),
      });

      applyPayload(response);
      return;
    }

    const response = await adminRequest(`/api/admin/missions/${row.mission.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...missionBody(row.mission), active: !row.mission.active }),
    });

    applyPayload(response);
  });

  /** Плашка количества: меняем цель счётного задания прямо из списка. */
  const setGoal = (item, goal) => run(async () => {
    if (!item || Number(item.goal) === goal) {
      return;
    }

    const response = await adminRequest(`/api/admin/missions/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...missionBody(item), goal }),
    });

    applyPayload(response);
  });

  /** Плашка «ритм»: один пресет — один интервал сброса на все задания. */
  const applyCadence = preset => run(async () => {
    const response = await adminRequest('/api/admin/missions/cadence', {
      method: 'PATCH',
      body: JSON.stringify({ hours: preset.hours }),
    });

    applyPayload(response);
    setCadenceOverride(preset.id);
  }, t('admin.missions.cadenceApplied'));

  const deleteMission = id => run(async () => {
    const response = await adminRequest(`/api/admin/missions/${id}`, { method: 'DELETE' });

    applyPayload(response);
    setMissionId(current => (current === id ? '' : current));
  }, t('admin.missions.deleted'));

  /**
   * Активный пресет «ритма»: выводим из заданий, но помним выбор владельца —
   * так 48 ч и «2 суток» не подсвечиваются одновременно.
   */
  const activeCadenceId = cadenceOverride ?? deriveCadenceId(missions, catalog?.cadencePresets || []);

  return (
    <div className="docs-admin-panel">
      {error ? <div className="inline-alert">{error}</div> : null}

      {mission ? (
        <MissionEditor
          busy={busy}
          catalog={catalog}
          key={mission.id}
          mission={mission}
          onBack={() => setMissionId('')}
          onDelete={deleteMission}
          onSave={saveMission}
        />
      ) : (
        <>
          {loading ? (
            <div className="docs-loading">
              <span className="loader-orbit" />
              <span>{t('admin.missions.loading')}</span>
            </div>
          ) : (
            <MissionsAdminList
              activeCadenceId={activeCadenceId}
              busy={busy}
              catalog={catalog}
              language={locale}
              missions={missions || []}
              onCadence={applyCadence}
              onGoal={setGoal}
              onOpen={setMissionId}
              onToggle={toggleMission}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Активный пресет «ритма» из списка заданий: если все повторяющиеся задания
 * делят один интервал — подсвечиваем первый подходящий пресет, иначе `null`
 * (в подписи показывается «свой ритм»).
 */
function deriveCadenceId(missions, presets) {
  const repeatable = (missions || []).filter(mission => mission.repeatable);

  if (repeatable.length === 0) {
    return null;
  }

  const hours = Number(repeatable[0].refreshHours);
  const uniform = repeatable.every(mission => Number(mission.refreshHours) === hours);

  if (!uniform) {
    return null;
  }

  return presets.find(preset => preset.hours === hours)?.id || null;
}

export default MissionsAdminPanel;
