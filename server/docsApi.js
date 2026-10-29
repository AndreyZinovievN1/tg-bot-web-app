import crypto from 'node:crypto'
import { Router } from 'express'
import { docsSeedArticles } from './docsSeed.js'

/**
 * Раздел «Документация» (Epic 2).
 *
 * Модель данных:
 *   `doc_articles`      — статья целиком: иконка, тема оформления, статус, порядок;
 *   `doc_translations`  — языковые версии статьи (ru/uk/en): заголовок, краткое
 *                         описание и произвольный набор блоков контента (jsonb).
 *
 * Публичные ручки отдают только опубликованные статьи на языке из `?lang=`
 * или заголовка `Accept-Language`, с автоматическим откатом на другую
 * доступную языковую версию.
 *
 * Админские ручки требуют сессию админки (см. requireAdminSession в server/index.js)
 * и позволяют создавать, читать, править, публиковать, сортировать и удалять статьи.
 */

export const docsLocales = ['ru', 'uk', 'en']

export const docsThemes = [
  'nebula',
  'aurora',
  'sunset',
  'ocean',
  'candy',
  'paper',
  'cyber',
  'gold',
  'mint',
  'graphite',
]

export const docsStatuses = ['draft', 'published']

/** Разделы справки: к какому экрану относится статья (кнопка «?» в приложении). */
export const docsTopics = ['common', 'home', 'cases', 'shop', 'inventory', 'missions', 'profile']

export const docsDefaultTopic = 'common'

const docsBlockTypes = [
  'heading',
  'text',
  'list',
  'badges',
  'steps',
  'stats',
  'image',
  'quote',
  'callout',
  'spoiler',
  'progress',
  'link',
  'code',
  'table',
  'divider',
]
const docsFallbackLocale = 'ru'
const docsMaxBlocks = 300
const docsMaxItems = 40
const docsMaxPayloadBytes = 4 * 1024 * 1024
const docsMaxImageLength = 2_000_000
const docsMaxTableColumns = 8
const docsMaxTableRows = 40
const docsCalloutToneList = ['info', 'tip', 'success', 'warn']
const docsAccentToneList = ['accent', 'accent-2', 'success', 'warn']

const docsSchemaSql = `
CREATE TABLE IF NOT EXISTS doc_articles (
  id serial PRIMARY KEY,
  icon text NOT NULL DEFAULT '📘',
  theme text NOT NULL DEFAULT 'nebula',
  status text NOT NULL DEFAULT 'draft',
  topic text NOT NULL DEFAULT 'common',
  is_faq boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '📘';
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'nebula';
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT 'common';
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS is_faq boolean NOT NULL DEFAULT false;
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS doc_translations (
  article_id integer NOT NULL REFERENCES doc_articles (id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_doc_articles_status ON doc_articles (status, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_doc_articles_topic ON doc_articles (topic, is_faq, sort_order);
CREATE INDEX IF NOT EXISTS idx_doc_translations_locale ON doc_translations (locale);
`

/**
 * Режим наполнения стартовыми статьями (переменная `DOCS_SEED`):
 *   `topup` (по умолчанию) — добавить отсутствующие стартовые статьи и
 *   недостающие языковые версии, существующий контент не трогается;
 *   `refresh` (алиасы `force`, `update`) — то же самое плюс перезапись уже
 *   существующих версий текущим текстом из server/docsSeed.js;
 *   `false` / `0` / `off` / `none` — ничего не добавлять и не обновлять.
 */
export function docsSeedMode(value = process.env.DOCS_SEED) {
  const mode = String(value ?? '').trim().toLowerCase()

  if (['false', '0', 'off', 'none', 'no'].includes(mode)) {
    return 'off'
  }

  if (['refresh', 'force', 'update', 'rewrite'].includes(mode)) {
    return 'refresh'
  }

  return 'topup'
}

/** Совместимость: включено ли наполнение стартовыми статьями. */
export function isDocsTopUpEnabled(value = process.env.DOCS_SEED) {
  return docsSeedMode(value) !== 'off'
}

