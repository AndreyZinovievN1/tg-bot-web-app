import { Router } from 'express'

/**
 * Миссии (задания) Mini App: каталог действий, схема хранения, админские ручки.
 *
 * Задания больше не зашиты в код: бот-владелец настраивает их в админ-панели
 * (раздел «Задания»). В коде остаётся только список ДЕЙСТВИЙ, которые сервер
 * умеет отслеживать: по коду действия считается прогресс, цель и готовность
 * к забору (см. missionMetric в server/index.js).
 *
 * ВАЖНО: каталог действий продублирован на клиенте
 * (src/config/missions.js) — там лежат иконки, тон карточки и запасные
 * подписи. При добавлении действия правь оба места.
 */

/** Типы заданий: `daily` кормит шкалу XP дня, `weekly` выдаёт кейс за неделю. */
export const missionKinds = ['daily', 'weekly']

/** Где выполняется задание — подпись на карточке в приложении. */
export const missionWhereScopes = ['bot', 'app']

/**
 * Цели задания «подписка»: что именно сервер проверяет в Telegram.
 *
 * Один канал/чат — одна цель, тип говорит, ЧТО проверять вызовом `getChatMember`
 * (см. `checkMissionTargets` в server/index.js):
 *   - `subscribe`  — игрок должен быть участником канала или чата;
 *   - `bot_member` — сам бот должен быть добавлен в этот чат;
 *   - `bot_admin`  — бот должен быть администратором этого чата.
 *
 * Подписи типов лежат в словарях: `missions.targetTypes.<code>` для карточки
 * задания и `admin.missions.targetTypes.<code>` для редактора.
 */
export const missionTargetTypes = ['subscribe', 'bot_member', 'bot_admin']

/** Сколько целей можно повесить на одно задание: карточка должна остаться читаемой. */
export const missionTargetLimit = 12

/** Языки, для которых можно задать свой заголовок и текст задания. */
export const missionLocales = ['ru', 'en', 'uk']

/** Кейсы-награды (колонки case_balances) — используются и в админке кейсов. */
export const caseBalanceColumns = ['homeless', 'standard', 'unusual', 'premium', 'spring', 'march_8th']

/**
 * Уровни сложности: код + цвет по умолчанию. Цвет хранится рядом с заданием,
 * поэтому его всегда можно перекрасить вручную (поле «Цвет» в админке).
 */
export const missionDifficultyCatalog = [
  { code: 'easy', color: '#47d18a' },
  { code: 'normal', color: '#52a8ff' },
  { code: 'hard', color: '#ff9f45' },
  { code: 'epic', color: '#b06bff' },
]

/**
 * «Ритм заданий»: готовые интервалы сброса для плашки над списком в админке.
 *
 * Это общий такт: выбор пресета разом ставит всем повторяющимся заданиям один
 * интервал, как будильник на всё расписание. Группы:
 *   - `base`   — такт до двух суток (часы);
 *   - `medium` — такт больше двух суток (дни).
 *
 * Часы у пресетов уникальны, иначе два чипа означали бы одно и то же. Готовые
 * подписи лежат в словаре (`admin.missions.cadenceNames.<id>`), поэтому сервер
 * отдаёт только код, часы и группу.
 */
export const missionCadencePresets = [
  { id: 'pulse', hours: 12, group: 'base' },
  { id: 'orbit', hours: 24, group: 'base' },
  { id: 'helix', hours: 48, group: 'base' },
  { id: 'drift', hours: 72, group: 'medium' },
  { id: 'selene', hours: 168, group: 'medium' },
  { id: 'lunar', hours: 336, group: 'medium' },
]

/**
 * Действия, которые отслеживает сервер.
 *
 * `goalable: true` — у действия есть счётчик, поэтому в админке можно задать
 * цель (например, «25 сообщений»). Для остальных цель всегда 1: это событие
 * «случилось / не случилось» (кулдаун бота, ставка в рулетке).
 * `cooldownColumn` / `cooldownHours` — кулдаун функции в боте: момент
 * использования = кулдаун − часы (см. missionUsedToday).
 */
