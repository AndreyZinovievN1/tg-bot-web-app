import crypto from 'node:crypto'
import { Router } from 'express'

/**
 * VIP-подписка за реальные деньги (карта, СБП) через Tribute.
 *
 * Как это устроено в Tribute (https://wiki.tribute.tg/for-content-creators/api-documentation):
 *
 *   GET  /api/v1/subscriptions        — каталог подписок автора с периодами и ценами;
 *   GET  /api/v1/subscribers          — подписчики подписки (`expireAt`, `status`);
 *   POST <webhook URL>                — события `new_subscription`, `renewed_subscription`,
 *                                       `cancelled_subscription` с заголовком
 *                                       `trbt-signature` (HMAC-SHA256 тела запроса, ключ — API key).
 *
 * Публичной ручки «создать счёт» у подписок Tribute нет: оплата открывается по
 * ссылке подписки из кабинета автора (`https://t.me/tribute/app?startapp=...` или
 * веб-ссылка). Поэтому схема такая:
 *
 *   1. владелец создаёт подписку в кабинете Tribute и кладёт её id и ссылку в `.env`;
 *   2. приложение показывает тарифы за реальные деньги и открывает эту ссылку;
 *   3. после оплаты Tribute присылает вебхук, и мы продлеваем `vip_users` ровно
 *      так же, как это делает покупка за Telegram Stars (см. `extendVipMembership`
 *      в `server/index.js`), — дни складываются с текущим сроком;
 *   4. кнопка «Проверить оплату» дополнительно сверяется с `/subscribers` на случай
 *      потерянного вебхука; недоступность этой ручки (она помечена у Tribute как
 *      внутренняя) не мешает — статус всё равно берётся из своей базы.
 *
 * События пишутся в `tribute_events` с уникальным `event_key`: Tribute повторяет
 * доставку при ошибке (5 мин, 15 мин, 30 мин, 1 ч, 2 ч, 4 ч, 8 ч, 8 ч), и без
 * ключа повторный вебхук продлил бы подписку дважды.
 *
 * Настройки окружения:
 *   TRIBUTE_API_KEY              — API key из кабинета Tribute (Settings → API Keys);
 *   TRIBUTE_VIP_LINK             — ссылка на оплату подписки из кабинета
 *                                  (Telegram-ссылка или web-ссылка, только https);
 *   TRIBUTE_VIP_SUBSCRIPTION_ID  — id подписки VIP (`subscriptionId`). Необязателен:
 *                                  если в кабинете подписка одна, id берётся из каталога;
 *   TRIBUTE_VIP_PERIODS          — привязка периодов к тарифам вручную; по умолчанию
 *                                  тариф подбирается по сроку (monthly → 30 дней и т.д.);
 *   TRIBUTE_API_URL              — адрес API (по умолчанию https://tribute.tg/api/v1).
 *
 * Ссылка для вебхука в кабинете Tribute: `https://<домен приложения>/api/tribute/webhook`.
 * Пока ключ и ссылка на оплату не заданы, раздел оплаты картой просто не
 * показывается — покупка за звёзды работает как раньше. Если Tribute ответил, но
 * подписки VIP в кабинете нет, раздел тоже скрыт (в лог уходит `subscription-not-found`).
 */

const TRIBUTE_API_URL = 'https://tribute.tg/api/v1'
const dayMs = 24 * 60 * 60 * 1000
/** Сколько ждём ответ Tribute в обычных запросах (каталог, подписчики). */
const requestTimeoutMs = 10_000
/** Каталог цен меняется редко: держим его в памяти, чтобы не дёргать API на каждый bootstrap. */
const catalogSuccessTtlMs = 5 * 60 * 1000
/** Ошибку кешируем недолго: Tribute мог просто моргнуть. */
const catalogFailureTtlMs = 60 * 1000
/** Сколько bootstrap ждёт каталог при первом открытии (дальше — из кеша). */
const catalogWaitMs = 1_500

