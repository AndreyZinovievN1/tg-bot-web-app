import crypto from 'node:crypto'
import { Router } from 'express'

/**
 * VIP-подписка за реальные деньги (карта, СБП) через Tribute.
 *
 * Как это устроено в Tribute (https://wiki.tribute.tg/for-content-creators/api-documentation):
 *
 *   GET  /api/v1/products             — товары автора: `id`, `name`, `amount` (в копейках),
 *                                       `currency`, `link` (Telegram) и `webLink` (веб);
 *   GET  /api/v1/subscriptions        — подписки автора с периодами и ценами;
 *   GET  /api/v1/subscribers          — подписчики подписки (`expireAt`, `status`);
 *   POST <webhook URL>                — события `new_digital_product`,
 *                                       `digital_product_refunded`, а для подписок —
 *                                       `new_subscription`, `renewed_subscription`,
 *                                       `cancelled_subscription` с заголовком
 *                                       `trbt-signature` (HMAC-SHA256 тела запроса, ключ — API key).
 *
 * Публичной ручки «создать счёт» у Tribute нет: оплата открывается по ссылке
 * товара (`https://t.me/tribute/app?startapp=p...`) или подписки (`...startapp=s...`)
 * из кабинета автора. Основной способ — цифровые товары: они не требуют канала и
 * работают как разовые покупки, а продление — это повторная покупка. Схема такая:
 *
 *   1. владелец создаёт товары в кабинете Tribute («Space VIP — 1 месяц» и т. д.);
 *      цена и ссылки приходят из `GET /products`, поэтому менять их можно в кабинете,
 *      ничего не трогая в приложении;
 *   2. срок VIP считается по товару: явная карта `TRIBUTE_VIP_PRODUCTS`
 *      (`171449:30`) или название товара («1 месяц» → 30, «6 месяцев» → 180,
 *      «1 год» → 365);
 *   3. приложение показывает тарифы за реальные деньги и открывает ссылку товара;
 *   4. после оплаты Tribute присылает `new_digital_product`, и мы продлеваем
 *      `vip_users` так же, как это делает покупка за Telegram Stars (см.
 *      `extendVipMembership` в `server/index.js`), — дни складываются с текущим
 *      сроком, поэтому повторная покупка и есть продление;
 *   5. подписки Tribute (`new_subscription`, `renewed_subscription`) поддерживаются
 *      тем же кодом: если понадобится автопродление, менять ничего не нужно;
 *   6. кнопка «Проверить оплату» дополнительно сверяется с `/subscribers` (только
 *      для подписок) на случай потерянного вебхука; недоступность этой ручки (она
 *      помечена у Tribute как внутренняя) не мешает — статус всё равно берётся из
 *      своей базы.
 *
 * События пишутся в `tribute_events` с уникальным `event_key`: Tribute повторяет
 * доставку при ошибке (5 мин, 15 мин, 30 мин, 1 ч, 2 ч, 4 ч, 8 ч, 8 ч), и без
 * ключа повторный вебхук продлил бы подписку дважды.
 *
 * Настройки окружения:
 *   TRIBUTE_API_KEY              — API key из кабинета Tribute (Settings → API Keys);
 *   TRIBUTE_VIP_PRODUCTS         — привязка товаров к срокам: `171449:30,171450:180`.
 *                                  Необязательна: без неё срок берётся из названия товара;
 *   TRIBUTE_VIP_LINK             — общая ссылка на оплату для всех тарифов. Необязательна:
 *                                  по умолчанию у каждого тарифа своя ссылка товара;
 *   TRIBUTE_VIP_SUBSCRIPTION_ID  — id подписки VIP (`subscriptionId`). Необязателен:
 *                                  если в кабинете подписка одна, id берётся из каталога;
 *   TRIBUTE_VIP_PERIODS          — привязка периодов подписки к тарифам вручную;
 *                                  по умолчанию тариф подбирается по сроку (monthly → 30 дней);
 *   TRIBUTE_API_URL              — адрес API (по умолчанию https://tribute.tg/api/v1).
 *
 * Ссылка для вебхука в кабинете Tribute: `https://<домен приложения>/api/tribute/webhook`.
 * Пока `TRIBUTE_API_KEY` не задан, раздел оплаты картой просто не показывается —
 * покупка за звёзды работает как раньше. Если Tribute ответил, но подходящих
 * товаров в кабинете нет, раздел тоже скрыт (в лог уходит `products-not-configured`).
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

/** Сколько дней в месяце для товаров: те же сроки, что в `vipPlans` (30 / 180 / 365). */
const monthDays = 30

