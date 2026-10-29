import { Router } from 'express'
import { giftIdText } from './giftsApi.js'

/**
 * Кейсы Mini App: каталог кейсов, схема хранения, рулетка наград и админ-ручки.
 *
 * Раньше кейсы были зашиты в код (`caseRewardConfigs` / `caseStoreOffers` в
 * server/index.js). Теперь они лежат в БД (таблица `mini_app_cases`), а владелец
 * правит их в админ-панели (раздел «Кейсы»): название и описание для каждого
 * языка, картинку, цену в Telegram Stars и «наполнение» — один взвешенный пул
 * призов.
 *
 * Наполнение (`contents`) — массив строк двух видов:
 *   - валюта/эффект: `coins`, `starcoins`, `vip` — вес + диапазон min…max;
 *   - предмет из галереи: `chart_skin` (скин графика по `itemId`), `shop_item`
 *     (любой непроданный предмет маркета), `gift` (подарок Telegram).
 *
 * Шесть старых кейсов остались стартовым набором: при первом запуске они
 * заливаются в таблицу, а балансы по-прежнему живут в колонках `case_balances`
 * (совместимость с ботом). У новых кейсов баланс — в `mini_app_case_balances`.
 *
 * ВАЖНО: акценты и типы призов продублированы на клиенте
 * (src/config/casesMeta.js, src/components/admin/CaseContentEditor.jsx) — там
 * лежат иконки и подписи. При добавлении типа правь оба места.
 */

/** Языки, для которых можно задать своё название и описание кейса. */
export const caseLocales = ['ru', 'en', 'uk']

/** Акценты карточки: класс `case-card--<accent>` в приложении. */
export const caseAccents = ['amber', 'cyan', 'violet', 'pink', 'green']

/**
 * Темы блока «Кейс дня»: цвета заливки блока на экране кейсов.
 *
 * Тема хранится как `{ mode: 'solid' | 'gradient', from, to, angle }`, где
 * `from`/`to` — либо токен палитры приложения (см. `src/theme/colors.js`), либо
 * собственный цвет в `#rrggbb`. Токен оставляем токеном: при смене палитры
 * (`cyberpunk` → `cosmic`) блок перекрашивается автоматически, а свой цвет
 * остаётся как задал владелец. Дубликат на клиенте — `src/utils/caseTheme.js`.
 */
export const caseThemeTokens = ['accent', 'accent-2', 'pink', 'ice', 'green', 'amber', 'gold', 'indigo', 'danger', 'success']

/** Фон блока по умолчанию для каждого акцента карточки — «в цвет кейса». */
export const caseAccentThemes = {
  amber: { from: 'amber', to: 'gold' },
  cyan: { from: 'ice', to: 'indigo' },
  violet: { from: 'accent', to: 'indigo' },
  pink: { from: 'pink', to: 'accent-2' },
  green: { from: 'green', to: 'ice' },
}

const caseHexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** Сколько строк наполнения можно повесить на один кейс. */
export const caseContentLimit = 24

/**
 * Типы призов внутри кейса.
 *
 * `implemented: false` — заготовка для будущих подарков Telegram и NFT: в
 * редакторе строка показывается неактивной, а сервер её не сохраняет.
 */
export const caseContentCatalog = [
  { type: 'coins', implemented: true, amount: true, maxAmount: 1000000 },
  { type: 'starcoins', implemented: true, amount: true, maxAmount: 100000 },
  { type: 'vip', implemented: true, amount: true, maxAmount: 365, unit: 'days' },
  { type: 'shop_item', implemented: true, amount: false },
  { type: 'chart_skin', implemented: true, amount: false, item: true },
  { type: 'gift', implemented: true, amount: false, gift: true },
  { type: 'tg_gift', implemented: false },
  { type: 'nft', implemented: false },
]

export const caseContentMap = new Map(caseContentCatalog.map((item) => [item.type, item]))

/**
 * Кейсы, у которых баланс лежит в колонках `case_balances` (совместимость с
 * ботом): эти же id — стартовый набор при первом запуске. Задания в награду и
 * вехи XP ссылаются именно на них (см. missionMilestones в server/index.js).
 */
export const legacyCaseIds = ['homeless', 'standard', 'unusual', 'premium', 'spring', 'march_8th']

/**
 * Русские названия старых кейсов: нужны только для счёта Telegram и уведомлений
 * в чат (там нет локализации). Клиент берёт подписи из словаря
 * (`cases.types.<id>.*`), поэтому в БД у стартовых кейсов названий нет.
 */
export const legacyCaseTitles = {
  homeless: 'Бомж кейс',
  standard: 'Стандартный кейс',
  unusual: 'Необычный кейс',
  premium: 'Premium кейс',
  spring: 'Spring кейс',
  march_8th: '8 марта кейс',
}