export const missionActionCatalog = [
  {
    code: 'activity_today',
    where: 'bot',
    goalable: false,
    defaultGoal: 1,
  },
  {
    code: 'groups_today',
    where: 'bot',
    goalable: true,
    defaultGoal: 2,
    maxGoal: 50,
  },
  {
    code: 'messages_today',
    where: 'bot',
    goalable: true,
    defaultGoal: 25,
    maxGoal: 5000,
  },
  {
    code: 'banana_ready',
    where: 'bot',
    goalable: false,
    defaultGoal: 1,
    cooldownColumn: 'banana_cooldown',
    cooldownHours: 8,
  },
  {
    code: 'bag_ready',
    where: 'bot',
    goalable: false,
    defaultGoal: 1,
    cooldownColumn: 'bag_cooldown',
    cooldownHours: 8,
  },
  {
    code: 'roulette_ready',
    where: 'bot',
    goalable: false,
    defaultGoal: 1,
    activityColumn: 'roulette_last_activity',
  },
  {
    code: 'case_open_today',
    where: 'app',
    goalable: true,
    defaultGoal: 1,
    maxGoal: 50,
  },
  {
    code: 'week_messages',
    where: 'bot',
    goalable: true,
    defaultGoal: 250,
    maxGoal: 20000,
  },
  {
    code: 'week_active_days',
    where: 'bot',
    goalable: true,
    defaultGoal: 5,
    maxGoal: 7,
  },
  {
    // Подписки и «добавь бота»: цель задания не задаётся руками — она равна
    // длине списка целей (`targets`), а прогресс — сколько целей выполнено.
    code: 'subscribe_targets',
    where: 'app',
    goalable: true,
    defaultGoal: 1,
    maxGoal: missionTargetLimit,
    targetList: true,
  },
  {
    code: 'cases_week',
    where: 'app',
    goalable: true,
    defaultGoal: 20,
    maxGoal: 500,
  },
  {
    code: 'groups_week',
    where: 'bot',
    goalable: true,
    defaultGoal: 5,
    maxGoal: 50,
  },
]

export const missionActionMap = new Map(missionActionCatalog.map((action) => [action.code, action]))

const missionColorPattern = /^#[0-9a-f]{6}$/i
const missionIdPattern = /^[a-z][a-z0-9_]{1,40}$/
const missionTitleMax = 80
const missionTextMax = 300

export const missionSchemaSql = `
CREATE TABLE IF NOT EXISTS mini_app_missions (
  id text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'daily',
  action text NOT NULL,
  where_scope text NOT NULL DEFAULT 'bot',
  titles jsonb NOT NULL DEFAULT '{}'::jsonb,
  texts jsonb NOT NULL DEFAULT '{}'::jsonb,
  goal integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  reward_case text,
  difficulty text NOT NULL DEFAULT 'normal',
  color text NOT NULL DEFAULT '#52a8ff',
  refresh_hours integer NOT NULL DEFAULT 24,
  repeatable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'daily';
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS where_scope text NOT NULL DEFAULT 'bot';
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS titles jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS texts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS goal integer NOT NULL DEFAULT 1;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS reward_case text;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'normal';
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#52a8ff';
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS refresh_hours integer NOT NULL DEFAULT 24;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS repeatable boolean NOT NULL DEFAULT true;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS targets jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_mini_app_missions_active ON mini_app_missions (active, kind, sort_order);
`

/**
 * Стартовый набор заданий: ровно те, что были зашиты в код до появления
 * админки, — чтобы после обновления приложение выглядело как раньше.
 */