/**
 * Разбор срока из названия товара: владелец пишет «Space VIP — 1 месяц»,
 * «VIP на 6 месяцев», «VIP 12 месяцев». Правила идут от крупных единиц к мелким,
 * чтобы «1 год» не превратился в 1 день. Товар с названием без срока
 * («Навсегда», «Путеводитель») VIP не даёт и в тарифах не показывается.
 */
const productDurationRules = [
  { pattern: /(\d+)\s*(?:мес|міс|month)/i, days: monthDays },
  { pattern: /(\d+)\s*(?:год|лет|рік|років|year)/i, days: 365 },
  { pattern: /(\d+)\s*(?:недел|тижн|week)/i, days: 7 },
  { pattern: /(\d+)\s*(?:дн|день|дня|дней|day)/i, days: 1 },
]

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

/**
 * События цифровых товаров — основной способ оплаты VIP картой. Покупка
 * продлевает VIP на срок товара, возврат только пишется в журнал: доступ уже
 * оплачен, а отнимать дни, купленные за звёзды, нельзя.
 */
const productEvents = {
  new_digital_product: { grants: true },
  digital_product_refunded: { grants: false },
}

// Trusted entitlements, not inferred from product names or Telegram starsAmount.
// Prices, currencies and links are loaded by the existing Tribute catalog loader.
export const spaceStarProductUnits = Object.freeze({ 173087: 100, 174052: 500, 174053: 1000, 174055: 2500, 174056: 5000, 174058: 10000 })