const caseIdPattern = /^[a-z][a-z0-9_]{1,40}$/
const caseTitleMax = 60
const caseTextMax = 240
const caseImagePattern = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
/** Размер картинки в символах data-URL: клиент ужимает PNG примерно до 300 КБ. */
const caseImageMax = 400000

/**
 * Стартовый набор: ровно те кейсы, что были зашиты в код до появления админки
 * (веса и диапазоны из старых `caseRewardConfigs`), поэтому после обновления
 * шансы и награды остаются прежними.
 */
export const caseDefaults = [
  {
    id: 'homeless',
    accent: 'amber',
    stars: 25,
    sortOrder: 10,
    theme: { mode: 'gradient', from: 'amber', to: 'gold' },
    contents: [
      { id: 'coins', type: 'coins', weight: 65, min: 150, max: 900 },
      { id: 'starcoins', type: 'starcoins', weight: 24, min: 2, max: 12 },
      { id: 'shop_item', type: 'shop_item', weight: 7 },
      { id: 'vip', type: 'vip', weight: 3.2, min: 1, max: 2 },
      { id: 'gift', type: 'gift', weight: 0.8 },
    ],
  },
  {
    id: 'standard',
    accent: 'cyan',
    stars: 65,
    sortOrder: 20,
    theme: { mode: 'gradient', from: 'ice', to: 'indigo' },
    contents: [
      { id: 'coins', type: 'coins', weight: 60, min: 500, max: 2500 },
      { id: 'starcoins', type: 'starcoins', weight: 25, min: 5, max: 28 },
      { id: 'shop_item', type: 'shop_item', weight: 9 },
      { id: 'vip', type: 'vip', weight: 5, min: 2, max: 4 },
      { id: 'gift', type: 'gift', weight: 1 },
    ],
  },
  {
    id: 'unusual',
    accent: 'violet',
    stars: 120,
    sortOrder: 30,
    theme: { mode: 'gradient', from: 'accent', to: 'indigo' },
    contents: [
      { id: 'coins', type: 'coins', weight: 56, min: 1200, max: 4500 },
      { id: 'starcoins', type: 'starcoins', weight: 27, min: 12, max: 55 },
      { id: 'shop_item', type: 'shop_item', weight: 10 },
      { id: 'vip', type: 'vip', weight: 5.7, min: 3, max: 7 },
      { id: 'gift', type: 'gift', weight: 1.3 },
    ],
  },
  {
    id: 'premium',
    accent: 'pink',
    stars: 240,
    sortOrder: 40,
    theme: { mode: 'gradient', from: 'pink', to: 'accent-2' },
    // Стартовый «Кейс дня»: на чистой установке блок уже чем-то заполнен.
    featured: true,
    contents: [
      { id: 'coins', type: 'coins', weight: 52, min: 2500, max: 9000 },
      { id: 'starcoins', type: 'starcoins', weight: 28, min: 25, max: 120 },
      { id: 'shop_item', type: 'shop_item', weight: 10 },
      { id: 'vip', type: 'vip', weight: 8.2, min: 7, max: 14 },
      { id: 'gift', type: 'gift', weight: 1.8 },
    ],
  },
  {
    id: 'spring',
    accent: 'green',
    stars: 95,
    sortOrder: 50,
    theme: { mode: 'gradient', from: 'green', to: 'ice' },
    contents: [
      { id: 'coins', type: 'coins', weight: 58, min: 800, max: 3000 },
      { id: 'starcoins', type: 'starcoins', weight: 26, min: 8, max: 35 },
      { id: 'shop_item', type: 'shop_item', weight: 9 },
      { id: 'vip', type: 'vip', weight: 5.8, min: 2, max: 5 },
      { id: 'gift', type: 'gift', weight: 1.2 },
    ],
  },
  {
    id: 'march_8th',
    accent: 'pink',
    stars: 110,
    sortOrder: 60,
    theme: { mode: 'gradient', from: 'pink', to: 'accent' },
    contents: [
      { id: 'coins', type: 'coins', weight: 57, min: 700, max: 3200 },
      { id: 'starcoins', type: 'starcoins', weight: 26, min: 8, max: 40 },
      { id: 'shop_item', type: 'shop_item', weight: 9 },
      { id: 'vip', type: 'vip', weight: 6.6, min: 2, max: 5 },
      { id: 'gift', type: 'gift', weight: 1.4 },
    ],
  },
]

/**
 * Одноразовый переезд фонов блока «Кейс дня»: у трёх стартовых кейсов фон был
 * подобран иначе и сливался с общим фоном приложения. Меняем только строки, где
 * тема ещё равна прежнему значению по умолчанию, — правки владельца не трогаем.
 */
