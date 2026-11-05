import { randomUUID } from 'node:crypto'
import { Router } from 'express'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const workerLock = 718634001

// Called ONLY inside the opening transaction. No provider requests here.
export async function enqueueCaseGift(client, { chatId, requestId, index, row, template, langCode = '' }) {
  const id = randomUUID()
  await client.query('INSERT INTO mini_app_case_deliveries (id, chat_id, request_id, reward_index, input) VALUES ($1,$2,$3,$4,$5::jsonb)',
    [id, chatId, requestId, index, JSON.stringify({ row, template, langCode })])
  const unique = row.giftKind === 'unique'
  return {
    queuedId: id,
    reward: { type: 'gift', code: unique ? 'tg-unique' : 'tg-gift', giftId: String(row.giftId),
      giftKind: unique ? 'unique' : 'regular', giftNum: Number(row.giftNum) || 0,
      title: unique ? 'Уникальный подарок Telegram' : 'Подарок Telegram',
      description: 'Подарок ожидает отправки.', deliveryId: id, deliveryRequestId: requestId, deliveryStatus: 'queued',
      payload: { giftId: String(row.giftId), num: Number(row.giftNum) || 0,
        delivery: 'telegram', deliveryId: id, deliveryStatus: 'queued' } },
    delivery: null,
  }
}

export function deliveryFailure(error, attempts) {
  // Only an explicit provider rejection/preflight failure is safe to retry.
  if (error?.details?.outcome === 'not_sent') {
    if (error.details.retryAfter > 0 && attempts < 5) {
      return { status: 'queued', delay: Math.min(86400, Math.max(5, error.details.retryAfter)), code: 'provider_retry' }
    }
    return { status: 'failed', delay: 0, code: 'provider_rejected' }
  }
  return { status: 'review', delay: 0, code: 'outcome_unknown' }
}

// Never infer "not sent" from a timeout, lost connection, restart, or HTTP 5xx.
export function createCaseGiftQueue({ pool, deliver, onSent = async () => {}, logger = console }) {
  let running = false
  let timer
  let lastErrorCode

  async function finish(client, row, status, code, delay = 0, reason = null) {
    await client.query('BEGIN')
    try {
      const updated = await client.query(
        "UPDATE mini_app_case_deliveries SET status=$3, error_code=$4, last_error=$6, available_at=now()+($5 * interval '1 second'), updated_at=now() " +
        "WHERE id=$1 AND attempt_id=$2 AND status IN ('sending','review') RETURNING opening_id",
        [row.id, row.attempt_id, status, code, delay, reason])
      if (updated.rows.length) {
        const history = await client.query(
          "UPDATE case_openings SET reward_payload=jsonb_set(reward_payload,'{deliveryStatus}',to_jsonb($2::text)) WHERE id=$1 AND reward_payload->>'deliveryId'=$3",
          [updated.rows[0].opening_id, status, row.id])
        if (history.rowCount !== 1) throw new Error('Delivery history missing')
      }
      await client.query('COMMIT')
      return updated.rows.length > 0
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  }

  async function runOnce() {
    if (running) return false
    running = true
    let client, locked = false, failed = false
    try {
      client = await pool.connect()
      const lock = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [workerLock])
      locked = lock.rows[0].locked
      if (!locked) return false
      // An abandoned in-flight call is NEVER requeued. The provider may have sent it.
      await client.query("WITH recovered AS (UPDATE mini_app_case_deliveries SET status='review', error_code='interrupted', updated_at=now() WHERE status='sending' AND started_at < now()-interval '10 minutes' RETURNING id, opening_id) " +
        "UPDATE case_openings o SET reward_payload=jsonb_set(o.reward_payload,'{deliveryStatus}',to_jsonb('review'::text)) FROM recovered d WHERE o.id=d.opening_id AND o.reward_payload->>'deliveryId'=d.id::text")
      const claimed = await client.query(
        "UPDATE mini_app_case_deliveries SET status='sending', attempt_id=$1, attempts=attempts+1, started_at=now(), updated_at=now() " +
        "WHERE id=(SELECT id FROM mini_app_case_deliveries WHERE status='queued' AND opening_id IS NOT NULL AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",
        [randomUUID()])
      const row = claimed.rows[0]
      if (!row) return false
      // The autocommit UPDATE above MUST be acknowledged before any external effect.
      // Prevent overlapping/second transfers of the same unique asset in this journal.
      if (row.input.row.giftKind === 'unique') {
        const duplicate = await client.query(
          "SELECT id FROM mini_app_case_deliveries WHERE id<>$1 AND input->'row'->>'giftKind'='unique' AND input->'row'->>'giftId'=$2 AND status IN ('sending','sent','review') LIMIT 1",
          [row.id, String(row.input.row.giftId)])
        if (duplicate.rows.length) {
          await finish(client, row, 'failed', 'unique_asset_reserved')
          return true
        }
      }
      let outcome = { status: 'sent', code: null, delay: 0 }
      let receipt
      try {
        receipt = await deliver({ client, chatId: row.chat_id, row: row.input.row,
          template: row.input.template, langCode: row.input.langCode, incident: row.id })
        if (receipt?.delivery?.ok !== true || receipt?.reward?.delivery !== 'telegram') throw new Error('Unconfirmed delivery')
      } catch (error) {
        outcome = deliveryFailure(error, row.attempts)
        outcome.reason = outcome.status === 'review' ? 'Provider outcome unknown'
          : String(error.reason || error.message || 'Delivery rejected')
            .replace(/https?:\/\/\S+/g, '[url]').replace(/\b\d{5,}:[A-Za-z0-9_-]+\b/g, '[token]').slice(0, 500)
      }
      // If saving this acknowledgement fails, leave sending/review intact. Do not resend.
      const saved = await finish(client, row, outcome.status, outcome.code, outcome.delay, outcome.reason)
      if (saved && outcome.status === 'sent') {
        // Release the worker connection independently of notification DB lookups.
        void Promise.resolve().then(() => onSent(row, receipt))
          .catch(() => logger.error('[cases/delivery] notification failed', { id: row.id }))
      } else if (saved && ['review', 'failed'].includes(outcome.status)) {
        logger.error('[cases/delivery] needs attention', { id: row.id, status: outcome.status, code: outcome.code })
      }
      return true
    } catch (error) { failed = true; throw error } finally {
      let discard = failed
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [workerLock]).catch(() => { discard = true })
      client?.release(discard)
      running = false
    }
  }

  const wake = () => runOnce().catch(error => {
    const code = error.code || 'QUEUE_ERROR'
    if (code !== lastErrorCode) logger.error('[cases/delivery] worker unavailable', { code })
    lastErrorCode = code
  })
  const start = () => { if (!timer) { timer = setInterval(wake, 5000); timer.unref(); void wake() } }
  const stop = () => { clearInterval(timer); timer = null }
  return { runOnce, wake, start, stop }
}