/** Настройки Tribute из окружения. */
export function loadTributeConfig(env = {}) {
  const apiKey = String(env.TRIBUTE_API_KEY || '').trim()
  const subscriptionId = toPositiveInt(env.TRIBUTE_VIP_SUBSCRIPTION_ID)
  const link = normalizeTributeLink(env.TRIBUTE_VIP_LINK)
  const apiBaseUrl = String(env.TRIBUTE_API_URL || TRIBUTE_API_URL).trim().replace(/\/+$/, '')
  const productDays = parseProductDays(env.TRIBUTE_VIP_PRODUCTS)
  // JSON product ID -> { units, amount, currency }; legacy rubKopecks remains supported.
  // Retain old mappings for refunds. Disable sales with the flag, not by removing IDs.
  const spaceProducts = JSON.parse(env.TRIBUTE_SPACE_STARS_PRODUCTS || '{}')
  if (!spaceProducts || Array.isArray(spaceProducts) || typeof spaceProducts !== 'object') throw new Error('Invalid TRIBUTE_SPACE_STARS_PRODUCTS')
  for (const [id, pack] of Object.entries(spaceProducts)) {
    const legacy = pack?.amount === undefined && pack?.currency === undefined
    const amount = legacy ? pack?.rubKopecks : pack?.amount
    const currency = legacy ? 'RUB' : String(pack?.currency || '').toUpperCase()
    if (!/^[1-9]\d*$/.test(id) || productDays[id] || !Number.isSafeInteger(pack?.units) || pack.units < 1
      || !Number.isSafeInteger(amount) || amount < 1 || !['RUB','USD'].includes(currency)
      || (pack.rubKopecks !== undefined && (currency !== 'RUB' || pack.rubKopecks !== amount))) throw new Error('Invalid or overlapping Tribute Space Stars product')
    pack.amount = amount
    pack.currency = currency
    if (pack.link && (!normalizeTributeLink(pack.link) || !/^https:\/\/(?:t\.me|tribute\.tg)\//i.test(pack.link))) throw new Error('Invalid Tribute Space Stars product link')
  }
  for (const [id, units] of Object.entries(spaceStarProductUnits)) {
    if (productDays[id] || (spaceProducts[id] && spaceProducts[id].units !== units)) throw new Error('Conflicting Tribute Space Stars entitlement')
    spaceProducts[id] = { ...spaceProducts[id], units }
  }

  return {
    apiKey,
    subscriptionId,
    link,
    periodMap: parsePeriodMap(env.TRIBUTE_VIP_PERIODS),
    productDays,
    spaceProducts,
    spaceStarsEnabled: env.TRIBUTE_SPACE_STARS_ENABLED === 'true',
    apiBaseUrl,
    /**
     * Хватает одного ключа: подпись вебхука проверяется им, каталог приходит из
     * `/products`, а ссылки на оплату — у каждого товара. Ссылка и id подписки
     * нужны только для старого способа (подписка Tribute с автопродлением).
     */
    enabled: Boolean(apiKey),
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
 * `171449:30,171450:180` → `{ 171449: 30, 171450: 180 }`. Явная карта важнее
 * названия товара: она нужна, если срок в названии не написан («VIP на сезон»).
 * Мусор и товары без срока пропускаются — такой товар просто не станет тарифом.
 */
function parseProductDays(raw) {
  const text = String(raw || '').trim()

  if (!text) {
    return {}
  }

  const map = {}

  for (const pair of text.split(',')) {
    const [rawId, rawDays] = pair.split(':')
    const productId = toPositiveInt(rawId)
    const days = toPositiveInt(rawDays)

    if (!productId || !days) {
      continue
    }

    map[productId] = Math.min(3650, days)
  }

  return map
}

/** Срок VIP из названия товара: «Space VIP — 1 месяц» → 30. Не распознали — 0. */
function productDaysFromName(raw) {
  const text = String(raw || '').trim()

  if (!text) {
    return 0
  }

  for (const rule of productDurationRules) {
    const match = text.match(rule.pattern)

    if (!match) {
      continue
    }

    const days = Number(match[1]) * rule.days

    if (days > 0 && days <= 3650) {
      return days
    }
  }

  return 0
}

/** Тариф `vipPlans` с таким сроком: нужен для бейджа «Популярный» и названий. */
function planForDays(vipPlans, days) {
  return (vipPlans || []).find((item) => Number(item.days) === Number(days)) || null
}

/**
 * Срок VIP для покупки товара: сначала явная карта из `.env`, затем каталог,
 * затем `product_name` из самого события. Поэтому вебхук считает дни даже
 * тогда, когда каталог ещё не загрузился или товар создан минуту назад.
 */
function tributeProductDays(config, payload) {
  const productId = toPositiveInt(payload?.product_id)
  const explicit = productId ? config?.productDays?.[productId] : 0

  if (explicit) {
    return explicit
  }

  const cached = productId ? catalogState.data?.products?.[productId] : null

  if (cached?.days) {
    return cached.days
  }

  return productDaysFromName(payload?.product_name)
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
  const products = Object.entries(config.productDays || {})
    .map(([productId, days]) => `${productId}:${days}`)
    .sort()
    .join(',')

  const account = crypto.createHash('sha256').update(config.apiKey || '').digest('hex')
  const space = Object.entries(config.spaceProducts || {}).map(([id, pack]) => `${id}:${pack.units}`).sort().join(',')
  return `${config.apiBaseUrl}|${account}|${config.subscriptionId}|${periods}|${products}|${space}`
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
      // Товары и подписки запрашиваем параллельно: у автора может быть и то, и
      // другое, а падение одной ручки не должно прятать весь раздел оплаты.
      const [productsResult, subscriptionsResult] = await Promise.allSettled([
        tributeRequest(config, '/products?limit=100&offset=0'),
        tributeRequest(config, '/subscriptions'),
      ])

      if (productsResult.status === 'rejected' && subscriptionsResult.status === 'rejected') {
        throw productsResult.reason
      }

      if (productsResult.status === 'rejected') {
        console.warn('[tribute] каталог товаров недоступен:', productsResult.reason?.message)
      }

      if (subscriptionsResult.status === 'rejected') {
        console.warn('[tribute] каталог подписок недоступен:', subscriptionsResult.reason?.message)
      }

      const products =
        productsResult.status === 'fulfilled'
          ? buildTributeProductPlans(config, vipPlans, productsResult.value)
          : { ok: false, plans: [], currency: null, subscriptionId: null, products: {}, error: 'products-unavailable' }
      const subscriptions =
        subscriptionsResult.status === 'fulfilled'
          ? buildTributePlans(config, vipPlans, subscriptionsResult.value)
          : {
              ok: false,
              plans: [],
              currency: null,
              subscriptionId: null,
              products: {},
              error: 'subscriptions-unavailable',
            }

      // Товары — основной способ: они не требуют канала и продлеваются повторной
      // покупкой. Подписка нужна, только если товаров VIP в кабинете нет.
      data = products.ok
        ? products
        : {
            ...subscriptions,
            products: products.products,
            error: subscriptions.ok ? null : products.error || subscriptions.error,
          }
      data.spacePackages = productsResult.status === 'fulfilled'
        ? buildSpaceStarPackages(config, productsResult.value) : []
      data.spaceReady = productsResult.status === 'fulfilled'

      if (data.ok && !config.subscriptionId && data.subscriptionId) {
        if (autoSubscriptionLogged !== data.subscriptionId) {
          autoSubscriptionLogged = data.subscriptionId
          console.info(`[tribute] подписка VIP определена по каталогу: ${data.subscriptionId}`)
        }
      }

      if (!data.ok) {
        console.warn('[tribute] в каталоге Tribute нет подходящих товаров и периодов:', data.error)
      }
    } catch (error) {
      console.warn('[tribute] каталог Tribute недоступен:', error.message)
      // Каталог не ответил — тарифы всё равно показываем, но без цен: сумму
      // человек увидит на странице Tribute. Ссылки берём из настроек.
      const offline = buildOfflinePlans(config, vipPlans)

      data = {
        ok: false,
        plans: offline.plans,
        currency: null,
        subscriptionId: config.subscriptionId || null,
        products: offline.products,
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
 * Тарифы, когда каталог Tribute не ответил. Сроки и ссылка известны только из
 * `.env`, поэтому цены пустые: человек увидит сумму уже на странице Tribute.
 * Если товары VIP заданы вручную (`TRIBUTE_VIP_PRODUCTS`), показываем именно их,
 * иначе — прежний набор периодов подписки.
 */
function buildOfflinePlans(config, vipPlans) {
  const products = {}

  for (const [rawId, days] of Object.entries(config?.productDays || {})) {
    const productId = toPositiveInt(rawId)

    if (!productId || !days) {
      continue
    }

    const plan = planForDays(vipPlans, days)

    products[productId] = { days, planId: plan?.id || null, price: null, currency: null, name: null }
  }

  const productPlans = Object.entries(products).map(([rawId, item]) => ({
    id: item.planId || `product_${rawId}`,
    productId: Number(rawId),
    days: item.days,
    price: null,
    currency: null,
    link: config.link || '',
    popular: Boolean(planForDays(vipPlans, item.days)?.popular),
    period: null,
    periodId: null,
  }))

  // Без ссылки на оплату тариф бесполезен: во время сбоя каталога прячем раздел,
  // а не показываем кнопку, которая ничего не откроет.
  if (!config.link) {
    return { plans: [], products }
  }

  if (productPlans.length > 0) {
    return { plans: productPlans.sort((a, b) => a.days - b.days), products }
  }

  const periodPlans = vipPlans
    .map((plan) => ({ plan, period: periodForPlan(config, plan) }))
    .filter((item) => item.period)
    .map(({ plan, period }) => ({
      id: plan.id,
      productId: null,
      days: Number(plan.days) || 0,
      period,
      periodId: null,
      price: null,
      currency: null,
      link: config.link || '',
      popular: Boolean(plan.popular),
    }))

  return { plans: periodPlans, products: {} }
}

/**
 * Тарифы за реальные деньги: цена и ссылка на оплату берутся из каталога
 * Tribute (цифровые товары, а если их нет — подписка), срок — из названия
 * товара/`TRIBUTE_VIP_PRODUCTS` или из `vipPlans` для подписки.
 *
 * Если каталог не ответил, тарифы остаются только при общей ссылке на оплату
 * (`TRIBUTE_VIP_LINK`) и без цен: иначе кнопка вела бы в никуда. Если Tribute
 * ответил и подходящих товаров нет, тарифов нет вовсе — заведомо нерабочую
 * кнопку оплаты лучше не показывать.
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

function buildSpaceStarPackages(config, payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload?.result) ? payload.result : []
  const packages = [], seen = new Set()
  for (const row of rows) {
    const id = String(row?.id), units = config.spaceProducts?.[id]?.units
    const currency = String(row?.currency || '').toUpperCase()
    const link = normalizeTributeLink(row?.link) || normalizeTributeLink(row?.webLink)
    // Catalog visibility is not proof of payment; settlement still requires a signed webhook.
    if (!units || seen.has(id) || row.type !== 'digital' || !['approved','new'].includes(row.status)
      || !Number.isSafeInteger(row.amount) || row.amount <= 0 || !['RUB','USD'].includes(currency) || !link) continue
    seen.add(id)
    // Display-only Telegram price. Never used to authorize a webhook or convert USD.
    packages.push({ id, units, amount:row.amount, currency, link,
      ...(/^https:\/\/web\.tribute\.tg\/p\/[A-Za-z0-9]+$/.test(row.webLink || '') ? { webLink: row.webLink } : {}),
      ...(Number.isSafeInteger(row.starsAmount) && row.starsAmount > 0 ? { starsAmount:row.starsAmount } : {}) })
  }
  return packages.sort((a,b) => a.units-b.units || a.id.localeCompare(b.id))
}

export async function tributeSpaceStarsSnapshot(config, vipPlans = [], purchaseAllowed = config?.spaceStarsEnabled) {
  if (!config?.enabled) return { enabled:false, packages:[] }
  await loadTributeCatalog(config, vipPlans, { waitMs:catalogWaitMs })
  // A stale/offline price must not authorize a new purchase. Previously saved
  // orders remain refundable without the catalog, using their own quote.
  const catalog = freshCatalog(catalogKey(config))
  return { enabled:Boolean(purchaseAllowed && catalog?.spaceReady), packages:catalog?.spaceReady ? catalog.spacePackages || [] : [] }
}

/**
 * Тарифы из подписок Tribute — прежний способ с автопродлением. Цена берётся из
 * каталога подписки, срок — из `vipPlans`, чтобы оба способа оплаты давали
 * одинаковые дни. Используется, только если товаров VIP в кабинете нет.
 */
function buildTributePlans(config, vipPlans, payload) {
  const list = Array.isArray(payload?.result) ? payload.result : []
  const catalogIds = list.map((item) => toPositiveInt(item?.subscriptionId)).filter(Boolean)
  // id подписки в кабинете не показывается: если она там одна, берём её.
  const subscriptionId = config.subscriptionId || (catalogIds.length === 1 ? catalogIds[0] : null)
  const subscription =
    (subscriptionId &&
      list.find((item) => toPositiveInt(item?.subscriptionId) === subscriptionId)) ||
    null

  if (!subscription) {
    // Tribute ответил, но подписки VIP там нет (ещё не создана или id не тот):
    // кнопки оплаты не рисуем — вести человека на нерабочую страницу хуже, чем
    // спрятать способ оплаты.
    return {
      ok: false,
      plans: [],
      currency: null,
      subscriptionId,
      products: {},
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
      productId: null,
      days: Number(plan.days) || 0,
      period,
      periodId: remote?.periodId ?? null,
      price: remote?.price === undefined || remote?.price === null ? null : Number(remote.price),
      currency: subscription.currency ? String(subscription.currency).toUpperCase() : null,
      link: config.link || '',
      popular: Boolean(plan.popular),
    })
  }

  plans.sort((a, b) => a.days - b.days)

  return {
    ok: plans.length > 0,
    plans,
    currency: subscription.currency ? String(subscription.currency).toUpperCase() : null,
    subscriptionId,
    products: {},
    error: plans.length > 0 ? null : 'periods-not-configured',
  }
}

/** Чтобы не писать в лог одно и то же на каждый перезапрос каталога. */
let skippedProductsLogged = 0

/**
 * Тарифы из цифровых товаров Tribute — основной способ оплаты картой.
 *
 * Цена (`amount` в копейках) и ссылки (`link`, `webLink`) приходят у каждого
 * товара, поэтому менять цены можно в кабинете: приложение подхватит их через
 * кеш каталога. Срок — из `TRIBUTE_VIP_PRODUCTS` или из названия товара.
 *
 * Товар без срока в названии («Навсегда», «Путеводитель») тарифом не становится:
 * VIP за него не выдать, а продавать «непонятно сколько дней» нельзя. Возвраты
 * (`digital_product_refunded`) в каталоге не участвуют.
 */
function buildTributeProductPlans(config, vipPlans, payload) {
  const list = Array.isArray(payload?.rows)
    ? payload.rows
    : Array.isArray(payload?.result)
      ? payload.result
      : []
  const plans = []
  const products = {}
  let currency = null
  let skipped = 0

  for (const row of list) {
    const productId = toPositiveInt(row?.id)

    // Физические товары VIP не дают: у них доставка, а не доступ к приложению.
    if (!productId || String(row?.type || '').trim() === 'physical') {
      continue
    }

    if (config?.spaceProducts?.[productId]) continue
    const days = config?.productDays?.[productId] || productDaysFromName(row?.name)

    if (!days) {
      skipped += 1
      continue
    }

    const plan = planForDays(vipPlans, days)
    const planId = plan?.id || `product_${productId}`
    const code = row?.currency ? String(row.currency).toUpperCase() : null
    const amount = Number(row?.amount)
    const price = amount > 0 ? Number((amount / 100).toFixed(2)) : null
    // Внутри Telegram удобнее Telegram-ссылка (`link`), веб-ссылка — запасной вариант.
    const link = normalizeTributeLink(row?.link) || normalizeTributeLink(row?.webLink) || ''

    currency = currency || code
    products[productId] = {
      days,
      planId: plan?.id || null,
      price,
      currency: code,
      name: row?.name ? String(row.name) : null,
    }

    // Два товара с одинаковым сроком дают один тариф: в списке он должен быть
    // один, но срок покупки каждого всё равно записан в `products`.
    if (plans.some((item) => item.id === planId)) {
      continue
    }

    plans.push({
      id: planId,
      productId,
      days,
      price,
      currency: code,
      link,
      popular: Boolean(plan?.popular),
      period: null,
      periodId: null,
    })
  }

  if (skipped > 0 && skippedProductsLogged !== skipped) {
    skippedProductsLogged = skipped

    console.info(
      `[tribute] товаров без срока в названии пропущено: ${skipped}. Срок задаётся в названии («VIP — 1 месяц») или в TRIBUTE_VIP_PRODUCTS=id:дней`,
    )
  }

  plans.sort((a, b) => a.days - b.days)

  return {
    ok: plans.length > 0,
    plans,
    currency,
    subscriptionId: null,
    products,
    error: plans.length > 0 ? null : 'products-not-configured',
  }
}

/**
 * Есть ли в `tribute_events` колонка `product_id`. Пока не знаем — считаем, что
 * есть: таблицу создаёт само приложение. `false` ставится, если ALTER не прошёл
 * или база ответила «undefined column» (код 42703).
 */
let productColumnReady = true

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
      product_id bigint,
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

  // Колонка появилась вместе с оплатой товарами: на существующей базе
  // `CREATE TABLE IF NOT EXISTS` её не добавит, а журнал должен помнить товар.
  // Если прав на ALTER нет (таблицу создавал владелец БД), оплата продолжит
  // работать: событие запишется без колонки, а id товара останется в `payload`.
  try {
    await pool.query('ALTER TABLE tribute_events ADD COLUMN IF NOT EXISTS product_id bigint')
    productColumnReady = true
  } catch (error) {
    productColumnReady = false

    console.warn(
      `[tribute] в tribute_events нет колонки product_id (${error.message}). Выполни от владельца БД: ALTER TABLE tribute_events ADD COLUMN IF NOT EXISTS product_id bigint;`,
    )
  }

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
    // Товары: `purchase_id` у каждой покупки свой, поэтому две одинаковые
    // покупки дают две записи, а повторная доставка того же события — нет.
    payload.product_id ?? '',
    payload.purchase_id ?? '',
    payload.transaction_id ?? '',
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
 * Обработка события Tribute: запись в журнал + продление VIP.
 *
 * Вызывается из вебхука. Продление идёт тем же путём, что оплата звёздами
 * (`extendVipMembership`): дни складываются с текущим сроком в `vip_users`.
 * Срок берётся из товара (`new_digital_product`) или из периода подписки.
 */
async function handleTributeSpaceStars({ pool, config, event, vipPlans, canPurchaseSpaceStars }) {
  const { name, payload } = event
  const pack = config.spaceProducts[String(payload.product_id)]
  const refund = name === 'digital_product_refunded'
  if (!['new_digital_product','digital_product_refunded'].includes(name)) {
    // Cancelling a subscription is not evidence that this one-time purchase was refunded.
    return { status: 'ignored', reason: 'space-stars-not-a-confirmed-payment-or-refund' }
  }
  const positiveId = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value))
  const currency = String(payload.currency || '').toUpperCase()
  if (!positiveId(payload.telegram_user_id) || !positiveId(payload.purchase_id)
    || !['RUB','USD'].includes(currency) || !Number.isSafeInteger(payload.amount) || payload.amount <= 0) {
    throw new Error('Tribute Space Stars: unverified buyer, purchase ID, currency or amount')
  }
  const userId = String(payload.telegram_user_id), purchaseId = String(payload.purchase_id), productId = String(payload.product_id)
  const charge = `tribute:${purchaseId}`
  const purchaseAllowed = !refund && (canPurchaseSpaceStars
    ? await canPurchaseSpaceStars(userId, productId) === true : config.spaceStarsEnabled)
  const catalog = purchaseAllowed ? await tributeSpaceStarsSnapshot(config, vipPlans, true) : null
  const quote = catalog?.packages.find(row => row.id === productId)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO space_star_wallets(telegram_user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId])
    await client.query('SELECT balance FROM space_star_wallets WHERE telegram_user_id=$1 FOR UPDATE', [userId])
    let order = (await client.query('SELECT * FROM space_star_orders WHERE tribute_purchase_id=$1 FOR UPDATE', [purchaseId])).rows[0]
    if (!order) {
      // Refund-first creates only a tombstone: no balance mutation, and a delayed
      // payment can never credit it. Never guess a USD/XTR conversion.
      if (!refund && (!purchaseAllowed || !quote || payload.amount !== quote.amount || currency !== quote.currency)) throw new Error('Tribute Space Stars: disabled, catalog unavailable or price mismatch')
      await client.query(`INSERT INTO space_star_orders(id,telegram_user_id,request_id,package_id,units,amount_xtr,
        tribute_purchase_id,tribute_product_id,amount_rub_kopecks,tribute_amount_minor,tribute_currency)
        VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10)
        ON CONFLICT (tribute_purchase_id) WHERE tribute_purchase_id IS NOT NULL DO NOTHING`,
      [crypto.randomUUID(), userId, crypto.randomUUID(), `tribute:${productId}`, pack.units, purchaseId, productId,
        currency === 'RUB' ? payload.amount : null, payload.amount, currency])
      order = (await client.query('SELECT * FROM space_star_orders WHERE tribute_purchase_id=$1 FOR UPDATE', [purchaseId])).rows[0]
    }
    if (String(order.telegram_user_id) !== userId || order.tribute_product_id !== productId
      || Number(order.tribute_amount_minor ?? order.amount_rub_kopecks) !== payload.amount
      || (order.tribute_currency ?? 'RUB') !== currency) throw new Error('Tribute Space Stars: purchase mismatch')
    const eventKey = crypto.createHash('sha256').update(`space-stars|${purchaseId}|${name}`).digest('hex')
    await client.query(`INSERT INTO tribute_events(event_key,name,status,telegram_user_id,amount,currency,payload)
      VALUES ($1,$2,'pending',$3,$4,$5,$6::jsonb) ON CONFLICT (event_key) DO NOTHING`,
    [eventKey, name, userId, payload.amount, currency, JSON.stringify(event)])
    await client.query('INSERT INTO space_star_payments(charge_id,order_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [charge, order.id])
    const receipt = (await client.query('SELECT * FROM space_star_payments WHERE charge_id=$1 FOR UPDATE', [charge])).rows[0]
    if (receipt.order_id !== order.id) throw new Error('Tribute Space Stars: receipt mismatch')
    let delta = 0
    if (refund) {
      await client.query('UPDATE space_star_payments SET refunded=true,refunded_at=COALESCE(refunded_at,now()) WHERE charge_id=$1', [charge])
      // As with XTR refunds, preserve debt if the credited units were already spent.
      if (order.credited_charge === charge) delta = -Number(order.units)
    } else if (!receipt.refunded) {
      if (!purchaseAllowed && !order.credited_charge) throw new Error('Tribute Space Stars: sales disabled')
      delta = Number(order.units)
    }
    if (delta) {
      const entry = await client.query(`INSERT INTO space_star_ledger(telegram_user_id,order_id,charge_id,kind,amount)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (charge_id,kind) DO NOTHING RETURNING id`,
      [userId, order.id, charge, refund ? 'refund' : 'credit', delta])
      if (entry.rowCount) await client.query('UPDATE space_star_wallets SET balance=balance+$2,updated_at=now() WHERE telegram_user_id=$1', [userId, delta])
    }
    const status = refund || receipt.refunded ? 'refunded' : 'paid'
    await client.query('UPDATE space_star_orders SET credited_charge=$2,status=$3 WHERE id=$1',
      [order.id, order.credited_charge || (delta > 0 ? charge : null), status])
    await client.query('UPDATE tribute_events SET status=$2,processed_at=now() WHERE event_key=$1', [eventKey, `space-stars-${status}`])
    await client.query('COMMIT')
    return { status: `space-stars-${status}` }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

export async function handleTributeEvent({ pool, config, vipPlans, event, extendVipMembership, canPurchaseSpaceStars }) {
  const name = String(event?.name || '').trim()
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : null
  const meta = subscriptionEvents[name] || productEvents[name]

  if (!meta || !payload) {
    return { status: 'ignored', reason: 'unknown-event' }
  }

  // The webhook has already verified its raw-body signature. Reserved Space Stars
  // products must never fall through to the VIP allowlist or name-based inference.
  if (config?.spaceProducts?.[String(payload.product_id)]) {
    return handleTributeSpaceStars({ pool, config, event, vipPlans, canPurchaseSpaceStars })
  }

  const subscriptionId = toPositiveInt(payload.subscription_id)
  const expectedSubscriptionId = vipSubscriptionId(config)

  // Чужие подписки игнорируем: у автора может быть не только VIP.
  if (expectedSubscriptionId && subscriptionId && subscriptionId !== expectedSubscriptionId) {
    return { status: 'ignored', reason: 'foreign-subscription' }
  }

  const productId = toPositiveInt(payload.product_id)
  const allowedProducts = Object.keys(config?.productDays || {})

  // Если товары VIP перечислены в `.env`, это список разрешённых: остальные
  // товары автора (гайды, документы) VIP не продлевают.
  if (productId && allowedProducts.length > 0 && !allowedProducts.includes(String(productId))) {
    return { status: 'ignored', reason: 'foreign-product' }
  }

  const telegramUserId = toPositiveInt(payload.telegram_user_id)
  let days = 0

  if (meta.grants) {
    days = productId
      ? tributeProductDays(config, payload)
      : tributeEventDays(config, vipPlans, payload)
  }

  const eventKey = tributeEventKey(name, payload)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Колонки `product_id` может не быть на старой базе (см.
    // `ensureTributeSchema`): тогда id товара остаётся только в `payload`.
    const values = [
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
    ]
    const insertSql = productColumnReady
      ? `
      INSERT INTO tribute_events (
        event_key, name, status, telegram_user_id, subscription_id, product_id,
        period_id, period, price, amount, currency, expires_at, payload
      )
      VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
      `
      : `
      INSERT INTO tribute_events (
        event_key, name, status, telegram_user_id, subscription_id, period_id,
        period, price, amount, currency, expires_at, payload
      )
      VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id
      `
    const insertParams = productColumnReady
      ? [...values.slice(0, 4), productId || null, ...values.slice(4)]
      : values

    const inserted = await client.query(insertSql, insertParams)

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

    // Таблица создана владельцем БД и без колонки `product_id`: повторяем
    // событие без неё, чтобы оплата не потерялась (см. `ensureTributeSchema`).
    if (error?.code === '42703' && productColumnReady) {
      productColumnReady = false

      return handleTributeEvent({ pool, config, vipPlans, event, extendVipMembership })
    }

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
 *   POST /api/vip/tribute/sync   — «Проверить оплату»: сверка подписки и свежий bootstrap.
 */
export function createTributeApi({
  pool,
  config,
  vipPlans,
  requireTelegramUser,
  buildBootstrapPayload,
  extendVipMembership,
  canPurchaseSpaceStars,
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
    const event = req.body && typeof req.body === 'object' ? req.body : {}
    const name = String(event.name || '').trim()
    const signature = req.get('trbt-signature') || ''
    const signatureStatus = !config?.apiKey ? 'not_configured' : !signature ? 'missing'
      : verifyTributeSignature(req.rawBody, signature, config.apiKey) ? 'valid' : 'invalid'
    // Never log raw bodies, signatures, secrets or buyer fields. Unknown event
    // names and malformed field values may contain personal data or log injection.
    const safeName = Object.hasOwn(subscriptionEvents, name) || Object.hasOwn(productEvents, name) ? name : 'unknown'
    const payload = event.payload || {}
    const safeId = value => typeof value === 'number'
      ? (Number.isSafeInteger(value) && value > 0 ? value : null)
      : typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) ? value : null
    console.info('[tribute] webhook diagnostic', {
      event: safeName,
      product_id: safeId(payload.product_id),
      amount: Number.isSafeInteger(payload.amount) ? payload.amount : null,
      currency: typeof payload.currency === 'string' && /^[a-z]{3}$/i.test(payload.currency) ? payload.currency.toUpperCase() : null,
      purchase_id: safeId(payload.purchase_id),
      signature_check: signatureStatus,
    })
    if (!config?.apiKey) {
      console.warn('[tribute] вебхук отклонён: TRIBUTE_API_KEY не задан в окружении сервера')
      res.status(503).json({ error: 'Tribute не настроен: задай TRIBUTE_API_KEY и перезапусти сервер' })
      return
    }

    if (!signature) {
      console.log(`[tribute] вебхук без подписи (${safeName}): проверка адреса`)
      res.json({ status: 'ok' })
      return
    }

    if (signatureStatus !== 'valid') {
      console.warn('[tribute] вебхук с неверной подписью отклонён')
      res.status(401).json({ error: 'Неверная подпись Tribute' })
      return
    }

    // Тестовые и незнакомые события VIP не трогают и в журнал не пишутся.
    if (!subscriptionEvents[name] && !productEvents[name]) {
      console.log(`[tribute] вебхук ${safeName}: ignored (unknown-event)`)
      res.json({ status: 'ok' })
      return
    }

    // id подписки нужен только для отсева чужих подписок. Пока каталог не
    // загрузился или подписка ещё не создана в кабинете, оплату не откладываем:
    // событие подписано ключом аккаунта, дни берём из самого события (см.
    // `tributeEventDays`). Иначе тестовый запрос и первая оплата получали бы 503.
    if (subscriptionEvents[name] && !vipSubscriptionId(config)) {
      console.warn('[tribute] подписка VIP ещё не определена: обрабатываю событие без отсева чужих подписок')
    }

    try {
      const result = await handleTributeEvent({
        pool,
        config,
        vipPlans,
        event: req.body,
        extendVipMembership,
        canPurchaseSpaceStars,
      })

      console.log(
        `[tribute] вебхук ${safeName}: ${result.status}${result.reason ? ` (${result.reason})` : ''}`,
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
   *
   * У товаров сверять нечего — ручки «покупки пользователя» у Tribute нет,
   * поэтому `checked: false`: экран просто перечитывает статус VIP, а оплату
   * присылает вебхук. Для подписки дополнительно тянем `/subscribers`.
   */
  router.post('/api/vip/tribute/sync', ...guards, async (req, res, next) => {
    if (!config?.enabled) {
      res.status(400).json({ error: 'Оплата картой пока не настроена' })
      return
    }

    const telegramUserId = req.telegramUser.id
    const client = await pool.connect()
    let checked = false

    try {
      if (vipSubscriptionId(config)) {
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
