import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/**
 * Премиум-эмодзи Telegram (custom emoji) для мини-аппа.
 *
 * В `shop_items` категория `premium_emojis` хранит в `text_m` числовой
 * `custom_emoji_id` — тот же id, что бот подставляет в `<tg-emoji emoji-id>`.
 * Сама анимация — обычный документ-стикер в Telegram: `.tgs` (gzip-Lottie),
 * `.webm` (видео) или статичный `.webp`/`.png`/`.jpg`. Достаём её через Bot API
 * (`getCustomEmojiStickers` → `getFile` → скачивание файла) — юзербот для этого
 * не нужен: MTProto-сессия требуется только для подарков, которые надо
 * переводить с аккаунта.
 *
 * Файлы кладём в кэш (`EMOJI_CACHE_DIR`, по умолчанию `public/emojis` — туда же
 * пишет команда `+стикер` бота, `app/owner/emoji_saver.py`): `{id}.tgs` —
 * исходник, `{id}.json` — распакованный Lottie для плеера, `{id}.webp|.webm|...`
 * — статичные и видео форматы, `{id}.meta.json` — символ-заменитель и метаданные.
 * Повторные запросы обслуживаются с диска, в Telegram ходим только за новым id.
 *
 * Ручки (открытые, как у стикеров подарков: их читает браузерный плеер и
 * `<video>`, initData передать не могут — по id доступна только публичная
 * анимация эмодзи):
 *
 *   GET /api/emoji/{id}         — описание: `{ format, src, emoji }`, где
 *                                 `format` = `lottie` | `image` | `video`,
 *                                 `src` = `/api/emoji/{id}.{ext}`;
 *   GET /api/emoji/{id}.{ext}   — сам файл (`.json` — Lottie, `.webp`, `.webm`,
 *                                 `.png`, `.jpg`, `.tgs`).
 *
 * Настройки окружения:
 *   EMOJI_CACHE_DIR    — папка кэша (по умолчанию `<корень>/public/emojis`);
 *   EMOJI_TIMEOUT_MS   — таймаут одного обращения к Telegram (по умолчанию 30000).
 */

const defaultTimeoutMs = 30000
const errorRetryMs = 30000
const cacheMaxAgeSeconds = 604800
const cacheHeader = `public, max-age=${cacheMaxAgeSeconds}`

/** `custom_emoji_id` — int64, поэтому только цифры и без ведущих нулей не проверяем. */
const emojiIdPattern = /^\d{1,20}$/
const emojiFilePattern = /^(\d{1,20})\.(json|webp|webm|png|jpe?g|tgs)$/

const contentTypes = {
  json: 'application/json; charset=utf-8',
  webp: 'image/webp',
  webm: 'video/webm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  tgs: 'application/x-tgsticker',
}

/** Расширение файла → формат, который понимает плеер в приложении. */
const formatByExt = {
  json: 'lottie',
  tgs: 'lottie',
  webp: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webm: 'video',
}

class EmojiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const notFound = message => new EmojiError('not_found', message)
const notConfigured = message => new EmojiError('not_configured', message)
const unavailable = message => new EmojiError('unavailable', message)

/**
 * Сервис премиум-эмодзи: кэш на диске + Bot API.
 *
 * Вынесен отдельно от роутера, чтобы тесты могли работать с ним напрямую,
 * подменяя `fetchImpl` и `cacheDir` — как в остальных модулях сервера.
 */