const caseThemeMigrations = [
  {
    id: 'standard',
    previous: { mode: 'gradient', from: 'ice', to: 'accent', angle: 135 },
    next: { mode: 'gradient', from: 'ice', to: 'indigo', angle: 135 },
  },
  {
    id: 'unusual',
    previous: { mode: 'gradient', from: 'accent', to: 'pink', angle: 135 },
    next: { mode: 'gradient', from: 'accent', to: 'indigo', angle: 135 },
  },
  {
    id: 'march_8th',
    previous: { mode: 'gradient', from: 'pink', to: 'accent-2', angle: 135 },
    next: { mode: 'gradient', from: 'pink', to: 'accent', angle: 135 },
  },
]

// ── Схема хранения ─────────────────────────────────────────────────────────

export const caseSchemaSql = `
CREATE TABLE IF NOT EXISTS mini_app_cases (
  id text PRIMARY KEY,
  titles jsonb NOT NULL DEFAULT '{}'::jsonb,
  texts jsonb NOT NULL DEFAULT '{}'::jsonb,
  accent text NOT NULL DEFAULT 'cyan',
  stars integer NOT NULL DEFAULT 0,
  image text,
  contents jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS titles jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS texts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS accent text NOT NULL DEFAULT 'cyan';
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS stars integer NOT NULL DEFAULT 0;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS contents jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_mini_app_cases_active ON mini_app_cases (active, sort_order);

CREATE TABLE IF NOT EXISTS mini_app_case_balances (
  chat_id bigint NOT NULL,
  case_id text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, case_id)
);
`

/**
 * Идемпотентно создаёт таблицы кейсов и заливает стартовый набор.
 *
 * Существующие кейсы не перезаписываются (`ON CONFLICT DO NOTHING`), поэтому
 * повторный запуск сервера не сбрасывает настройки из админки.
 */
export async function ensureCasesSchema(pool) {
  const client = await pool.connect()

  try {
    await client.query(caseSchemaSql)
    const existing = await client.query('SELECT id FROM mini_app_cases')
    const present = new Set(existing.rows.map((row) => row.id))
    let added = 0

    for (const item of caseDefaults) {
      if (present.has(item.id)) {
        continue
      }

      await client.query(caseInsertSql, caseInsertValues(item))
      added += 1
    }

    // Меняем фон только там, где он ещё равен прежнему стартовому значению.
    for (const migration of caseThemeMigrations) {
      await client.query(
        'UPDATE mini_app_cases SET theme = $2::jsonb WHERE id = $1 AND theme = $3::jsonb',
        [migration.id, JSON.stringify(migration.next), JSON.stringify(migration.previous)],
      )
    }

    return { added }
  } finally {
    client.release()
  }
}

// ── Чтение и запись кейсов ─────────────────────────────────────────────────

const caseSelectSql = `
SELECT id, titles, texts, accent, stars, image, contents, active, sort_order,
       theme, featured, created_at, updated_at
FROM mini_app_cases
`

const caseInsertSql = `
INSERT INTO mini_app_cases
  (id, titles, texts, accent, stars, image, contents, active, sort_order, theme, featured)
VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11)
RETURNING *
`

const caseUpdateSql = `
UPDATE mini_app_cases
SET titles = $2::jsonb,
    texts = $3::jsonb,
    accent = $4,
    stars = $5,
    image = $6,
    contents = $7::jsonb,
    active = $8,
    sort_order = $9,
    theme = $10::jsonb,
    updated_at = now()
WHERE id = $1
RETURNING *
`

/** Значения для INSERT: принимает и стартовый набор, и нормализованный ввод. */
function caseInsertValues(item) {
  return [
    item.id,
    JSON.stringify(item.titles || {}),
    JSON.stringify(item.texts || {}),
    item.accent || 'cyan',
    Number(item.stars || 0),
    item.image || null,
    JSON.stringify(item.contents || []),
    item.active !== false,
    Number(item.sortOrder ?? 100),
    JSON.stringify(normalizeCaseTheme(item.theme, item.accent)),
    item.featured === true,
  ]
}

/**
 * Строка БД → шаблон кейса для приложения и админки. Наружу отдаётся и картинка
 * (`image` — data-URL для редактора), из неё же собирается `imageUrl` для
 * приложения (см. caseImageUrl).
 */