/**
 * Идемпотентно создаёт таблицы документации и наполняет раздел стартовым
 * набором статей. Повторные вызовы безопасны: новые статьи добавляются,
 * недостающие языковые версии дозаполняются, дубликаты не создаются, а
 * уже написанный (в том числе админский) текст не перезаписывается.
 *
 * Возвращает счётчики: `added` — новые статьи, `filled` — добавленные языковые
 * версии существующих статей, `refreshed` — перезаписанные версии (режим refresh).
 */
export async function ensureDocsSchema(pool, { seed = true } = {}) {
  const client = await pool.connect()

  try {
    await client.query(docsSchemaSql)

    const mode = seed === false ? 'off' : docsSeedMode()
    const result = { added: 0, filled: 0, refreshed: 0 }

    if (mode === 'off') {
      return result
    }

    for (const article of docsSeedArticles) {
      const existingId = await findSeedArticleId(client, article)

      if (!existingId) {
        await insertSeedArticle(client, article)
        result.added += 1
        continue
      }

      const versions = await writeSeedLocales(client, existingId, article, mode === 'refresh')
      result.filled += versions.filled
      result.refreshed += versions.refreshed
    }

    return result
  } finally {
    client.release()
  }
}

/**
 * Ищет статью стартового набора по заголовку RU-версии (регистр не важен) —
 * защита от дубликатов при повторном наполнении. `0` — такой статьи ещё нет.
 */
async function findSeedArticleId(client, article) {
  const title = docText(article?.translations?.ru?.title, 200).trim()

  if (!title) {
    return 0
  }

  const result = await client.query(
    'SELECT article_id FROM doc_translations WHERE locale = $1 AND lower(title) = lower($2) ORDER BY article_id LIMIT 1',
    ['ru', title],
  )

  return Number(result.rows[0]?.article_id || 0)
}


/** Создаёт статью стартового набора вместе со всеми языковыми версиями. */
async function insertSeedArticle(client, article) {
  const created = await client.query(
    `
    INSERT INTO doc_articles (icon, theme, status, topic, is_faq, sort_order)
    VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sort_order) + 1 FROM doc_articles), 0))
    RETURNING id
    `,
    [article.icon, article.theme, article.status, docTopic(article.topic), docBool(article.isFaq)],
  )

  await writeSeedLocales(client, created.rows[0].id, article, false)
}

/**
 * Записывает языковые версии стартовой статьи. Без `overwrite` уже
 * существующие версии остаются как есть (правки администратора сохраняются),
 * с `overwrite` контент заменяется текущим текстом из server/docsSeed.js.
 */
async function writeSeedLocales(client, articleId, article, overwrite) {
  const conflict = overwrite
    ? 'DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, blocks = EXCLUDED.blocks, updated_at = now()'
    : 'DO NOTHING'
  const sql = `
      INSERT INTO doc_translations (article_id, locale, title, summary, blocks)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (article_id, locale) ${conflict}
      `
  const versions = { filled: 0, refreshed: 0 }

  for (const [locale, version] of Object.entries(article.translations || {})) {
    if (!docsLocales.includes(locale)) {
      continue
    }

    const written = await client.query(sql, [
      articleId,
      locale,
      docText(version.title, 200),
      docText(version.summary, 500),
      JSON.stringify(normalizeBlocks(version.blocks)),
    ])

    if (written.rowCount > 0) {
      if (overwrite) {
        versions.refreshed += 1
      } else {
        versions.filled += 1
      }
    }
  }

  return versions
}

/* ---------------------------------------------------------------
   Нормализация данных
   --------------------------------------------------------------- */

function docText(value, maxLength) {
  return String(value ?? '').slice(0, maxLength)
}

function docTextArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.slice(0, maxItems).map((item) => docText(item, maxLength))
}

function docAlign(value) {
  return ['left', 'center', 'right'].includes(value) ? value : 'left'
}

function docBool(value) {
  return value === true || value === 'true'
}

/** Массив объектов: не-объекты заменяем на пустые, чтобы не ронять нормализацию. */
function docObjectArray(value, maxItems) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .slice(0, maxItems)
    .map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? item : {}))
}

