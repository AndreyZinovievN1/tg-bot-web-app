import { randomBytes } from 'node:crypto'
import { Router } from 'express'

export function createDropProfiles({ pool, botToken }) {
  const router = Router()
  const tokens = new Map()
  const lifetime = 15 * 60 * 1000
  const prune = () => {
    for (const [key, entry] of tokens) if (entry.expires <= Date.now()) tokens.delete(key)
    while (tokens.size >= 512) tokens.delete(tokens.keys().next().value)
  }
  const avatarUrl = chatId => {
    prune()
    for (const [key, entry] of tokens) if (entry.chatId === chatId) return `/api/cases/drop-avatar/${key}`
    const key = randomBytes(24).toString('hex')
    tokens.set(key, { chatId, expires: Date.now() + lifetime, image: null, pending: null })
    return `/api/cases/drop-avatar/${key}`
  }
  const telegram = async (method, payload) => {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error('Avatar unavailable')
    return data.result
  }
  const loadAvatar = async chatId => {
    if (!botToken) return null
    const photos = await telegram('getUserProfilePhotos', { user_id: Number(chatId), limit: 1 })
    const photo = photos.photos?.[0]?.[0]
    if (!photo) return null
    const file = await telegram('getFile', { file_id: photo.file_id })
    const path = String(file.file_path || '')
    if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..')) return null
    const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${path}`, { signal: AbortSignal.timeout(5000), redirect: 'error' })

    if (!response.ok || !response.body) return null
    const reader = response.body.getReader()
    const chunks = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > 256 * 1024) { await reader.cancel(); return null }
        chunks.push(Buffer.from(value))
      }
    } finally { reader.releaseLock() }
    // Telegram file downloads may use application/octet-stream. Verify bytes instead.
    const bytes = Buffer.concat(chunks)
    const type = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null
    return type ? { type, bytes } : null
  }
  // Opaque, expiring capability URL: never contains Telegram IDs or bot tokens.
  router.get('/api/cases/drop-avatar/:token', async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    const entry = tokens.get(req.params.token)
    try {
      if (!entry || entry.expires <= Date.now()) return res.sendStatus(404)
      if (!entry.pending && !entry.image && (!entry.retryAt || entry.retryAt <= Date.now())) {
        entry.pending = loadAvatar(entry.chatId).catch(() => null).then(image => {
          entry.image = image
          entry.retryAt = Date.now() + 30_000
        }).finally(() => { entry.pending = null })
      }
      await entry.pending
      if (!entry.image) return res.sendStatus(404)
      res.type(entry.image.type).send(entry.image.bytes)
    } catch { res.sendStatus(404) } // Never return or log a token-bearing Telegram URL.
  })

  async function decorate(drops) {
    if (!drops.length) return drops
    const result = await pool.query(`SELECT o.id::text AS opening_id, u.chat_id::text AS owner,
      u.name
      FROM case_openings o JOIN users u ON u.chat_id = o.chat_id
      WHERE o.id = ANY($1::bigint[])`, [drops.map(drop => drop.id)]).catch(() => ({ rows: [] }))
    const users = new Map(result.rows.map(user => [user.opening_id, user]))
    return drops.map(drop => {
      const user = users.get(drop.id)
      if (!user) return { ...drop, winner: null }
      return { ...drop, winner: {
        name: String(user.name || '').trim().slice(0, 200),
        avatarUrl: avatarUrl(user.owner),
      } }
    })
  }
  return { router, decorate }
}