export function buildCaseTemplate(row) {
  const accent = caseAccents.includes(String(row?.accent || '')) ? String(row.accent) : caseAccents[1]

  return {
    id: String(row?.id || ''),
    titles: caseLocaleMap(row?.titles, caseTitleMax),
    texts: caseLocaleMap(row?.texts, caseTextMax),
    accent,
    stars: Math.max(0, Number(row?.stars || 0)),
    image: row?.image ? String(row.image) : null,
    contents: normalizeCaseContents(row?.contents, { strict: false }),
    active: row?.active !== false,
    sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? 100),
    theme: normalizeCaseTheme(row?.theme, accent),
    featured: row?.featured === true,
    legacy: legacyCaseIds.includes(String(row?.id || '')),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

/** Актуальный список кейсов из БД (пустая таблица — пустой список). */
export async function loadCaseTemplates(client) {
  try {
    const result = await client.query(`${caseSelectSql} ORDER BY sort_order, id`)

    return result.rows.map(buildCaseTemplate)
  } catch (error) {
    console.warn('Таблица кейсов недоступна, используется стартовый набор:', error.message)
    return []
  }
}

/** Стартовый набор кейсов, если в БД ещё ничего не сохранено. */
export function defaultCaseTemplates() {
  return caseDefaults.map((item) => buildCaseTemplate({
    ...item,
    titles: {},
    texts: {},
    image: null,
    active: true,
  }))
}

/** Карта переводов `{ ru: '…' }`: только известные языки, без пустых строк. */
function caseLocaleMap(value, maxLength) {
  const source = safeJsonObject(value)
  const result = {}

  for (const locale of caseLocales) {
    const text = String(source[locale] || '').trim()

    if (text) {
      result[locale] = text.slice(0, maxLength)
    }
  }

  return result
}

/**
 * Название кейса для счёта Telegram и уведомлений в чат (без локализации):
 * сперва русское, потом любое из БД, потом русское имя старого кейса.
 */
export function caseStoreTitle(template) {
  const titles = safeJsonObject(template?.titles)
  const id = String(template?.id || '')

  return titles.ru || titles.en || titles.uk || legacyCaseTitles[id] || id
}

/** Ссылка на картинку кейса для приложения (версия — по времени правки). */
export function caseImageUrl(template) {
  if (!template?.image) {
    return null
  }

  const stamp = template.updatedAt ? new Date(template.updatedAt).getTime() : Date.now()

  return `/api/cases/${encodeURIComponent(template.id)}/image?v=${stamp}`
}

/**
 * Кейс для приложения: без картинки-«простыни», только ссылка на неё.
 *
 * `contents` уходят целиком: экран детали кейса рисует из них слоты призов
 * (валюта, подписки, подарки Telegram), а `odds` остаётся сводкой шансов по
 * типам для прежних мест (карточка «кейс дня», рулетка).
 */
export function toClientCase(template) {
  return {
    id: template.id,
    titles: template.titles,
    texts: template.texts,
    accent: template.accent,
    stars: template.stars,
    imageUrl: caseImageUrl(template),
    active: template.active,
    sortOrder: template.sortOrder,
    theme: template.theme,
    featured: template.featured === true,
    odds: caseOdds(template.contents),
    contents: Array.isArray(template.contents) ? template.contents : [],
  }
}

/**
 * Шансы строк в процентах: считаются от суммы весов и нужны приложению, чтобы
 * показать состав кейса без повторной арифметики на клиенте.
 */
export function caseOdds(contents) {
  const list = Array.isArray(contents) ? contents : []
  const total = list.reduce((sum, item) => sum + Math.max(0, Number(item?.weight || 0)), 0)
  const result = {}

  for (const item of list) {
    const weight = Math.max(0, Number(item?.weight || 0))
    result[`${item.type}:${item.itemId || item.id || ''}`] = total > 0 ? (weight / total) * 100 : 0
  }

  return result
}

/**
 * Пул недоступных предметов для выбора скина графика: категория называется
 * `chart_skin_*`. `key` совпадает с ключом `chartSkinFiles` в src/config/shop.js,
 * поэтому редактор сразу показывает картинку скина.
 */
export async function loadCaseGallery(client) {
  try {
    const result = await client.query(
      `
      SELECT id, category, text_f, text_m
      FROM shop_items
      WHERE category LIKE 'chart_skin_%'
      ORDER BY category, id
      `,
    )

    return result.rows.map((row) => ({
      id: Number(row.id),
      category: String(row.category || ''),
      key: caseSkinKey(row.text_f || row.text_m),
      label: String(row.text_m || row.text_f || `#${row.id}`),
    }))
  } catch (error) {
    console.warn('Каталог скинов недоступен:', error.message)
    return []
  }
}

/** Имя файла скина из названия предмета: «Honey Pie» → `honey_pie`. */
export function caseSkinKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Значения для UPDATE: тот же порядок, что и в INSERT, но id уже первый. */
function caseUpdateValues(item, image) {
  return [
    item.id,
    JSON.stringify(item.titles || {}),
    JSON.stringify(item.texts || {}),
    item.accent || 'cyan',
    Number(item.stars || 0),
    image,
    JSON.stringify(item.contents || []),
    item.active !== false,
    Number(item.sortOrder ?? 100),
    JSON.stringify(normalizeCaseTheme(item.theme, item.accent)),
  ]
}


// ── Проверка и нормализация ────────────────────────────────────────────────

/**
 * Наполнение кейса → массив строк для БД.
 *
 * В админке (`strict`) мусор и пустые веса отбрасываются, а полностью пустое
 * наполнение — ошибка: кейс без призов открыть нельзя. При чтении из БД
 * (`strict: false`) та же функция просто чистит битые строки.
 */
export function normalizeCaseContents(value, { strict = true } = {}) {
  const list = Array.isArray(value) ? value : []
  const rows = []
  const seen = new Set()

  for (const item of list) {
    if (rows.length >= caseContentLimit) {
      break
    }

    const type = String(item?.type || '')
    const meta = caseContentMap.get(type)

    if (!meta?.implemented) {
      continue
    }

    const weight = clampNumber(item?.weight, 0, 10000, 0)

    if (weight <= 0) {
      continue
    }

    let id = String(item?.id || '').trim().slice(0, 40)

    if (!id || seen.has(id)) {
      id = `${type}_${rows.length + 1}`
    }

    seen.add(id)

    const row = { id, type, weight: Math.round(weight * 1000) / 1000 }

    if (meta.amount) {
      const min = clampInteger(item?.min, 1, meta.maxAmount, 1)

      row.min = min
      // «От» больше «до» — берём «от», чтобы диапазон всегда был корректным.
      row.max = clampInteger(item?.max, min, meta.maxAmount, min)
    }

    if (meta.item) {
      const itemId = clampInteger(item?.itemId, 1, 2147483647, 0)

      if (!itemId) {
        if (strict) {
          throw new Error('У скина графика не выбран предмет')
        }

        continue
      }

      row.itemId = itemId
    }

    // Подарок Telegram: необязательный id подарка из каталога юзербота. Без него
    // строка остаётся общей «подарок» (выдаётся подарок по умолчанию).
    // Id держим строкой цифр: у подарков он девятнадцатизначный и в `integer`
    // (2147483647) не влезает — число обрезало бы его до нуля и подарок строки
    // терялся бы при сохранении (см. `giftIdText` в `server/giftsApi.js`).
    if (meta.gift) {
      const giftId = giftIdText(item?.giftId)

      if (giftId) {
        row.giftId = giftId

        // Уникальный подарок берут с аккаунта юзербота: из бота его не выдать,
        // поэтому вместе с id храним адрес подарка на аккаунте (`giftSlug` и
        // `giftMsgId`) — по нему юзербот передаёт подарок получателю, когда кейс
        // открыли (см. `deliverGift` в server/caseGifts.js).
        if (item?.giftKind === 'unique') {
          row.giftKind = 'unique'
          row.giftSlug = String(item?.giftSlug || '').trim().slice(0, 64)
          row.giftMsgId = Math.max(0, Math.trunc(Number(item?.giftMsgId) || 0))
          row.giftNum = Math.max(0, Math.trunc(Number(item?.giftNum) || 0))
        }
      }
    }

    rows.push(row)
  }

  if (strict && rows.length === 0) {
    throw new Error('Наполнение кейса: нужен хотя бы один приз с весом')
  }

  return rows
}

/**
 * Картинка кейса: data-URL PNG/JPEG/WebP. `undefined` означает «не менять
 * текущую» (редактор всегда присылает поле целиком), пустая строка — убрать.
 */
export function normalizeCaseImage(value) {
  if (value === undefined) {
    return undefined
  }

  const raw = String(value ?? '').trim()

  if (!raw) {
    return null
  }

  if (!caseImagePattern.test(raw)) {
    throw new Error('Картинка кейса: нужен файл PNG')
  }

  if (raw.length > caseImageMax) {
    throw new Error('Картинка кейса слишком большая')
  }

  return raw
}

/**
 * Тема блока «Кейс дня»: `{ mode, from, to, angle }`.
 *
 * `from`/`to` — либо токен палитры (`caseThemeTokens`), либо свой цвет
 * `#rrggbb`. Всё незнакомое заменяется темой по акценту кейса, поэтому тема
 * никогда не бывает «пустой» и блок всегда во что-то окрашен.
 */
export function normalizeCaseTheme(value, accent = 'cyan') {
  const source = safeJsonObject(value)
  const preset = caseAccentThemes[accent] || caseAccentThemes[caseAccents[1]]
  const mode = source.mode === 'solid' ? 'solid' : 'gradient'
  const angle = clampInteger(source.angle, 0, 360, 135)

  return {
    mode,
    from: themeColorRef(source.from, preset.from),
    to: themeColorRef(source.to, preset.to),
    angle,
  }
}

/** Токен палитры или свой `#rrggbb`; иначе — цвет по умолчанию. */
function themeColorRef(value, fallback) {
  const raw = String(value ?? '').trim()

  return caseThemeTokens.includes(raw) || caseHexColorPattern.test(raw) ? raw : fallback
}

/**
 * Проверка и нормализация кейса из админки. Ошибки — на русском: они
 * показываются владельцу прямо в форме.
 */
export function normalizeCasePayload(raw, { id = '' } = {}) {
  const source = safeJsonObject(raw)
  const accent = String(source.accent || '')
  const normalizedAccent = caseAccents.includes(accent) ? accent : caseAccents[1]

  return {
    id,
    titles: caseLocaleMap(source.titles, caseTitleMax),
    texts: caseLocaleMap(source.texts, caseTextMax),
    accent: normalizedAccent,
    stars: clampInteger(source.stars, 0, 100000, 0),
    image: normalizeCaseImage(source.image),
    contents: normalizeCaseContents(source.contents, { strict: true }),
    active: source.active !== false,
    sortOrder: clampInteger(source.sortOrder, 0, 99999, 100),
    theme: normalizeCaseTheme(source.theme, normalizedAccent),
  }
}

/** Проверка id нового кейса: он попадает в балансы, заказы и токены. */
export function normalizeCaseId(value) {
  const id = String(value || '').trim().toLowerCase()

  if (!caseIdPattern.test(id)) {
    throw new Error('Код кейса: латиница, цифры и «_», 2–41 символ, начинается с буквы')
  }

  return id
}

/** Все скины из наполнения есть в каталоге маркета? Ошибка — текст для владельца. */
async function assertContentsGallery(client, contents) {
  const wanted = contents.filter((row) => row.type === 'chart_skin').map((row) => Number(row.itemId))

  if (wanted.length === 0) {
    return
  }

  const gallery = await loadCaseGallery(client)
  const known = new Set(gallery.map((item) => item.id))

  if (wanted.some((itemId) => !known.has(itemId))) {
    throw new Error('Неизвестный скин графика')
  }
}

/**
 * Все подарки из наполнения есть в каталоге юзербота? Проверяем только когда
 * каталог загрузился: если юзербот лежит, сохраняем как есть — иначе владелец не
 * сможет править кейс, а уже выбранный подарок потеряется. Строка `gift` без `giftId`
 * проверку проходит: сервер её сохраняет, а приложение рисует подарок «по умолчанию».
 *
 * Сравниваем id числами: у подарков он девятнадцатизначный, и в `double` приходят
 * одинаковые значения и у точного id из каталога, и у прежних записей, сохранённых
 * ещё числами (`6003373314888696871` → `6003373314888697000`). Так владелец не
 * остаётся запертым в кейсе, который уже сохранён со «сломанным» id.
 */
/**
 * Проверяет подарки наполнения: id каждого должен быть известен.
 *
 * Обычные подарки знает каталог Telegram (`payments.getStarGifts`). Уникальный
 * подарок — экземпляр, которого в каталоге нет: его id приходит только из списка
 * подарков аккаунта юзербота, поэтому для строк с `giftKind === 'unique'`
 * проверяем по `savedGifts`.
 *
 * Если оба списка пусты (юзербот лежит и кеш пустой), проверку пропускаем — как и
 * раньше: сохранить кейс должно быть можно даже без юзербота.
 */
function assertContentsGifts(gifts, contents, savedGifts = []) {
  const rows = contents.filter((row) => row.type === 'gift' && Number(row.giftId) > 0)

  if (rows.length === 0) {
    return
  }

  const catalog = new Set((Array.isArray(gifts) ? gifts : []).map((gift) => Number(gift?.id)))
  const account = new Set((Array.isArray(savedGifts) ? savedGifts : []).map((gift) => Number(gift?.id)))

  if (catalog.size === 0 && account.size === 0) {
    return
  }

  const unknown = rows.some((row) => {
    const giftId = Number(row.giftId)

    return row.giftKind === 'unique'
      ? !account.has(giftId)
      : !(catalog.has(giftId) || account.has(giftId))
  })

  if (unknown) {
    throw new Error('Неизвестный подарок кейса')
  }
}

/** Кейс можно купить за Telegram Stars? */
export function caseForSale(template) {
  return Boolean(template) && Number(template.stars || 0) > 0
}

/** Целое число в границах: пустое или нечисловое значение → значение по умолчанию. */
function clampInteger(value, min, max, fallback) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(number)))
}