/**
 * Периоды Tribute и срок в днях: по сроку подбирается тариф из `vipPlans`
 * (см. `planForPeriod`) и запасной срок для событий без пары. `quarterly`
 * (90 дней) тарифа не находит — его в приложении не показываем, но оплатить на
 * странице Tribute можно, и VIP выдастся на 90 дней (см. `tributeEventDays`).
 */
const tributePeriodDays = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  halfyearly: 180,
  yearly: 365,
}

/**
 * События подписки Tribute. `grants` — продлевает ли событие VIP.
 * Отмена не отбирает доступ: оплаченный срок уже лежит в `expires_at`,
 * и `vip_users` не должен стать короче, чем оплачено.
 */
const subscriptionEvents = {
  new_subscription: { grants: true },
  renewed_subscription: { grants: true },
  cancelled_subscription: { grants: false },
}

/** Настройки Tribute из окружения. */
export function loadTributeConfig(env = {}) {
  const apiKey = String(env.TRIBUTE_API_KEY || '').trim()
  const subscriptionId = toPositiveInt(env.TRIBUTE_VIP_SUBSCRIPTION_ID)
  const link = normalizeTributeLink(env.TRIBUTE_VIP_LINK)
  const apiBaseUrl = String(env.TRIBUTE_API_URL || TRIBUTE_API_URL).trim().replace(/\/+$/, '')

  return {
    apiKey,
    subscriptionId,
    link,
    periodMap: parsePeriodMap(env.TRIBUTE_VIP_PERIODS),
    apiBaseUrl,
    /**
     * Ключ нужен, чтобы проверить подпись вебхука, ссылка — чтобы вести на
     * оплату, id подписки можно не задавать: если в кабинете она одна, он
     * определится по каталогу (`vipSubscriptionId`).
     */
    enabled: Boolean(apiKey && link),
  }
}

/**
 * Проверка подписи вебхука: `trbt-signature` — HMAC-SHA256 тела запроса,
 * ключ подписи — API key. Сравнение постоянное по времени, чтобы по ответам
 * нельзя было подобрать подпись.
 */
export function verifyTributeSignature(rawBody, signature, apiKey) {
  if (!rawBody || !signature || !apiKey) {
    return false
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody))
  const expected = crypto.createHmac('sha256', apiKey).update(body).digest()
  const candidate = String(signature).trim().replace(/^sha256=/i, '')
  const received = /^[a-f0-9]{64}$/i.test(candidate)
    ? Buffer.from(candidate, 'hex')
    : Buffer.from(candidate, 'base64')

  return received.length === expected.length && crypto.timingSafeEqual(received, expected)
}

/**
 * `monthly:vip_30,halfyearly:vip_180` → `{ monthly: 'vip_30', halfyearly: 'vip_180' }`.
 * Явная привязка нужна, только если сроки в Tribute не совпадают с `vipPlans`;
 * по умолчанию карта пустая и тариф подбирается по сроку (`planForPeriod`).
 * Неизвестные периоды и мусор пропускаются: лучше меньше тарифов, чем выплата
 * VIP за период, которого нет в подписке.
 */
function parsePeriodMap(raw) {
  const text = String(raw || '').trim()

  if (!text) {
    return {}
  }

  const map = {}

  for (const pair of text.split(',')) {
    const [rawPeriod, rawPlanId] = pair.split(':')
    const period = String(rawPeriod || '').trim().toLowerCase()
    const planId = String(rawPlanId || '').trim()

    if (!planId || !tributePeriodDays[period]) {
      continue
    }

    map[period] = planId
  }

  return map
}

/**
 * Тариф VIP для периода Tribute.
 *
 * Явная привязка (`TRIBUTE_VIP_PERIODS`) — это полная замена: если она задана,
 * продаём только перечисленные в ней периоды. Иначе тариф подбирается по сроку:
 * `monthly` (30 дней) → `vip_30`, `halfyearly` (180) → `vip_180`,
 * `yearly` (365) → `vip_365`; период без пары (`quarterly`, `trial`) не продаём.
 */
