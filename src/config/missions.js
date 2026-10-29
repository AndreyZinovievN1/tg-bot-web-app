import { FiMessageCircle, FiSend, FiShield, FiTrendingUp, FiUserPlus } from 'react-icons/fi';
import { LuBanana, LuFlame, LuMessagesSquare, LuPackage, LuTrophy, LuUsers } from 'react-icons/lu';
import { TbCalendarWeek, TbMoneybag, TbRoulette, TbSparkles } from 'react-icons/tb';

/**
 * Миссии: оформление карточек и зеркало серверных справочников.
 *
 * Сами задания больше не зашиты в код: они живут в БД (`mini_app_missions`) и
 * приходят с сервера (`data.missions`), где у каждого задания есть заголовки,
 * тексты, цель, XP, награда, сложность, цвет и интервал сброса.
 *
 * Здесь остаётся только оформление:
 *   - `missionActionMeta` — иконка и тон карточки по КОДУ ДЕЙСТВИЯ;
 *   - `missionDifficultyMeta` — цвета уровней сложности по умолчанию
 *     (если владелец не задал свой цвет задания).
 *
 * Каталог действий продублирован на сервере (`missionActionCatalog` в
 * server/missionsApi.js): при добавлении действия правь оба места, иначе
 * задание получит нейтральную иконку.
 */
export const missionActionMeta = {
  activity_today: { icon: FiMessageCircle, tone: 'ice' },
  groups_today: { icon: LuMessagesSquare, tone: 'green' },
  messages_today: { icon: LuFlame, tone: 'pink' },
  banana_ready: { icon: LuBanana, tone: 'amber' },
  bag_ready: { icon: TbMoneybag, tone: 'gold' },
  roulette_ready: { icon: TbRoulette, tone: 'accent' },
  case_open_today: { icon: LuPackage, tone: 'ice' },
  week_messages: { icon: FiTrendingUp, tone: 'accent' },
  week_active_days: { icon: TbCalendarWeek, tone: 'green' },
  subscribe_targets: { icon: FiUserPlus, tone: 'green' },
  cases_week: { icon: LuTrophy, tone: 'gold' },
  groups_week: { icon: LuUsers, tone: 'green' },
};

/**
 * Оформление целей задания «подписка» (`mission.targets` с сервера).
 * Тип цели говорит, что именно проверил сервер через Telegram:
 * `subscribe` — подписка игрока, `bot_member` — бот добавлен, `bot_admin` —
 * бот админ. Подписи — в словаре `missions.targetTypes.<type>`.
 */
export const missionTargetMeta = {
  subscribe: { icon: FiUserPlus, tone: 'accent' },
  bot_member: { icon: FiSend, tone: 'ice' },
  bot_admin: { icon: FiShield, tone: 'amber' },
};

/** Иконка цели: неизвестный тип показываем как обычную подписку. */
export function missionTargetVisual(target) {
  return missionTargetMeta[target?.type] || missionTargetMeta.subscribe;
}

/** Оформление задания с незнакомым приложению действием: нейтральная карточка. */
export const missionFallbackMeta = { icon: TbSparkles, tone: 'ice' };

/**
 * Уровни сложности: код → цвет и ключ подписи. Цвета совпадают с
 * `missionDifficultyCatalog` в server/missionsApi.js.
 */
export const missionDifficultyMeta = {
  easy: { color: '#47d18a', labelKey: 'missions.difficulty.easy' },
  normal: { color: '#52a8ff', labelKey: 'missions.difficulty.normal' },
  hard: { color: '#ff9f45', labelKey: 'missions.difficulty.hard' },
  epic: { color: '#b06bff', labelKey: 'missions.difficulty.epic' },
};

/** Иконка и тон карточки задания: сначала по действию, потом нейтральные. */
export function missionVisual(mission) {
  return missionActionMeta[mission?.action] || missionFallbackMeta;
}

/** Сложность задания: неизвестный код показываем как `normal`. */
export function missionDifficulty(mission) {
  return missionDifficultyMeta[mission?.difficulty] || missionDifficultyMeta.normal;
}

/** Цвет задания: свой из админки, а если он пуст — цвет его сложности. */
export function missionColor(mission) {
  const color = String(mission?.color || '').trim();

  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : missionDifficulty(mission).color;
}

/**
 * `#52a8ff` → `82 168 255`: в CSS цвета живут каналами
 * (`rgb(var(--card-rgb) / 0.2)`), поэтому hex нужно разложить.
 */
export function missionColorRgb(color) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(color || ''));

  if (!match) {
    return '';
  }

  return [match[1], match[2], match[3]].map(channel => parseInt(channel, 16)).join(' ');
}