export function createEmojiService({ botToken = '', cacheDir = '', timeoutMs = 0, fetchImpl = null } = {}) {
  const doFetch = fetchImpl || fetch
  const dir = String(cacheDir || '').trim()
  const requestTimeoutMs = () => {
    const value = Number(timeoutMs || process.env.EMOJI_TIMEOUT_MS)

    return Number.isFinite(value) && value > 0 ? value : defaultTimeoutMs
  }

  /** Идущие и недавно неудавшиеся загрузки: id эмодзи → Promise / время промаха. */
  const pending = new Map()
  const failures = new Map()

  function metaPath(id) {
    return path.join(dir, `${id}.meta.json`)
  }

  function readJson(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }

  /**
   * Символ-заменитель эмодзи: своё `{id}.meta.json`, иначе манифест
   * `emojis.json`, который ведёт команда `+стикер` бота (`emoji_saver.py`).
   */
  function fallbackEmoji(id) {
    const meta = readJson(metaPath(id))
    if (meta?.emoji) {
      return String(meta.emoji)
    }

    const manifest = readJson(path.join(dir, 'emojis.json'))
    const entry = manifest?.emojis?.[id]

    return entry?.emoji ? String(entry.emoji) : ''
  }

  /**
   * Готовый файл эмодзи в кэше: `{id}.json` (Lottie), затем статичные и видео
   * форматы, в конце — сырой `.tgs` (его надо распаковать в `.json`).
   */
  function findCached(id) {
    for (const ext of ['json', 'webp', 'webm', 'png', 'jpg', 'jpeg']) {
      const file = path.join(dir, `${id}.${ext}`)

      try {
        if (fs.statSync(file).size > 0) {
          return { ext, format: formatByExt[ext] }
        }
      } catch {
        // файла нет — смотрим дальше
      }
    }

    try {
      if (fs.statSync(path.join(dir, `${id}.tgs`)).size > 0) {
        return { ext: 'tgs', format: 'lottie' }
      }
    } catch {
      // и его нет
    }

    return null
  }

  /** Распаковывает `.tgs` (gzip-Lottie) в `.json` рядом — как `extract_lottie_json` у юзербота. */
  function unpackTgs(id) {
    const tgsPath = path.join(dir, `${id}.tgs`)
    const jsonPath = path.join(dir, `${id}.json`)

    try {
      if (fs.statSync(jsonPath).size > 0 && fs.statSync(jsonPath).mtimeMs >= fs.statSync(tgsPath).mtimeMs) {
        return
      }
    } catch {
      // json ещё нет или старее — собираем заново
    }

    let data = fs.readFileSync(tgsPath)

    if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
      data = zlib.gunzipSync(data)
    }

    JSON.parse(data.toString('utf8'))
    fs.writeFileSync(jsonPath, data)
  }

  async function telegramApi(method, payload) {
    if (!botToken) {
      throw notConfigured('BOT_TOKEN не настроен на сервере')
    }

    const response = await doFetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(requestTimeoutMs()),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok || !result.ok) {
      throw unavailable(result.description || `Telegram Bot API error in ${method}`)
    }

    return result.result
  }

  /** Расширение и mime по `file_path`/`mime_type` из `getFile`. */
  function fileKind(filePath, mimeType) {
    const ext = path.extname(String(filePath || '')).slice(1).toLowerCase()
    const mime = String(mimeType || '').toLowerCase()

    if (ext === 'tgs' || mime.includes('tgsticker')) return { ext: 'tgs', format: 'lottie' }
    if (ext === 'webm' || mime.includes('video/webm')) return { ext: 'webm', format: 'video' }
    if (ext === 'webp' || mime.includes('image/webp')) return { ext: 'webp', format: 'image' }
    if (ext === 'png' || mime.includes('image/png')) return { ext: 'png', format: 'image' }
    if (ext === 'jpg' || ext === 'jpeg' || mime.includes('image/jpeg')) {
      return { ext: ext === 'jpeg' ? 'jpg' : (ext || 'jpg'), format: 'image' }
    }

    return { ext: 'bin', format: 'unknown' }
  }

  /** Качает документ эмодзи из Telegram и раскладывает по кэшу. */
  async function downloadEmoji(id) {
    const stickers = await telegramApi('getCustomEmojiStickers', { custom_emoji_ids: [id] })
    const sticker = Array.isArray(stickers) ? stickers[0] : null

    if (!sticker?.file_id) {
      throw notFound('Telegram не вернул стикер для этого эмодзи')
    }

    const file = await telegramApi('getFile', { file_id: sticker.file_id })
    const filePath = String(file?.file_path || '').trim()

    if (!filePath) {
      throw unavailable('Telegram не отдал файл эмодзи')
    }

    const response = await doFetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
      signal: AbortSignal.timeout(requestTimeoutMs()),
    })

    if (!response.ok) {
      throw unavailable(`Telegram не отдал файл эмодзи (HTTP ${response.status})`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const kind = fileKind(filePath, file?.mime_type)

    if (kind.format === 'unknown') {
      throw unavailable(`неизвестный формат эмодзи: ${file?.mime_type || filePath}`)
    }

    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${id}.${kind.ext}`), buffer)

    if (kind.ext === 'tgs') {
      unpackTgs(id)
    }

    const meta = {
      emoji: String(sticker.emoji || ''),
      setName: String(sticker.set_name || ''),
      format: kind.format,
      ext: kind.ext === 'tgs' ? 'json' : kind.ext,
      mimeType: String(file?.mime_type || ''),
      size: buffer.length,
      addedAt: new Date().toISOString(),
    }

    fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2))

    return { ext: meta.ext, format: kind.format, emoji: meta.emoji }
  }

  /**
   * Гарантирует, что у эмодзи есть файл в кэше, и возвращает
   * `{ ext, format, emoji }`: `ext` — расширение отдаваемого файла
   * (`.tgs` превращается в `.json`), `format` — `lottie` | `image` | `video`.
   */
  async function ensure(id) {
    const emojiId = String(id || '').trim()

    if (!emojiIdPattern.test(emojiId)) {
      throw notFound('Некорректный id эмодзи')
    }

    const cached = findCached(emojiId)

    if (cached) {
      if (cached.ext === 'tgs') {
        try {
          unpackTgs(emojiId)
        } catch (error) {
          throw unavailable(`не удалось распаковать эмодзи: ${error?.message || error}`)
        }

        return { ext: 'json', format: 'lottie', emoji: fallbackEmoji(emojiId) }
      }

      return { ext: cached.ext, format: cached.format, emoji: fallbackEmoji(emojiId) }
    }

    const failed = failures.get(emojiId)

    if (failed && Date.now() - failed < errorRetryMs) {
      throw unavailable('эмодзи временно недоступно — попробуйте позже')
    }

    const running = pending.get(emojiId)

    if (running) {
      return running
    }

    const job = downloadEmoji(emojiId)
      .catch(error => {
        failures.set(emojiId, Date.now())
        throw error
      })
      .finally(() => pending.delete(emojiId))

    pending.set(emojiId, job)

    return job
  }

  /**
   * Отдаёт файл эмодзи с диска. `ensure` вызываем и здесь: если плеер запросил
   * `.json` первым (минуя описание), файл всё равно докачается и распакуется.
   * Расширение из адреса служит как есть: `.webp` у lottie-эмодзи — честный 404,
   * а не подмена чужим форматом.
   */
  async function readFile(id, ext) {
    await ensure(id)

    const file = path.join(dir, `${id}.${ext}`)

    try {
      const data = fs.readFileSync(file)

      if (data.length > 0) {
        return { data, ext }
      }
    } catch {
      // ниже — понятный 404
    }

    throw notFound('Такого файла эмодзи нет')
  }

  return { ensure, readFile, dir }
}

/**
 * HTTP-ручки премиум-эмодзи.
 *
 * Открытые, как `/api/gifts/sticker/...`: по id отдаётся только публичная
 * анимация эмодзи, авторизация initData здесь ничего не защищает.
 */
export function createEmojisApi({ botToken = '', cacheDir = '' } = {}) {
  const service = createEmojiService({ botToken, cacheDir })
  const router = Router()

  function sendError(res, error) {
    const code = error?.code || 'unavailable'
    const status = code === 'not_found' ? 404 : code === 'not_configured' ? 503 : 502

    res.status(status).json({ error: error?.message || 'Эмодзи недоступно' })
  }

  router.get('/api/emoji/:target', async (req, res) => {
    const target = String(req.params.target || '')
    const fileMatch = emojiFilePattern.exec(target)

    try {
      if (fileMatch) {
        const [, id, ext] = fileMatch
        const { data, ext: servedExt } = await service.readFile(id, ext)

        res.setHeader('Content-Type', contentTypes[servedExt] || 'application/octet-stream')
        res.setHeader('Cache-Control', cacheHeader)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.send(data)
        return
      }

      if (!emojiIdPattern.test(target)) {
        res.status(404).json({ error: 'Эмодзи не найдено' })
        return
      }

      const info = await service.ensure(target)

      res.json({
        ok: true,
        emojiId: target,
        format: info.format,
        src: `/api/emoji/${target}.${info.ext}`,
        emoji: info.emoji || null,
      })
    } catch (error) {
      console.warn('[emojis] запрос эмодзи не выполнен:', error?.message || error)
      sendError(res, error)
    }
  })

  return router
}

export default createEmojisApi