/** Безопасная ссылка: разрешаем только http(s), остальное отбрасываем. */
function docLink(value) {
  const href = docText(value, 500).trim()

  return /^https?:\/\//i.test(href) ? href : ''
}

/** Раздел справки: неизвестное значение приводим к «Общее». */
function docTopic(value) {
  return docsTopics.includes(String(value)) ? String(value) : docsDefaultTopic
}

/** Приводит блок из запроса к известному формату. Неизвестные блоки отбрасываются. */
function normalizeDocsBlock(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }

  const type = docsBlockTypes.includes(String(raw.type)) ? String(raw.type) : ''

  if (!type) {
    return null
  }

  const id = docText(raw.id, 64).trim() || `${type}-${index}-${crypto.randomUUID().slice(0, 8)}`
  const base = { id, type }

  if (type === 'heading') {
    return { ...base, text: docText(raw.text, 600), level: Number(raw.level) === 3 ? 3 : 2, align: docAlign(raw.align) }
  }

  if (type === 'text') {
    return { ...base, text: docText(raw.text, 6000), size: raw.size === 'lg' ? 'lg' : 'md', align: docAlign(raw.align) }
  }

  if (type === 'list') {
    return {
      ...base,
      style: ['bullet', 'number', 'check'].includes(raw.style) ? raw.style : 'bullet',
      items: docTextArray(raw.items, docsMaxItems, 600),
    }
  }

  if (type === 'badges') {
    return {
      ...base,
      items: docObjectArray(raw.items, docsMaxItems).map((item) => ({
        text: docText(item.text, 120),
        tone: docsAccentToneList.includes(item.tone) ? item.tone : 'accent',
      })),
    }
  }

  if (type === 'steps') {
    return {
      ...base,
      items: docObjectArray(raw.items, docsMaxItems).map((item) => ({
        title: docText(item.title, 160),
        text: docText(item.text, 1000),
      })),
    }
  }

  if (type === 'stats') {
    return {
      ...base,
      items: docObjectArray(raw.items, docsMaxItems).map((item) => ({
        label: docText(item.label, 80),
        value: docText(item.value, 40),
        icon: docText(item.icon, 12),
      })),
    }
  }

  if (type === 'image') {
    return {
      ...base,
      src: docText(raw.src, docsMaxImageLength),
      alt: docText(raw.alt, 200),
      caption: docText(raw.caption, 300),
      size: ['full', 'md', 'sm'].includes(raw.size) ? raw.size : 'full',
      align: docAlign(raw.align),
      rounded: docBool(raw.rounded),
    }
  }

  if (type === 'quote') {
    return { ...base, text: docText(raw.text, 3000), author: docText(raw.author, 120) }
  }

  if (type === 'callout') {
    return {
      ...base,
      tone: docsCalloutToneList.includes(raw.tone) ? raw.tone : 'info',
      title: docText(raw.title, 160),
      text: docText(raw.text, 2000),
    }
  }

  if (type === 'spoiler') {
    return { ...base, title: docText(raw.title, 160), text: docText(raw.text, 4000) }
  }

  if (type === 'progress') {
    const max = Number.isFinite(Number(raw.max)) && Number(raw.max) > 0
      ? Math.min(Math.round(Number(raw.max)), 1_000_000)
      : 100
    const value = Number.isFinite(Number(raw.value))
      ? Math.max(0, Math.min(Math.round(Number(raw.value)), max))
      : 0

    return {
      ...base,
      label: docText(raw.label, 160),
      value,
      max,
      tone: docsCalloutToneList.includes(raw.tone) ? raw.tone : 'info',
    }
  }

  if (type === 'link') {
    return {
      ...base,
      text: docText(raw.text, 120),
      href: docLink(raw.href),
      icon: docText(raw.icon, 12),
      tone: docsAccentToneList.includes(raw.tone) ? raw.tone : 'accent',
    }
  }

  if (type === 'code') {
    return { ...base, code: docText(raw.code, 20000), language: docText(raw.language, 40) }
  }

  if (type === 'table') {
    return {
      ...base,
      head: docTextArray(raw.head, docsMaxTableColumns, 200),
      rows: Array.isArray(raw.rows)
        ? raw.rows.slice(0, docsMaxTableRows).map((row) => docTextArray(row, docsMaxTableColumns, 300))
        : [],
    }
  }

  return { ...base, style: ['line', 'glow', 'stars'].includes(raw.style) ? raw.style : 'line' }
}