export const missionDefaults = [
  { id: 'activity_today', kind: 'daily', action: 'activity_today', goal: 1, xp: 100, difficulty: 'easy', color: '#47d18a', sortOrder: 10 },
  { id: 'groups_today', kind: 'daily', action: 'groups_today', goal: 2, xp: 100, difficulty: 'easy', color: '#47d18a', sortOrder: 20 },
  { id: 'messages_today', kind: 'daily', action: 'messages_today', goal: 25, xp: 180, difficulty: 'normal', color: '#52a8ff', sortOrder: 30 },
  { id: 'banana_ready', kind: 'daily', action: 'banana_ready', goal: 1, xp: 140, difficulty: 'easy', color: '#47d18a', sortOrder: 40 },
  { id: 'bag_ready', kind: 'daily', action: 'bag_ready', goal: 1, xp: 140, difficulty: 'easy', color: '#47d18a', sortOrder: 50 },
  { id: 'roulette_ready', kind: 'daily', action: 'roulette_ready', goal: 1, xp: 140, difficulty: 'normal', color: '#52a8ff', sortOrder: 60 },
  { id: 'case_open_today', kind: 'daily', action: 'case_open_today', goal: 1, xp: 200, difficulty: 'normal', color: '#52a8ff', sortOrder: 70 },
  { id: 'week_messages', kind: 'weekly', action: 'week_messages', goal: 250, xp: 0, rewardCase: 'unusual', difficulty: 'hard', color: '#ff9f45', sortOrder: 110 },
  { id: 'week_active_days', kind: 'weekly', action: 'week_active_days', goal: 5, xp: 0, rewardCase: 'standard', difficulty: 'hard', color: '#ff9f45', sortOrder: 120 },
  // Задания на аудиторию: список подписок пустой, поэтому заготовка лежит
  // выключенной — владелец заполняет цели в редакторе и включает задание.
  { id: 'subscribe_targets', kind: 'daily', action: 'subscribe_targets', goal: 1, xp: 150, difficulty: 'normal', color: '#52a8ff', sortOrder: 80 },
  { id: 'cases_week', kind: 'weekly', action: 'cases_week', goal: 20, xp: 0, rewardCase: 'unusual', difficulty: 'hard', color: '#ff9f45', sortOrder: 130 },
  { id: 'groups_week', kind: 'weekly', action: 'groups_week', goal: 5, xp: 0, rewardCase: 'standard', difficulty: 'hard', color: '#ff9f45', sortOrder: 140 },
]

/** Показатель «до сброса» для заданий, у которых интервал не задан. */
const defaultRefreshHours = { daily: 24, weekly: 168 }

/**
 * Идемпотентно создаёт таблицу заданий и наполняет её стартовым набором.
 *
 * ВАЖНО: все действия заводятся заранее и ВЫКЛЮЧЕННЫМИ (`active = false`) —
 * в админке это список «будильников», где владелец просто включает нужные.
 * Уже существующие задания не перезаписываются: повторные вызовы безопасны и
 * не сбрасывают настройки из админки.
 */
export async function ensureMissionsSchema(pool) {
  const client = await pool.connect()

  try {
    await client.query(missionSchemaSql)
    const existing = await client.query('SELECT id FROM mini_app_missions')
    const present = new Set(existing.rows.map((row) => row.id))
    let added = 0

    for (const mission of missionDefaults) {
      if (present.has(mission.id)) {
        continue
      }

      // Стартовый набор лежит выключенным — включается тумблером в админке.
      await client.query(missionInsertSql, missionInsertValues({ ...mission, active: false }))
      added += 1
    }

    return { added }
  } finally {
    client.release()
  }
}

// ── Игровое время (МСК) ─────────────────────────────────────────────────────
// Дублируется на клиенте в src/screens/MissionsScreen.jsx (таймеры сброса).

