import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import zlib from 'node:zlib'
import { createEmojiService } from './emojisApi.js'

const emojiId = '5230000000000000001'

function tmpCache() {
  return mkdtempSync(path.join(tmpdir(), 'emoji-cache-'))
}

function tgsBytes(payload = { v: '5.7.0', fr: 60, ip: 0, op: 30, w: 100, h: 100, layers: [] }) {
  return zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
}

/**
 * Подмена fetch для Bot API: `getCustomEmojiStickers` → `getFile` → файл.
 * `file` — { path, mime, bytes } ответа `getFile` и скачивания.
 */
function telegramFetch({ sticker = {}, file = null, calls = [] } = {}) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options })

    const method = String(url).split('/').pop()

    if (method === 'getCustomEmojiStickers') {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: sticker.file_id
            ? [{ file_id: sticker.file_id, emoji: sticker.emoji || '', set_name: sticker.set_name || '' }]
            : [],
        }),
      }
    }

    if (method === 'getFile') {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: file
            ? { file_path: file.path, file_size: file.bytes.length, mime_type: file.mime }
            : {},
        }),
      }
    }

    // Скачивание файла: https://api.telegram.org/file/bot<token>/<path>
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength),
    }
  }
}

test('ensure отдаёт статичный webp из кэша без обращения к Telegram', async () => {
  const dir = tmpCache()
  writeFileSync(path.join(dir, `${emojiId}.webp`), Buffer.from('webp-bytes'))

  let called = 0
  const service = createEmojiService({
    botToken: 'test-token',
    cacheDir: dir,
    fetchImpl: async () => { called += 1; throw new Error('не должно вызываться') },
  })

  const info = await service.ensure(emojiId)

  assert.equal(info.format, 'image')
  assert.equal(info.ext, 'webp')
  assert.equal(called, 0)
})

test('ensure распаковывает .tgs из кэша в Lottie-JSON', async () => {
  const dir = tmpCache()
  writeFileSync(path.join(dir, `${emojiId}.tgs`), tgsBytes())

  const service = createEmojiService({ botToken: 'test-token', cacheDir: dir, fetchImpl: async () => { throw new Error('fetch') } })

  const info = await service.ensure(emojiId)

  assert.equal(info.format, 'lottie')
  assert.equal(info.ext, 'json')

  const json = JSON.parse(readFileSync(path.join(dir, `${emojiId}.json`), 'utf8'))
  assert.equal(json.v, '5.7.0')
})

test('ensure скачивает tgs-эмодзи через Bot API и кладёт json + meta', async () => {
  const dir = tmpCache()
  const calls = []
  const service = createEmojiService({
    botToken: 'test-token',
    cacheDir: dir,
    fetchImpl: telegramFetch({
      calls,
      sticker: { file_id: 'file-1', emoji: '😎', set_name: 'premium_pack' },
      file: { path: 'stickers/emoji.tgs', mime: 'application/x-tgsticker', bytes: tgsBytes() },
    }),
  })

  const info = await service.ensure(emojiId)

  assert.equal(info.format, 'lottie')
  assert.equal(info.ext, 'json')
  assert.equal(info.emoji, '😎')
  assert.ok(existsSync(path.join(dir, `${emojiId}.tgs`)))
  assert.ok(existsSync(path.join(dir, `${emojiId}.json`)))

  const meta = JSON.parse(readFileSync(path.join(dir, `${emojiId}.meta.json`), 'utf8'))
  assert.equal(meta.emoji, '😎')
  assert.equal(meta.setName, 'premium_pack')

  // Три обращения к Telegram: стикеры, файл, скачивание.
  assert.equal(calls.length, 3)

  // Повторный ensure обслуживается с диска.
  const again = await service.ensure(emojiId)
  assert.equal(again.ext, 'json')
  assert.equal(calls.length, 3)
})

test('ensure скачивает webm-эмодзи как видео', async () => {
  const dir = tmpCache()
  const service = createEmojiService({
    botToken: 'test-token',
    cacheDir: dir,
    fetchImpl: telegramFetch({
      sticker: { file_id: 'file-2', emoji: '🔥' },
      file: { path: 'stickers/emoji.webm', mime: 'video/webm', bytes: Buffer.from('webm-bytes') },
    }),
  })

  const info = await service.ensure(emojiId)

  assert.equal(info.format, 'video')
  assert.equal(info.ext, 'webm')

  const { data } = await service.readFile(emojiId, 'webm')
  assert.equal(data.toString(), 'webm-bytes')
})

test('ensure: Telegram не знает эмодзи — not_found, повтор в течение ttl не ходит в сеть', async () => {
  const dir = tmpCache()
  const calls = []
  const service = createEmojiService({
    botToken: 'test-token',
    cacheDir: dir,
    fetchImpl: telegramFetch({ calls, sticker: {} }),
  })

  await assert.rejects(service.ensure(emojiId), error => error.code === 'not_found')
  assert.equal(calls.length, 1)

  await assert.rejects(service.ensure(emojiId), error => error.code === 'unavailable')
  assert.equal(calls.length, 1)
})

test('ensure отклоняет некорректный id', async () => {
  const service = createEmojiService({ botToken: 'test-token', cacheDir: tmpCache(), fetchImpl: async () => { throw new Error('fetch') } })

  for (const bad of ['', 'abc', '../etc', '12-34', '1'.repeat(25)]) {
    await assert.rejects(service.ensure(bad), error => error.code === 'not_found')
  }
})

test('ensure без BOT_TOKEN — not_configured', async () => {
  const service = createEmojiService({ botToken: '', cacheDir: tmpCache(), fetchImpl: async () => { throw new Error('fetch') } })

  await assert.rejects(service.ensure(emojiId), error => error.code === 'not_configured')
})

test('readFile отдаёт файл по запрошенному расширению и 404 на чужой формат', async () => {
  const dir = tmpCache()
  writeFileSync(path.join(dir, `${emojiId}.json`), Buffer.from('{"v":"5.7.0"}'))

  const service = createEmojiService({ botToken: 'test-token', cacheDir: dir, fetchImpl: async () => { throw new Error('fetch') } })

  const { data, ext } = await service.readFile(emojiId, 'json')
  assert.equal(ext, 'json')
  assert.equal(data.toString(), '{"v":"5.7.0"}')

  // У lottie-эмодзи нет .webp — запрошенный формат не подменяем.
  await assert.rejects(service.readFile(emojiId, 'webp'), error => error.code === 'not_found')
})