function normalizeBlocks(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .slice(0, docsMaxBlocks)
    .map((block, index) => normalizeDocsBlock(block, index))
    .filter(Boolean)
}

/** Языковые версии из тела PUT-запроса: [{ locale, title, summary, blocks }]. */
function normalizeTranslationsPayload(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set()

  return value.flatMap((version) => {
    const locale = normalizeDocsLocale(version?.locale)

    if (!locale || seen.has(locale)) {
      return []
    }

    seen.add(locale)

    return [{
      locale,
      title: docText(version.title, 200),
      summary: docText(version.summary, 500),
      blocks: normalizeBlocks(version.blocks),
    }]
  })
}

/** 'ua-UA' | 'EN' | 'ru' → 'uk' | 'en' | 'ru' | null */
export function normalizeDocsLocale(value) {
  const base = String(value || '').trim().toLowerCase().replaceAll('_', '-').split('-')[0]

  if (docsLocales.includes(base)) {
    return base
  }

  return base === 'ua' ? 'uk' : null
}

/** Язык запроса: `?lang=` приоритетнее, дальше Accept-Language, дальше базовый ru. */
function requestedLocale(req) {
  const fromQuery = normalizeDocsLocale(req.query?.lang)

  if (fromQuery) {
    return fromQuery
  }

  for (const part of String(req.get('accept-language') || '').split(',')) {
    const code = normalizeDocsLocale(part.trim().split(';')[0])

    if (code) {
      return code
    }
  }

  return docsFallbackLocale
}

/* ---------------------------------------------------------------
   Сборка ответов
   --------------------------------------------------------------- */

/** Карта языковых версий статьи: { ru: { title, summary, blocks, updated_at } }. */
async function getTranslationMap(client, articleId) {
  const result = await client.query(
    `
    SELECT locale, title, summary, blocks, updated_at
    FROM doc_translations
    WHERE article_id = $1
    `,
    [articleId],
  )

  return Object.fromEntries(result.rows.map((row) => [row.locale, row]))
}

function isVersionFilled(version) {
  if (!version) {
    return false
  }

  return Boolean(docText(version.title, 200).trim()) || (Array.isArray(version.blocks) && version.blocks.length > 0)
}

/** Выбирает доступную версию: запрошенный язык → ru → en → uk → первая доступная. */
function resolveVersion(translations, requested) {
  const code = [requested, docsFallbackLocale, 'en', 'uk'].filter(Boolean).find((item) => isVersionFilled(translations[item]))

  if (code) {
    return { locale: code, version: translations[code], isFallback: code !== requested }
  }

  const anyCode = docsLocales.find((item) => isVersionFilled(translations[item]))

  if (anyCode) {
    return { locale: anyCode, version: translations[anyCode], isFallback: anyCode !== requested }
  }

  return { locale: requested, version: null, isFallback: false }
}

function sortDocLocales(locales) {
  return [...locales].sort((left, right) => docsLocales.indexOf(left) - docsLocales.indexOf(right))
}

function availableDocLocales(source) {
  return sortDocLocales(Object.keys(source || {}).filter((code) => docsLocales.includes(code)))
}

function buildArticleSummary(row, requested) {
  const translations = row.translations && typeof row.translations === 'object' ? row.translations : {}
  const { locale, version, isFallback } = resolveVersion(translations, requested)

  return {
    id: Number(row.id),
    icon: row.icon || '📘',
    theme: row.theme || 'nebula',
    topic: docTopic(row.topic),
    isFaq: Boolean(row.is_faq),
    updatedAt: row.updated_at,
    locale,
    requestedLocale: requested,
    isFallback,
    availableLocales: availableDocLocales(translations),
    title: docText(version?.title, 200),
    summary: docText(version?.summary, 500),
  }
}

