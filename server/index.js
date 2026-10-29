import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CaseGiftDeliveryError,
  buildCaseFailureLog,
  buildCaseOpeningLog,
  createCaseGiftDelivery,
  newCaseIncidentCode,
} from './caseGifts.js'
import { createDocsApi, ensureDocsSchema } from './docsApi.js'
import {
  caseForSale,
  caseStoreTitle,
  createCasesApi,
  defaultCaseTemplates,
  ensureCasesSchema,
  legacyCaseIds,
  loadCaseTemplates,
  toClientCase,
} from './casesApi.js'
import {
  createGiftsApi,
  giftCatalogSnapshot,
  loadGiftCatalog,
  loadSavedGifts,
  savedGiftsSnapshot,
} from './giftsApi.js'
import {
  createMissionsApi,
  defaultMissionTemplates,
  ensureMissionsSchema,
  isMissionClaimFresh,
  loadMissionTemplates,
  missionPeriodRange,
  missionToken as missionRewardToken,
  mskDayKey,
  startOfMskDay,
  startOfMskWeek,
} from './missionsApi.js'
import {
  createTributeApi,
  ensureTributeSchema,
  loadTributeConfig,
  tributeVipSnapshot,
} from './tributeApi.js'
import express from 'express'
import pg from 'pg'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

loadEnv(path.join(rootDir, '.env'))

const app = express()
const port = Number(process.env.PORT || 3001)
const botToken = process.env.BOT_TOKEN || ''
const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true'
const devChatId = process.env.DEV_CHAT_ID ? Number(process.env.DEV_CHAT_ID) : null
const paymentRelaySecret = process.env.PAYMENT_RELAY_SECRET || ''
const caseResultsChatId = process.env.CASE_RESULTS_CHAT_ID || '-1001284280342'
const caseResultsThreadId = process.env.CASE_RESULTS_THREAD_ID || '496436'
/**
 * Выдача подарков из кейсов: способ и причины описаны в `server/caseGifts.js`.
 *
 * Уникальный подарок передаёт юзербот, обычный бот покупает и дарит из своего
 * баланса звёзд, а `grantGiftReward` остаётся запасным путём — им выдаётся
 * внутренний подарок, когда в строке наполнения подарка нет или владелец включил
 * `CASE_GIFT_DELIVERY=internal`.
 */
const caseGiftDelivery = createCaseGiftDelivery({ botToken, grantInternalGift: grantGiftReward })

/**
 * Тарифы VIP-подписки за Telegram Stars (цена — в звёздах).
 *
 * Список живёт в коде, а не в БД: тарифы меняются редко, зато цена всегда одна
 * и та же на приложение и сервер — подделать её из Mini App нельзя. Клиент
 * рисует подписи и срок, сервер берёт отсюда `days` и `stars`.
 *
 * Дни складываются с текущим сроком в таблице бота `vip_users`, поэтому
 * повторная покупка продлевает подписку, а не сбрасывает её. Сроки те же, что у
 * витрины в боте («Донат»): 1, 6 и 12 месяцев.
 */
const vipPlans = [
  { id: 'vip_30', days: 30, stars: 250 },
  { id: 'vip_180', days: 180, stars: 1200, popular: true },
  { id: 'vip_365', days: 365, stars: 2200 },
]

/**
 * Тексты счёта для `createInvoiceLink`: язык берётся из `Accept-Language` клиента,
 * а срок подписки подставляется в заголовок — по чеку сразу видно, что куплено.
 *
 * Заголовок держим короче 32 символов: столько разрешает Bot API для `title`
 * и подписи в `prices[].label`, иначе `createInvoiceLink` вернёт ошибку.
 */
const vipInvoiceTexts = {
  ru: {
    title: 'VIP-подписка Space',
    period: '{days} дн.',
    description: 'VIP включится сразу после оплаты звёздами Telegram.',
  },
  en: {
    title: 'Space VIP',
    period: '{days} days',
    description: 'VIP turns on right after you pay with Telegram Stars.',
  },
  uk: {
    title: 'VIP-підписка Space',
    period: '{days} дн.',
    description: 'VIP увімкнеться одразу після оплати зірками Telegram.',
  },
}

/**
 * Продажа VIP за реальные деньги через Tribute (карта, СБП).
 *
 * Тарифы и сроки те же, что у оплаты звёздами: цена приходит из кабинета
 * Tribute (`GET /subscriptions`), а дни — из `vipPlans`, поэтому оба способа
 * оплаты дают одинаковый срок. Пока `TRIBUTE_API_KEY`, `TRIBUTE_VIP_SUBSCRIPTION_ID`
 * и `TRIBUTE_VIP_LINK` не заданы, раздел оплаты картой просто не показывается.
 * Подробности — в `server/tributeApi.js`.
 */
const tributeConfig = loadTributeConfig(process.env)

const pool = new Pool(createPoolConfig())
const adminAttempts = new Map()
const adminSessions = new Map()
const adminLockMs = 60 * 1000
const adminSessionMs = 2 * 60 * 60 * 1000
/** Способы входа в админку: графическая фигура и числовой код. */
const adminCredentialTypes = ['pattern', 'code']
const adminCodeLengths = [4, 8]
const adminMaxFails = 3
/**
 * Колонка `owner.mini_app_code_hash` появляется на старте (ensureAdminAccessSchema)
 * или её добавляет владелец БД вручную (server/admin_setup.sql). Пока колонки нет,
 * вход по коду отключён и работает только фигура. Флаг поднимается проверкой
 * каталога (adminCodeColumnAvailable), поэтому перезапуск после ручного ALTER
 * приложению не нужен.
 */
let adminCodeColumnReady = false
/**
 * Колонка `owner.mini_app_access_off` — тумблер «вход без пароля»: когда она
 * `true`, админка пускает владельца бота без фигуры и кода. Появляется так же,
 * как и колонка кода: на старте или вручную (server/admin_setup.sql).
 */
let adminAccessOffColumnReady = false

const activeColumnByCategory = {
  titles: 'active_title_id',
  emojis: 'active_emoji_id',
  premium_emojis: 'active_emoji_id',
  replies: 'active_reply_id',
  greetings: 'active_greeting_id',
  buttons: 'active_button_id',
}

// ── Миссии ──────────────────────────────────────────────────────────────────
// Список заданий живёт в БД (таблица `mini_app_missions`, раздел «Задания» в
// админ-панели): сервер только считает прогресс и готовность по коду действия
// задания. Каталог действий, схема таблицы и админские ручки — в
// server/missionsApi.js.
//
// Ежедневные задания дают XP и наполняют «вехи дня»: веха = подарочный кейс,
// который выдаётся сразу при заборе задания, перешагнувшего порог.
// Недельные задания XP не начисляют — за них сразу выдают кейс.
// ВАЖНО: пороги вех продублированы на клиенте (src/config/casesMeta.js) — при
// изменении правь оба места.
const missionMilestones = [
  { xp: 250, caseType: 'homeless', quantity: 1 },
  { xp: 500, caseType: 'homeless', quantity: 2 },
  { xp: 750, caseType: 'standard', quantity: 1 },
  { xp: 1000, caseType: 'unusual', quantity: 1 },
]


// ── Кейсы ──────────────────────────────────────────────────────────────────
// Кейсы живут в БД (таблица `mini_app_cases`, раздел «Кейсы» в админ-панели):
// владелец задаёт названия и описания для каждого языка, картинку, цену в
// Telegram Stars и «наполнение» — взвешенный пул призов. Схема, валидация и
// админские ручки — в server/casesApi.js.
//
// Шесть старых кейсов заливаются в таблицу стартовым набором, а их балансы
// остались в колонках `case_balances` (совместимость с ботом). У новых кейсов
// баланс — в `mini_app_case_balances`, выбор таблицы делают getCaseBalances и
// incrementCaseBalance по списку caseBalanceColumns.
const caseBalanceColumns = legacyCaseIds

/**
 * Каталог кейсов кешируется на полминуты: экран кейсов опрашивает bootstrap
 * часто, а список меняется только из админки. После каждой правки кеш
 * сбрасывается (onChange в casesRouter).
 */
const caseCacheMs = 30 * 1000
let caseCatalogCache = { list: null, loadedAt: 0 }

/** Актуальный список кейсов: из БД, либо стартовый набор, если таблица пуста. */
async function getCaseCatalog(client, { activeOnly = false } = {}) {
  if (!caseCatalogCache.list || Date.now() - caseCatalogCache.loadedAt >= caseCacheMs) {
    const stored = await loadCaseTemplates(client)
    const list = stored.length > 0 ? stored : defaultCaseTemplates()

    caseCatalogCache = { list, loadedAt: Date.now() }
  }

  const list = caseCatalogCache.list

  return activeOnly ? list.filter((item) => item.active !== false) : list
}

/** Сброс кеша кейсов: вызывается после сохранения/удаления кейса в админке. */
function resetCaseCatalogCache() {
  caseCatalogCache = { list: null, loadedAt: 0 }
}

/** Шаблон кейса по id: неизвестный id — ошибка «Неизвестный тип кейса». */
async function findCaseTemplate(client, caseId) {
  const list = await getCaseCatalog(client)
  const template = list.find((item) => item.id === caseId)

  if (!template) {
    throw new Error('Неизвестный тип кейса')
  }

  return template
}

/** Витрина кейсов для bootstrap: цена в Stars, количество и название счёта. */
function caseStorePayload(catalog) {
  return Object.fromEntries(catalog.map((item) => [
    item.id,
    { stars: item.stars, quantity: 1, title: caseStoreTitle(item) },
  ]))
}

/**
 * Разбор JSON и запоминание сырого тела.
 *
 * `req.rawBody` нужен вебхуку Tribute: подпись `trbt-signature` — это
 * HMAC-SHA256 байтов тела до разбора JSON (см. `server/tributeApi.js`).
 */
