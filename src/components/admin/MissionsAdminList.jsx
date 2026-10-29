import { useState } from 'react';
import { FiMinus, FiPlus, FiRefreshCw, FiSliders, FiTarget } from 'react-icons/fi';
import { missionVisual } from '../../config/missions.js';
import { caseShortTitle } from '../../utils/caseText.js';
import { caseTypes } from '../../config/casesMeta.js';
import { useTranslation } from '../../i18n/I18nContext.js';

/**
 * Список заданий в админке — «будильники».
 *
 * Радикально простая модель: все возможные задания уже лежат в базе, поэтому
 * список строится не из БД, а из КАТАЛОГА действий (server/missionsApi.js),
 * а строка только показывает состояние:
 *   - тумблер — включено/выключено (как будильник в телефоне);
 *   - плашка количества — компактный ±-переключатель цели (для счётных заданий);
 *   - кнопка «настроить» — уводит в редактор карточки (тексты, награда, XP…).
 *
 * Над списком — плашка «ритм»: одним касанием ставим всем заданиям один
 * интервал сброса (короткий такт в часах и долгий — в сутках).
 */
const CADENCE_GROUPS = [
  { id: 'base', labelKey: 'admin.missions.cadenceBase' },
  { id: 'medium', labelKey: 'admin.missions.cadenceMedium' },
];