export function planForPeriod(config, vipPlans, period) {
  const map = config?.periodMap || {}
  const planId = map[period]

  if (Object.keys(map).length > 0) {
    return planId ? vipPlans.find((item) => item.id === planId) || null : null
  }

  const days = tributePeriodDays[period]

  return days ? vipPlans.find((item) => Number(item.days) === days) || null : null
}

/** Обратное соответствие «срок тарифа → период Tribute»: нужно, когда каталог не ответил. */
const periodByDays = Object.fromEntries(
  Object.entries(tributePeriodDays).map(([period, days]) => [days, period]),
)

function periodForPlan(config, plan) {
  const explicit = Object.entries(config?.periodMap || {}).find(([, planId]) => planId === plan.id)

  return explicit ? explicit[0] : periodByDays[Number(plan.days)] || null
}

/** Ссылка на оплату: только https, иначе открывать её в Telegram небезопасно. */
function normalizeTributeLink(raw) {
  const text = String(raw || '').trim()

  if (!text) {
    return ''
  }

  try {
    const url = new URL(text)

    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function toPositiveInt(raw) {
  const value = Number(String(raw ?? '').trim())

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function parseTimestamp(raw) {
  if (!raw) {
    return null
  }

  const date = new Date(String(raw))

  return Number.isNaN(date.getTime()) ? null : date
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)

    // Таймаут ожидания не должен держать процесс при остановке сервера.
    timer.unref?.()
  })
}

/** Ошибка запроса к Tribute: нужна, чтобы отличить «Tribute не ответил» от ошибок БД. */
class TributeRequestError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'TributeRequestError'
    this.status = status
  }
}