/** Игровой день — календарные сутки по МСК (UTC+3). */
export function mskDayKey(ms) {
  return new Date(ms + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function startOfMskDay(ms) {
  const shifted = new Date(ms + 3 * 60 * 60 * 1000)
  shifted.setUTCHours(0, 0, 0, 0)
  return shifted.getTime() - 3 * 60 * 60 * 1000
}

/** Начало игровой недели — понедельник 00:00 по МСК. */
export function startOfMskWeek(ms) {
  const dayStart = startOfMskDay(ms)
  const weekdayIndex = (new Date(dayStart + 3 * 60 * 60 * 1000).getUTCDay() + 6) % 7

  return dayStart - weekdayIndex * 24 * 60 * 60 * 1000
}

/**
 * Период задания: сутки, неделя или любой другой интервал из `refreshHours`.
 * Границы выровнены по понедельнику 00:00 МСК, поэтому интервал 24 ч всегда
 * попадает в календарные сутки, а 168 ч — ровно в игровую неделю.
 * `null` — задание без сброса (одноразовое).
 */
export function missionPeriodRange(mission, now = Date.now()) {
  const hours = Number(mission?.refreshHours || 0)

  if (!Number.isFinite(hours) || hours <= 0) {
    return null
  }

  const bucketMs = hours * 60 * 60 * 1000
  const anchor = startOfMskWeek(now)
  const start = anchor + Math.floor((now - anchor) / bucketMs) * bucketMs

  return { start, end: start + bucketMs }
}

/**
 * Токен «награда раз за период». Хранится в mission_progress.claims по id
 * задания: `once` — одноразовое задание, `static` — без сброса,
 * `start:end` — окно текущего периода (конец окна в токене позволяет понять,
 * «свежий ли забор» без обращения к таблице заданий).
 */
export function missionToken(mission, now = Date.now()) {
  if (!mission || mission.repeatable === false) {
    return `${mission?.id || ''}:once`
  }

  const range = missionPeriodRange(mission, now)

  if (!range) {
    return `${mission.id}:static`
  }

  return `${mission.id}:${range.start}:${range.end}`
}

/** Награда уже забрана именно в текущем периоде этого задания? */
export function isMissionClaimFresh(token, now = Date.now()) {
  const value = String(token || '')

  if (!value) {
    return false
  }

  if (value.endsWith(':once') || value.endsWith(':static')) {
    return true
  }

  const parts = value.split(':')
  const end = Number(parts[parts.length - 1])

  return Number.isFinite(end) && end > now
}


// ── Чтение и запись заданий ────────────────────────────────────────────────

const missionSelectSql = `
SELECT id, kind, action, where_scope, titles, texts, goal, xp, reward_case,
       difficulty, color, refresh_hours, repeatable, active, sort_order, targets,
       created_at, updated_at
FROM mini_app_missions
`

const missionInsertSql = `
INSERT INTO mini_app_missions
  (id, kind, action, where_scope, titles, texts, goal, xp, reward_case,
   difficulty, color, refresh_hours, repeatable, active, sort_order, targets)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
RETURNING *
`

const missionUpdateSql = `
UPDATE mini_app_missions
SET kind = $2,
    action = $3,
    where_scope = $4,
    titles = $5::jsonb,
    texts = $6::jsonb,
    goal = $7,
    xp = $8,
    reward_case = $9,
    difficulty = $10,
    color = $11,
    refresh_hours = $12,
    repeatable = $13,
    active = $14,
    sort_order = $15,
    targets = $16::jsonb,
    updated_at = now()
WHERE id = $1
RETURNING *
`

/** Значения для INSERT: принимает и стартовый набор, и нормализованный ввод. */
function missionInsertValues(mission, id = '') {
  const action = missionActionMap.get(mission.action) || null

  return [
    id || mission.id,
    mission.kind,
    mission.action,
    action?.where || 'bot',
    JSON.stringify(mission.titles || {}),
    JSON.stringify(mission.texts || {}),
    Number(mission.goal || 1),
    Number(mission.xp || 0),
    mission.rewardCase || null,
    mission.difficulty || 'normal',
    mission.color || '#52a8ff',
    Number(mission.refreshHours ?? defaultRefreshHours[mission.kind] ?? 24),
    mission.repeatable !== false,
    mission.active !== false,
    Number(mission.sortOrder ?? 100),
    JSON.stringify(mission.targets || []),
  ]
}

/**
 * Строка БД → шаблон задания для приложения и админки. К каталогу действий
 * добавляются производные поля (счётчик цели, кулдаун бота), чтобы клиенту и
 * серверу не приходилось держать их отдельно.
 */
export function buildMissionTemplate(row) {
  const action = missionActionMap.get(row?.action) || null
  const kind = missionKinds.includes(row?.kind) ? row.kind : 'daily'
  const difficulty = missionDifficultyCatalog.find((item) => item.code === row?.difficulty)
    || missionDifficultyCatalog[1]
  const color = missionColorPattern.test(String(row?.color || '')) ? String(row.color).toLowerCase() : difficulty.color

  return {
    id: String(row?.id || ''),
    kind,
    action: action ? action.code : String(row?.action || ''),
    where: missionWhereScopes.includes(row?.where_scope) ? row.where_scope : (action?.where || 'bot'),
    titles: missionLocaleMap(row?.titles, missionTitleMax),
    texts: missionLocaleMap(row?.texts, missionTextMax),
    goal: Number(row?.goal || 1),
    goalable: Boolean(action?.goalable),
    maxGoal: Number(action?.maxGoal || 0) || null,
    cooldownColumn: action?.cooldownColumn || '',
    cooldownHours: Number(action?.cooldownHours || 0),
    activityColumn: action?.activityColumn || '',
    xp: Number(row?.xp || 0),
    rewardCase: row?.reward_case || null,
    difficulty: difficulty.code,
    color,
    refreshHours: Number(row?.refresh_hours ?? defaultRefreshHours[kind] ?? 24),
    repeatable: row?.repeatable !== false,
    active: row?.active !== false,
    sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? 100),
    // Список целей «подписка»: у обычных заданий он всегда пустой, а цель такого
    // задания равна числу целей, поэтому в админке её не правят вручную.
    targets: action?.targetList ? normalizeMissionTargets(row?.targets) : [],
    targetList: Boolean(action?.targetList),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

/** Карта переводов `{ ru: '…' }`: только известные языки, без пустых строк. */
function missionLocaleMap(value, maxLength) {
  const source = safeJsonObject(value)
  const result = {}

  for (const locale of missionLocales) {
    const text = String(source[locale] || '').trim()

    if (text) {
      result[locale] = text.slice(0, maxLength)
    }
  }

  return result
}



// ── Цели заданий «подписка» ────────────────────────────────────────────────

/** Максимальная длина подписи цели (название канала или чата). */
const missionTargetTitleMax = 64

/**
 * Chat id или @username: Telegram принимает в `getChatMember` и число
 * (`-1001234567890`), и открытый юзернейм канала. Храним как ввёл владелец,
 * только убираем пробелы и мусор.
 */
const missionChatIdPattern = /^-?\d{5,20}$/
const missionChatUsernamePattern = /^@[A-Za-z0-9_]{4,32}$/

/** Приводит ввод владельца к chat_id/@username: мусор → пустая строка. */
export function normalizeMissionChatId(value) {
  const raw = String(value || '').trim()

  if (missionChatIdPattern.test(raw) || missionChatUsernamePattern.test(raw)) {
    return raw
  }

  return ''
}

/** Ссылка на канал в карточке задания: «@space» и «t.me/space» тоже понимаем. */
export function normalizeMissionTargetUrl(value) {
  const raw = String(value || '').trim()

  if (!raw) {
    return ''
  }

  if (raw.startsWith('@')) {
    return `https://t.me/${raw.slice(1)}`.slice(0, 200)
  }

  if (/^t\.me\//i.test(raw)) {
    return `https://${raw}`.slice(0, 200)
  }

  return /^https?:\/\//i.test(raw) ? raw.slice(0, 200) : ''
}

/**
 * Список целей задания → нормализованный массив для БД и клиента.
 *
 * Цель без chat_id отбрасывается (владелец мог оставить пустую строку в
 * редакторе), а дубликаты по паре «тип + чат» склеиваются: сервер проверяет
 * каждую цель отдельным запросом, повторять их незачем.
 */
export function normalizeMissionTargets(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const result = []
  const seen = new Set()

  for (const item of value) {
    if (result.length >= missionTargetLimit) {
      break
    }

    const chatId = normalizeMissionChatId(item?.chatId)

    if (!chatId) {
      continue
    }

    const type = missionTargetTypes.includes(String(item?.type || '')) ? String(item.type) : missionTargetTypes[0]
    const id = `${type}:${chatId}`

    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    result.push({
      id,
      type,
      chatId,
      title: String(item?.title || '').trim().slice(0, missionTargetTitleMax),
      url: normalizeMissionTargetUrl(item?.url),
    })
  }

  return result
}

function safeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

/**
 * Задания из БД. Пустой массив означает «таблицы нет или она пуста» — в этом
 * случае вызывающая сторона подставляет стартовый набор, чтобы обновлённый
 * сервер продолжал работать до выполнения SQL-миграции.
 */
export async function loadMissionTemplates(client) {
  try {
    const result = await client.query(`${missionSelectSql} ORDER BY sort_order, id`)

    return result.rows.map(buildMissionTemplate)
  } catch (error) {
    console.warn('Таблица заданий недоступна, используется стартовый набор:', error.message)
    return []
  }
}

/** Стартовый набор заданий, если в БД ещё ничего не сохранено. */
export function defaultMissionTemplates() {
  return missionDefaults.map((mission) => buildMissionTemplate({
    ...mission,
    reward_case: mission.rewardCase || null,
    refresh_hours: defaultRefreshHours[mission.kind] || 24,
    repeatable: true,
    active: true,
  }))
}

/**
 * Проверка и нормализация задания из админки. Ошибки — на русском: они
 * показываются владельцу прямо в форме.
 */
export function normalizeMissionPayload(raw, { id = '' } = {}) {
  const source = safeJsonObject(raw)
  const action = missionActionMap.get(String(source.action || '').trim())

  if (!action) {
    throw new Error('Неизвестное действие задания')
  }

  const kind = missionKinds.includes(source.kind) ? source.kind : 'daily'
  const difficulty = missionDifficultyCatalog.find((item) => item.code === source.difficulty)
  const repeatable = source.repeatable !== false
  const maxGoal = Number(action.maxGoal || 100000)
  const color = String(source.color || '').trim()
  // Задание «подписка» живёт списком целей: их и сохраняем, а цель задания
  // считаем по длине списка — владельцу не нужно поддерживать два числа.
  const targets = action.targetList ? normalizeMissionTargets(source.targets) : []
  const active = source.active !== false

  if (action.targetList && active && targets.length === 0) {
    throw new Error('Добавьте хотя бы одну цель: канал или чат, подписку на который проверяет бот')
  }

  return {
    id,
    kind,
    action: action.code,
    titles: missionLocaleMap(source.titles, missionTitleMax),
    texts: missionLocaleMap(source.texts, missionTextMax),
    goal: action.targetList
      ? Math.max(1, targets.length)
      : action.goalable ? clampInteger(source.goal, 1, maxGoal, action.defaultGoal || 1) : 1,
    xp: clampInteger(source.xp, 0, 5000, 0),
    rewardCase: caseBalanceColumns.includes(String(source.rewardCase || '')) ? String(source.rewardCase) : null,
    difficulty: (difficulty || missionDifficultyCatalog[1]).code,
    color: missionColorPattern.test(color) ? color.toLowerCase() : (difficulty || missionDifficultyCatalog[1]).color,
    // Одноразовое задание не сбрасывается, поэтому интервал ему не нужен.
    refreshHours: repeatable ? clampInteger(source.refreshHours, 1, 8760, defaultRefreshHours[kind]) : 0,
    repeatable,
    active,
    sortOrder: clampInteger(source.sortOrder, 0, 99999, 100),
    targets,
  }
}

/** Целое число в границах: пустое или нечисловое значение → значение по умолчанию. */
function clampInteger(value, min, max, fallback) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(number)))
}