function buildArticleDetail(row, translations, requested) {
  const { locale, version, isFallback } = resolveVersion(translations, requested)

  return {
    id: Number(row.id),
    icon: row.icon || '📘',
    theme: row.theme || 'nebula',
    topic: docTopic(row.topic),
    isFaq: Boolean(row.is_faq),
    updatedAt: row.updated_at,
    locale,
    requestedLocale: requested,
    isFallback,
    availableLocales: availableDocLocales(translations),
    title: docText(version?.title, 200),
    summary: docText(version?.summary, 500),
    blocks: normalizeBlocks(version?.blocks),
  }
}

/** Полная карточка для админки: все языковые версии вместе с блоками. */
function buildAdminArticleDetail(row, translations) {
  return {
    id: Number(row.id),
    icon: row.icon || '📘',
    theme: row.theme || 'nebula',
    status: docsStatuses.includes(row.status) ? row.status : 'draft',
    topic: docTopic(row.topic),
    isFaq: Boolean(row.is_faq),
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at,
    translations: availableDocLocales(translations).map((locale) => ({
      locale,
      title: docText(translations[locale].title, 200),
      summary: docText(translations[locale].summary, 500),
      blocks: normalizeBlocks(translations[locale].blocks),
    })),
  }
}

/** Короткая карточка для админки: без блоков, но со счётчиком. */
function buildAdminArticleRow(row) {
  const versions = Array.isArray(row.translations) ? row.translations : []

  return {
    id: Number(row.id),
    icon: row.icon || '📘',
    theme: row.theme || 'nebula',
    status: docsStatuses.includes(row.status) ? row.status : 'draft',
    topic: docTopic(row.topic),
    isFaq: Boolean(row.is_faq),
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at,
    translations: versions
      .filter((version) => docsLocales.includes(version.locale))
      .map((version) => ({
        locale: version.locale,
        title: docText(version.title, 200),
        summary: docText(version.summary, 500),
        blockCount: Number(version.blockCount || 0),
        updatedAt: version.updatedAt,
      })),
  }
}

/* ---------------------------------------------------------------
   API раздела
   --------------------------------------------------------------- */

/**
 * Создаёт роутер документации.
 * Требует `pool` и middleware авторизации из server/index.js.
 */