/** Дробное число в границах (веса кейсов бывают дробными: 3.2, 0.8). */
function clampNumber(value, min, max, fallback) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(min, Math.min(max, number))
}

/** JSON-объект из jsonb (pg отдаёт объект) или из строки — иначе пустой объект. */
function safeJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)

      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  return {}
}



// ── Админские ручки ────────────────────────────────────────────────────────

/**
 * Ручки раздела «Кейсы» для админ-панели.
 *
 * Доступ только у владельца бота: `requireOwner` проверяется после
 * `requireTelegramUser` (кто пришёл) и `requireAdminSession` (админ-сессия).
 * `onChange` вызывается после каждой успешной записи — сервер сбрасывает кеш
 * каталога, чтобы приложение увидело правки сразу.
 *
 * Отдельная ручка `GET /api/cases/:id/image` открыта без авторизации: картинку
 * показывает тег `<img>` в приложении, а он не умеет передавать заголовок с
 * Telegram initData. По id можно получить только картинку кейса.
 */
export function createCasesApi({
  pool,
  requireTelegramUser,
  requireAdminSession,
  requireOwner,
  onChange,
  loadGifts,
  giftsSnapshot,
  loadSavedGifts,
  savedGiftsSnapshot,
}) {
  const router = Router()
  const guards = [requireTelegramUser, requireAdminSession, requireOwner].filter(Boolean)

  /**
   * Каталог подарков юзербота: если загрузчик не передан или упал, отдаём пустой
   * список — админка и bootstrap должны открыться и без работающего юзербота.
   */
  async function loadedGifts(options = {}) {
    if (typeof loadGifts !== 'function') {
      return []
    }

    try {
      return await loadGifts(options)
    } catch (error) {
      console.warn('[cases] каталог подарков недоступен:', error?.message || error)

      return []
    }
  }

  /**
   * Состояние каталога подарков для админки: `ok`, текст ошибки и когда читали.
   * По нему пикер подарков честно пишет «каталог недоступен», а не пустой список.
   */
  function giftsState(count) {
    const snapshot = typeof giftsSnapshot === 'function' ? giftsSnapshot() : null

    return {
      ok: snapshot ? Boolean(snapshot.ok) : count > 0,
      error: snapshot?.error || '',
      loadedAt: Number(snapshot?.loadedAt) || 0,
      count,
    }
  }

  /**
   * Подарки, которые уже есть на аккаунте юзербота: второй режим пикера подарков.
   *
   * Отдельная ручка для них не нужна — список нужен только в редакторе наполнения,
   * поэтому едет тем же ответом. Как и каталог, он не роняет админку: без юзербота
   * получаем пустой список, а состояние (`savedStatus`) объясняет почему.
   */
  async function loadedSavedGifts(options = {}) {
    if (typeof loadSavedGifts !== 'function') {
      return []
    }

    try {
      return await loadSavedGifts(options)
    } catch (error) {
      console.warn('[cases] подарки аккаунта недоступны:', error?.message || error)

      return []
    }
  }

  /**
   * Состояние подарков аккаунта для админки: `ok`, текст ошибки, когда читали и
   * каким запросом их добыли (`mode`).
   *
   * `mode` нужен пикеру: если список приехал не полным — без подарков, размещённых
   * на профиле (`owned`), или от юзербота старой версии (`plain`), — он пишет, чего
   * в списке нет (см. `savedGiftRequests` в server/giftsApi.js).
   */
  function savedGiftsState(count) {
    const snapshot = typeof savedGiftsSnapshot === 'function' ? savedGiftsSnapshot() : null

    return {
      ok: snapshot ? Boolean(snapshot.ok) : count > 0,
      error: snapshot?.error || '',
      loadedAt: Number(snapshot?.loadedAt) || 0,
      mode: String(snapshot?.mode || ''),
      count,
    }
  }

  async function respondWithCases(client, res, { refreshGifts = false } = {}) {
    const result = await client.query(`${caseSelectSql} ORDER BY sort_order, id`)
    // Каталог подарков юзербота: редактор наполнения выбирает конкретный
    // подарок для строки типа `gift`. Если юзербот недоступен — пустой массив,
    // форма всё равно откроется.
    const gifts = await loadedGifts({ force: refreshGifts })
    // Подарки, полученные аккаунтом юзербота: пикер показывает их вторым режимом
    // («есть на аккаунте»), чтобы владелец выбирал из того, что есть на руках.
    const savedGifts = await loadedSavedGifts({ force: refreshGifts })

    res.json({
      ok: true,
      cases: result.rows.map(buildCaseTemplate),
      catalog: {
        locales: caseLocales,
        accents: caseAccents,
        contentTypes: caseContentCatalog,
        contentLimit: caseContentLimit,
        legacyCases: legacyCaseIds,
        gallery: await loadCaseGallery(client),
        gifts,
        giftsStatus: giftsState(gifts.length),
        savedGifts,
        savedStatus: savedGiftsState(savedGifts.length),
      },
    })
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

  /** Проверка тела кейса: ошибки возвращаем как 400 с текстом для владельца. */
  function readPayload(req, res, id) {
    try {
      return normalizeCasePayload(req.body, { id })
    } catch (error) {
      res.status(400).json({ error: error.message })
      return null
    }
  }

  router.get('/api/admin/cases', ...guards, async (req, res, next) => {
    // `?refresh=1` — кнопка «обновить» в пикере подарков: каталог тянется из юзербота
    // в обход серверного кеша (`GIFTS_CACHE_MS`).
    const refreshGifts = String(req.query?.refresh || '') === '1'

    await withClient(res, next, (client) => respondWithCases(client, res, { refreshGifts }))
  })

  /**
   * Кейс в блоке «Кейс дня»: путь `/featured` не совпадает с `/api/admin/cases/:id`
   * (там только PUT/DELETE), поэтому код кейса `featured` создать не помешает.
   * Пустой `caseId` очищает блок: он пропадает с экрана кейсов.
   */
  router.post('/api/admin/cases/featured', ...guards, async (req, res, next) => {
    const rawId = String(req.body?.caseId || '').trim()
    let caseId = ''

    if (rawId) {
      try {
        caseId = normalizeCaseId(rawId)
      } catch (error) {
        res.status(400).json({ error: error.message })
        return
      }
    }

    await withClient(res, next, async (client) => {
      if (caseId) {
        const exists = await client.query('SELECT 1 FROM mini_app_cases WHERE id = $1', [caseId])

        if (exists.rowCount === 0) {
          res.status(404).json({ error: 'Кейс не найден' })
          return
        }
      }

      // Флаг только один: сервер сам снимает его с остальных кейсов.
      await client.query('UPDATE mini_app_cases SET featured = (id = $1)', [caseId])
      onChange?.()
      await respondWithCases(client, res)
    })
  })

  router.post('/api/admin/cases', ...guards, async (req, res, next) => {
    let id

    try {
      id = normalizeCaseId(req.body?.id)
    } catch (error) {
      res.status(400).json({ error: error.message })
      return
    }

    const payload = readPayload(req, res, id)

    if (!payload) {
      return
    }

    await withClient(res, next, async (client) => {
      try {
        await assertContentsGallery(client, payload.contents)
        assertContentsGifts(await loadedGifts(), payload.contents, await loadedSavedGifts())
      } catch (error) {
        res.status(400).json({ error: error.message })
        return
      }

      const existing = await client.query('SELECT 1 FROM mini_app_cases WHERE id = $1', [id])

      if (existing.rowCount > 0) {
        res.status(409).json({ error: 'Кейс с таким кодом уже существует' })
        return
      }

      await client.query(caseInsertSql, caseInsertValues({ ...payload, image: payload.image || null }))
      onChange?.()
      await respondWithCases(client, res)
    })
  })

  router.put('/api/admin/cases/:id', ...guards, async (req, res, next) => {
    let id

    try {
      id = normalizeCaseId(req.params.id)
    } catch (error) {
      res.status(400).json({ error: error.message })
      return
    }

    const payload = readPayload(req, res, id)

    if (!payload) {
      return
    }

    await withClient(res, next, async (client) => {
      try {
        await assertContentsGallery(client, payload.contents)
        assertContentsGifts(await loadedGifts(), payload.contents, await loadedSavedGifts())
      } catch (error) {
        res.status(400).json({ error: error.message })
        return
      }

      const current = await client.query('SELECT image FROM mini_app_cases WHERE id = $1', [id])

      if (current.rowCount === 0) {
        res.status(404).json({ error: 'Кейс не найден' })
        return
      }

      // Поле не пришло — оставляем прежнюю картинку; пустая строка её убирает.
      const image = payload.image === undefined ? (current.rows[0].image || null) : payload.image

      await client.query(caseUpdateSql, caseUpdateValues(payload, image))
      onChange?.()
      await respondWithCases(client, res)
    })
  })

  router.delete('/api/admin/cases/:id', ...guards, async (req, res, next) => {
    const id = String(req.params.id || '')

    await withClient(res, next, async (client) => {
      const result = await client.query('DELETE FROM mini_app_cases WHERE id = $1', [id])

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Кейс не найден' })
        return
      }

      // Остатки кейсов у игроков не трогаем: удаление (и повторное создание)
      // кейса не должно выдавать или сжигать их балансы.
      onChange?.()
      await respondWithCases(client, res)
    })
  })

  /** Картинка кейса из data-URL: отдаём байтами, чтобы приложение кешировало её. */
  router.get('/api/cases/:id/image', async (req, res, next) => {
    const id = String(req.params.id || '')

    if (!caseIdPattern.test(id)) {
      res.status(404).json({ error: 'Кейс не найден' })
      return
    }

    await withClient(res, next, async (client) => {
      const result = await client.query('SELECT image FROM mini_app_cases WHERE id = $1', [id])
      const match = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(result.rows[0]?.image || ''))

      if (!match) {
        res.status(404).json({ error: 'Картинка кейса не найдена' })
        return
      }

      res.setHeader('Content-Type', match[1])
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.send(Buffer.from(match[2], 'base64'))
    })
  })

  return router
}

export default createCasesApi