/** Запрос к API Tribute с ключом из окружения и таймаутом. */
async function tributeRequest(config, path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)

  try {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      headers: {
        'Api-Key': config.apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')

      throw new TributeRequestError(
        `Tribute API ответил ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
        response.status,
      )
    }

    return await response.json()
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new TributeRequestError('Tribute API не ответил вовремя', 0)
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
}

function emptyCatalog(error = 'disabled') {
  return { ok: false, plans: [], currency: null, subscriptionId: null, error }
}

/**
 * Кеш каталога: ключ собирается из адреса API, id подписки и привязки периодов.
 * Один запрос на все bootstrap-ы, ошибка живёт минуту.
 */
let catalogState = { key: '', at: 0, data: null, inflight: null, inflightKey: '' }

function catalogKey(config) {
  const periods = Object.entries(config.periodMap)
    .map(([period, planId]) => `${period}:${planId}`)
    .sort()
    .join(',')

  return `${config.apiBaseUrl}|${config.subscriptionId}|${periods}`
}

function freshCatalog(key) {
  const { data, at, key: cachedKey } = catalogState

  if (!data || cachedKey !== key) {
    return null
  }

  const ttl = data.ok ? catalogSuccessTtlMs : catalogFailureTtlMs

  return Date.now() - at < ttl ? data : null
}

function staleCatalog(key) {
  return catalogState.data && catalogState.key === key ? catalogState.data : null
}

/** Чтобы не писать в лог одно и то же на каждый перезапрос каталога. */
let autoSubscriptionLogged = null

/**
 * id подписки VIP: из `.env`, а если он там не задан — из каталога Tribute
 * (владелец создал в кабинете одну подписку). Нужен и для сверки событий
 * вебхука, и для `/subscribers`.
 */
export function vipSubscriptionId(config) {
  return config?.subscriptionId || toPositiveInt(catalogState.data?.subscriptionId) || null
}

function startCatalogRequest(config, vipPlans, key) {
  const request = (async () => {
    let data

    try {
      const payload = await tributeRequest(config, '/subscriptions')
      data = buildTributePlans(config, vipPlans, payload)

      if (data.ok && !config.subscriptionId && data.subscriptionId) {
        if (autoSubscriptionLogged !== data.subscriptionId) {
          autoSubscriptionLogged = data.subscriptionId
          console.info(`[tribute] подписка VIP определена по каталогу: ${data.subscriptionId}`)
        }
      }

      if (!data.ok) {
        console.warn('[tribute] в каталоге нет нужных периодов подписки:', data.error)
      }
    } catch (error) {
      console.warn('[tribute] каталог подписок недоступен:', error.message)
      // Каталог не ответил — тарифы всё равно показываем, но без цен: ссылка на
      // оплату есть в настройках, а сумму человек увидит на странице Tribute.
      data = {
        ...buildTributePlans(config, vipPlans, { result: [] }, { offline: true }),
        error: error.message,
      }
    }

    catalogState = { key, at: Date.now(), data, inflight: null, inflightKey: '' }

    return data
  })()

  catalogState = { ...catalogState, inflight: request, inflightKey: key }

  return request
}

/**
 * Тарифы за реальные деньги: цена берётся из Tribute, срок — из `vipPlans`,
 * чтобы в приложении оба способа оплаты давали одинаковые дни.
 *
 * Если каталог не ответил, тарифы всё равно остаются (без цены): ссылка на
 * оплату есть в настройках, а период и сумму человек увидит на странице Tribute.
 * Если же Tribute ответил и подписки VIP в кабинете нет, тарифов нет вовсе —
 * заведомо нерабочую кнопку оплаты лучше не показывать.
 */
export async function loadTributeCatalog(config, vipPlans, { force = false, waitMs = 0 } = {}) {
  if (!config?.enabled) {
    return emptyCatalog()
  }

  const key = catalogKey(config)
  const cached = freshCatalog(key)

  if (cached && !force) {
    return cached
  }

  const request =
    catalogState.inflight && catalogState.inflightKey === key
      ? catalogState.inflight
      : startCatalogRequest(config, vipPlans, key)

  if (waitMs > 0) {
    await Promise.race([request, delay(waitMs)])

    return freshCatalog(key) || staleCatalog(key) || emptyCatalog('not-ready')
  }

  return request
}

/** Снимок для bootstrap: не ждёт Tribute дольше пары секунд и никогда не бросает. */
export async function tributeVipSnapshot(config, vipPlans) {
  if (!config?.enabled) {
    return { enabled: false, link: '', currency: null, pricesReady: false, plans: [] }
  }

  const catalog = await loadTributeCatalog(config, vipPlans, { waitMs: catalogWaitMs })

  return {
    enabled: true,
    link: config.link,
    currency: catalog.currency,
    pricesReady: catalog.ok,
    plans: catalog.plans.map((plan) => ({ ...plan })),
  }
}

function buildTributePlans(config, vipPlans, payload, { offline = false } = {}) {
  const list = Array.isArray(payload?.result) ? payload.result : []
  const catalogIds = list.map((item) => toPositiveInt(item?.subscriptionId)).filter(Boolean)
  // id подписки в кабинете не показывается: если она там одна, берём её.
  const subscriptionId = config.subscriptionId || (catalogIds.length === 1 ? catalogIds[0] : null)
  const subscription =
    (subscriptionId &&
      list.find((item) => toPositiveInt(item?.subscriptionId) === subscriptionId)) ||
    null

  if (!subscription) {
    // Каталог не ответил — показываем известные тарифы без цен, чтобы раздел
    // «Картой» не пропадал из-за моргнувшего API. Если же Tribute ответил и
    // подписки нет (ещё не создана или id не тот), кнопки оплаты не рисуем:
    // вести человека на нерабочую страницу хуже, чем спрятать способ оплаты.
    const fallbackPlans = offline
      ? vipPlans
          .map((plan) => ({ plan, period: periodForPlan(config, plan) }))
          .filter((item) => item.period)
          .map(({ plan, period }) => ({
            id: plan.id,
            days: Number(plan.days) || 0,
            period,
            periodId: null,
            price: null,
            popular: Boolean(plan.popular),
          }))
      : []

    return {
      ok: false,
      plans: fallbackPlans,
      currency: null,
      subscriptionId,
      error: catalogIds.length > 1 ? 'subscription-not-specified' : 'subscription-not-found',
    }
  }

  const plans = []

  for (const remote of subscription.periods || []) {
    const period = String(remote?.period || '').trim().toLowerCase()
    const plan = planForPeriod(config, vipPlans, period)

    // Период без пары в `vipPlans` (например `quarterly` или `trial`) в
    // приложении не продаём: срок такого платежа не совпадёт с тарифом.
    // Один тариф не показываем дважды, даже если он привязан к двум периодам.
    if (!plan || plans.some((item) => item.id === plan.id)) {
      continue
    }

    plans.push({
      id: plan.id,
      days: Number(plan.days) || 0,
      period,
      periodId: remote?.periodId ?? null,
      price: remote?.price === undefined || remote?.price === null ? null : Number(remote.price),
      popular: Boolean(plan.popular),
    })
  }

  plans.sort((a, b) => a.days - b.days)

  return {
    ok: plans.length > 0,
    plans,
    currency: subscription.currency ? String(subscription.currency).toUpperCase() : null,
    subscriptionId,
    error: plans.length > 0 ? null : 'periods-not-configured',
  }
}

/**
 * Журнал вебхуков Tribute. `event_key` уникален, поэтому повторная доставка
 * того же события не продлевает VIP второй раз.
 *
 * Таблица создаётся идемпотентно; на существующей базе приложение не может
 * выдать себе права на чужую таблицу, поэтому при ошибке пишем подсказку про
 * `server/admin_setup.sql`.
 */
export async function ensureTributeSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tribute_events (
      id bigserial PRIMARY KEY,
      event_key text NOT NULL UNIQUE,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      telegram_user_id bigint,
      subscription_id bigint,
      period_id bigint,
      period text,
      price bigint,
      amount bigint,
      currency text,
      expires_at timestamptz,
      days integer NOT NULL DEFAULT 0,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz
    )
  `)

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_tribute_events_user ON tribute_events (telegram_user_id, created_at DESC)',
  )
}