export function createDocsApi({ pool, requireTelegramUser, requireAdminSession }) {
  const router = Router()

  /* --- пользовательская часть: только опубликованные статьи --- */

  router.get('/api/docs', requireTelegramUser, async (req, res, next) => {
    const requested = requestedLocale(req)
    const client = await pool.connect()

    try {
      const result = await client.query(
        `
        SELECT a.id, a.icon, a.theme, a.topic, a.is_faq, a.updated_at,
               COALESCE((
                 SELECT jsonb_object_agg(t.locale, jsonb_build_object('title', t.title, 'summary', t.summary))
                 FROM doc_translations t
                 WHERE t.article_id = a.id
               ), '{}'::jsonb) AS translations
        FROM doc_articles a
        WHERE a.status = 'published'
        ORDER BY a.sort_order ASC, a.id ASC
        `,
      )

      res.json({
        locale: requested,
        articles: result.rows.map((row) => buildArticleSummary(row, requested)),
      })
    } catch (error) {
      next(error)
    } finally {
      client.release()
    }
  })

  router.get('/api/docs/:id', requireTelegramUser, async (req, res, next) => {
    const articleId = Number(req.params.id)

    if (!Number.isInteger(articleId) || articleId <= 0) {
      res.status(400).json({ error: 'Некорректная статья' })
      return
    }

    const requested = requestedLocale(req)
    const client = await pool.connect()

    try {
      const articleResult = await client.query(
        'SELECT id, icon, theme, topic, is_faq, updated_at FROM doc_articles WHERE id = $1 AND status = $2',
        [articleId, 'published'],
      )

      if (articleResult.rowCount === 0) {
        res.status(404).json({ error: 'Статья не найдена' })
        return
      }

      const translations = await getTranslationMap(client, articleId)

      res.json({
        locale: requested,
        article: buildArticleDetail(articleResult.rows[0], translations, requested),
      })
    } catch (error) {
      next(error)
    } finally {
      client.release()
    }
  })

  /* --- админка: полный CRUD по статьям --- */

  router.get('/api/admin/docs', requireTelegramUser, requireAdminSession, async (_req, res, next) => {
    const client = await pool.connect()

    try {
      res.json({ articles: await getAdminArticleRows(client) })
    } catch (error) {
      next(error)
    } finally {
      client.release()
    }
  })

  router.get('/api/admin/docs/:id', requireTelegramUser, requireAdminSession, async (req, res, next) => {
    const articleId = Number(req.params.id)

    if (!Number.isInteger(articleId) || articleId <= 0) {
      res.status(400).json({ error: 'Некорректная статья' })
      return
    }

    const client = await pool.connect()

    try {
      const article = await loadAdminArticle(client, articleId)

      if (!article) {
        res.status(404).json({ error: 'Статья не найдена' })
        return
      }

      res.json({ article })
    } catch (error) {
      next(error)
    } finally {
      client.release()
    }
  })

  router.post('/api/admin/docs', requireTelegramUser, requireAdminSession, async (req, res, next) => {
    const locale = normalizeDocsLocale(req.body.locale) || docsFallbackLocale
    const title = docText(req.body.title, 200).trim()

    if (!title) {
      res.status(400).json({ error: 'Укажи название статьи' })
      return
    }

    const icon = docText(req.body.icon, 8).trim() || '📘'
    const theme = docsThemes.includes(req.body.theme) ? req.body.theme : docsThemes[0]
    const status = docsStatuses.includes(req.body.status) ? req.body.status : 'draft'
    const client = await pool.connect()

    try {
      const created = await client.query(
        `
        INSERT INTO doc_articles (icon, theme, status, topic, is_faq, sort_order)
        VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sort_order) + 1 FROM doc_articles), 0))
        RETURNING id
        `,
        [icon, theme, status, docTopic(req.body.topic), docBool(req.body.isFaq)],
      )

      const articleId = Number(created.rows[0].id)

      await client.query(
        `
        INSERT INTO doc_translations (article_id, locale, title, summary, blocks)
        VALUES ($1, $2, $3, '', '[]'::jsonb)
        `,
        [articleId, locale, title],
      )

      res.json({ ok: true, article: await loadAdminArticle(client, articleId) })
    } catch (error) {
      next(error)
    } finally {
      client.release()
    }
  })

  router.put('/api/admin/docs/:id', requireTelegramUser, requireAdminSession, async (req, res, next) => {
    const articleId = Number(req.params.id)

    if (!Number.isInteger(articleId) || articleId <= 0) {
      res.status(400).json({ error: 'Некорректная статья' })
      return
    }

    const versions = normalizeTranslationsPayload(req.body.translations)

    if (JSON.stringify(versions).length > docsMaxPayloadBytes) {
      res.status(400).json({ error: 'Статья слишком большая' })
      return
    }

    const icon = docText(req.body.icon, 8).trim() || '📘'
    const theme = docsThemes.includes(req.body.theme) ? req.body.theme : docsThemes[0]
    const status = docsStatuses.includes(req.body.status) ? req.body.status : 'draft'
    const client = await pool.connect()

    try {
      const existing = await client.query('SELECT id FROM doc_articles WHERE id = $1', [articleId])

      if (existing.rowCount === 0) {
        res.status(404).json({ error: 'Статья не найдена' })
        return
      }

      await client.query('BEGIN')

      await client.query(
        'UPDATE doc_articles SET icon = $2, theme = $3, status = $4, topic = $5, is_faq = $6, updated_at = now() WHERE id = $1',
        [articleId, icon, theme, status, docTopic(req.body.topic), docBool(req.body.isFaq)],
      )

      for (const version of versions) {
        await client.query(
          `
          INSERT INTO doc_translations (article_id, locale, title, summary, blocks, updated_at)
          VALUES ($1, $2, $3, $4, $5::jsonb, now())
          ON CONFLICT (article_id, locale) DO UPDATE
          SET title = EXCLUDED.title,
              summary = EXCLUDED.summary,
              blocks = EXCLUDED.blocks,
              updated_at = now()
          `,
          [articleId, version.locale, version.title, version.summary, JSON.stringify(version.blocks)],
        )
      }

      // Языковая версия, которой нет в запросе, удаляется — так работает
      // кнопка «удалить языковую версию» в админке. Пустой список версий
      // игнорируется, чтобы случайный запрос не стёр статью целиком.
      if (versions.length > 0) {
        await client.query(
          'DELETE FROM doc_translations WHERE article_id = $1 AND NOT (locale = ANY($2::text[]))',
          [articleId, versions.map((version) => version.locale)],
        )
      }

      await client.query('COMMIT')

      res.json({ ok: true, article: await loadAdminArticle(client, articleId) })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      next(error)
    } finally {
      client.release()
    }
  })

  router.post('/api/admin/docs/:id/move', requireTelegramUser, requireAdminSession, async (req, res, next) => {
    const articleId = Number(req.params.id)
    const direction = req.body.direction === 'up' ? -1 : req.body.direction === 'down' ? 1 : 0

    if (!Number.isInteger(articleId) || articleId <= 0) {
      res.status(400).json({ error: 'Некорректная статья' })
      return
    }

    if (!direction) {
      res.status(400).json({ error: 'Некорректное направление' })
      return
    }

    const client = await pool.connect()

    try {
      const result = await client.query('SELECT id FROM doc_articles ORDER BY sort_order ASC, id ASC')
      const order = result.rows.map((row) => Number(row.id))
      const index = order.indexOf(articleId)
      const target = index + direction

      if (index === -1) {
        res.status(404).json({ error: 'Статья не найдена' })
        return
      }

      if (target >= 0 && target < order.length) {
        const reordered = [...order]
        reordered[index] = order[target]
        reordered[target] = order[index]

        await client.query('BEGIN')

        for (const [position, id] of reordered.entries()) {
          await client.query('UPDATE doc_articles SET sort_order = $2 WHERE id = $1', [id, position])
        }

        await client.query('COMMIT')
      }

      res.json({ ok: true, articles: await getAdminArticleRows(client) })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      next(error)
    } finally {
      client.release()
    }
  })

  router.delete('/api/admin/docs/:id', requireTelegramUser, requireAdminSession, async (req, res, next) => {
    const articleId = Number(req.params.id)

    if (!Number.isInteger(articleId) || articleId <= 0) {
      res.status(400).json({ error: 'Некорректная статья' })
      return
    }

    const client = await pool.connect()

    try {
      const deleted = await client.query('DELETE FROM doc_articles WHERE id = $1', [articleId])

      if (deleted.rowCount === 0) {
        res.status(404).json({ error: 'Статья не найдена' })
        return
      }

      res.json({ ok: true, articles: await getAdminArticleRows(client) })
    } catch (error) {
      next(error)
    } finally {
      client.release()
    }
  })



  return router
}

