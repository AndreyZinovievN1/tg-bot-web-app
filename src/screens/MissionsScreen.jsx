import { useEffect, useMemo, useRef, useState } from 'react';
import { FiCheck, FiZap } from 'react-icons/fi';
import { TbSparkles } from 'react-icons/tb';
import { apiRequest } from '../api/client.js';
import { caseTypes, missionDailyXpGoal, missionMilestones as fallbackMilestones } from '../config/casesMeta.js';
import {
  missionColor,
  missionColorRgb,
  missionDifficulty,
  missionTargetVisual,
  missionVisual,
} from '../config/missions.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { caseShortTitle } from '../utils/caseText.js';
import { formatCountdown } from '../utils/formatters.js';

/** Стабильные пустые ссылки: не создаём новые массивы и объекты на каждом рендере. */
const emptyMilestones = [];
/** Сколько миллисекунд карточка уезжает с экрана после забора одноразовой награды. */
const claimFadeMs = 420;

function MissionsScreen({ data, initData, onData, onMissions, onToast }) {
  const { t, locale } = useTranslation();
  const [busyMissionId, setBusyMissionId] = useState('');
  const [leavingMissionId, setLeavingMissionId] = useState('');
  const fadeTimerRef = useRef(0);

  const progress = data.missionProgress || { xp: 0, claimedMilestones: emptyMilestones };
  const xp = Number(progress.xp || 0);
  const claimedMilestones = Array.isArray(progress.claimedMilestones) ? progress.claimedMilestones : emptyMilestones;
  const milestones = Array.isArray(data.missionMilestones) && data.missionMilestones.length > 0
    ? data.missionMilestones
    : fallbackMilestones;

  const missions = useMemo(() => buildMissionCards(data, t, locale), [data, t, locale]);
  const dailyMissions = missions.filter(mission => mission.kind === 'daily');
  const weeklyMissions = missions.filter(mission => mission.kind !== 'daily');
  // Таймеры раздела считаются по ближайшему концу периода среди его заданий:
  // у заданий может быть свой интервал сброса (поле `refreshHours` в админке).
  const dailyEnd = nearestPeriodEnd(dailyMissions);
  const weeklyEnd = nearestPeriodEnd(weeklyMissions);
  // Полная шкала дня — либо цена последней вехи, либо сумма XP всех заданий дня.
  const maxXp = Math.max(
    dailyMissions.reduce((sum, mission) => sum + mission.xp, 0) || missionDailyXpGoal,
    Number(milestones[milestones.length - 1]?.xp || 0),
  );
  const xpPercent = maxXp > 0 ? clampPercent((xp / maxXp) * 100) : 0;
  const nextMilestone = milestones.find(milestone => xp < milestone.xp) || null;
  const claimedDaily = dailyMissions.filter(mission => mission.claimed).length;

  /**
   * Геометрия рельса: отметки вех и заливка. Шкала идёт от первой вехи до
   * последней, поэтому крайние кейсы стоят ровно по краям панели, а каждый
   * кейс — точно под своей засечкой (см. `.ops-xp__band` в styles.css).
   */
  const rail = useMemo(() => {
    const sorted = [...milestones]
      .map(milestone => ({ ...milestone, xp: Number(milestone.xp) || 0 }))
      .sort((first, second) => first.xp - second.xp);
    const firstXp = sorted[0]?.xp || 0;
    const lastXp = sorted[sorted.length - 1]?.xp || 0;
    const span = lastXp - firstXp;

    if (!sorted.length) {
      // Защита от пустого конфига вех: показываем просто прогресс дня.
      return { fill: `calc(var(--ops-inset) * ${roundNumber(xpPercent / 100, 3)})`, places: [] };
    }

    const percentOf = value => {
      if (span <= 0) {
        return value >= lastXp ? 100 : 0;
      }

      return roundNumber(clampPercent((value - firstXp) / span * 100), 2);
    };

    // До первой вехи полоса растёт от левого края линии до её отметки, дальше —
    // по отметкам вех: наконечник всегда совпадает с засечкой своего порога.
    const fill = xp >= firstXp
      ? `calc(var(--ops-inset) + ${percentOf(xp)}%)`
      : `calc(var(--ops-inset) * ${roundNumber(clampPercent(firstXp > 0 ? xp / firstXp * 100 : 100) / 100, 3)})`;

    return {
      fill,
      places: sorted.map(milestone => ({ ...milestone, percent: `${percentOf(milestone.xp)}%` })),
    };
  }, [milestones, xp, xpPercent]);

  const claimMission = async missionId => {
    // Одноразовое задание после забора исчезает с экрана: карточка сначала
    // уезжает (класс `.is-leaving`), а данные применяем после анимации —
    // иначе карточка пропадёт рывком.
    const mission = missions.find(item => item.id === missionId);
    const onceOnly = Boolean(mission) && !mission.repeatable;

    setBusyMissionId(missionId);
    triggerHaptic('impactOccurred', 'light');

    try {
      const payload = await apiRequest('/api/missions/claim', {
        method: 'POST',
        body: JSON.stringify({ missionId }),
      }, initData);

      onToast(buildClaimToast(t, payload));
      triggerHaptic('notificationOccurred', 'success');

      if (onceOnly) {
        setLeavingMissionId(missionId);
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = window.setTimeout(() => {
          setLeavingMissionId('');
          onData(payload.data);
        }, claimFadeMs);
      } else {
        onData(payload.data);
      }
    } catch (error) {
      triggerHaptic('notificationOccurred', 'error');
      onToast(error.message);
    } finally {
      setBusyMissionId('');
    }
  };

  // Таймер анимации не должен дёрнуть состояние после размонтирования экрана.
  useEffect(() => () => window.clearTimeout(fadeTimerRef.current), []);

  /**
   * Пока экран открыт, раз в 5 секунд проверяем, не выполнились ли задания
   * (сообщения в чатах, банан, ставка, кейс). Полное обновление не тянем —
   * сервер отдаёт только прогресс и статусы миссий. Когда вкладка скрыта,
   * запросы не отправляем, а при возврате обновляемся сразу.
   */
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (document.hidden) {
        return;
      }

      try {
        const payload = await apiRequest('/api/missions', {}, initData);

        if (!cancelled) {
          onMissions({
            missions: payload.missions || [],
            missionProgress: payload.missionProgress,
            missionMilestones: payload.missionMilestones,
          });
        }
      } catch {
        // Тихий режим: следующий тик попробует снова, пользователю не мешаем.
      }
    };

    const handleVisible = () => {
      if (!document.hidden) {
        refresh();
      }
    };

    const timer = window.setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [initData, onMissions]);

  return (
    <section className="screen missions-screen">
      {/* ===== командный хедер дня ===== */}
      <header className="ops-hero">
        <span className="ops-hero__grid" aria-hidden="true" />
        <span className="ops-hero__beam" aria-hidden="true" />

        <div className="ops-hero__main">
          <span className="ops-hero__eyebrow">{t('missions.heroEyebrow')}</span>
          <h1>{t('missions.heroTitle')}</h1>
          <p>{t('missions.heroSub')}</p>
        </div>

        <div className="ops-hero__reset">
          <span>{t('missions.resetLabel')}</span>
          <Countdown endAt={dailyEnd} fallback="day" />
        </div>
      </header>

      {/* ===== вехи дня: непрерывная линия XP → кейсы ===== */}
      <section className="ops-panel ops-progress">
        <div className="ops-panel__head">
          <span className="ops-panel__label">{t('missions.progressLabel')}</span>
          <span className="ops-progress__xp">
            <strong>{Math.min(xp, maxXp)}</strong>
            <em>/ {maxXp} XP</em>
            <i className="ops-progress__pct">{Math.round(xpPercent)}%</i>
          </span>
        </div>

        <div className="ops-panel__body">
          <div className={`ops-xp ${nextMilestone ? '' : 'is-complete'}`}>
            <div className="ops-xp__rail">
              <span className="ops-xp__line" aria-hidden="true" />

              {/* Шкала вех: 0% — центр первого кейса, 100% — центр последнего. */}
              <div className="ops-xp__band" aria-hidden="true">
                <span className="ops-xp__fill" style={{ width: rail.fill }}>
                  {xp > 0 ? <i className="ops-xp__head" /> : null}
                </span>

                {rail.places.map(milestone => (
                  <span
                    className={`ops-xp__mark ${milestoneState(milestone, xp, claimedMilestones)} ${nextMilestone?.xp === milestone.xp ? 'is-next' : ''}`}
                    key={`${milestone.xp}-${milestone.caseType}`}
                    style={{ left: milestone.percent }}
                  />
                ))}
              </div>
            </div>

            <div className="ops-xp__nodes">
              {rail.places.map(milestone => {
                const granted = claimedMilestones.includes(milestone.xp);
                const reached = granted || xp >= milestone.xp;
                const quantity = Math.max(1, Number(milestone.quantity || 1));
                const isNext = nextMilestone?.xp === milestone.xp;

                return (
                  <div
                    className={`ops-xp__node ${granted ? 'is-granted' : reached ? 'is-reached' : ''} ${isNext ? 'is-next' : ''}`}
                    key={`${milestone.xp}-${milestone.caseType}`}
                    style={{ left: milestone.percent }}
                  >
                    <span className="ops-xp__avatar">
                      {caseTypes[milestone.caseType]?.image
                        ? <img alt="" decoding="async" src={caseTypes[milestone.caseType].image} />
                        : <TbSparkles />}
                      {granted ? <i className="ops-xp__badge"><FiCheck /></i> : null}
                      {quantity > 1 ? <i className="ops-xp__mult">×{quantity}</i> : null}
                    </span>

                    <span className="ops-xp__meta">
                      <strong>{milestone.xp} XP</strong>
                      <small>{caseShortTitle(caseTypes, milestone.caseType)}</small>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="ops-progress__hint">
            {nextMilestone
              ? t('missions.nextMilestone', {
                case: caseShortTitle(caseTypes, nextMilestone.caseType),
                xp: nextMilestone.xp - xp,
              })
              : t('missions.milestonesDone')}
          </p>
        </div>
      </section>

      {/* ===== ежедневные задания ===== */}
      <section className="ops-panel">
        <div className="ops-panel__head">
          <span className="ops-panel__label">{t('missions.todayLabel')}</span>
          <span className="ops-panel__count">
            {t('missions.doneOf', { done: claimedDaily, total: dailyMissions.length })}
          </span>
        </div>

        <div className="ops-panel__body ops-list">
          {dailyMissions.map(mission => (
            <MissionCard
              busy={busyMissionId === mission.id}
              key={mission.id}
              leaving={leavingMissionId === mission.id}
              mission={mission}
              onClaim={claimMission}
            />
          ))}
        </div>
      </section>

      {/* ===== недельные задания ===== */}
      {weeklyMissions.length > 0 && (
        <section className="ops-panel ops-panel--week">
          <div className="ops-panel__head">
            <span className="ops-panel__label">{t('missions.weekLabel')}</span>
            <span className="ops-panel__count">
              {t('missions.weekReset')} <Countdown endAt={weeklyEnd} fallback="week" />
            </span>
          </div>

          <div className="ops-panel__body ops-list">
            {weeklyMissions.map(mission => (
              <MissionCard
                busy={busyMissionId === mission.id}
                key={mission.id}
                leaving={leavingMissionId === mission.id}
                mission={mission}
                onClaim={claimMission}
              />
            ))}
          </div>
        </section>
      )}

    </section>
  );
}

function MissionCard({ busy, leaving = false, mission, onClaim }) {
  const { t } = useTranslation();
  const Icon = mission.icon;
  const meterPercent = mission.progress
    ? Math.min(100, Math.round((mission.progress.current / mission.progress.goal) * 100))
    : 0;
  const caseMeta = mission.rewardCase ? caseTypes[mission.rewardCase] : null;
  const rgb = missionColorRgb(mission.color);
  const hasTargets = mission.targets.length > 0;

  return (
    <article
      className={`ops-card ops-card--${mission.tone} ${mission.ready ? 'is-ready' : ''} ${mission.claimed ? 'is-claimed' : ''} ${leaving ? 'is-leaving' : ''}`}
      // Цвет задания приходит из админки: подставляем его в оба акцента карточки.
      style={{ '--card-tone': mission.color, '--card-rgb': rgb }}
    >
      <span className="ops-card__scan" aria-hidden="true" />
      <span className="ops-card__icon"><Icon /></span>

      <div className="ops-card__body">
        <header className="ops-card__head">
          <h3>{mission.title}</h3>

          {mission.xp > 0 ? (
            <span className="ops-chip ops-chip--xp"><FiZap />+{mission.xp} XP</span>
          ) : caseMeta ? (
            <span className="ops-chip ops-chip--case">
              <img alt="" decoding="async" src={caseMeta.image} />
              {caseShortTitle(caseTypes, mission.rewardCase)}
            </span>
          ) : null}
        </header>

        {mission.text ? <p className="ops-card__text">{mission.text}</p> : null}

        {/* Цели «подписка»: по галочке на каждую — сколько осталось, видно сразу. */}
        {hasTargets ? (
          <ul className="ops-targets">
            {mission.targets.map(target => {
              const TargetIcon = target.icon;
              const label = target.title || target.chatId;
              const meta = t(`missions.targetTypes.${target.type}`);

              return (
                <li className={`ops-target ${target.ok ? 'is-done' : ''}`} key={target.id}>
                  <span className="ops-target__icon"><TargetIcon /></span>

                  <span className="ops-target__body">
                    {target.url ? (
                      <a href={target.url} rel="noreferrer noopener" target="_blank">{label}</a>
                    ) : (
                      <strong>{label}</strong>
                    )}
                    <small>{meta}</small>
                  </span>

                  <span className="ops-target__state">
                    {target.ok ? <FiCheck /> : t('missions.targetPending')}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {/* У задания со списком целей шкалу не показываем: её роль играют галочки. */}
        {mission.progress && !hasTargets ? (
          <div className="ops-meter">
            <span className="ops-meter__bar"><i style={{ width: `${meterPercent}%` }} /></span>
            <em>{mission.progress.current} / {mission.progress.goal}</em>
          </div>
        ) : null}

        <footer className="ops-card__foot">
          <span className="ops-card__tags">
            <span className={`ops-tag ops-tag--${mission.where}`}>{t(`missions.where.${mission.where}`)}</span>
            <span className="ops-tag ops-tag--diff" style={{ '--tag-rgb': rgb }}>{t(mission.difficultyKey)}</span>
          </span>

          {mission.ready ? (
            <button className="ops-claim" disabled={busy} type="button" onClick={() => onClaim(mission.id)}>
              <span className="ops-claim__sheen" aria-hidden="true" />
              {busy ? t('missions.claiming') : t('missions.claim')}
            </button>
          ) : mission.claimed ? (
            <span className="ops-status is-claimed"><FiCheck />{t('missions.claimed')}</span>
          ) : (
            <span className="ops-status">
              {mission.progress ? t('missions.inProgress') : t('missions.awaiting')}
            </span>
          )}
        </footer>
      </div>
    </article>
  );
}

/** Тост после забора: XP, кейсы (с количеством, если выдано несколько). */
function buildClaimToast(t, payload) {
  const rewardXp = Number(payload.rewardXp || 0);
  const counts = new Map();

  (payload.grantedCases || []).forEach(caseType => {
    const name = caseShortTitle(caseTypes, caseType);

    counts.set(name, (counts.get(name) || 0) + 1);
  });

  const caseNames = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
  const cases = caseNames.join(', ');

  if (cases && rewardXp > 0) {
    return t('missions.toastXpAndCase', { xp: rewardXp, cases });
  }

  if (cases) {
    return t('missions.toastCase', { cases });
  }

  return t('missions.toastXp', { xp: rewardXp });
}

/**
 * Живой таймер сброса: тикает внутри себя, чтобы не перерисовывать список миссий.
 * `endAt` — конец периода задания с сервера (мс). Если задание без сброса или
 * сервер не прислал дату, считаем от ближайшей границы МСК: дня или недели.
 */
function Countdown({ endAt, fallback = 'day' }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const target = Number(endAt) || 0;
  const left = target > 0
    ? Math.max(0, target - now)
    : (fallback === 'week' ? msUntilMskWeekEnd(now) : msUntilMskMidnight(now));

  return <strong className="ops-timer">{formatCountdown(left)}</strong>;
}

/** Ближайший конец периода среди миссий раздела (мс) — для таймера раздела. */
function nearestPeriodEnd(missions) {
  return missions.reduce((nearest, mission) => {
    if (mission.periodEnd <= 0) {
      return nearest;
    }

    return nearest === 0 || mission.periodEnd < nearest ? mission.periodEnd : nearest;
  }, 0);
}


/**
 * Карточки миссий собираются из ответа сервера (`data.missions`): сервер знает
 * XP, цели, награды, сложность, цвет и период сброса. Оформление (иконка, тон)
 * берётся из локального конфига по коду действия, поэтому задание из админки
 * с незнакомым приложению действием получит нейтральный вид.
 */
function buildMissionCards(data, t, locale) {
  const serverMissions = Array.isArray(data.missions) ? data.missions : [];

  return serverMissions
    .map(serverMission => {
      const claimed = Boolean(serverMission.claimed);
      const visuals = missionVisual(serverMission);

      return {
        id: serverMission.id,
        kind: serverMission.kind === 'daily' ? 'daily' : 'weekly',
        where: serverMission.where === 'app' ? 'app' : 'bot',
        icon: visuals.icon,
        tone: visuals.tone,
        color: missionColor(serverMission),
        difficultyKey: missionDifficulty(serverMission).labelKey,
        xp: Number(serverMission.xp || 0),
        rewardCase: serverMission.rewardCase || null,
        progress: normalizeProgress(serverMission.progress),
        // Цели «подписка»: сервер уже проверил каждую через Telegram и положил
        // флаг `ok`, поэтому карточке остаётся только оформление иконок.
        targets: normalizeTargets(serverMission.targets),
        // Одноразовые задания после забора уезжают с экрана — см. claimMission.
        repeatable: serverMission.repeatable !== false,
        ready: Boolean(serverMission.ready) && !claimed,
        claimed,
        sortOrder: Number(serverMission.sortOrder || 0),
        periodEnd: Number(serverMission.periodEnd || 0),
        title: missionLabel(t, locale, serverMission, 'title') || humanizeId(serverMission.id),
        text: missionLabel(t, locale, serverMission, 'text'),
      };
    })
    .sort((first, second) => cardWeight(first) - cardWeight(second)
      || first.sortOrder - second.sortOrder
      || first.id.localeCompare(second.id));
}

/** Сначала то, что можно забрать, потом активные, в конце — забранные. */
function cardWeight(mission) {
  if (mission.claimed) {
    return 2;
  }

  return mission.ready ? 0 : 1;
}

function normalizeProgress(progress) {
  const goal = Number(progress?.goal || 0);

  if (!goal) {
    return null;
  }

  return {
    current: Number(progress.current || 0),
    goal,
  };
}

/**
 * Цели задания «подписка»: сервер присылает `{ id, type, chatId, title, url, ok }`.
 * Добавляем иконку и тон по типу цели, пустые строки отбрасываем — так карточка
 * не покажет «пустую» галочку, если сервер прислал мусор.
 */
function normalizeTargets(targets) {
  if (!Array.isArray(targets)) {
    return [];
  }

  return targets
    .filter(target => target && (target.title || target.chatId))
    .map(target => {
      const visual = missionTargetVisual(target);

      return {
        id: String(target.id || `${target.type || 'subscribe'}:${target.chatId || ''}`),
        type: String(target.type || 'subscribe'),
        chatId: String(target.chatId || ''),
        title: String(target.title || ''),
        url: String(target.url || ''),
        ok: Boolean(target.ok),
        icon: visual.icon,
        tone: visual.tone,
      };
    });
}

/**
 * Заголовок и описание задания: сначала локализованный текст с сервера
 * (`titles`/`texts` — их правит владелец в админке), затем словарь
 * `missions.definitions.<код>.<поле>` — запасной вариант для сидов,
 * которые раньше были зашиты в код. Словарь смотрим дважды: по коду задания и
 * по коду действия — так у задания со своим кодом всё равно есть понятное имя.
 */
function missionLabel(t, locale, mission, field) {
  const fromServer = mission?.[`${field}s`]?.[locale];

  if (typeof fromServer === 'string' && fromServer.trim()) {
    return fromServer.trim();
  }

  for (const code of [mission?.id, mission?.action]) {
    const key = `missions.definitions.${code}.${field}`;
    const value = t(key);

    if (value !== key) {
      return value;
    }
  }

  return '';
}

/** Запасной заголовок для миссии без перевода: `week_cases` → `Week cases`. */
function humanizeId(missionId) {
  const text = String(missionId || '').replaceAll('_', ' ').trim();

  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

/** Ограничение процента шкалы: 0–100. */
function clampPercent(percent) {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.max(0, Math.min(100, percent));
}

/** Округление до `digits` знаков: в разметку не попадают длинные дроби. */
function roundNumber(value, digits) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

/**
 * Состояние порога: `is-granted` — забран, `is-reached` — закрыт, иначе пусто.
 */
function milestoneState(milestone, xp, claimedMilestones) {
  if (claimedMilestones.includes(milestone.xp)) {
    return 'is-granted';
  }

  return xp >= milestone.xp ? 'is-reached' : '';
}

function mskShift(ms) {
  return new Date(ms + 3 * 60 * 60 * 1000);
}

function msUntilMskMidnight(now) {
  const shifted = mskShift(now);
  const nextMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
  );

  return Math.max(0, nextMidnight - 3 * 60 * 60 * 1000 - now);
}

/** Ближайший понедельник 00:00 по МСК — сброс недельных заданий. */
function msUntilMskWeekEnd(now) {
  const shifted = mskShift(now);
  const weekdayIndex = (shifted.getUTCDay() + 6) % 7;
  const dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const nextMonday = dayStart + (7 - weekdayIndex) * 24 * 60 * 60 * 1000;

  return Math.max(0, nextMonday - 3 * 60 * 60 * 1000 - now);
}

function triggerHaptic(method, type) {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;

  if (haptic?.[method]) {
    haptic[method](type);
  }
}

export default MissionsScreen;