/** Проверка id нового задания: он попадает в токены наград и в claims. */
export function normalizeMissionId(value) {
  const id = String(value || '').trim().toLowerCase()

  if (!missionIdPattern.test(id)) {
    throw new Error('Код задания: латиница, цифры и «_», 2–41 символ, начинается с буквы')
  }

  return id
}

// ── Админские ручки ────────────────────────────────────────────────────────

/**
 * Ручки раздела «Задания» для админ-панели.
 *
 * Доступ только у владельца бота: `requireOwner` проверяется после
 * `requireTelegramUser` (кто пришёл) и `requireAdminSession` (админ-паттерн),
 * поэтому посторонний не увидит даже список заданий.
 *
 * `onChange` вызывается после каждой успешной записи — сервер сбрасывает
 * кеш заданий, чтобы приложение увидело правки сразу.
 */
export function createMissionsApi({
  pool,
  requireTelegramUser,
  requireAdminSession,
  requireOwner,
  onChange,
}) {
  const router = Router()
  const guards = [requireTelegramUser, requireAdminSession, requireOwner].filter(Boolean)

  const catalog = {
    kinds: missionKinds,
    whereScopes: missionWhereScopes,
    locales: missionLocales,
    actions: missionActionCatalog,
    difficulties: missionDifficultyCatalog,
    cases: caseBalanceColumns,
    targetTypes: missionTargetTypes,
    targetLimit: missionTargetLimit,
    refreshPresets: [
      { hours: 24, kind: 'daily' },
      { hours: 168, kind: 'weekly' },
    ],
    cadencePresets: missionCadencePresets,
  }

  async function respondWithMissions(client, res) {
    const result = await client.query(`${missionSelectSql} ORDER BY sort_order, id`)

    res.json({ ok: true, missions: result.rows.map(buildMissionTemplate), catalog })
  }

  async function withClient(res, next, handler) {
    const client = await pool.connect()

    try {
      await handler(client)
    } catch (error) {
      next(error)
    } finally {
      client.release()
    }
  }

  /** Проверка тела задания: ошибки возвращаем как 400 с текстом для владельца. */
  function readPayload(req, res, id) {
    try {
      return normalizeMissionPayload(req.body, { id })
    } catch (error) {
      res.status(400).json({ error: error.message })
      return null
    }
  }

  router.get('/api/admin/missions', ...guards, async (_req, res, next) => {
    await withClient(res, next, (client) => respondWithMissions(client, res))
  })

  router.post('/api/admin/missions', ...guards, async (req, res, next) => {
    let id

    try {
      id = normalizeMissionId(req.body?.id)
    } catch (error) {
      res.status(400).json({ error: error.message })
      return
    }

    const mission = readPayload(req, res, id)

    if (!mission) {
      return
    }

    await withClient(res, next, async (client) => {
      const existing = await client.query('SELECT 1 FROM mini_app_missions WHERE id = $1', [id])

      if (existing.rowCount > 0) {
        res.status(409).json({ error: 'Задание с таким кодом уже существует' })
        return
      }

      await client.query(missionInsertSql, missionInsertValues(mission, id))
      onChange?.()
      await respondWithMissions(client, res)
    })
  })

  router.put('/api/admin/missions/:id', ...guards, async (req, res, next) => {
    let id

    try {
      id = normalizeMissionId(req.params.id)
    } catch (error) {
      res.status(400).json({ error: error.message })
      return
    }

    const mission = readPayload(req, res, id)

    if (!mission) {
      return
    }

    await withClient(res, next, async (client) => {
      const [, ...values] = missionInsertValues(mission, id)
      const result = await client.query(missionUpdateSql, [id, ...values])

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Задание не найдено' })
        return
      }

      onChange?.()
      await respondWithMissions(client, res)
    })
  })

  /**
   * «Ритм заданий»: одним движением ставим всем повторяющимся заданиям один
   * интервал сброса — плашка с пресетами в админке.
   */
  router.patch('/api/admin/missions/cadence', ...guards, async (req, res, next) => {
    const hours = clampInteger(req.body?.hours, 1, 8760, 0)

    if (!hours) {
      res.status(400).json({ error: 'Некорректный интервал сброса' })
      return
    }

    await withClient(res, next, async (client) => {
      await client.query(
        'UPDATE mini_app_missions SET refresh_hours = $1, updated_at = now() WHERE repeatable = true',
        [hours],
      )
      onChange?.()
      await respondWithMissions(client, res)
    })
  })

  router.delete('/api/admin/missions/:id', ...guards, async (req, res, next) => {
    const id = String(req.params.id || '')

    await withClient(res, next, async (client) => {
      const result = await client.query('DELETE FROM mini_app_missions WHERE id = $1', [id])

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Задание не найдено' })
        return
      }

      onChange?.()
      await respondWithMissions(client, res)
    })
  })

  return router
}

export default createMissionsApi