/* ---------------------------------------------------------------
   Вспомогательные запросы админки
   --------------------------------------------------------------- */

const adminArticleListSql = `
SELECT a.id, a.icon, a.theme, a.status, a.topic, a.is_faq, a.sort_order, a.updated_at,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'locale', t.locale,
           'title', t.title,
           'summary', t.summary,
           'blockCount', jsonb_array_length(t.blocks),
           'updatedAt', t.updated_at
         ) ORDER BY t.locale)
         FROM doc_translations t
         WHERE t.article_id = a.id
       ), '[]'::jsonb) AS translations
FROM doc_articles a
ORDER BY a.sort_order ASC, a.id ASC
`

/** Список статей для админки (без блоков, но со счётчиками по языкам). */
async function getAdminArticleRows(client) {
  const result = await client.query(adminArticleListSql)
  return result.rows.map(buildAdminArticleRow)
}

/** Полная статья для админки либо null, если её нет. */
async function loadAdminArticle(client, articleId) {
  const result = await client.query(
    'SELECT id, icon, theme, status, topic, is_faq, sort_order, updated_at FROM doc_articles WHERE id = $1',
    [articleId],
  )

  if (result.rowCount === 0) {
    return null
  }

  return buildAdminArticleDetail(result.rows[0], await getTranslationMap(client, articleId))
}




export default createDocsApi