/**
 * Ключ идемпотентности: имя события и реквизиты платежа. Время создания
 * события (`created_at`) не берём — при повторной доставке Tribute может его
 * пересчитать, а срок окончания подписки остаётся тем же.
 */
function tributeEventKey(name, payload) {
  const identity = [
    name,
    payload.telegram_user_id ?? '',
    payload.trb_user_id ?? '',
    payload.subscription_id ?? '',
    payload.period_id ?? '',
    payload.expires_at ?? '',
  ].join('|')

  return crypto.createHash('sha256').update(identity).digest('hex')
}

/** Сколько дней VIP даёт оплаченный период. */
function tributeEventDays(config, vipPlans, payload) {
  const period = String(payload.period || '').trim().toLowerCase()
  const planDays = Number(planForPeriod(config, vipPlans, period)?.days) || 0

  if (planDays > 0) {
    return planDays
  }

  const periodDays = tributePeriodDays[period] || 0

  if (periodDays > 0) {
    return periodDays
  }

  // Неизвестный период (например, `onetime`): считаем по фактическому сроку
  // из Tribute, но не больше года — защита от странного `expires_at`.
  const until = parseTimestamp(payload.expires_at)

  if (!until) {
    return 0
  }

  return Math.min(365, Math.max(0, Math.ceil((until.getTime() - Date.now()) / dayMs)))
}

/**
 * Обработка события подписки: запись в журнал + продление VIP.
 *
 * Вызывается из вебхука. Продление идёт тем же путём, что оплата звёздами
 * (`extendVipMembership`): дни складываются с текущим сроком в `vip_users`.
 */