export function createCaseGiftQueueApi({ pool, requireTelegramUser, requireAdminSession, requireOwner }) {
  const router = Router()
  router.get('/api/cases/batches/:requestId/deliveries', requireTelegramUser, async (req, res, next) => {
    if (!uuid.test(req.params.requestId)) return res.sendStatus(400)
    try {
      const result = await pool.query('SELECT id, status FROM mini_app_case_deliveries WHERE chat_id=$1 AND request_id=$2 ORDER BY reward_index',
        [req.telegramUser.id, req.params.requestId])
      res.set('Cache-Control', 'no-store').json({ deliveries: result.rows })
    } catch (error) { next(error) }
  })
  router.get('/api/admin/cases/deliveries', requireTelegramUser, requireAdminSession, requireOwner, async (_req, res, next) => {
    try {
      const result = await pool.query("SELECT id, chat_id, request_id, reward_index, opening_id, status, attempts, error_code, last_error, updated_at, audit, input->'row' AS gift FROM mini_app_case_deliveries WHERE status<>'sent' ORDER BY updated_at LIMIT 100")
      res.set('Cache-Control', 'no-store').json({ deliveries: result.rows })
    } catch (error) { next(error) }
  })
  router.post('/api/admin/cases/deliveries/:id/resolve', requireTelegramUser, requireAdminSession, requireOwner, async (req, res, next) => {
    const { action, note } = req.body || {}
    if (!uuid.test(req.params.id) || !['retry', 'confirm_sent'].includes(action) || typeof note !== 'string' || note.trim().length < 10 || note.length > 1000) return res.sendStatus(400)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const found = await client.query('SELECT * FROM mini_app_case_deliveries WHERE id=$1 FOR UPDATE', [req.params.id])
      const row = found.rows[0]
      // Unknown outcomes can be confirmed with evidence, but can NEVER be retried here.
      if (!row || (action === 'retry' ? row.status !== 'failed' : !['review', 'failed'].includes(row.status))) {
        await client.query('ROLLBACK'); return res.sendStatus(409)
      }
      const status = action === 'retry' ? 'queued' : 'sent'
      const audit = JSON.stringify([{ action, note: note.trim(), actor: String(req.telegramUser.id), at: new Date().toISOString() }])
      await client.query('UPDATE mini_app_case_deliveries SET status=$2, available_at=now(), updated_at=now(), audit=audit || $3::jsonb WHERE id=$1', [row.id, status, audit])
      const history = await client.query("UPDATE case_openings SET reward_payload=jsonb_set(reward_payload,'{deliveryStatus}',to_jsonb($2::text)) WHERE id=$1 AND reward_payload->>'deliveryId'=$3", [row.opening_id, status, row.id])
      if (history.rowCount !== 1) throw new Error('Delivery history missing')
      await client.query('COMMIT')
      res.json({ ok: true, status })
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error) }
    finally { client.release() }
  })
  return router
}