function MissionsAdminList({
  missions,
  catalog,
  busy,
  language,
  activeCadenceId,
  onCadence,
  onGoal,
  onOpen,
  onToggle,
}) {
  const { t } = useTranslation();
  const presets = catalog?.cadencePresets || [];
  const rows = buildRows(catalog?.actions || [], missions || []);
  const activeCount = rows.filter(row => row.mission?.active).length;

  return (
    <section className="profile-panel docs-admin missions-admin">
      <div className="profile-panel__head">
        <h3>{t('admin.missions.listTitle')}</h3>
        <span className="docs-admin__count">
          {activeCount} / {rows.length}
        </span>
      </div>

      <div className="profile-panel__body">
        <p className="admin-hint">{t('admin.missions.listHint')}</p>

        {presets.length > 0 ? (
          <CadenceBar activeId={activeCadenceId} busy={busy} presets={presets} onPick={onCadence} />
        ) : null}

        {rows.length === 0 ? (
          <div className="docs-empty">
            <strong>{t('admin.missions.empty')}</strong>
            <small>{t('admin.missions.emptyText')}</small>
          </div>
        ) : (
          <div className="missions-alarms">
            {rows.map(row => (
              <MissionAlarm
                busy={busy}
                key={row.key}
                language={language}
                row={row}
                onGoal={onGoal}
                onOpen={onOpen}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Плашка «ритм заданий»: пресеты интервалов сброса, сгруппированные по такту. */
function CadenceBar({ activeId, busy, presets, onPick }) {
  const { t } = useTranslation();

  return (
    <div className="missions-cadence">
      <div className="missions-cadence__head">
        <span className="missions-cadence__label">
          <FiRefreshCw /> {t('admin.missions.cadenceTitle')}
        </span>
        <small>{t('admin.missions.cadenceHint')}</small>
      </div>

      <div className="missions-cadence__groups">
        {CADENCE_GROUPS.map(group => {
          const items = presets.filter(preset => preset.group === group.id);

          if (items.length === 0) {
            return null;
          }

          return (
            <div className="missions-cadence__group" key={group.id}>
              <span className="missions-cadence__group-label">{t(group.labelKey)}</span>

              <div className="missions-cadence__chips">
                {items.map(preset => (
                  <button
                    aria-pressed={preset.id === activeId}
                    className={`missions-cadence__chip ${preset.id === activeId ? 'is-active' : ''}`}
                    disabled={busy}
                    key={preset.id}
                    type="button"
                    onClick={() => onPick(preset)}
                  >
                    <strong>{t(`admin.missions.cadenceNames.${preset.id}`)}</strong>
                    <i>{formatCadenceAmount(preset, t)}</i>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {activeId ? null : <small className="missions-cadence__mixed">{t('admin.missions.cadenceMixed')}</small>}
    </div>
  );
}

/** Одна строка-будильник: иконка, подпись, плашка количества, «настроить», тумблер. */
function MissionAlarm({ row, busy, language, onToggle, onGoal, onOpen }) {
  const { t } = useTranslation();
  const { action, mission } = row;
  const visual = missionVisual({ action: action?.code || mission?.action });
  const Icon = visual.icon;
  const active = Boolean(mission?.active);
  const goalable = Boolean(mission?.goalable || action?.goalable);
  const maxGoal = Number(mission?.maxGoal || action?.maxGoal || 0);
  const goalValue = Number(mission?.goal || action?.defaultGoal || 1);
  // Задание «подписка»: целей может быть несколько, и щёлкать их количество в
  // списке нельзя — оно равно длине списка целей из редактора.
  const targetList = Boolean(mission?.targetList || action?.targetList);
  const targetCount = Array.isArray(mission?.targets) ? mission.targets.length : 0;
  // Включить задание без целей нельзя: сервер такую запись не примет.
  const toggleBlocked = Boolean(targetList && mission && targetCount === 0);
  const title = mission
    ? missionTitle(mission, language, t)
    : actionLabel(action?.code, t) || t('admin.missions.untitled');
  // Код задания держим рядом с названием: по нему владелец ищет миссию в
  // наградах и статистике, а читает он всё равно человеческое название.
  const code = mission?.id || action?.code || '';

  return (
    <article className={`missions-alarm ${active ? 'is-on' : ''}`}>
      <span className="missions-alarm__icon">
        <Icon />
      </span>

      <div className="missions-alarm__body">
        <span className="missions-alarm__head">
          <strong>{title}</strong>
          {code ? <i className="missions-alarm__code" title={t('admin.missions.codeField')}>{code}</i> : null}
        </span>
        <small>{mission ? missionSummary(mission, t) : t('admin.missions.notConfigured')}</small>
      </div>

      <div className="missions-alarm__tools">
        {targetList ? (
          <span
            className={`missions-targets-chip ${targetCount > 0 ? '' : 'is-empty'}`}
            title={targetCount > 0 ? t('admin.missions.targetsCount', { count: targetCount }) : t('admin.missions.targetsRequired')}
          >
            <FiTarget /> {targetCount}
          </span>
        ) : goalable ? (
          <GoalStepper
            busy={busy}
            key={`goal-${goalValue}`}
            max={maxGoal}
            step={goalStep(maxGoal)}
            value={goalValue}
            onChange={value => onGoal(mission, value)}
          />
        ) : null}

        <button
          aria-label={t('admin.missions.configure')}
          className="missions-alarm__edit"
          disabled={busy || !mission}
          title={t('admin.missions.configure')}
          type="button"
          onClick={() => onOpen(mission.id)}
        >
          <FiSliders />
        </button>

        <button
          aria-label={active ? t('admin.missions.deactivate') : t('admin.missions.activate')}
          aria-pressed={active}
          className={`missions-toggle ${active ? 'is-on' : ''}`}
          disabled={busy || toggleBlocked}
          title={toggleBlocked
            ? t('admin.missions.targetsRequired')
            : active ? t('admin.missions.deactivate') : t('admin.missions.activate')}
          type="button"
          onClick={() => onToggle(row)}
        >
          <span className="missions-toggle__track" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

/**
 * Плашка количества: −/число/+ в один ряд. Значение приходит с сервера после
 * каждого запроса, поэтому поле хранит черновик и коммитит его по blur или Enter;
 * родитель пересоздаёт плашку по `key={value}`, когда сервер прислал новую цель.
 */
function GoalStepper({ value, max, step, busy, onChange }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value));
  const bound = max > 0 ? max : 100000;

  const commit = raw => {
    const parsed = Math.round(Number(raw));
    const next = Number.isFinite(parsed) ? Math.max(1, Math.min(bound, parsed)) : value;

    if (next !== value) {
      onChange(next);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <span className="missions-goal" title={t('admin.missions.goalLabel')}>
      <button
        aria-label={t('admin.missions.goalMinus')}
        className="missions-goal__btn"
        disabled={busy || value <= 1}
        type="button"
        onClick={() => commit(value - step)}
      >
        <FiMinus />
      </button>

      <input
        aria-label={t('admin.missions.goalValue', { count: draft })}
        className="missions-goal__value"
        inputMode="numeric"
        value={draft}
        onBlur={() => commit(draft)}
        onChange={event => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(draft);
          }
        }}
      />

      <button
        aria-label={t('admin.missions.goalPlus')}
        className="missions-goal__btn"
        disabled={busy || value >= bound}
        type="button"
        onClick={() => commit(value + step)}
      >
        <FiPlus />
      </button>
    </span>
  );
}

/**
 * Строки списка: сначала все действия каталога (чтобы даже выключенное задание
 * было видно), затем — редкие задания из БД, которых нет в каталоге.
 */
function buildRows(actions, missions) {
  const used = new Set();
  const rows = actions.map(action => {
    const mission =
      missions.find(item => item.id === action.code) || missions.find(item => item.action === action.code);

    if (mission) {
      used.add(mission.id);
    }

    return { key: action.code, action, mission: mission || null };
  });

  for (const mission of missions) {
    if (used.has(mission.id)) {
      continue;
    }

    used.add(mission.id);
    rows.push({ key: mission.id, action: null, mission });
  }

  // Порядок как в приложении: по `sortOrder`, неизвестные — в конец.
  return rows.sort((left, right) => (left.mission?.sortOrder ?? 9999) - (right.mission?.sortOrder ?? 9999));
}

/** Шаг кнопок ± рассчитывается из максимума цели, чтобы кликать «по-умному». */
function goalStep(max) {
  if (!max || max <= 50) {
    return 1;
  }

  if (max <= 500) {
    return 5;
  }

  if (max <= 5000) {
    return 25;
  }

  return 100;
}

/** Часы внутри суток показываем часами, дальше — сутками. */
function formatCadenceAmount(preset, t) {
  if (preset.group === 'medium') {
    return t('admin.missions.cadenceDays', { count: Math.round(preset.hours / 24) });
  }

  return t('admin.missions.cadenceHours', { count: preset.hours });
}

/**
 * Заголовок задания: язык админки → русский → любой заполненный → понятное
 * имя действия → код. Английский код в списке владельцу не нужен: он должен
 * сразу читать, что включает.
 */
function missionTitle(mission, language, t) {
  const titles = mission?.titles || {};
  const text = titles[language] || titles.ru || Object.values(titles).find(value => String(value || '').trim());

  return text || actionLabel(mission?.action || mission?.id, t) || mission?.id || t('admin.missions.untitled');
}

/**
 * Понятное имя действия из словаря админки (`admin.missions.actions.<code>`).
 * Незнакомый код возвращаем пустым: вызывающая сторона сама решит, что показать.
 */
function actionLabel(code, t) {
  const key = `admin.missions.actions.${code}`;
  const value = t(key);

  return value === key ? '' : value;
}

/** Вторая строка строки-будильника: тип, место, XP, награда, интервал сброса. */
function missionSummary(mission, t) {
  const parts = [
    mission.kind === 'daily' ? t('admin.missions.kindDaily') : t('admin.missions.kindWeekly'),
    t(`missions.where.${mission.where}`),
  ];

  parts.push(mission.xp > 0 ? `${mission.xp} XP` : t('admin.missions.noXp'));

  if (mission.rewardCase) {
    parts.push(caseShortTitle(caseTypes, mission.rewardCase));
  }

  // У задания «подписка» вместо ручной цели — список каналов и чатов.
  if (mission.targetList) {
    parts.push(t('admin.missions.targetsCount', {
      count: Array.isArray(mission.targets) ? mission.targets.length : 0,
    }));
  }

  parts.push(
    mission.repeatable
      ? t('admin.missions.refreshShort', { hours: mission.refreshHours })
      : t('admin.missions.once'),
  );

  return parts.join(' · ');
}

export default MissionsAdminList;