export async function handleTributeEvent({ pool, config, vipPlans, event, extendVipMembership }) {
  const name = String(event?.name || '').trim()
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : null
  const meta = subscriptionEvents[name]

  if (!meta || !payload) {
    return { status: 'ignored', reason: 'unknown-event' }
  }

  const subscriptionId = toPositiveInt(payload.subscription_id)
  const expectedSubscriptionId = vipSubscriptionId(config)

  // Чужие подписки игнорируем: у автора может быть не только VIP.
  if (expectedSubscriptionId && subscriptionId && subscriptionId !== expectedSubscriptionId) {
    return { status: 'ignored', reason: 'foreign-subscription' }
  }

  const telegramUserId = toPositiveInt(payload.telegram_user_id)
  const days = meta.grants ? tributeEventDays(config, vipPlans, payload) : 0
  const eventKey = tributeEventKey(name, payload)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const inserted = await client.query(
      `
      INSERT INTO tribute_events (
        event_key, name, status, telegram_user_id, subscription_id, period_id,
        period, price, amount, currency, expires_at, payload
      )
      VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
      `,
      [
        eventKey,
        name,
        telegramUserId || null,
        subscriptionId || null,
        toPositiveInt(payload.period_id) || null,
        payload.period ? String(payload.period) : null,
        Number(payload.price) || null,
        Number(payload.amount) || null,
        payload.currency ? String(payload.currency).toUpperCase() : null,
        parseTimestamp(payload.expires_at),
        JSON.stringify(event),
      ],
    )

    if (inserted.rowCount === 0) {
      await client.query('COMMIT')

      return { status: 'duplicate', reason: 'event-already-processed' }
    }

    const eventId = inserted.rows[0].id
    let status = 'recorded'

    if (meta.grants) {
      if (!telegramUserId) {
        // Подписка оплачена пользователем без Telegram (`W-…`, вход по email):
        // привязать её к игроку нечем, событие остаётся в журнале.
        status = 'no-telegram-user'
      } else if (days <= 0) {
        status = 'no-days'
      } else {
        await extendVipMembership(client, telegramUserId, days)
        status = 'granted'
      }
    }

    await client.query(
      'UPDATE tribute_events SET status = $2, days = $3, processed_at = now() WHERE id = $1',
      [eventId, status, days],
    )

    await client.query('COMMIT')

    return { status, days }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * Сверка по Tribute: VIP не должен закончиться раньше оплаченной подписки.
 * Срок только растёт — дни, купленные за звёзды, не сгорают.
 */
async function extendVipUntil(client, chatId, until) {
  const target = new Date(until)

  if (Number.isNaN(target.getTime())) {
    return { changed: false }
  }

  const current = await client.query(
    'SELECT end_date FROM vip_users WHERE user_id = $1 LIMIT 1',
    [chatId],
  )
  const endDate = current.rows[0]?.end_date ? new Date(current.rows[0].end_date) : null

  if (endDate && endDate.getTime() >= target.getTime()) {
    return { changed: false }
  }

  await client.query(
    `
    INSERT INTO vip_users (user_id, start_date, end_date)
    VALUES ($1, now(), $2)
    ON CONFLICT (user_id) DO UPDATE
    SET end_date = GREATEST(vip_users.end_date, EXCLUDED.end_date)
    `,
    [chatId, target],
  )

  return { changed: true }
}

/** Подписчик конкретного игрока из `/subscribers` (ручка Tribute помечена как внутренняя). */
async function fetchTributeSubscriber(config, telegramUserId) {
  const subscriptionId = vipSubscriptionId(config)

  if (!subscriptionId) {
    throw new Error('id подписки VIP неизвестен')
  }

  const payload = await tributeRequest(
    config,
    `/subscribers?subscriptionID=${encodeURIComponent(subscriptionId)}`,
  )
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.result) ? payload.result : [])

  return rows.find((row) => Number(row?.telegramUserId) === Number(telegramUserId)) || null
}

/**
 * Ручки Tribute для Mini App.
 *
 *   GET|HEAD /api/tribute/webhook — проверка адреса из кабинета («Проверить домен»);
 *   POST /api/tribute/webhook    — вебхук Tribute (проверка подписи, без Telegram-авторизации);
 *   POST /api/vip/tribute/sync   — «Проверить оплату»: сверка с Tribute и свежий bootstrap.
 */