app.use(express.json({
  limit: '6mb',
  verify: (req, _res, buffer) => {
    req.rawBody = buffer
  },
}))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/admin/login', requireTelegramUser, async (req, res, next) => {
  const chatId = req.telegramUser.id
  const attempt = adminAttempts.get(chatId)

  if (attempt?.lockedUntil > Date.now()) {
    res.status(429).json({
      error: 'Слишком много попыток. Попробуй через минуту.',
      retryAfter: Math.ceil((attempt.lockedUntil - Date.now()) / 1000),
    })
    return
  }

  const client = await pool.connect()

  try {
    const access = await getStoredAdminAccess(client)

    // Защита выключена («вход без пароля»): фигуру и код не спрашиваем вовсе.
    // Пароль был вторым фактором, а первый остаётся: пускаем только владельца
    // бота, поэтому чужой Telegram-аккаунт в админку всё равно не попадёт.
    if (access.off) {
      if (!(await isBotOwner(client, chatId))) {
        res.status(403).json({ error: 'Раздел доступен только владельцу бота' })
        return
      }

      const token = createAdminSession(chatId)
      adminAttempts.delete(chatId)
      res.json({ ok: true, token, ...adminAccessPayload(access) })
      return
    }

    const credential = readLoginCredential(req.body)

    if (credential.error) {
      res.status(400).json({ error: credential.error })
      return
    }

    if (credential.type === 'code' && !(await adminCodeColumnAvailable())) {
      res.status(500).json({ error: 'Владелец БД должен добавить колонку owner.mini_app_code_hash' })
      return
    }

    const stored = credential.type === 'code' ? access.code : access.pattern

    if (!access.pattern && !access.code) {
      // Первый вход: владелец сам выбирает, чем будет защищена админка —
      // фигурой или числовым кодом, введённым сейчас.
      if (String(process.env.ADMIN_BOOTSTRAP_CHAT_ID || '') === String(chatId)) {
        const saved = await saveAdminCredential(client, credential.type, credential.value)

        if (saved.rowCount === 0) {
          res.status(500).json({ error: 'В таблице owner нет строки для сохранения пароля' })
          return
        }

        const token = createAdminSession(chatId)
        adminAttempts.delete(chatId)
        res.json({ ok: true, token, bootstrapped: true, ...adminAccessPayload(await getStoredAdminAccess(client)) })
        return
      }

      res.status(500).json({ error: 'Пароль админки не задан в таблице owner' })
      return
    }

    if (!stored) {
      // Выбранный способ не настроен: подсказываем клиенту, что доступно.
      res.status(400).json({
        error: credential.type === 'code' ? 'Код доступа не настроен' : 'Фигура не настроена',
        ...adminAccessPayload(access),
      })
      return
    }

    if (verifyAdminCredential(credential.type, credential.value, stored)) {
      const token = createAdminSession(chatId)
      adminAttempts.delete(chatId)
      res.json({ ok: true, token, ...adminAccessPayload(access) })
      return
    }

    const fails = Number(attempt?.fails || 0) + 1

    if (fails >= adminMaxFails) {
      adminAttempts.set(chatId, { fails: 0, lockedUntil: Date.now() + adminLockMs })
      res.status(429).json({ error: '3 неверные попытки. Ввод заблокирован на 1 минуту.', retryAfter: 60 })
      return
    }

    adminAttempts.set(chatId, { fails, lockedUntil: 0 })
    res.status(401).json({
      error: credential.type === 'code' ? 'Неверный код доступа' : 'Неверная фигура',
      attemptsLeft: adminMaxFails - fails,
      ...adminAccessPayload(access),
    })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

/**
 * Способы входа и состояние защиты: настроен ли код/фигура и не выключен ли
 * пароль тумблером «вход без пароля». Экрану логина это нужно, чтобы показать
 * вкладку «Фигура» или «Код» либо сразу пустить владельца без пароля.
 */
app.get('/api/admin/access', requireTelegramUser, requireOwner, async (req, res, next) => {
  const client = await pool.connect()

  try {
    const access = await getStoredAdminAccess(client)
    res.json({ ok: true, ...adminAccessPayload(access) })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

/**
 * Смена способа входа: задать фигуру/код, удалить один из способов или
 * включить/выключить пароль целиком (`{ disabled: true }` — вход без пароля).
 * Нужна активная сессия админки; последний способ входа удалить нельзя.
 */
app.post('/api/admin/access', requireTelegramUser, requireAdminSession, async (req, res, next) => {
  const type = String(req.body?.type || '')
  const remove = Boolean(req.body?.remove)
  /** Тумблер «вход без пароля»: приходит как boolean, иначе `null` (не трогаем). */
  const disabled = typeof req.body?.disabled === 'boolean' ? req.body.disabled : null

  if (disabled === null && !adminCredentialTypes.includes(type)) {
    res.status(400).json({ error: 'Неизвестный способ входа' })
    return
  }

  if (type === 'code' && !(await adminCodeColumnAvailable())) {
    res.status(500).json({ error: 'Владелец БД должен добавить колонку owner.mini_app_code_hash' })
    return
  }

  let value = ''

  if (!remove && disabled === null) {
    try {
      value = normalizeAdminCredential(type, req.body?.value)
    } catch (error) {
      res.status(400).json({ error: error.message })
      return
    }
  }

  const client = await pool.connect()

  try {
    // Переключатель «вход без пароля»: фигура и код просто перестают спрашиваться.
    // Хеши не стираем — если владелец вернёт защиту, прежний способ входа останется.
    if (disabled !== null) {
      if (!(await adminAccessOffColumnAvailable())) {
        res.status(500).json({ error: 'Владелец БД должен добавить колонку owner.mini_app_access_off' })
        return
      }

      const saved = await client.query('UPDATE owner SET mini_app_access_off = $1', [disabled])

      if (saved.rowCount === 0) {
        res.status(500).json({ error: 'В таблице owner нет строки для сохранения пароля' })
        return
      }

      // Выключая защиту, закрываем прочие сессии; текущую оставляем, чтобы
      // открытое окно админки не выбросило владельца сразу после переключения.
      if (disabled) {
        const keepToken = req.get('x-admin-token') || ''
        for (const token of [...adminSessions.keys()]) {
          if (token !== keepToken) {
            adminSessions.delete(token)
          }
        }
      }

      const updated = await getStoredAdminAccess(client)
      res.json({ ok: true, ...adminAccessPayload(updated) })
      return
    }

    const access = await getStoredAdminAccess(client)
    const other = type === 'code' ? access.pattern : access.code

    if (remove && !other) {
      res.status(400).json({ error: 'Нельзя удалить единственный способ входа' })
      return
    }

    const saved = remove
      ? await clearAdminCredential(client, type)
      : await saveAdminCredential(client, type, value)

    if (saved.rowCount === 0) {
      res.status(500).json({ error: 'В таблице owner нет строки для сохранения пароля' })
      return
    }

    const updated = await getStoredAdminAccess(client)
    res.json({ ok: true, ...adminAccessPayload(updated) })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/admin/users/:chatId', requireTelegramUser, requireAdminSession, async (req, res, next) => {
  const chatId = Number(req.params.chatId)

  if (!Number.isInteger(chatId)) {
    res.status(400).json({ error: 'Некорректный chat_id' })
    return
  }

  const client = await pool.connect()

  try {
    const payload = await getAdminUserPayload(client, chatId)

    if (!payload) {
      res.status(404).json({ error: 'Пользователь не найден' })
      return
    }

    res.json(payload)
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/admin/users/:chatId/cases', requireTelegramUser, requireAdminSession, async (req, res, next) => {
  const chatId = Number(req.params.chatId)
  const caseType = String(req.body.caseType || '').trim()
  const quantity = Number(req.body.quantity || 1)

  if (!Number.isInteger(chatId)) {
    res.status(400).json({ error: 'Некорректный chat_id' })
    return
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    res.status(400).json({ error: 'Некорректное количество' })
    return
  }

  const client = await pool.connect()

  try {
    // Названия кейсов живут в БД: неизвестный id — ошибка для владельца.
    try {
      await findCaseTemplate(client, caseType)
    } catch (error) {
      res.status(400).json({ error: error.message })
      return
    }

    const userResult = await client.query('SELECT chat_id FROM users WHERE chat_id = $1', [chatId])

    if (userResult.rowCount === 0) {
      res.status(404).json({ error: 'Пользователь не найден' })
      return
    }

    await incrementCaseBalance(client, chatId, caseType, quantity)

    const cases = await getCaseBalances(client, chatId)
    res.json({ ok: true, cases })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/admin/pattern', requireTelegramUser, requireAdminSession, async (req, res, next) => {
  let pattern

  try {
    pattern = normalizePattern(req.body.pattern)
  } catch (error) {
    res.status(400).json({ error: error.message })
    return
  }

  const client = await pool.connect()

  try {
    const result = await saveAdminPattern(client, pattern)

    if (result.rowCount === 0) {
      res.status(500).json({ error: 'В таблице owner нет строки для сохранения пароля' })
      return
    }

    res.json({ ok: true })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

// ── Технические работы ──────────────────────────────────────────────────────
// Владелец включает режим кнопкой в шапке админки. Пока он включён,
// `GET /api/bootstrap` отдаёт данные только владельцу бота, а остальные получают
// один флаг `maintenance` и видят заглушку (src/screens/SetupScreens.jsx).
// Флаг живёт в маленьком JSON-файле рядом с сервером: настройка одна, ради неё
// схему БД не трогаем, а значение переживает перезапуск API.
const maintenanceFile = path.join(__dirname, 'maintenance.json')

function readMaintenanceState() {
  try {
    // BOM срезаем: файл может быть сохранён редактором Windows.
    const raw = fs.readFileSync(maintenanceFile, 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw)

    return { enabled: parsed?.enabled === true, updatedAt: parsed?.updatedAt || null }
  } catch {
    // Файла нет или он битый — считаем, что тех. работы выключены.
    return { enabled: false, updatedAt: null }
  }
}

function writeMaintenanceState(enabled) {
  const state = { enabled: enabled === true, updatedAt: new Date().toISOString() }

  fs.writeFileSync(maintenanceFile, `${JSON.stringify(state, null, 2)}\n`)

  return state
}

app.get('/api/admin/maintenance', requireTelegramUser, requireAdminSession, requireOwner, (_req, res) => {
  res.json({ ok: true, ...readMaintenanceState() })
})

app.post('/api/admin/maintenance', requireTelegramUser, requireAdminSession, requireOwner, (req, res) => {
  res.json({ ok: true, ...writeMaintenanceState(req.body?.enabled === true) })
})

// Лёгкая ручка для авто-обновления экрана миссий: отдаёт только прогресс дня
// и статусы заданий, без тяжёлого bootstrap (склад, маркет, брак и т.д.).
app.get('/api/missions', requireTelegramUser, async (req, res, next) => {
  const client = await pool.connect()

  try {
    const userResult = await client.query('SELECT * FROM users WHERE chat_id = $1', [req.telegramUser.id])

    if (userResult.rowCount === 0) {
      res.json({ ok: true, missionProgress: null, missionMilestones, missions: [] })
      return
    }

    const user = userResult.rows[0]
    const missionProgress = await getMissionProgress(client, req.telegramUser.id)

    res.json({
      ok: true,
      missionProgress,
      missionMilestones,
      missions: await buildMissionStatuses(client, user, missionProgress),
    })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/bootstrap', requireTelegramUser, async (req, res, next) => {
  const chatId = req.telegramUser.id

  // Режим «тех. работы»: обычные пользователи получают только флаг и заглушку,
  // владелец бота работает как обычно (и заодно видит админку).
  if (readMaintenanceState().enabled) {
    let client = null
    let owner = false

    try {
      client = await pool.connect()
      owner = await isBotOwner(client, chatId)
    } catch (error) {
      // БД недоступна — это ровно та ситуация, ради которой режим и включают:
      // заглушку показываем всем, а владельца узнаём по списку в окружении.
      console.warn('Режим тех. работ: не удалось проверить владельца бота:', error.message)
      owner = ownerChatIds().includes(String(chatId))
    } finally {
      client?.release()
    }

    if (!owner) {
      res.json({ maintenance: true, user: null, isOwner: false })
      return
    }
  }

  try {
    res.json(await buildBootstrapPayload(chatId))
  } catch (error) {
    next(error)
  }
})

app.post('/api/shop/favorite', requireTelegramUser, async (req, res, next) => {
  const itemId = Number(req.body.itemId)

  if (!Number.isInteger(itemId)) {
    res.status(400).json({ error: 'Некорректный товар' })
    return
  }

  const client = await pool.connect()

  try {
    const existing = await client.query(
      'SELECT 1 FROM shop_favorites WHERE user_id = $1 AND item_id = $2',
      [req.telegramUser.id, itemId],
    )

    let isFavorite = false

    if (existing.rowCount > 0) {
      await client.query('DELETE FROM shop_favorites WHERE user_id = $1 AND item_id = $2', [
        req.telegramUser.id,
        itemId,
      ])
    } else {
      await client.query(
        `
        INSERT INTO shop_favorites (user_id, item_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, item_id) DO NOTHING
        `,
        [req.telegramUser.id, itemId],
      )
      isFavorite = true
    }

    const payload = await buildBootstrapPayload(req.telegramUser.id)
    res.json({ ok: true, isFavorite, data: payload })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/shop/equip', requireTelegramUser, async (req, res, next) => {
  const itemId = Number(req.body.itemId)

  if (!Number.isInteger(itemId)) {
    res.status(400).json({ error: 'Некорректный товар' })
    return
  }

  const client = await pool.connect()

  try {
    const item = await client.query('SELECT id, category, price FROM shop_items WHERE id = $1', [itemId])

    if (item.rowCount === 0) {
      res.status(404).json({ error: 'Товар не найден' })
      return
    }

    const shopItem = item.rows[0]
    const isOwned = await userOwnsItem(client, req.telegramUser.id, itemId)

    if (!isOwned && Number(shopItem.price || 0) > 0) {
      res.status(409).json({ error: 'Сначала купите предмет' })
      return
    }

    const activeColumn = getActiveColumn(shopItem.category)

    if (!activeColumn) {
      res.status(400).json({ error: 'Этот тип предмета нельзя установить' })
      return
    }

    await client.query(`UPDATE users SET ${activeColumn} = $1 WHERE chat_id = $2`, [
      itemId,
      req.telegramUser.id,
    ])

    res.json({ ok: true, data: await buildBootstrapPayload(req.telegramUser.id) })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/shop/purchase', requireTelegramUser, async (req, res, next) => {
  const itemId = Number(req.body.itemId)

  if (!Number.isInteger(itemId)) {
    res.status(400).json({ error: 'Некорректный товар' })
    return
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const userResult = await client.query(
      'SELECT chat_id, starcoins FROM users WHERE chat_id = $1 FOR UPDATE',
      [req.telegramUser.id],
    )

    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Пользователь не найден в базе бота' })
      return
    }

    const itemResult = await client.query('SELECT * FROM shop_items WHERE id = $1', [itemId])

    if (itemResult.rowCount === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Товар не найден' })
      return
    }

    const item = itemResult.rows[0]
    const price = Number(item.price || 0)
    const balance = Number(userResult.rows[0].starcoins || 0)

    if (await userOwnsItem(client, req.telegramUser.id, itemId)) {
      await client.query('COMMIT')
      res.json({ ok: true, status: 'owned', data: await buildBootstrapPayload(req.telegramUser.id) })
      return
    }

    if (balance < price) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Недостаточно астронов', balance, price })
      return
    }

    await client.query('UPDATE users SET starcoins = starcoins - $1 WHERE chat_id = $2', [
      price,
      req.telegramUser.id,
    ])
    await client.query('INSERT INTO inventory (chat_id, item_id) VALUES ($1, $2)', [
      req.telegramUser.id,
      itemId,
    ])

    await client.query('COMMIT')
    res.json({ ok: true, status: 'purchased', data: await buildBootstrapPayload(req.telegramUser.id) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally {
    client.release()
  }
})

/**
 * Открытие кейса.
 *
 * Код обращения (`incident`) выдаётся на каждую попытку: он уходит в лог чата
 * кейсов и его называет игрок поддержке, если награду выдать не удалось.
 * Награда фиксируется вместе со списанием кейса, поэтому сбой выдачи откатывает
 * транзакцию, а лог об этом уходит в чат кейсов обязательно (см. `caseGifts.js`).
 */
app.post('/api/cases/open', requireTelegramUser, async (req, res, next) => {
  const caseType = String(req.body.caseType || '').trim()
  const incident = newCaseIncidentCode()
  const client = await pool.connect()
  let template = null
  let opened = null

  try {
    // Кейс мог быть выключен или удалён владельцем — сверяемся с каталогом из БД.
    template = await findCaseTemplate(client, caseType).catch(() => null)

    if (!template || template.active === false) {
      res.status(400).json({ error: 'Неизвестный тип кейса' })
      return
    }

    await client.query('BEGIN')

    opened = await openCaseAndGrantReward(client, req.telegramUser.id, template, {
      incident,
      langCode: req.telegramUser.language_code,
    })

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    await respondCaseOpenFailure({ telegramUser: req.telegramUser, res, next, error, template, incident })
    return
  } finally {
    client.release()
  }

  // Награда уже зафиксирована: лог и данные для экрана собираем после COMMIT, иначе
  // сбой bootstrap выглядел бы в логе как «кейс не открылся».
  notifyCaseOpening(req.telegramUser, template, opened.reward, incident, opened.delivery).catch((notifyError) => {
    console.error(notifyError)
  })

  try {
    res.json({
      ok: true,
      reward: opened.reward,
      data: await buildBootstrapPayload(req.telegramUser.id),
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Ответ на неудачное открытие: игроку — понятная ошибка с кодом обращения, в чат
 * кейсов — обязательный лог с причиной. Кейс к этому моменту уже вернулся игроку.
 */
async function respondCaseOpenFailure({ telegramUser, res, next, error, template, incident }) {
  if (error.message === 'Этот кейс закончился') {
    res.status(409).json({ error: error.message })
    return
  }

  await notifyCaseFailure(telegramUser, template, error, incident).catch((logError) => {
    console.error('[cases] лог провала не отправлен:', logError?.message || logError)
  })

  // Подарок не ушёл: награды нет, кейс на месте, игроку — код обращения и
  // подсказка написать в поддержку (клиент рисует её по флагу `support`).
  if (error instanceof CaseGiftDeliveryError) {
    res.status(502).json({
      error: 'Подарок не удалось выдать. Кейс не списан.',
      code: error.code || incident,
      reason: error.reason || '',
      support: true,
    })
    return
  }

  next(error)
}

app.post('/api/cases/purchase-link', requireTelegramUser, async (req, res, next) => {
  const caseType = String(req.body.caseType || '').trim()
  const quantity = normalizeQuantity(req.body.quantity)
  const client = await pool.connect()

  try {
    const template = await findCaseTemplate(client, caseType).catch(() => null)

    if (!template || template.active === false || !caseForSale(template)) {
      res.status(400).json({ error: 'Этот кейс пока нельзя купить за Telegram Stars' })
      return
    }

    const order = await createCasePurchaseOrder(client, req.telegramUser.id, template, quantity)
    res.json({ ok: true, ...order })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

/**
 * Счёт за VIP-подписку в Telegram Stars.
 *
 * Тариф берётся только из `vipPlans` (цену из запроса сервер игнорирует).
 * В ответ уходит `invoiceLink` — его открывает `WebApp.openInvoice` внутри
 * Mini App. Срок подписки продлевается после оплаты: см. `fulfillVipOrder`.
 */
app.post('/api/vip/purchase-link', requireTelegramUser, async (req, res, next) => {
  const plan = vipPlanById(req.body.planId)
  const client = await pool.connect()

  try {
    if (!plan) {
      res.status(400).json({ error: 'Такого тарифа VIP нет' })
      return
    }

    const order = await createVipPurchaseOrder(
      client,
      req.telegramUser.id,
      plan,
      vipInvoiceText(plan, req.get('accept-language')),
    )

    res.json({ ok: true, ...order })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/payments/sync', requireTelegramUser, async (req, res, next) => {
  const orderId = String(req.body.orderId || '').trim()

  if (!orderId) {
    res.status(400).json({ error: 'Не передан orderId' })
    return
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    // Заказ бывает и на VIP-подписку: сначала ищем в таблице VIP-заказов, а если
    // его там нет — синхронизируем кейсовый (он же отдаёт ошибку «не найден»).
    const order =
      (await syncVipPurchaseOrder(client, req.telegramUser.id, orderId)) ||
      (await syncCasePurchaseOrder(client, req.telegramUser.id, orderId))
    await client.query('COMMIT')

    res.json({
      ok: true,
      order,
      data: await buildBootstrapPayload(req.telegramUser.id),
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/payments/telegram/update', async (req, res, next) => {
  const headerSecret =
    req.get('x-miniapp-payments-secret') ||
    req.get('x-telegram-bot-api-secret-token') ||
    req.get('x-payment-relay-secret') ||
    ''

  if (!paymentRelaySecret || headerSecret !== paymentRelaySecret) {
    res.status(403).json({ error: 'Недостаточно прав для payment relay' })
    return
  }

  try {
    await handlePaymentRelayUpdate(req.body || {})
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.post('/api/missions/claim', requireTelegramUser, async (req, res, next) => {
  const missionId = String(req.body.missionId || '').trim()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const result = await claimMissionReward(client, req.telegramUser.id, missionId)

    await client.query('COMMIT')
    res.json({
      ok: true,
      rewardXp: result.rewardXp,
      rewardCase: result.rewardCase,
      grantedCases: result.grantedCases,
      data: await buildBootstrapPayload(req.telegramUser.id),
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})

    if (error.message === 'Неизвестная задача') {
      res.status(400).json({ error: error.message })
      return
    }

    if (
      error.message === 'Задача пока не готова' ||
      error.message === 'Награда за эту задачу уже забрана' ||
      error.message === 'Пользователь не найден'
    ) {
      res.status(409).json({ error: error.message })
      return
    }

    next(error)
  } finally {
    client.release()
  }
})

// Документация (Epic 2): публичные и админские ручки раздела.
const docsRouter = createDocsApi({ pool, requireTelegramUser, requireAdminSession })
app.use(docsRouter)

// Задания: админский CRUD раздела «Задания». Доступ — только владельцу бота:
// сначала проверяем, кто пришёл (Telegram initData), потом админ-сессию
// (графический пароль), и лишь затем владельца (`owner.chat_id`).
// onChange сбрасывает кеш шаблонов, поэтому правки видны приложению сразу.
const missionsRouter = createMissionsApi({
  pool,
  requireTelegramUser,
  requireAdminSession,
  requireOwner,
  onChange: resetMissionTemplateCache,
})
app.use(missionsRouter)

// Кейсы: админский CRUD раздела «Кейсы» (названия и описания по языкам, картинка
// PNG, цена в Stars и взвешенное наполнение). Рулетка награждает по `contents`
// из БД, а балансы старых кейсов остались в колонках `case_balances`.
// onChange сбрасывает кеш каталога, поэтому правки видны приложению сразу.
const casesRouter = createCasesApi({
  pool,
  requireTelegramUser,
  requireAdminSession,
  requireOwner,
  onChange: resetCaseCatalogCache,
  loadGifts: loadGiftCatalog,
  // Состояние каталога нужен админке: пикер подарков по нему отличает «подарков нет»
  // от «юзербот недоступен» (см. `giftsStatus` в ответе списка кейсов).
  giftsSnapshot: giftCatalogSnapshot,
  // Подарки, уже полученные аккаунтом юзербота: второй режим пикера («есть на
  // аккаунте»). Состояние нужно по той же причине, что и у каталога.
  loadSavedGifts,
  savedGiftsSnapshot,
})
app.use(casesRouter)

// Подарки Telegram: прокси к юзерботу (`app/user_bot`). Каталог подарков идёт
// в приложение вместе с bootstrap, а Lottie-анимации отдаются по прямым
// ссылкам `/api/gifts/sticker/{id}.json` — их читает плеер в мини-аппе.
const giftsRouter = createGiftsApi({ requireTelegramUser })
app.use(giftsRouter)

// VIP за реальные деньги (Tribute): вебхук об оплате и «Проверить оплату» из
// приложения. Вебхук без Telegram-авторизации — вместо неё проверяется подпись
// `trbt-signature`; синхронизация статуса закрыта Telegram initData.
const tributeRouter = createTributeApi({
  pool,
  config: tributeConfig,
  vipPlans,
  requireTelegramUser,
  buildBootstrapPayload,
  extendVipMembership,
})
app.use(tributeRouter)

const distDir = path.join(rootDir, 'dist')
const skinsDir = process.env.SKINS_DIR || '/home/joy/iSpaceRobot/app/user/skins'
const staticCacheOptions = {
  immutable: true,
  maxAge: '30d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache')
    }
  },
}

if (fs.existsSync(skinsDir)) {
  app.use('/skins', express.static(skinsDir, staticCacheOptions))
}

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, staticCacheOptions))
  // SPA-фолбэк: любой GET без файла отдаёт index.html. Исключения обязательны,
  // иначе опечатка в адресе API возвращает HTML с кодом 200 (клиент молча
  // получает пустой объект вместо ошибки), а отсутствующий скин — «битую» картинку.
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next()
      return
    }

    const isApi = req.path === '/api' || req.path.startsWith('/api/')
    const isSkins = req.path === '/skins' || req.path.startsWith('/skins/')

    if (isApi) {
      res.status(404).json({ error: 'Эндпоинт не найден' })
      return
    }

    if (isSkins) {
      res.status(404).type('text/plain').send('Skin not found')
      return
    }

    // index.html отдаём без кэша: иначе WebView подолгу держит старую сборку.
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((error, _req, res, next) => {
  void next
  console.error(error)

  if (error?.code === '28P01') {
    res.status(500).json({
      error: 'PostgreSQL отклонил пароль. Проверь DB_USER/DB_PASSWORD или DATABASE_URL в .env Mini App.',
    })
    return
  }

  if (error?.code === 'ECONNREFUSED') {
    res.status(500).json({
      error: 'Mini App не смог подключиться к PostgreSQL. Проверь DB_HOST/DB_PORT и запущен ли Postgres.',
    })
    return
  }

  if (error?.code === '42703' || error?.code === '42P01' || error?.code === '42804') {
    res.status(500).json({
      error: 'Не хватает служебных таблиц mini app. Выполни SQL для админки и кейсов на сервере.',
    })
    return
  }

  // Срок VIP продлевается в таблице бота `vip_users`: без прав на запись заказ
  // оплатится, но подписка не включится. Проверяем таблицу в тексте ошибки,
  // чтобы не подменять сообщение для чужих случаев 42501.
  if (error?.code === '42501' && /vip_users/.test(String(error.message || ''))) {
    res.status(500).json({
      error: 'Мини-приложению не хватает прав на таблицу vip_users для продления подписки.',
    })
    return
  }

  res.status(500).json({ error: 'Ошибка сервера Mini App' })
})

// Колонки доступа админки (фигура, числовой код и тумблер «вход без пароля»)
// добавляются идемпотентно. Если у приложения нет прав ALTER, их добавляет
// владелец БД (admin_setup.sql), а тумблер и код остаются выключенными до
// следующего запуска.
ensureAdminAccessSchema(pool)
  .then(() => {
    console.log('Admin access schema ready (фигура, код доступа и вход без пароля)')
  })
  .catch((error) => {
    console.error('Admin access schema init failed:', error.message)
    console.error('Выполни server/admin_setup.sql от владельца БД: ALTER TABLE owner ADD COLUMN IF NOT EXISTS mini_app_code_hash text; ALTER TABLE owner ADD COLUMN IF NOT EXISTS mini_app_access_off boolean NOT NULL DEFAULT false;')
  })

// Таблицы документации создаются идемпотентно; при каждом старте дозаполняются
// отсутствующие стартовые статьи и языковые версии (см. server/docsSeed.js).
// DOCS_SEED=false отключает наполнение, DOCS_SEED=refresh обновляет тексты.
ensureDocsSchema(pool)
  .then(({ added, filled, refreshed }) => {
    const details = [
      added ? `${added} новых статей` : '',
      filled ? `${filled} языковых версий` : '',
      refreshed ? `обновлено ${refreshed} версий` : '',
    ].filter(Boolean)

    console.log(details.length ? `Docs schema ready (${details.join(', ')})` : 'Docs schema ready')
  })
  .catch((error) => {
    console.error('Docs schema init failed:', error.message)
    console.error('Выполни server/admin_setup.sql от владельца БД и выдай права приложению.')
  })

// Таблица заданий создаётся идемпотентно; стартовый набор из 9 заданий
// заливается только если таблица пустая — правки владельца не перезаписываются.
ensureMissionsSchema(pool)
  .then(({ added }) => {
    console.log(added ? `Missions schema ready (${added} стартовых заданий)` : 'Missions schema ready')
  })
  .catch((error) => {
    console.error('Missions schema init failed:', error.message)
    console.error('Выполни server/admin_setup.sql от владельца БД и выдай права приложению.')
  })

// Таблицы кейсов создаются идемпотентно; стартовый набор (6 старых кейсов с их
// весами и диапазонами) заливается только в пустые id — правки владельца в
// админке не перезаписываются. После заливки сбрасываем кеш каталога.
ensureCasesSchema(pool)
  .then(({ added }) => {
    resetCaseCatalogCache()
    console.log(added ? `Cases schema ready (${added} стартовых кейсов)` : 'Cases schema ready')
  })
  .catch((error) => {
    console.error('Cases schema init failed:', error.message)
    console.error('Выполни server/admin_setup.sql от владельца БД и выдай права приложению.')
  })

// Таблица VIP-заказов (оплата подписки звёздами Telegram) создаётся идемпотентно.
// Тарифы живут в коде (`vipPlans`), наполнять нечего — нужна только схема.
ensureVipOrdersSchema(pool)
  .then(() => {
    console.log('VIP schema ready (подписка за Telegram Stars)')
  })
  .catch((error) => {
    console.error('VIP schema init failed:', error.message)
    console.error('Выполни server/admin_setup.sql от владельца БД и выдай права приложению.')
  })

// Журнал вебхуков Tribute (VIP за реальные деньги) создаётся так же идемпотентно.
// Без таблицы вебхук вернёт ошибку, а оплата останется в кабинете Tribute.
ensureTributeSchema(pool)
  .then(() => {
    console.log(
      tributeConfig.enabled
        ? 'Tribute schema ready (VIP за карту и СБП)'
        : 'Tribute schema ready, но оплата картой выключена: задай TRIBUTE_API_KEY, TRIBUTE_VIP_SUBSCRIPTION_ID и TRIBUTE_VIP_LINK',
    )
  })
  .catch((error) => {
    console.error('Tribute schema init failed:', error.message)
    console.error('Выполни server/admin_setup.sql от владельца БД и выдай права приложению.')
  })

app.listen(port, () => {
  console.log(`Space Mini App API started on http://127.0.0.1:${port}`)
})

function createPoolConfig() {
  const ssl = process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl,
    }
  }

  return {
    host: process.env.PGHOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
    database: process.env.PGDATABASE || process.env.DB_NAME,
    user: process.env.PGUSER || process.env.DB_USER,
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
    ssl,
  }
}

async function buildBootstrapPayload(chatId) {
  const client = await pool.connect()

  try {
    // Кейсы нужны и до записи пользователя в БД (первый вход): каталог читается
    // один раз, а в приложение уходит без картинки-«простыни» (только imageUrl).
    const caseCatalog = await getCaseCatalog(client)
    const caseStore = caseStorePayload(caseCatalog)
    const caseCards = caseCatalog.filter((item) => item.active !== false).map(toClientCase)
    // Каталог подарков юзербота: по нему экран кейса рисует подарки в слотах
    // (анимация Lottie + цена в звёздах). Юзербот недоступен — пустой список.
    // Ждать его здесь нельзя: Telegram отвечает секундами, а bootstrap —
    // первый экран приложения. Поэтому снимок берём сразу, а каталог юзербот
    // обновляет в фоне (следующий bootstrap/кейс увидит его уже заполненным).
    const giftsCatalog = await loadGiftCatalog({ background: true })
    const userResult = await client.query(
      `
      SELECT id, chat_id, banana, coins, msg_count, name, username, last_activity,
             starcoins, groups, roulette_last_activity, roulette_cooldown,
             banana_cooldown, bag_cooldown, created_at, lang, groups_activity,
             rp_access_until, active_title_id, active_emoji_id, active_reply_id,
             active_greeting_id, active_button_id, active_chart_id
      FROM users
      WHERE chat_id = $1
      `,
      [chatId],
    )

    if (userResult.rowCount === 0) {
      return {
        user: null,
        isOwner: await isBotOwner(client, chatId),
        // VIP едет вместе с профилем: карточка в профиле и тарифы на экране VIP
        // берутся из bootstrap, без отдельного запроса при открытии вкладки.
        vip: await getVipStatus(client, chatId),
        vipPlans,
        // VIP за реальные деньги: цена приходит из кабинета Tribute, дни — из
        // `vipPlans`. Пока Tribute не настроен, `enabled: false` и раздел
        // оплаты картой в приложении не показывается.
        tributeVip: await tributeVipSnapshot(tributeConfig, vipPlans),
        marriage: null,
        activeItems: {},
        inventory: [],
        shopItems: [],
        categories: [],
        cases: {},
        caseStore,
        caseCatalog: caseCards,
        gifts: [],
        giftsCatalog,
        missionProgress: null,
        missionMilestones,
        missions: [],
        caseOpenings: [],
      }
    }

    const user = userResult.rows[0]
    const marriage = await getMarriage(client, chatId)
    const activeItems = await getActiveItems(client, user)
    const inventory = await getInventory(client, chatId, user)
    const shopItems = await getShopItems(client, chatId, user)
    const cases = await getCaseBalances(client, chatId)
    const gifts = await getGiftBalances(client, chatId)
    const missionProgress = await getMissionProgress(client, chatId)
    const caseOpenings = await getRecentCaseOpenings(client, chatId)
    // Владелец бота видит в профиле вход в админ-панель; список заданий читаем
    // один раз и переиспользуем в buildMissionStatuses.
    const isOwner = await isBotOwner(client, chatId)
    const missionTemplates = await getMissionTemplates(client)

    const categories = [...new Set(shopItems.map((item) => item.category))]

    return {
      user,
      isOwner,
      vip: await getVipStatus(client, chatId),
      vipPlans,
      // см. ветку выше: тарифы Tribute для оплаты реальными деньгами
      tributeVip: await tributeVipSnapshot(tributeConfig, vipPlans),
      marriage,
      activeItems,
      inventory,
      shopItems,
      categories,
      cases,
      caseStore,
      caseCatalog: caseCards,
      gifts,
      giftsCatalog,
      missionProgress,
      missionMilestones,
      missions: await buildMissionStatuses(client, user, missionProgress, null, missionTemplates),
      caseOpenings,
    }
  } finally {
    client.release()
  }
}

async function getMarriage(client, chatId) {
  const result = await client.query(
    `
    SELECT m.id, m.husband_id, m.wife_id, m.marriage_datetime,
           partner.chat_id AS partner_chat_id,
           partner.name AS partner_name,
           partner.username AS partner_username
    FROM marriages m
    LEFT JOIN users partner
      ON partner.chat_id = CASE WHEN m.husband_id = $1 THEN m.wife_id ELSE m.husband_id END
    WHERE m.husband_id = $1 OR m.wife_id = $1
    LIMIT 1
    `,
    [chatId],
  )

  return result.rows[0] || null
}

async function getActiveItems(client, user) {
  const activePairs = [
    ['title', user.active_title_id],
    ['emoji', user.active_emoji_id],
    ['reply', user.active_reply_id],
    ['greeting', user.active_greeting_id],
    ['button', user.active_button_id],
    ['chart', user.active_chart_id],
  ].filter(([, value]) => Number(value) > 0)

  if (activePairs.length === 0) {
    return {}
  }

  const ids = activePairs.map(([, value]) => Number(value))
  const result = await client.query('SELECT * FROM shop_items WHERE id = ANY($1::int[])', [ids])
  const byId = new Map(result.rows.map((item) => [Number(item.id), item]))

  return Object.fromEntries(activePairs.map(([key, value]) => [key, byId.get(Number(value)) || null]))
}

async function getInventory(client, chatId, user) {
  const result = await client.query(
    `
    SELECT DISTINCT ON (si.id) si.*,
           true AS is_owned,
           EXISTS (
             SELECT 1 FROM shop_favorites sf
             WHERE sf.user_id = $1 AND sf.item_id = si.id
           ) AS is_favorite,
           ${activeCaseSql('si')} AS is_active
    FROM inventory i
    JOIN shop_items si ON si.id = i.item_id
    WHERE i.chat_id = $1
    ORDER BY si.id ASC
    `,
    activeQueryValues(chatId, user),
  )

  return result.rows
}

async function getShopItems(client, chatId, user) {
  const result = await client.query(
    `
    SELECT si.*,
           EXISTS (
             SELECT 1 FROM inventory i
             WHERE i.chat_id = $1 AND i.item_id = si.id
           ) OR COALESCE(si.price, 0) = 0 AS is_owned,
           EXISTS (
             SELECT 1 FROM shop_favorites sf
             WHERE sf.user_id = $1 AND sf.item_id = si.id
           ) AS is_favorite,
           ${activeCaseSql('si')} AS is_active
    FROM shop_items si
    ORDER BY si.category ASC, si.id ASC
    `,
    activeQueryValues(chatId, user),
  )

  return result.rows
}

/**
 * Балансы кейсов для приложения и профиля.
 *
 * Старые шесть кейсов живут в колонках `case_balances` (их читает бот), новые —
 * в `mini_app_case_balances`. Наружу отдаётся один объект `{ [caseId]: amount }`
 * по всем кейсам каталога, поэтому приложению всё равно, откуда взялся баланс.
 */
async function getCaseBalances(client, chatId) {
  const catalog = await getCaseCatalog(client)
  const balances = Object.fromEntries(catalog.map((item) => [item.id, 0]))

  if (caseBalanceColumns.length > 0) {
    const legacyResult = await client.query(
      `SELECT ${caseBalanceColumns.join(', ')} FROM case_balances WHERE chat_id = $1`,
      [chatId],
    )

    if (legacyResult.rowCount > 0) {
      for (const column of caseBalanceColumns) {
        if (column in balances) {
          balances[column] = Number(legacyResult.rows[0][column] || 0)
        }
      }
    }
  }

  const modernResult = await client
    .query('SELECT case_id, amount FROM mini_app_case_balances WHERE chat_id = $1', [chatId])
    .catch((error) => {
      console.warn('Балансы новых кейсов недоступны:', error.message)
      return { rows: [] }
    })

  for (const row of modernResult.rows) {
    if (row.case_id in balances) {
      balances[row.case_id] = Number(row.amount || 0)
    }
  }

  return balances
}

async function getGiftBalances(client, chatId) {
  const result = await client.query(
    `
    SELECT gift_code, amount
    FROM gift_balances
    WHERE chat_id = $1 AND amount > 0
    ORDER BY gift_code ASC
    `,
    [chatId],
  )

  return result.rows.map((row) => ({
    gift_code: row.gift_code,
    amount: Number(row.amount || 0),
  }))
}

async function getMissionProgress(client, chatId) {
  const result = await client.query(
    `
    SELECT xp, claimed_milestones, claims, updated_at
    FROM mission_progress
    WHERE chat_id = $1
    `,
    [chatId],
  )

  const base = {
    xp: 0,
    claimedMilestones: [],
    claims: {},
  }

  if (result.rowCount === 0) {
    return base
  }

  const row = result.rows[0]
  const updatedAt = parseDateSafe(row.updated_at)
  const now = Date.now()
  // Токен награды живёт ровно свой период: у ежедневного задания он умирает в
  // 00:00 по МСК, у недельного — в понедельник, одноразовый (`:once`) не
  // сбрасывается никогда. Поэтому «забрано» проверяем по самому токену, а не по
  // дате последнего забора: недельная награда не оживает после сброса дня.
  const claims = filterActiveClaims(safeJsonObject(row.claims), now)

  // Ежедневный цикл: XP и milestone-награды живут один игровой день и
  // сбрасываются в 00:00 по МСК. Если последний забор был в прошлом дне —
  // дневная часть прогресса обнуляется автоматически.
  if (!updatedAt || updatedAt.getTime() < startOfMskDay(now)) {
    return { ...base, claims }
  }

  return {
    xp: Number(row.xp || 0),
    claimedMilestones: normalizeNumberList(row.claimed_milestones),
    claims,
  }
}

/** Убирает токены истёкших периодов: после сброса награду можно забрать снова. */
function filterActiveClaims(claims, now) {
  return Object.fromEntries(
    Object.entries(claims).filter(([, token]) => isMissionClaimFresh(token, now)),
  )
}

async function getRecentCaseOpenings(client, chatId) {
  const result = await client.query(
    `
    SELECT id, case_type, reward_type, reward_title, created_at
    FROM case_openings
    WHERE chat_id = $1
    ORDER BY id DESC
    LIMIT 10
    `,
    [chatId],
  )

  return result.rows
}

/**
 * Контекст миссий: данные бота и Space App, нужные для проверки готовности.
 * Запросы к служебным таблицам обёрнуты в try/catch — если таблицы нет,
 * экран миссий не падает, просто задания без данных считаются невыполненными.
 *
 * `templates` передаётся, когда список заданий уже прочитан: по нему видно, у
 * каких заданий есть цели «подписка», и только для них дёргается Telegram.
 * При заборе награды `forceTargets` отключает кеш проверок — иначе игрок,
 * подписавшийся секунду назад, получил бы ошибку «задача не готова».
 */
async function buildMissionContext(client, chatId, user, templates = null, { forceTargets = false } = {}) {
  const list = templates || await getMissionTemplates(client)

  return {
    user,
    activity: await getMissionActivityStats(client, chatId),
    cases: await getMissionCaseStats(client, chatId),
    targets: await checkMissionTargets(chatId, list, { force: forceTargets }),
  }
}

// ── Проверка целей «подписка» через Telegram ────────────────────────────────
// Проверка живёт на сервере приложения, а не в боте: initData уже подтверждён
// Telegram, а `getChatMember` отвечает сразу на все три вопроса — «игрок
// подписан», «бот добавлен», «бот админ». Ответы кешируются на минуту, потому
// что экран миссий опрашивает сервер каждые несколько секунд, а Telegram
// ограничивает частоту запросов. Кеш — карта «чат:пользователь» с жёстким
// размером, чтобы долгоживущий процесс не рос.

const missionTargetCheckTtlMs = 45 * 1000
const missionTargetCacheLimit = 2000
const missionTargetCache = new Map()
let botUserIdPromise = null

/** id самого бота: нужен для проверок «бот добавлен» и «бот админ». */
async function getBotUserId() {
  if (!botUserIdPromise) {
    botUserIdPromise = telegramBotApi('getMe')
      .then((me) => Number(me?.id || 0))
      .catch((error) => {
        console.warn('Не удалось получить id бота для заданий:', error.message)
        botUserIdPromise = null
        return 0
      })
  }

  return botUserIdPromise
}

/** Участник чата из Telegram: `null` — узнать не получилось (нет чата/бота). */
async function fetchChatMember(chatId, userId, { force = false } = {}) {
  const key = `${chatId}:${userId}`
  const cached = missionTargetCache.get(key)

  if (!force && cached && Date.now() - cached.at < missionTargetCheckTtlMs) {
    return cached.member
  }

  let member = null

  try {
    member = await telegramBotApi('getChatMember', { chat_id: chatId, user_id: userId })
  } catch (error) {
    // «chat not found» и «bot is not a member» — обычные ответы, когда чата нет
    // или бот не добавлен: цель просто считается невыполненной.
    console.warn(`Не удалось проверить участника ${key}:`, error.message)
  }

  rememberMissionTarget(key, { at: Date.now(), member })

  return member
}

/** Кеш проверок: при переполнении вытесняем самую старую запись. */
function rememberMissionTarget(key, value) {
  if (missionTargetCache.size >= missionTargetCacheLimit) {
    const oldest = missionTargetCache.keys().next().value
    missionTargetCache.delete(oldest)
  }

  missionTargetCache.set(key, value)
}

/** Игрок в чате: участник, админ, владелец или ограниченный «в чате». */
function isChatMemberStatus(member) {
  const status = String(member?.status || '')

  if (status === 'creator' || status === 'administrator' || status === 'member') {
    return true
  }

  return status === 'restricted' && member?.is_member === true
}

/** Бот добавлен в чат: у бота в канале бывает только админский статус. */
function isChatAdminStatus(member) {
  const status = String(member?.status || '')

  return status === 'creator' || status === 'administrator'
}

/**
 * Проверка целей всех заданий «подписка» одного игрока.
 *
 * Возвращает карту `{ [missionId]: { total, satisfied, items } }`: `items` —
 * цели с флагом `ok`, они же уезжают в приложение, чтобы карточка показала
 * «подписан / не подписан» по каждому каналу.
 */
async function checkMissionTargets(chatId, missions, { force = false } = {}) {
  const statuses = {}
  const list = (missions || []).filter((mission) => mission.targetList && mission.targets?.length)

  if (list.length === 0) {
    return statuses
  }

  const needsBot = list.some((mission) => mission.targets.some((target) => target.type !== 'subscribe'))
  const botUserId = needsBot ? await getBotUserId() : 0

  for (const mission of list) {
    const items = []

    for (const target of mission.targets) {
      const isPlayerTarget = target.type === 'subscribe'
      const userId = isPlayerTarget ? Number(chatId) : botUserId
      const member = userId ? await fetchChatMember(target.chatId, userId, { force }) : null
      const ok = !member
        ? false
        : isPlayerTarget ? isChatMemberStatus(member) : target.type === 'bot_admin' ? isChatAdminStatus(member) : isChatMemberStatus(member)

      items.push({ ...target, ok })
    }

    statuses[mission.id] = {
      total: items.length,
      satisfied: items.filter((item) => item.ok).length,
      items,
    }
  }

  return statuses
}

/** Сообщения по дням из бота (`user_activity_daily`, даты по МСК). */
async function getMissionActivityStats(client, chatId) {
  const today = mskDayKey(Date.now())
  const weekStart = mskDayKey(startOfMskWeek(Date.now()))

  try {
    const result = await client.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN activity_date = $2::date THEN msg_count END), 0) AS today_msgs,
        COALESCE(SUM(msg_count), 0) AS week_msgs,
        COUNT(DISTINCT activity_date) AS week_days
      FROM user_activity_daily
      WHERE user_id = $1 AND activity_date >= $3::date
      `,
      [chatId, today, weekStart],
    )

    const row = result.rows[0] || {}

    return {
      available: true,
      todayMsgs: Number(row.today_msgs || 0),
      weekMsgs: Number(row.week_msgs || 0),
      weekDays: Number(row.week_days || 0),
    }
  } catch (error) {
    console.warn('Статистика активности для миссий недоступна:', error.message)
    return { available: false, todayMsgs: 0, weekMsgs: 0, weekDays: 0 }
  }
}

/** Открытия кейсов в Space App: сегодня и с начала игровой недели. */
async function getMissionCaseStats(client, chatId) {
  try {
    const result = await client.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= $2::timestamptz) AS today_cases,
        COUNT(*) AS week_cases
      FROM case_openings
      WHERE chat_id = $1 AND created_at >= $3::timestamptz
      `,
      [
        chatId,
        new Date(startOfMskDay(Date.now())).toISOString(),
        new Date(startOfMskWeek(Date.now())).toISOString(),
      ],
    )

    const row = result.rows[0] || {}

    return {
      available: true,
      today: Number(row.today_cases || 0),
      week: Number(row.week_cases || 0),
    }
  } catch (error) {
    console.warn('Статистика кейсов для миссий недоступна:', error.message)
    return { available: false, today: 0, week: 0 }
  }
}

// ── Шаблоны заданий из БД ───────────────────────────────────────────────────
// Экран миссий опрашивает /api/missions каждые несколько секунд, а список
// заданий меняется только из админки. Поэтому шаблоны кешируются на полминуты,
// а после каждой правки владельца кеш сбрасывается (onChange в missionsRouter).
const missionCacheMs = 30 * 1000
let missionTemplateCache = { list: null, loadedAt: 0 }

/** Актуальный список заданий: из БД, либо стартовый набор, если таблица пуста. */
async function getMissionTemplates(client) {
  if (missionTemplateCache.list && Date.now() - missionTemplateCache.loadedAt < missionCacheMs) {
    return missionTemplateCache.list
  }

  const stored = await loadMissionTemplates(client)
  const list = stored.length > 0 ? stored : defaultMissionTemplates()

  missionTemplateCache = { list, loadedAt: Date.now() }

  return list
}

/** Сброс кеша заданий: вызывается после сохранения/удаления задания в админке. */
function resetMissionTemplateCache() {
  missionTemplateCache = { list: null, loadedAt: 0 }
}

/** Шаблон задания по id: неизвестный id — ошибка «Неизвестная задача». */
async function findMissionTemplate(client, missionId) {
  const list = await getMissionTemplates(client)
  const mission = list.find((item) => item.id === missionId)

  if (!mission) {
    throw new Error('Неизвестная задача')
  }

  return mission
}

/**
 * Статусы заданий для приложения: список берётся из БД (см. getMissionTemplates),
 * поэтому владелец может добавлять, скрывать и переименовывать задания без
 * пересборки фронтенда. `templates` передаётся, когда список уже прочитан
 * (bootstrap), чтобы не ходить в кеш дважды.
 */
async function buildMissionStatuses(client, user, progress, context = null, templates = null) {
  const claims = progress?.claims || {}
  const list = templates || await getMissionTemplates(client)
  const ctx = context || (await buildMissionContext(client, user.chat_id, user, list))
  const now = Date.now()

  return list
    .filter((mission) => mission.active)
    .map((mission) => ({
      id: mission.id,
      kind: mission.kind,
      action: mission.action,
      where: mission.where,
      xp: mission.xp,
      goal: mission.goal || null,
      goalable: mission.goalable,
      maxGoal: mission.maxGoal,
      rewardCase: mission.rewardCase || null,
      titles: mission.titles,
      texts: mission.texts,
      difficulty: mission.difficulty,
      color: mission.color,
      refreshHours: mission.refreshHours,
      sortOrder: mission.sortOrder,
      // Цели «подписка»: приложение рисует их списком с галочками, чтобы игрок
      // видел, на какие каналы он уже подписан. У обычных заданий список пуст.
      targets: ctx.targets?.[mission.id]?.items || [],
      targetList: Boolean(mission.targetList),
      // Одноразовое задание после забора исчезает с экрана, поэтому клиенту
      // нужен явный флаг повторяемости.
      repeatable: mission.repeatable !== false,
      // Конец текущего периода — по нему приложение рисует таймер сброса.
      periodEnd: missionPeriodRange(mission, now)?.end || null,
      progress: missionProgressValue(mission, ctx),
      ready: missionReady(mission, ctx),
      // Токен привязан к периоду задания, поэтому старое «забрано» из прошлых
      // суток не блокирует новую награду, а сегодняшняя задача не «оживает»
      // после повторного действия в боте.
      claimed: isMissionClaimFresh(claims[mission.id], now),
    }))
}

/** Прогресс миссии для прогресс-бара: `{ current, goal }` или `null`. */
function missionProgressValue(mission, ctx) {
  // Шкала есть только у «измеримых» действий с целью больше 1: событие
  // «случилось / не случилось» (банан, ставка) показывается без прогресса.
  if (!mission.goalable || !mission.goal || mission.goal <= 1) {
    return null
  }

  const metric = missionProgressMetrics[mission.action]

  if (!metric) {
    return null
  }

  return { current: Math.min(Number(metric(ctx, mission) || 0), mission.goal), goal: mission.goal }
}

/**
 * Счётчики для прогресс-бара по коду действия задания. Ключи совпадают с
 * каталогом действий в server/missionsApi.js: добавленное действие нужно
 * описать и здесь, и в `missionReady`.
 */
const missionProgressMetrics = {
  groups_today: (ctx) => countActiveGroupsToday(ctx.user),
  messages_today: (ctx) => ctx.activity.todayMsgs,
  case_open_today: (ctx) => ctx.cases.today,
  week_messages: (ctx) => ctx.activity.weekMsgs,
  week_active_days: (ctx) => ctx.activity.weekDays,
  // Задание «подписка»: прогресс — сколько его целей уже выполнено сервером.
  subscribe_targets: (ctx, mission) => ctx.targets?.[mission.id]?.satisfied || 0,
  cases_week: (ctx) => ctx.cases.week,
  groups_week: (ctx) => countActiveGroupsWeek(ctx.user),
}

/**
 * Сколько разных чатов пользователь засветил сегодня.
 * Бот складывает в `groups_activity` строку последней активности по каждому
 * чату, поэтому день сверяем по префиксу даты — это ровно тот день, каким
 * его видит сам бот (без пересчёта часовых поясов).
 */
function countActiveGroupsToday(user) {
  const groups = safeJsonObject(user?.groups_activity)

  if (Object.keys(groups).length === 0) {
    return 0
  }

  const today = mskDayKey(Date.now())
  let active = 0

  for (const value of Object.values(groups)) {
    if (String(value || '').slice(0, 10) === today) {
      active += 1
    }
  }

  return active
}

/**
 * Сколько разных чатов пользователь засветил с начала игровой недели.
 * Тот же приём, что и в дневном счётчике: бот пишет в `groups_activity` дату
 * последней активности по каждому чату, поэтому «активные чаты недели» — это
 * строки с датой внутри текущей недели (граница считается по МСК).
 */
function countActiveGroupsWeek(user) {
  const groups = safeJsonObject(user?.groups_activity)

  if (Object.keys(groups).length === 0) {
    return 0
  }

  const weekStart = mskDayKey(startOfMskWeek(Date.now()))
  let active = 0

  for (const value of Object.values(groups)) {
    if (String(value || '').slice(0, 10) >= weekStart) {
      active += 1
    }
  }

  return active
}

async function claimMissionReward(client, chatId, missionId) {
  const mission = await findMissionTemplate(client, missionId)

  const userResult = await client.query('SELECT * FROM users WHERE chat_id = $1 FOR UPDATE', [chatId])

  if (userResult.rowCount === 0) {
    throw new Error('Пользователь не найден')
  }

  const user = userResult.rows[0]
  const progress = await ensureMissionProgress(client, chatId)
  const token = missionRewardToken(mission)

  if (isMissionClaimFresh(progress.claims?.[missionId], Date.now())) {
    throw new Error('Награда за эту задачу уже забрана')
  }

  // Проверяем цели «подписка» заново, без кеша: игрок мог подписаться только что.
  const context = await buildMissionContext(client, chatId, user, null, { forceTargets: true })

  if (!missionReady(mission, context)) {
    throw new Error('Задача пока не готова')
  }

  const nextClaims = {
    ...progress.claims,
    [missionId]: token,
  }
  const claimedMilestones = Array.isArray(progress.claimedMilestones) ? [...progress.claimedMilestones] : []
  const grantedCases = []
  let nextXp = Number(progress.xp || 0)

  if (mission.kind === 'weekly') {
    // Недельные миссии XP не дают: награда — кейс в запас.
    if (mission.rewardCase) {
      grantedCases.push(mission.rewardCase)
      await incrementCaseBalance(client, chatId, mission.rewardCase, 1)
    }
  } else {
    nextXp += mission.xp

    // Кейс можно повесить и на ежедневное задание — тогда он выдаётся вместе с XP.
    if (mission.rewardCase) {
      grantedCases.push(mission.rewardCase)
      await incrementCaseBalance(client, chatId, mission.rewardCase, 1)
    }

    for (const milestone of missionMilestones) {
      if (nextXp >= milestone.xp && !claimedMilestones.includes(milestone.xp)) {
        const quantity = Math.max(1, Number(milestone.quantity || 1))

        claimedMilestones.push(milestone.xp)

        for (let index = 0; index < quantity; index += 1) {
          grantedCases.push(milestone.caseType)
        }

        await incrementCaseBalance(client, chatId, milestone.caseType, quantity)
      }
    }
  }

  await client.query(
    `
    INSERT INTO mission_progress (chat_id, xp, claimed_milestones, claims, updated_at)
    VALUES ($1, $2, $3::jsonb, $4::jsonb, now())
    ON CONFLICT (chat_id) DO UPDATE
    SET xp = EXCLUDED.xp,
        claimed_milestones = EXCLUDED.claimed_milestones,
        claims = EXCLUDED.claims,
        updated_at = now()
    `,
    [chatId, nextXp, JSON.stringify(claimedMilestones), JSON.stringify(nextClaims)],
  )

  return {
    grantedCases,
    rewardXp: mission.xp,
    rewardCase: mission.rewardCase || null,
  }
}

async function ensureMissionProgress(client, chatId) {
  const progress = await getMissionProgress(client, chatId)

  if (progress.xp > 0 || Object.keys(progress.claims || {}).length > 0 || progress.claimedMilestones.length > 0) {
    return progress
  }

  await client.query(
    `
    INSERT INTO mission_progress (chat_id, xp, claimed_milestones, claims, updated_at)
    VALUES ($1, $2, '[]'::jsonb, '{}'::jsonb, now())
    ON CONFLICT (chat_id) DO NOTHING
    `,
    [chatId, progress.xp],
  )

  return progress
}


/**
 * Готова ли миссия к забору. `ctx` — результат buildMissionContext.
 * Проверка идёт по КОДУ ДЕЙСТВИЯ (`mission.action`), а не по id задания:
 * владелец может создать сколько угодно заданий на одном действии.
 */
function missionReady(mission, { user, activity, cases, targets = {} }) {
  switch (mission.action) {
    case 'activity_today':
      // Хватает одного сообщения в чатах Space; если таблицы активности нет —
      // откатываемся на users.last_activity.
      return activity.todayMsgs > 0 || isMskToday(user.last_activity)
    case 'groups_today':
      // Разные чаты: бот пишет в groups_activity последнюю активность по каждому чату.
      return countActiveGroupsToday(user) >= mission.goal
    case 'messages_today':
      return activity.todayMsgs >= mission.goal
    case 'banana_ready':
      return missionUsedToday(user, mission)
    case 'bag_ready':
      return missionUsedToday(user, mission)
    case 'roulette_ready':
      // roulette_last_activity обновляется, когда игрок делает ставку в рулетке.
      return isMskToday(user.roulette_last_activity)
    case 'case_open_today':
      return cases.today > 0
    case 'week_messages':
      return activity.weekMsgs >= mission.goal
    case 'week_active_days':
      return activity.weekDays >= mission.goal
    case 'subscribe_targets': {
      // Цели проверяет Telegram (см. checkMissionTargets): задание готово,
      // когда выполнены все цели, — их количество и есть цель задания.
      const status = targets[mission.id]

      return Boolean(status && status.total > 0 && status.satisfied >= mission.goal)
    }
    case 'cases_week':
      return cases.week >= mission.goal
    case 'groups_week':
      return countActiveGroupsWeek(user) >= mission.goal
    default:
      return false
  }
}

/**
 * «Сделано сегодня» для функций с кулдауном (банан, мешок удачи): бот ставит
 * кулдаун на N часов вперёд, поэтому момент использования = кулдаун − N часов.
 * Так вчерашняя вечерняя активность не засчитывается сегодня (проверка
 * «кулдаун позже начала суток» ошибочно считала её сегодняшней).
 * `cooldownColumn`/`cooldownHours` приходят из каталога действий
 * (server/missionsApi.js).
 */
function missionUsedToday(user, mission) {
  if (!mission.cooldownColumn || !mission.cooldownHours) {
    return false
  }

  const cooldown = parseDateSafe(user[mission.cooldownColumn])

  if (!cooldown) {
    return false
  }

  const usedAt = cooldown.getTime() - mission.cooldownHours * 60 * 60 * 1000

  return mskDayKey(usedAt) === mskDayKey(Date.now())
}

/** Дата (строка из БД) относится к текущим суткам по МСК. */
function isMskToday(rawDate) {
  const date = parseDateSafe(rawDate)

  return Boolean(date && mskDayKey(date.getTime()) === mskDayKey(Date.now()))
}

// Игровое время (mskDayKey / startOfMskDay / startOfMskWeek), период задания и
// токен награды живут в server/missionsApi.js — там же, где их использует
// админка заданий, чтобы «сброс дня» считался в одном месте.

function normalizeQuantity(value) {
  const quantity = Number(value || 1)
  return Number.isInteger(quantity) && quantity > 0 && quantity <= 10 ? quantity : 1
}

function normalizeNumberList(value) {
  if (Array.isArray(value)) {
    return value.map(Number).filter((item) => Number.isFinite(item))
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(Number).filter((item) => Number.isFinite(item)) : []
    } catch {
      return []
    }
  }

  return []
}

/**
 * Счёт за кейс в Telegram Stars: заказ в БД + инвойс в личку.
 *
 * Цена и название берутся из шаблона кейса (админка «Кейсы»), а в payload
 * кладётся id кейса — по нему оплата вернёт купленные кейсы в баланс.
 */
async function createCasePurchaseOrder(client, chatId, template, quantity) {
  if (!caseForSale(template)) {
    throw new Error('Этот кейс пока нельзя купить за Telegram Stars')
  }

  const caseType = template.id
  const title = caseStoreTitle(template)
  const amountStars = Number(template.stars) * Number(quantity)
  const orderId = crypto.randomBytes(12).toString('hex')
  const invoicePayload = `case:${orderId}:${chatId}:${caseType}:${quantity}`

  await client.query(
    `
    INSERT INTO star_case_orders (
      id, chat_id, case_type, quantity, amount_stars, status, invoice_payload, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, 'pending', $6, now(), now())
    `,
    [orderId, chatId, caseType, quantity, amountStars, invoicePayload],
  )

  const invoiceTitle = quantity > 1 ? `${title} x${quantity}` : title

  await telegramBotApi('sendInvoice', {
    chat_id: chatId,
    title: invoiceTitle,
    description: 'Кейс появится в Mini App сразу после оплаты.',
    payload: invoicePayload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: invoiceTitle, amount: amountStars }],
  })

  return {
    orderId,
    delivery: 'dm',
    amountStars,
    quantity,
    caseType,
  }
}

async function syncCasePurchaseOrder(client, chatId, orderId) {
  const result = await client.query(
    `
    SELECT *
    FROM star_case_orders
    WHERE id = $1 AND chat_id = $2
    FOR UPDATE
    `,
    [orderId, chatId],
  )

  if (result.rowCount === 0) {
    throw new Error('Заказ не найден')
  }

  const order = result.rows[0]

  if (order.status === 'fulfilled') {
    return order
  }

  const transaction = await findMatchingStarTransaction(order)

  if (!transaction) {
    return order
  }

  return fulfillCaseOrder(client, order, transaction)
}

/** Тариф VIP по id из запроса или `null`, если такого тарифа нет. */
function vipPlanById(rawPlanId) {
  const planId = String(rawPlanId || '').trim()

  return vipPlans.find((plan) => plan.id === planId) || null
}

/**
 * Тексты счёта на языке клиента (`Accept-Language`), с откатом на русский.
 * В заголовок попадает срок тарифа: «VIP-подписка Space · 180 дн.».
 */
function vipInvoiceText(plan, rawLocale) {
  const base = String(rawLocale || '')
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .split('-')[0]
  const text = vipInvoiceTexts[base] || vipInvoiceTexts.ru

  return {
    title: `${text.title} · ${text.period.replace('{days}', Number(plan?.days) || 0)}`,
    description: text.description,
  }
}

/**
 * Счёт за VIP-подписку: заказ в БД + ссылка для `WebApp.openInvoice`.
 *
 * `createInvoiceLink` (а не `sendInvoice`) выбран специально: оплата открывается
 * шторкой прямо в Mini App, а не уходит сообщением в личку бота. Срок кладётся
 * в payload — по нему `answerPreCheckoutQuery` сверяет оплату, а успешный платёж
 * продлевает `vip_users`.
 */
async function createVipPurchaseOrder(client, chatId, plan, text) {
  const orderId = crypto.randomBytes(12).toString('hex')
  const invoicePayload = `vip:${orderId}:${chatId}:${plan.id}:${plan.days}`
  const amountStars = Number(plan.stars)

  await client.query(
    `
    INSERT INTO star_vip_orders (
      id, chat_id, plan_id, days, amount_stars, status, invoice_payload, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, 'pending', $6, now(), now())
    `,
    [orderId, chatId, plan.id, plan.days, amountStars, invoicePayload],
  )

  const invoiceLink = await telegramBotApi('createInvoiceLink', {
    title: text.title,
    description: text.description,
    payload: invoicePayload,
    currency: 'XTR',
    prices: [{ label: text.title, amount: amountStars }],
  })

  await client.query(
    'UPDATE star_vip_orders SET invoice_link = $2, updated_at = now() WHERE id = $1',
    [orderId, String(invoiceLink || '')],
  )

  return {
    orderId,
    invoiceLink: String(invoiceLink || ''),
    amountStars,
    days: plan.days,
    planId: plan.id,
  }
}

/**
 * Досчёт VIP-заказа после оплаты (клиент зовёт это сразу после закрытия счёта).
 *
 * Если relay не дошёл, факт оплаты ищем в `getStarTransactions` — тот же путь,
 * что и у кейсов. `null` означает «это не VIP-заказ»: тогда вызывающий код
 * смотрит таблицу кейсов.
 */
async function syncVipPurchaseOrder(client, chatId, orderId) {
  const result = await client.query(
    `
    SELECT *
    FROM star_vip_orders
    WHERE id = $1 AND chat_id = $2
    FOR UPDATE
    `,
    [orderId, chatId],
  )

  if (result.rowCount === 0) {
    return null
  }

  const order = result.rows[0]

  if (order.status === 'fulfilled') {
    return order
  }

  const transaction = await findMatchingStarTransaction(order)

  if (!transaction) {
    return order
  }

  return fulfillVipOrder(client, order, transaction)
}

/** Выдача оплаченной подписки: дни уходят в `vip_users`, заказ закрывается. */
async function fulfillVipOrder(client, order, transaction) {
  if (order.status === 'fulfilled') {
    return order
  }

  await extendVipMembership(client, order.chat_id, Number(order.days || 0))

  const updateResult = await client.query(
    `
    UPDATE star_vip_orders
    SET status = 'fulfilled',
        telegram_payment_charge_id = $2,
        paid_at = to_timestamp($3),
        fulfilled_at = now(),
        updated_at = now(),
        payment_payload = $4::jsonb
    WHERE id = $1
    RETURNING *
    `,
    [
      order.id,
      String(transaction.id || ''),
      Number(transaction.date || Math.floor(Date.now() / 1000)),
      JSON.stringify(transaction || {}),
    ],
  )

  return updateResult.rows[0]
}

/**
 * Продление VIP в таблице бота `vip_users` (общая база Space).
 * Активная подписка продлевается от текущего срока, истёкшая начинается заново
 * от now() — оплаченные дни не сгорают и не теряются.
 */
async function extendVipMembership(client, chatId, days) {
  const amount = Math.max(1, Math.floor(Number(days) || 0))

  await client.query(
    `
    INSERT INTO vip_users (user_id, start_date, end_date)
    VALUES ($1, now(), now() + ($2 || ' days')::interval)
    ON CONFLICT (user_id) DO UPDATE
    SET start_date =
          CASE
            WHEN vip_users.end_date > now() THEN vip_users.start_date
            ELSE now()
          END,
        end_date =
          CASE
            WHEN vip_users.end_date > now()
              THEN vip_users.end_date + ($2 || ' days')::interval
            ELSE now() + ($2 || ' days')::interval
          END
    `,
    [chatId, amount],
  )
}

/**
 * Текущий VIP для bootstrap: активен ли, до какого числа и сколько дней осталось.
 * Таблица принадлежит боту, поэтому недоступность `vip_users` не должна ломать
 * весь профиль — в этом случае показываем «VIP не активен».
 */
async function getVipStatus(client, chatId) {
  const result = await client
    .query('SELECT end_date FROM vip_users WHERE user_id = $1 LIMIT 1', [chatId])
    .catch((error) => {
      console.warn('VIP-подписки недоступны:', error.message)
      return { rows: [] }
    })
  const endDate = result.rows[0]?.end_date || null
  const until = endDate ? new Date(endDate) : null

  if (!until || Number.isNaN(until.getTime())) {
    return { active: false, until: null, daysLeft: 0 }
  }

  const daysLeft = Math.max(0, Math.ceil((until.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))

  return {
    active: daysLeft > 0,
    until: until.toISOString(),
    daysLeft,
  }
}

async function handlePaymentRelayUpdate(update) {
  if (update.pre_checkout_query) {
    await handlePreCheckoutQuery(update.pre_checkout_query)
    return
  }

  if (update.message?.successful_payment?.currency === 'XTR') {
    await handleSuccessfulPaymentMessage(update.message)
  }
}

async function handlePreCheckoutQuery(query) {
  try {
    const payload = parseInvoicePayload(query.invoice_payload)
    const client = await pool.connect()

    try {
      const matches = await orderMatchesPayment(client, payload, Number(query.total_amount || 0))

      await telegramBotApi('answerPreCheckoutQuery', {
        pre_checkout_query_id: query.id,
        ok: matches,
        ...(matches ? {} : { error_message: 'Заказ для оплаты не найден или устарел.' }),
      })
    } finally {
      client.release()
    }
  } catch (error) {
    await telegramBotApi('answerPreCheckoutQuery', {
      pre_checkout_query_id: query.id,
      ok: false,
      error_message: 'Не удалось проверить заказ.',
    }).catch(() => {})
    throw error
  }
}

/**
 * Сверка заказа со счётом Telegram: сумма и состав заказа должны совпадать.
 * Кейсы и VIP-подписки живут в разных таблицах, поэтому ветка выбирается по
 * типу payload.
 */
async function orderMatchesPayment(client, payload, totalAmount) {
  if (payload.kind === 'vip') {
    const result = await client.query(
      `
      SELECT id
      FROM star_vip_orders
      WHERE id = $1 AND chat_id = $2 AND plan_id = $3 AND days = $4 AND amount_stars = $5
      LIMIT 1
      `,
      [payload.orderId, payload.chatId, payload.planId, payload.days, totalAmount],
    )

    return result.rowCount > 0
  }

  const result = await client.query(
    `
    SELECT id
    FROM star_case_orders
    WHERE id = $1 AND chat_id = $2 AND case_type = $3 AND quantity = $4 AND amount_stars = $5
    LIMIT 1
    `,
    [payload.orderId, payload.chatId, payload.caseType, payload.quantity, totalAmount],
  )

  return result.rowCount > 0
}

async function handleSuccessfulPaymentMessage(message) {
  const payment = message.successful_payment
  const payload = parseInvoicePayload(payment.invoice_payload)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const order = await findOrderForUpdate(client, payload)

    if (!order) {
      await client.query('ROLLBACK')
      return
    }

    if (order.status === 'fulfilled') {
      await client.query('COMMIT')
      return
    }

    await fulfillOrder(client, payload, order, {
      id: payment.telegram_payment_charge_id,
      amount: payment.total_amount,
      date: Math.floor(Date.now() / 1000),
      source: {
        type: 'user',
        user: { id: payload.chatId },
        invoice_payload: payment.invoice_payload,
      },
    })

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Заказ из payload, заблокированный на время выдачи (кейсы или VIP). */
async function findOrderForUpdate(client, payload) {
  const table = payload.kind === 'vip' ? 'star_vip_orders' : 'star_case_orders'
  const result = await client.query(
    `
    SELECT *
    FROM ${table}
    WHERE id = $1 AND chat_id = $2
    FOR UPDATE
    `,
    [payload.orderId, payload.chatId],
  )

  return result.rows[0] || null
}

/** Выдача оплаченного заказа: кейсы в баланс или дни VIP в подписку. */
async function fulfillOrder(client, payload, order, transaction) {
  if (payload.kind === 'vip') {
    return fulfillVipOrder(client, order, transaction)
  }

  return fulfillCaseOrder(client, order, transaction)
}

/**
 * Разбор payload инвойса. Каталог кейсов здесь не проверяется: id кейса уже
 * лежит в заказе (`star_case_orders`), а сам кейс владелец мог удалить после
 * покупки — оплаченные кейсы всё равно должны дойти до баланса.
 *
 * VIP-заказы (payload `vip:orderId:chatId:planId:days`) разбираются здесь же,
 * чтобы оплата кейсов и подписки шла одним и тем же путём.
 */
function parseInvoicePayload(rawPayload) {
  const payload = String(rawPayload || '')
  const [kind, orderId, chatIdRaw, fourth, fifth] = payload.split(':')

  if ((kind !== 'case' && kind !== 'vip') || !orderId || !fourth) {
    throw new Error('Неизвестный invoice payload')
  }

  if (kind === 'vip') {
    return {
      kind: 'vip',
      orderId,
      chatId: Number(chatIdRaw),
      planId: fourth,
      days: Number(fifth || 0),
    }
  }

  return {
    kind: 'case',
    orderId,
    chatId: Number(chatIdRaw),
    caseType: fourth,
    quantity: normalizeQuantity(fifth),
  }
}

async function findMatchingStarTransaction(order) {
  const transactions = await telegramBotApi('getStarTransactions', {
    offset: 0,
    limit: 100,
  })

  const list = Array.isArray(transactions?.transactions) ? transactions.transactions : []

  return (
    list.find((transaction) => {
      const source = transaction?.source

      return (
        source?.type === 'user' &&
        source?.transaction_type === 'invoice_payment' &&
        String(source?.invoice_payload || '') === String(order.invoice_payload || '') &&
        Number(source?.user?.id || 0) === Number(order.chat_id || 0) &&
        Number(transaction?.amount || 0) === Number(order.amount_stars || 0)
      )
    }) || null
  )
}

async function fulfillCaseOrder(client, order, transaction) {
  if (order.status === 'fulfilled') {
    return order
  }

  await incrementCaseBalance(client, order.chat_id, order.case_type, Number(order.quantity || 1))

  const updateResult = await client.query(
    `
    UPDATE star_case_orders
    SET status = 'fulfilled',
        telegram_payment_charge_id = $2,
        paid_at = to_timestamp($3),
        fulfilled_at = now(),
        updated_at = now(),
        payment_payload = $4::jsonb
    WHERE id = $1
    RETURNING *
    `,
    [
      order.id,
      String(transaction.id || ''),
      Number(transaction.date || Math.floor(Date.now() / 1000)),
      JSON.stringify(transaction || {}),
    ],
  )

  return updateResult.rows[0]
}

async function telegramBotApi(method, payload) {
  if (!botToken) {
    throw new Error('BOT_TOKEN не настроен на сервере')
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload || {}),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram Bot API error in ${method}`)
  }

  return result.result
}

/**
 * Лог в чат кейсов.
 *
 * Лог провала — единственный след обращения игрока, поэтому его повторяем; если
 * Telegram не принял и со второй попытки, текст уходит в журнал сервера: без лога
 * обращение закрывать нечем.
 */
async function sendCaseLog(text, { required = false } = {}) {
  if (!caseResultsChatId || !botToken) {
    console.warn('[cases] логи открытий выключены: не заданы CASE_RESULTS_CHAT_ID или BOT_TOKEN')
    return false
  }

  const attempts = required ? 2 : 1

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await telegramBotApi('sendMessage', {
        chat_id: caseResultsChatId,
        ...(caseResultsThreadId ? { message_thread_id: Number(caseResultsThreadId) } : {}),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        text,
      })

      return true
    } catch (error) {
      console.error(`[cases] лог открытия не отправлен (попытка ${attempt}):`, error?.message || error)
    }
  }

  return false
}

/** Открытие кейса: подробный лог с наградой и способом выдачи подарка. */
async function notifyCaseOpening(telegramUser, template, reward, incident = '', delivery = null) {
  const user = await getPublicUser(telegramUser.id).catch(() => null)

  await sendCaseLog(buildCaseOpeningLog({ telegramUser, user, template, reward, delivery, incident }))
}

/**
 * Провал открытия: подарок не ушёл или кейс упал с ошибкой.
 *
 * Лог обязателен, поэтому его дожидаемся (с повтором) и дублируем причину в
 * журнал сервера — даже если Telegram недоступен, обращение будет чем закрыть.
 */
async function notifyCaseFailure(telegramUser, template, error, incident = '', { reward = null } = {}) {
  const user = await getPublicUser(telegramUser.id).catch(() => null)
  const text = buildCaseFailureLog({ telegramUser, user, template, error, incident, reward })

  console.error(`[cases] кейс не открылся (код ${incident || '—'}):`, error?.message || error)

  if (!(await sendCaseLog(text, { required: true }))) {
    console.error(`[cases] лог провала не ушёл в Telegram, текст ниже:\n${text}`)
  }
}

async function getPublicUser(chatId) {
  const result = await pool.query('SELECT name, username FROM users WHERE chat_id = $1 LIMIT 1', [chatId])
  return result.rows[0] || null
}

function activeCaseSql(alias) {
  return `
    CASE
      WHEN ${alias}.category = 'titles' AND ${alias}.id = $2 THEN true
      WHEN ${alias}.category IN ('emojis', 'premium_emojis') AND ${alias}.id = $3 THEN true
      WHEN ${alias}.category = 'replies' AND ${alias}.id = $4 THEN true
      WHEN ${alias}.category = 'greetings' AND ${alias}.id = $5 THEN true
      WHEN ${alias}.category = 'buttons' AND ${alias}.id = $6 THEN true
      WHEN ${alias}.category LIKE 'chart_skin_%' AND ${alias}.id = $7 THEN true
      ELSE false
    END
  `
}

function activeQueryValues(chatId, user) {
  return [
    chatId,
    Number(user.active_title_id || 0),
    Number(user.active_emoji_id || 0),
    Number(user.active_reply_id || 0),
    Number(user.active_greeting_id || 0),
    Number(user.active_button_id || 0),
    Number(user.active_chart_id || 0),
  ]
}

async function userOwnsItem(client, chatId, itemId) {
  const result = await client.query('SELECT 1 FROM inventory WHERE chat_id = $1 AND item_id = $2', [
    chatId,
    itemId,
  ])

  return result.rowCount > 0
}

/**
 * Открытие кейса: списываем один кейс с баланса, крутим награду и пишем историю
 * (журнал `case_openings` показывает приложение в разделе «История»).
 *
 * Возвращает пару «награда + способ выдачи»: `delivery` заполняется только у
 * подарков и нужен логу админов, в базу и в ответ приложения он не попадает.
 */
async function openCaseAndGrantReward(client, chatId, template, options = {}) {
  const caseType = template.id

  await takeCaseFromBalance(client, chatId, caseType)

  const { reward, delivery } = await createCaseReward(client, chatId, template, options)

  await client.query(
    `
    INSERT INTO case_openings (chat_id, case_type, reward_type, reward_code, reward_title, reward_payload)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [chatId, caseType, reward.type, reward.code || null, reward.title, JSON.stringify(reward.payload || {})],
  )

  return { reward, delivery }
}

/**
 * Списывает один кейс с баланса пользователя.
 *
 * Старые кейсы — колонка в `case_balances` (её видит бот), новые — строка в
 * `mini_app_case_balances`. Строка берётся `FOR UPDATE`, чтобы два открытия
 * подряд не ушли в минус.
 */
async function takeCaseFromBalance(client, chatId, caseType) {
  if (caseBalanceColumns.includes(caseType)) {
    const balanceResult = await client.query(
      `SELECT ${caseType} FROM case_balances WHERE chat_id = $1 FOR UPDATE`,
      [chatId],
    )

    if (Number(balanceResult.rows[0]?.[caseType] || 0) <= 0) {
      throw new Error('Этот кейс закончился')
    }

    await client.query(
      `
      INSERT INTO case_balances (chat_id, ${caseType}, updated_at)
      VALUES ($1, 0, now())
      ON CONFLICT (chat_id) DO NOTHING
      `,
      [chatId],
    )

    await client.query(`UPDATE case_balances SET ${caseType} = ${caseType} - 1, updated_at = now() WHERE chat_id = $1`, [
      chatId,
    ])

    return
  }

  const balanceResult = await client.query(
    `
    SELECT amount
    FROM mini_app_case_balances
    WHERE chat_id = $1 AND case_id = $2
    FOR UPDATE
    `,
    [chatId, caseType],
  )

  if (Number(balanceResult.rows[0]?.amount || 0) <= 0) {
    throw new Error('Этот кейс закончился')
  }

  await client.query(
    `
    UPDATE mini_app_case_balances
    SET amount = amount - 1,
        updated_at = now()
    WHERE chat_id = $1 AND case_id = $2
    `,
    [chatId, caseType],
  )
}

/**
 * Случайный приз из наполнения кейса.
 *
 * Наполнение (`template.contents`) — взвешенный пул строк: монеты, астроны, VIP,
 * конкретный скин графика, случайный предмет маркета или подарок Telegram.
 *
 * Возвращает `{ reward, delivery }`: у подарка выдачу целиком решает
 * `caseGiftDelivery` (`server/caseGifts.js`) — она же собирает данные для лога
 * админов, поэтому способ доставки возвращаем наружу.
 */
async function createCaseReward(client, chatId, template, options = {}) {
  const row = pickWeightedContent(template.contents)
  /** Награда без доставки: монетам и скинам лог о подарке не нужен. */
  const simple = (reward) => ({ reward, delivery: null })

  if (!row) {
    // Кейс без наполнения открыть нельзя (админка не сохранит пустой пул),
    // но если строка битая — не оставляем игрока без награды.
    return simple(await grantCoinsReward(client, chatId, { type: 'coins', min: 100, max: 500 }))
  }

  if (row.type === 'coins') {
    return simple(await grantCoinsReward(client, chatId, row))
  }

  if (row.type === 'starcoins') {
    return simple(await grantStarcoinsReward(client, chatId, row))
  }

  if (row.type === 'vip') {
    return simple(await grantVipReward(client, chatId, row))
  }

  if (row.type === 'chart_skin') {
    return simple(await grantChartSkinReward(client, chatId, row))
  }

  if (row.type === 'shop_item') {
    return simple(await grantShopItemReward(client, chatId))
  }

  // Подарок Telegram: уникальный передаёт юзербот, обычный дарит бот — разбор
  // способа и откат при сбое внутри `deliverGift`. Отсюда `giftId` и `giftKind`
  // приходят в награду, чтобы приложение показало именно этот подарок.
  return caseGiftDelivery.deliverGift({ client, chatId, row, template, ...options })
}

/**
 * Взвешенный выбор строки наполнения. Веса — доли и бывают дробными (3.2, 0.8),
 * поэтому они приводятся к целым «тысячным», а случайность берётся из CSPRNG:
 * кейсы покупаются за Telegram Stars, здесь нельзя полагаться на Math.random().
 */
function pickWeightedContent(contents) {
  const pool = (Array.isArray(contents) ? contents : []).map((row) => ({
    row,
    weight: Math.max(0, Math.round(Number(row?.weight || 0) * 1000)),
  }))
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0)

  if (totalWeight <= 0) {
    return null
  }

  let roll = crypto.randomInt(0, totalWeight)

  for (const item of pool) {
    if (roll < item.weight) {
      return item.row
    }

    roll -= item.weight
  }

  return pool[0]?.row || null
}

/** Случайное количество из диапазона строки наполнения (`min`/`max` из админки). */
function randomRewardAmount(row, fallbackMin, fallbackMax) {
  const min = Math.max(0, Math.round(Number(row?.min ?? fallbackMin)))
  const max = Math.max(min, Math.round(Number(row?.max ?? fallbackMax)))

  return randomInt(min, max)
}

async function grantCoinsReward(client, chatId, row) {
  const amount = randomRewardAmount(row, 100, 500)

  await client.query('UPDATE users SET coins = coins + $1 WHERE chat_id = $2', [amount, chatId])

  return {
    type: 'coins',
    title: `+${amount} монет`,
    description: 'Монеты уже добавлены на баланс.',
    payload: { amount },
  }
}

async function grantStarcoinsReward(client, chatId, row) {
  const amount = randomRewardAmount(row, 5, 25)

  await client.query('UPDATE users SET starcoins = COALESCE(starcoins, 0) + $1 WHERE chat_id = $2', [amount, chatId])

  return {
    type: 'starcoins',
    title: `+${amount} астронов`,
    description: 'Астроны уже начислены в профиль.',
    payload: { amount },
  }
}

async function grantShopItemReward(client, chatId) {
  const result = await client.query(
    `
    SELECT si.*
    FROM shop_items si
    WHERE COALESCE(si.price, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory i
        WHERE i.chat_id = $1 AND i.item_id = si.id
      )
    ORDER BY random()
    LIMIT 1
    `,
    [chatId],
  )

  if (result.rowCount === 0) {
    return grantStarcoinsReward(client, chatId, { min: 5, max: 30 })
  }

  const item = result.rows[0]

  await client.query('INSERT INTO inventory (chat_id, item_id) VALUES ($1, $2)', [chatId, item.id])

  return {
    type: 'shop_item',
    code: String(item.id),
    title: item.text_m || item.text_f || `Предмет #${item.id}`,
    description: 'Предмет добавлен в коллекцию.',
    payload: { itemId: item.id, category: item.category },
  }
}

/**
 * Конкретный скин графика из наполнения кейса (`itemId` строки). Если скин уже
 * есть в коллекции (или владелец удалил предмет), награда заменяется астронами.
 */
async function grantChartSkinReward(client, chatId, row) {
  const itemId = Number(row.itemId)
  const itemResult = await client.query(
    'SELECT id, category, text_m, text_f FROM shop_items WHERE id = $1',
    [itemId],
  )

  if (itemResult.rowCount === 0 || (await userOwnsItem(client, chatId, itemId))) {
    return grantStarcoinsReward(client, chatId, { min: 5, max: 30 })
  }

  const item = itemResult.rows[0]

  await client.query('INSERT INTO inventory (chat_id, item_id) VALUES ($1, $2)', [chatId, item.id])

  return {
    type: 'chart_skin',
    code: String(item.id),
    title: item.text_m || item.text_f || `Скин #${item.id}`,
    description: 'Скин графика добавлен в коллекцию.',
    payload: { itemId: item.id, category: item.category },
  }
}

async function grantVipReward(client, chatId, row) {
  const days = Math.max(1, randomRewardAmount(row, 1, 3))

  // Та же выдача дней, что и при покупке VIP за звёзды: срок складывается с уже
  // оплаченным, а не сбрасывает подписку.
  await extendVipMembership(client, chatId, days)

  return {
    type: 'vip',
    title: `VIP на ${days} дн.`,
    description: 'VIP уже продлен в базе.',
    payload: { days },
  }
}

/**
 * Внутренний подарок: «мишка» в коллекцию профиля.
 *
 * Это запасной путь (`CASE_GIFT_DELIVERY=internal` или строка наполнения без
 * подарка Telegram), а также выдача, которую выбирает `deliverGift`, когда
 * реальный подарок отправить нечем. Наружу подарок не уходит — только запись в
 * коллекции, поэтому лог такой выдачи помечен как внутренняя.
 */
async function grantGiftReward(client, chatId) {
  await client.query(
    `
    INSERT INTO gift_balances (chat_id, gift_code, amount, updated_at)
    VALUES ($1, 'bear', 1, now())
    ON CONFLICT (chat_id, gift_code) DO UPDATE
    SET amount = gift_balances.amount + 1,
        updated_at = now()
    `,
    [chatId],
  )

  return {
    type: 'gift',
    code: 'bear',
    giftCode: 'bear',
    title: 'Мишка Telegram',
    description: 'Подарок добавлен в коллекцию профиля.',
    payload: { amount: 1 },
  }
}

function getActiveColumn(category) {
  if (category.startsWith('chart_skin_')) {
    return 'active_chart_id'
  }

  return activeColumnByCategory[category]
}

/**
 * Начисляет кейсы на баланс: старые кейсы — в колонку `case_balances` (их видит
 * бот и задания), новые — в `mini_app_case_balances`. Вызывается оплатой Stars и
 * наградами за задания/вехи.
 */
async function incrementCaseBalance(client, chatId, caseType, amount) {
  if (caseBalanceColumns.includes(caseType)) {
    await client.query(
      `
      INSERT INTO case_balances (chat_id, ${caseType}, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (chat_id) DO UPDATE
      SET ${caseType} = case_balances.${caseType} + $2,
          updated_at = now()
      `,
      [chatId, amount],
    )

    return
  }

  await client.query(
    `
    INSERT INTO mini_app_case_balances (chat_id, case_id, amount, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (chat_id, case_id) DO UPDATE
    SET amount = mini_app_case_balances.amount + $3,
        updated_at = now()
    `,
    [chatId, caseType, amount],
  )
}

async function getAdminUserPayload(client, chatId) {
  const userResult = await client.query(
    `
    SELECT id, chat_id, banana, coins, msg_count, name, username, last_activity,
           starcoins, groups, created_at, lang, rp_access_until,
           active_title_id, active_emoji_id, active_reply_id,
           active_greeting_id, active_button_id, active_chart_id
    FROM users
    WHERE chat_id = $1
    `,
    [chatId],
  )

  if (userResult.rowCount === 0) {
    return null
  }

  const user = userResult.rows[0]
  const [banResult, spamResult, marriage, activeItems, inventoryCountResult, cases] = await Promise.all([
    client.query('SELECT id, chat_id, created_at FROM banlist WHERE chat_id = $1 LIMIT 1', [chatId]),
    client.query('SELECT id, chat_id, created_at, auto, reason FROM spamlist WHERE chat_id = $1 LIMIT 1', [
      chatId,
    ]),
    getMarriage(client, chatId),
    getActiveItems(client, user),
    client.query('SELECT COUNT(*)::int AS count FROM inventory WHERE chat_id = $1', [chatId]),
    getCaseBalances(client, chatId),
  ])

  return {
    user,
    ban: banResult.rows[0] || null,
    spam: spamResult.rows[0] || null,
    marriage,
    activeItems,
    inventoryCount: Number(inventoryCountResult.rows[0]?.count || 0),
    cases,
  }
}

/**
 * Настроенные способы входа: хеши фигуры и кода лежат в единственной строке
 * таблицы `owner`. Пустое значение означает «способ не задан».
 *
 * `off` — выключатель защиты: владелец может заходить в админку вообще без
 * пароля, тогда фигура и код не спрашиваются (строку всё равно находим, даже
 * если оба хеша пустые, — иначе флаг было бы негде прочитать).
 */
async function getStoredAdminAccess(client) {
  const columns = ['mini_app_pattern_hash']
  const conditions = ['mini_app_pattern_hash IS NOT NULL']

  if (adminCodeColumnReady) {
    columns.push('mini_app_code_hash')
    conditions.push('mini_app_code_hash IS NOT NULL')
  }

  if (adminAccessOffColumnReady) {
    columns.push('mini_app_access_off')
    conditions.push('mini_app_access_off IS TRUE')
  }

  const result = await client.query(
    `SELECT ${columns.join(', ')} FROM owner WHERE ${conditions.join(' OR ')} LIMIT 1`,
  )
  const row = result.rows[0] || {}

  return {
    pattern: String(row.mini_app_pattern_hash || ''),
    code: adminCodeColumnReady ? String(row.mini_app_code_hash || '') : '',
    off: adminAccessOffColumnReady ? Boolean(row.mini_app_access_off) : false,
  }
}

/**
 * Ответ по способам входа: что настроено, какой длины код и выключена ли защита
 * («вход без пароля»). `disabled` клиент использует, чтобы сразу войти владельцу.
 */
function adminAccessPayload(access) {
  return {
    methods: { pattern: Boolean(access.pattern), code: Boolean(access.code) },
    codeLength: adminCodeLength(access.code),
    disabled: Boolean(access.off),
  }
}

async function saveAdminPattern(client, pattern) {
  return client.query('UPDATE owner SET mini_app_pattern_hash = $1', [hashAdminPattern(pattern)])
}

async function saveAdminCredential(client, type, value) {
  return type === 'code'
    ? client.query('UPDATE owner SET mini_app_code_hash = $1', [hashAdminCredential('code', value)])
    : saveAdminPattern(client, value)
}

async function clearAdminCredential(client, type) {
  return type === 'code'
    ? client.query('UPDATE owner SET mini_app_code_hash = NULL')
    : client.query('UPDATE owner SET mini_app_pattern_hash = NULL')
}

function createAdminSession(chatId) {
  const token = crypto.randomBytes(32).toString('hex')
  adminSessions.set(token, {
    chatId,
    expiresAt: Date.now() + adminSessionMs,
  })

  return token
}

function normalizePattern(value) {
  const dots = Array.isArray(value)
    ? value.map(Number)
    : String(value || '')
        .split(/[-,\s]+/)
        .filter(Boolean)
        .map(Number)

  const uniqueDots = [...new Set(dots)]
  const valid = uniqueDots.length >= 4 && uniqueDots.every((dot) => Number.isInteger(dot) && dot >= 0 && dot <= 8)

  if (!valid || uniqueDots.length !== dots.length) {
    throw new Error('Фигура должна содержать минимум 4 разные точки')
  }

  return dots.join('-')
}

function hashAdminPattern(pattern) {
  return hashAdminCredential('pattern', pattern)
}

/** Хеш значения: `v1:<соль>:<хеш>` для фигуры и `v2:<длина>:<соль>:<хеш>` для кода. */
function hashAdminCredential(type, value) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = sha256Hex(salt, value)

  return type === 'code' ? `v2:${value.length}:${salt}:${hash}` : `v1:${salt}:${hash}`
}

/**
 * Проверка фигуры (`v1:`) или кода (`v2:`) по сохранённому хешу.
 * Сравнение идёт через timingSafeEqual, чтобы хеш нельзя было подобрать по времени.
 */
function verifyAdminCredential(type, value, storedValue) {
  const stored = String(storedValue || '').trim()

  if (type === 'code') {
    if (!stored.startsWith('v2:')) {
      return stored === value
    }

    const [, , salt, hash] = stored.split(':')

    return safeEqualHex(sha256Hex(salt, value), hash)
  }

  if (stored.startsWith('v1:')) {
    const [, salt, hash] = stored.split(':')

    return safeEqualHex(sha256Hex(salt, value), hash)
  }

  return stored === value
}

/** Длина кода лежит в самом хеше (`v2:<длина>:...`), отдельная колонка не нужна. */
function adminCodeLength(stored) {
  const [, length] = String(stored || '').split(':')
  const parsed = Number(length)

  return adminCodeLengths.includes(parsed) ? parsed : adminCodeLengths[0]
}

function sha256Hex(salt, value) {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex')
}

/** Код доступа: ровно 4 или 8 цифр. */
function normalizeCode(value) {
  const digits = String(value ?? '').trim()

  if (!adminCodeLengths.includes(digits.length) || !/^\d+$/.test(digits)) {
    throw new Error('Код доступа: 4 или 8 цифр')
  }

  return digits
}

function normalizeAdminCredential(type, value) {
  return type === 'code' ? normalizeCode(value) : normalizePattern(value)
}

/**
 * Значение из тела запроса на вход: `{ pattern: [...] }` или `{ code: '1234' }`.
 * Возвращает `{ type, value }` либо `{ error }` с текстом для ответа 400.
 */
function readLoginCredential(body) {
  const rawPattern = body?.pattern
  const rawCode = body?.code
  const hasPattern = rawPattern !== undefined && rawPattern !== null && String(rawPattern).trim() !== ''
  const hasCode = rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== ''

  try {
    if (hasPattern) {
      return { type: 'pattern', value: normalizePattern(rawPattern) }
    }

    if (hasCode) {
      return { type: 'code', value: normalizeCode(rawCode) }
    }
  } catch (error) {
    return { error: error.message }
  }

  return { error: 'Введи фигуру или код доступа' }
}

/**
 * Таблица VIP-заказов (`star_vip_orders`) создаётся идемпотентно.
 *
 * Тарифы и цены лежат в коде (`vipPlans`), поэтому наполнять нечего — нужна
 * только схема. Если у приложения нет прав `CREATE`, таблицу заводит владелец БД
 * по server/admin_setup.sql, а покупка VIP вернёт понятную ошибку.
 */
async function ensureVipOrdersSchema(pool) {
  const client = await pool.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS star_vip_orders (
        id text PRIMARY KEY,
        chat_id bigint NOT NULL,
        plan_id text NOT NULL,
        days integer NOT NULL,
        amount_stars integer NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        invoice_payload text NOT NULL UNIQUE,
        invoice_link text,
        telegram_payment_charge_id text,
        payment_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        paid_at timestamp with time zone,
        fulfilled_at timestamp with time zone,
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `)
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_star_vip_orders_chat_id ON star_vip_orders (chat_id, created_at DESC)',
    )
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_star_vip_orders_status ON star_vip_orders (status, created_at DESC)',
    )

    return true
  } finally {
    client.release()
  }
}

/**
 * Колонки доступа админки: `mini_app_pattern_hash` (фигура) и
 * `mini_app_code_hash` (числовой код). Добавляются идемпотентно при старте.
 *
 * Сначала смотрим каталог: если колонки уже есть (например, их добавил
 * владелец БД по server/admin_setup.sql), права `ALTER` приложению не нужны.
 * Иначе `ALTER TABLE owner` под не-владельцем таблицы падает с «must be owner
 * of table owner», и вход по коду оставался бы выключенным
 * (`adminCodeColumnReady = false`) даже при готовых колонках.
 */
async function ensureAdminAccessSchema(pool) {
  const client = await pool.connect()

  try {
    const columns = await adminAccessColumns(client)
    adminCodeColumnReady = columns.code
    adminAccessOffColumnReady = columns.off

    if (columns.code && columns.off) {
      return true
    }

    await client.query('ALTER TABLE owner ADD COLUMN IF NOT EXISTS mini_app_pattern_hash text')
    await client.query('ALTER TABLE owner ADD COLUMN IF NOT EXISTS mini_app_code_hash text')
    await client.query(
      'ALTER TABLE owner ADD COLUMN IF NOT EXISTS mini_app_access_off boolean NOT NULL DEFAULT false',
    )
    adminCodeColumnReady = true
    adminAccessOffColumnReady = true

    return true
  } finally {
    client.release()
  }
}

/**
 * Какие колонки доступа уже есть в таблице `owner`. Смотрим каталог по той
 * таблице `owner`, которую нашёл бы неполный запрос приложения
 * (pg_table_is_visible учитывает `search_path`), поэтому права `ALTER` для
 * проверки не нужны.
 */
async function adminAccessColumns(client) {
  const result = await client.query(
    `SELECT a.attname
     FROM pg_catalog.pg_attribute a
     JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
     WHERE c.relname = 'owner'
       AND pg_catalog.pg_table_is_visible(c.oid)
       AND NOT a.attisdropped
       AND a.attname IN ('mini_app_pattern_hash', 'mini_app_code_hash', 'mini_app_access_off')`,
  )
  const names = new Set(result.rows.map((row) => row.attname))

  return {
    code: names.has('mini_app_code_hash'),
    off: names.has('mini_app_access_off'),
  }
}

/**
 * Доступна ли колонка кода доступа. Флаг поднимается при старте, но колонку
 * владелец БД может добавить уже во время работы приложения — тогда перечитываем
 * каталог, чтобы вход по коду включался без перезапуска API.
 */
async function adminCodeColumnAvailable() {
  if (adminCodeColumnReady) {
    return true
  }

  const client = await pool.connect()

  try {
    adminCodeColumnReady = (await adminAccessColumns(client)).code

    return adminCodeColumnReady
  } catch (error) {
    console.warn('Проверка колонки owner.mini_app_code_hash недоступна:', error.message)

    return false
  } finally {
    client.release()
  }
}

/**
 * Доступна ли колонка `owner.mini_app_access_off` («вход без пароля») и что в ней
 * сейчас. Работает как проверка колонки кода: перечитывает каталог, поэтому
 * ручной `ALTER` владельца БД включает тумблер без перезапуска API.
 */
async function adminAccessOffColumnAvailable() {
  if (adminAccessOffColumnReady) {
    return true
  }

  const client = await pool.connect()

  try {
    adminAccessOffColumnReady = (await adminAccessColumns(client)).off

    return adminAccessOffColumnReady
  } catch (error) {
    console.warn('Проверка колонки owner.mini_app_access_off недоступна:', error.message)

    return false
  } finally {
    client.release()
  }
}

function safeEqualHex(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false
  }

  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

// ── Владелец бота ───────────────────────────────────────────────────────────
/**
 * chat_id владельцев из окружения: OWNER_CHAT_ID (можно перечислить через
 * запятую) и ADMIN_BOOTSTRAP_CHAT_ID как исторический дубль. Нужны для случаев,
 * когда таблица `owner` недоступна приложению.
 */
function ownerChatIds() {
  return [process.env.OWNER_CHAT_ID, process.env.ADMIN_BOOTSTRAP_CHAT_ID]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

/**
 * Владелец ли это бота. Основной источник — таблица `owner` бота (в ней лежит
 * и админ-паттерн Mini App, см. getStoredAdminPattern), резервный — chat_id из
 * окружения. Если таблица недоступна приложению, просто нет владельца по ней.
 */
async function isBotOwner(client, chatId) {
  const id = String(chatId || '')

  if (!id) {
    return false
  }

  if (ownerChatIds().includes(id)) {
    return true
  }

  try {
    const result = await client.query('SELECT 1 FROM owner WHERE chat_id = $1 LIMIT 1', [id])

    return result.rowCount > 0
  } catch (error) {
    console.warn('Проверка владельца бота недоступна:', error.message)
    return false
  }
}

/**
 * Пускает только владельца бота. Ставится после requireTelegramUser (кто
 * пришёл) и requireAdminSession (графический пароль), поэтому чужая Mini App
 * не увидит даже список заданий.
 */
async function requireOwner(req, res, next) {
  const client = await pool.connect()

  try {
    if (await isBotOwner(client, req.telegramUser?.id)) {
      next()
      return
    }

    res.status(403).json({ error: 'Раздел доступен только владельцу бота' })
  } catch (error) {
    next(error)
  } finally {
    client.release()
  }
}

function requireAdminSession(req, res, next) {
  const token = req.get('x-admin-token') || ''
  const session = adminSessions.get(token)

  if (!session || session.expiresAt <= Date.now() || session.chatId !== req.telegramUser.id) {
    adminSessions.delete(token)
    res.status(401).json({ error: 'Сессия админки истекла. Войди заново.' })
    return
  }

  session.expiresAt = Date.now() + adminSessionMs
  next()
}

function requireTelegramUser(req, res, next) {
  try {
    const initData = getInitData(req)
    const telegramUser = initData ? verifyTelegramInitData(initData) : null

    if (telegramUser) {
      req.telegramUser = telegramUser
      next()
      return
    }

    if (allowDevAuth && devChatId) {
      req.telegramUser = { id: devChatId, first_name: 'Dev' }
      next()
      return
    }

    res.status(401).json({ error: 'Откройте приложение внутри Telegram' })
  } catch (error) {
    res.status(401).json({ error: error.message || 'Ошибка авторизации Telegram' })
  }
}

function getInitData(req) {
  const authHeader = req.get('authorization') || ''

  if (authHeader.toLowerCase().startsWith('tma ')) {
    return authHeader.slice(4)
  }

  return req.get('x-telegram-init-data') || ''
}

function verifyTelegramInitData(initData) {
  if (!botToken) {
    throw new Error('BOT_TOKEN не настроен на сервере')
  }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')

  if (!hash) {
    throw new Error('Telegram initData без hash')
  }

  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(hash, 'hex'))) {
    throw new Error('Некорректная подпись Telegram')
  }

  const authDate = Number(params.get('auth_date') || 0)
  const maxAge = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 86400)

  if (maxAge > 0 && authDate && Date.now() / 1000 - authDate > maxAge) {
    throw new Error('Telegram-сессия устарела')
  }

  const userJson = params.get('user')

  if (!userJson) {
    throw new Error('Telegram initData без пользователя')
  }

  return JSON.parse(userJson)
}

/**
 * Целое число в диапазоне [min, max] включительно. Источник — CSPRNG: этим
 * хелпером считаются монеты, астроны и дни VIP за кейсы, купленные за Stars.
 * `crypto.randomInt` бросает исключение при min >= max, поэтому вырожденный
 * диапазон (или нечисловые границы) обрабатывается вручную.
 */
function randomInt(min, max) {
  const low = Math.ceil(Number(min))
  const high = Math.floor(Number(max))

  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return Number.isFinite(low) ? low : 0
  }

  return crypto.randomInt(low, high + 1)
}

function parseDateSafe(value) {
  if (!value) {
    return null
  }

  // node-postgres возвращает timestamp-колонки как объекты Date.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const normalized = String(value)
    .trim()
    .replace(' ', 'T')
    .replace(/\.(\d{3})\d+/, '.$1')
    // Бот пишет время в формате `%Y-%m-%d %H:%M:%S +0300` (пробел перед смещением
    // и без двоеточия) — такой JS Date не понимает, поэтому чистим смещение.
    .replace(/\s+([+-]\d{2}:?\d{2})$/, '$1')
  const date = new Date(normalized)

  return Number.isNaN(date.getTime()) ? null : date
}

function safeJsonObject(value) {
  if (typeof value === 'string' && value.trim()) {
    // Некоторые колонки бота хранят JSON текстом — пробуем разобрать.
    try {
      const parsed = JSON.parse(value)

      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, '')

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}