export function createTributeApi({
  pool,
  config,
  vipPlans,
  requireTelegramUser,
  buildBootstrapPayload,
  extendVipMembership,
} = {}) {
  const router = Router()
  const guards = [requireTelegramUser].filter(Boolean)

  /**
   * Кабинет Tribute при сохранении Webhook URL проверяет адрес обычным GET: если
   * ручка не отвечает 2xx, он пишет «Не удалось определить адрес вебхука.
   * Проверьте домен» и не даёт сохранить URL. Отвечаем 200 и ничего не делаем —
   * это же удобно для внешнего мониторинга.
   */
  const probe = (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ status: 'ok', endpoint: 'tribute-webhook' })
  }

  router.get('/api/tribute/webhook', probe)
  router.head('/api/tribute/webhook', probe)

  /**
   * Вебхук Tribute. Подпись считается по сырому телу запроса — его складывает
   * `express.json({ verify })` в `req.rawBody` (см. `server/index.js`).
   *
   * 200 отвечаем на всё, что не продлевает VIP: неизвестные события и запросы без
   * подписи (проверка адреса, «Отправить тестовый запрос») — иначе Tribute будет
   * повторять доставку сутки, а кабинет посчитает вебхук нерабочим. 401 — только
   * когда подпись есть, но не сходится.
   */
  router.post('/api/tribute/webhook', async (req, res, next) => {
    if (!config?.apiKey) {
      res.status(503).json({ error: 'Tribute не настроен' })
      return
    }

    const event = req.body && typeof req.body === 'object' ? req.body : {}
    const name = String(event.name || '').trim()
    const signature = req.get('trbt-signature') || ''

    if (!signature) {
      console.log(`[tribute] вебхук без подписи (${name || 'без имени'}): проверка адреса`)
      res.json({ status: 'ok' })
      return
    }

    if (!verifyTributeSignature(req.rawBody, signature, config.apiKey)) {
      console.warn('[tribute] вебхук с неверной подписью отклонён')
      res.status(401).json({ error: 'Неверная подпись Tribute' })
      return
    }

    // Тестовые и незнакомые события VIP не трогают и в журнал не пишутся.
    if (!subscriptionEvents[name]) {
      console.log(`[tribute] вебхук ${name || '—'}: ignored (unknown-event)`)
      res.json({ status: 'ok' })
      return
    }

    // Подписка VIP ещё не создана в кабинете (или каталог не успел загрузиться):
    // без её id нельзя понять, за что платёж. 503 заставит Tribute повторить
    // доставку позже (до суток), и оплата не потеряется.
    if (!vipSubscriptionId(config)) {
      console.warn('[tribute] вебхук отложен: подписка VIP не определена (TRIBUTE_VIP_SUBSCRIPTION_ID)')
      res.status(503).json({ error: 'Подписка VIP Tribute не настроена' })
      return
    }

    try {
      const result = await handleTributeEvent({
        pool,
        config,
        vipPlans,
        event: req.body,
        extendVipMembership,
      })

      console.log(
        `[tribute] вебхук ${req.body?.name || '—'}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`,
      )
      res.json({ status: 'ok' })
    } catch (error) {
      next(error)
    }
  })

  /**
   * «Проверить оплату» после возврата из Tribute. Основной источник истины —
   * вебхук, поэтому отсутствие доступа к `/subscribers` не ошибка: отдаём
   * текущий статус из `vip_users` и свежие данные приложения.
   */
  router.post('/api/vip/tribute/sync', ...guards, async (req, res, next) => {
    if (!config?.enabled || !vipSubscriptionId(config)) {
      res.status(400).json({ error: 'Оплата картой пока не настроена' })
      return
    }

    const telegramUserId = req.telegramUser.id
    const client = await pool.connect()
    let checked = false

    try {
      try {
        const subscriber = await fetchTributeSubscriber(config, telegramUserId)
        checked = true

        const until = parseTimestamp(subscriber?.expireAt)

        if (until && until.getTime() > Date.now()) {
          await extendVipUntil(client, telegramUserId, until)
        }
      } catch (error) {
        console.warn('[tribute] проверка подписки недоступна:', error.message)
      }

      const data = await buildBootstrapPayload(telegramUserId)

      res.json({ ok: true, checked, vip: data.vip, data })
    } catch (error) {
      next(error)
    } finally {
      client.release()
    }
  })

  return router
}

export default createTributeApi
