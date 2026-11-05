import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { parse } from '@babel/parser'
import { createCaseGiftQueue, createCaseGiftQueueApi, deliveryFailure, enqueueCaseGift } from './caseGiftQueue.js'
import { createCaseGiftDelivery } from './caseGifts.js'

const ack = { reward: { delivery: 'telegram' }, delivery: { ok: true } }
const requestId = '11111111-1111-4111-8111-111111111111'
const job = (id = '22222222-2222-4222-8222-222222222222', extra = {}) => ({
  id, chat_id: '123', request_id: requestId, opening_id: 7, status: 'queued', attempts: 0,
  input: { row: { type: 'gift', giftId: '5170233102089322756', giftKind: 'regular' }, template: { id: 'premium' } }, ...extra,
})

// Transactional double: exercises actual worker SQL boundaries, not Telegram or a live DB.
function memoryPool(initial) {
  const pool = { rows: structuredClone(initial), history: {}, queries: [], owner: null, failClaim: false, failHistory: false }
  pool.connect = async () => {
    let backup
    const client = { release(discard) { if (discard && pool.owner === client) pool.owner = null } }
    client.query = async (sql, args = []) => {
      pool.queries.push(sql)
      if (sql.includes('pg_try_advisory_lock')) {
        const locked = !pool.owner
        if (locked) pool.owner = client
        return { rows: [{ locked }] }
      }
      if (sql.includes('pg_advisory_unlock')) { pool.owner = null; return { rows: [] } }
      if (sql === 'BEGIN') { backup = structuredClone({ rows: pool.rows, history: pool.history }); return { rows: [] } }
      if (sql === 'COMMIT') { backup = null; return { rows: [] } }
      if (sql === 'ROLLBACK') { if (backup) Object.assign(pool, backup); backup = null; return { rows: [] } }
      if (sql.includes("error_code='interrupted'")) {
        for (const row of pool.rows) if (row.status === 'sending' && row.stale) row.status = 'review'
        return { rows: [] }
      }
      if (sql.includes("SET status='sending'")) {
        const row = pool.rows.find(item => item.status === 'queued' && !item.delayed)
        if (!row) return { rows: [] }
        Object.assign(row, { status: 'sending', attempt_id: args[0], attempts: row.attempts + 1 })
        if (pool.failClaim) { pool.failClaim = false; throw new Error('Claim commit acknowledgement lost') }
        return { rows: [structuredClone(row)] }
      }
      if (sql.includes("input->'row'->>'giftId'")) {
        return { rows: pool.rows.filter(row => row.id !== args[0] && row.input.row.giftId === args[1] && ['sent', 'sending', 'review'].includes(row.status)) }
      }
      if (sql.startsWith('UPDATE mini_app_case_deliveries SET status=$3')) {
        const row = pool.rows.find(item => item.id === args[0] && item.attempt_id === args[1] && ['sending', 'review'].includes(item.status))
        if (!row) return { rows: [] }
        Object.assign(row, { status: args[2], error_code: args[3], delayed: args[4] > 0 })
        return { rows: [{ opening_id: row.opening_id }] }
      }
      if (sql.startsWith('UPDATE case_openings')) {
        if (pool.failHistory) { pool.failHistory = false; throw new Error('History write failed') }
        pool.history[args[0]] = args[1]
        return { rows: [], rowCount: 1 }
      }
      throw new Error('Unexpected test SQL: ' + sql)
    }
    return client
  }
  return pool
}

test('queue stores immutable gift choice without any external call', async () => {
  const writes = []
  const row = { type: 'gift', giftId: '5170233102089322756', giftKind: 'unique', giftNum: 42 }
  const result = await enqueueCaseGift({ query: async (sql, args) => writes.push({ sql, args }) },
    { chatId: '123', requestId, index: 2, row, template: { id: 'premium' } })
  assert.equal(writes.length, 1)
  assert.equal(JSON.parse(writes[0].args[4]).row.giftId, row.giftId)
  assert.equal(writes[0].args[3], 2)
  assert.equal(result.reward.deliveryStatus, 'queued')
  assert.equal(result.reward.payload.deliveryId, result.queuedId)
  assert.equal(result.reward.deliveryRequestId, requestId)
})

test('delivery starts after durable claim; successful delivery is not repeated on restart', async () => {
  const pool = memoryPool([job()])
  let sends = 0
  const deliver = async () => { assert.equal(pool.rows[0].status, 'sending'); sends++; return ack }
  await createCaseGiftQueue({ pool, deliver }).runOnce()
  assert.equal(pool.rows[0].status, 'sent')
  assert.equal(pool.history[7], 'sent')
  await createCaseGiftQueue({ pool, deliver }).runOnce()
  assert.equal(sends, 1)
  assert.ok(pool.queries.every(sql => !/case_balances|UPDATE users|INSERT INTO inventory/.test(sql)))
})

test('concurrent workers cannot dispatch the same operation', async () => {
  const pool = memoryPool([job()])
  let sends = 0, release
  const gate = new Promise(resolve => { release = resolve })
  let started
  const ready = new Promise(resolve => { started = resolve })
  const deliver = async () => { sends++; started(); await gate; return ack }
  const first = createCaseGiftQueue({ pool, deliver }).runOnce()
  await ready
  assert.equal(await createCaseGiftQueue({ pool, deliver }).runOnce(), false)
  release(); await first
  assert.equal(sends, 1)
})

test('timeout becomes review, never automatic retry; next independent reward still delivers', async () => {
  const pool = memoryPool([job(), job('33333333-3333-4333-8333-333333333333', { opening_id: 8 })])
  let sends = 0
  const deliver = async () => { if (++sends === 1) throw new Error('Timeout'); return ack }
  const queue = createCaseGiftQueue({ pool, deliver })
  await queue.runOnce(); await queue.runOnce(); await queue.runOnce()
  assert.deepEqual(pool.rows.map(row => row.status), ['review', 'sent'])
  assert.equal(sends, 2)
  assert.equal(pool.history[7], 'review')
  assert.equal(pool.history[8], 'sent')
})

test('restart resumes queued jobs but quarantines stale sending jobs', async () => {
  const pool = memoryPool([job(undefined, { status: 'sending', stale: true }), job('33333333-3333-4333-8333-333333333333')])
  let sends = 0
  await createCaseGiftQueue({ pool, deliver: async () => { sends++; return ack } }).runOnce()
  assert.deepEqual(pool.rows.map(row => row.status), ['review', 'sent'])
  assert.equal(sends, 1)
})

test('lost claim acknowledgement never sends; lost post-send DB write never resends', async () => {
  for (const failure of ['failClaim', 'failHistory']) {
    const pool = memoryPool([job()]); pool[failure] = true
    let sends = 0
    const deliver = async () => { sends++; return ack }
    await assert.rejects(createCaseGiftQueue({ pool, deliver }).runOnce())
    assert.equal(pool.rows[0].status, 'sending')
    pool.rows[0].stale = true
    await createCaseGiftQueue({ pool, deliver }).runOnce()
    assert.equal(pool.rows[0].status, 'review')
    assert.equal(sends, failure === 'failClaim' ? 0 : 1)
  }
})

test('only explicit rate-limit rejection retries automatically, with bounded attempts', async () => {
  const error = { details: { outcome: 'not_sent', retryAfter: 20 } }
  assert.deepEqual(deliveryFailure(error, 1), { status: 'queued', delay: 20, code: 'provider_retry' })
  assert.equal(deliveryFailure(error, 5).status, 'failed')
  assert.equal(deliveryFailure(new Error('network'), 1).status, 'review')
  const pool = memoryPool([job()])
  let sends = 0
  const queue = createCaseGiftQueue({ pool, deliver: async () => { if (++sends === 1) throw error; return ack } })
  await queue.runOnce()
  assert.equal(pool.rows[0].status, 'queued')
  await queue.runOnce(); assert.equal(sends, 1)
  pool.rows[0].delayed = false
  await queue.runOnce(); assert.equal(sends, 2)
  assert.equal(pool.rows[0].status, 'sent')
})

test('same unique asset is not transferred twice or retried while its first outcome is unknown', async () => {
  for (const previous of ['sent', 'review']) {
    const input = { row: { giftId: '123', giftKind: 'unique' }, template: { id: 'premium' } }
    const pool = memoryPool([job(undefined, { status: previous, input }), job('33333333-3333-4333-8333-333333333333', { input })])
    let sends = 0
    await createCaseGiftQueue({ pool, deliver: async () => { sends++; return ack } }).runOnce()
    assert.equal(sends, 0)
    assert.equal(pool.rows[1].status, 'failed')
    assert.equal(pool.rows[1].error_code, 'unique_asset_reserved')
  }
})

test('real Telegram adapter distinguishes rejection, throttling and ambiguous transport errors', async () => {
  const originalFetch = globalThis.fetch
  const service = createCaseGiftDelivery({ botToken: 'test-only', mode: 'telegram', grantInternalGift: async () => { throw new Error('No substitution') } })
  try {
    for (const [response, expected, retry] of [
      [() => Response.json({ ok: false, error_code: 400, description: 'rejected' }, { status: 400 }), 'not_sent', 0],
      [() => Response.json({ ok: false, error_code: 429, parameters: { retry_after: 45 } }, { status: 429 }), 'not_sent', 45],
      [() => Response.json({ ok: false, error_code: 500 }, { status: 500 }), 'unknown', 0],
      [() => { throw new Error('network') }, 'unknown', 0],
    ]) {
      globalThis.fetch = response
      await assert.rejects(service.deliverGift({ chatId: 123, row: { giftId: '123' }, template: { id: 'premium' } }),
        error => error.details.outcome === expected && error.details.retryAfter === retry)
    }
    globalThis.fetch = async () => Response.json({ ok: true, result: true })
    const result = await service.deliverGift({ chatId: 123, row: { giftId: '123' }, template: { id: 'premium' } })
    assert.equal(result.delivery.ok, true)
  } finally { globalThis.fetch = originalFetch }
})

test('delivery APIs retain owner/session guards and scope public status to the authenticated user', async () => {
  const auth = () => {}, session = () => {}, owner = () => {}
  const queries = []
  const router = createCaseGiftQueueApi({ pool: { query: async (sql, args) => { queries.push({ sql, args }); return { rows: [{ id: 'opaque', status: 'review' }] } } },
    requireTelegramUser: auth, requireAdminSession: session, requireOwner: owner })
  for (const layer of router.stack.filter(item => item.route.path.startsWith('/api/admin/'))) {
    assert.deepEqual(layer.route.stack.slice(0, 3).map(item => item.handle), [auth, session, owner])
  }
  const route = router.stack.find(item => item.route.path.startsWith('/api/cases/')).route
  assert.equal(route.stack[0].handle, auth)
  let body
  await route.stack.at(-1).handle({ params: { requestId }, telegramUser: { id: 123 } },
    { set() { return this }, json(value) { body = value } }, error => { throw error })
  assert.deepEqual(queries[0].args, [123, requestId])
  assert.doesNotMatch(JSON.stringify(body), /chat_id|input|attempt|giftId/)
})

test('owner cannot retry uncertain/sent/in-flight gifts; resolution updates history and records evidence', async () => {
  for (const [status, action, expected] of [
    ['review', 'retry', 409], ['sent', 'retry', 409], ['sending', 'retry', 409],
    ['failed', 'retry', 200], ['review', 'confirm_sent', 200], ['failed', 'confirm_sent', 200],
  ]) {
    const row = job(undefined, { status })
    const queries = []
    let released = false
    const client = { query: async (sql, args = []) => {
      queries.push({ sql, args })
      return { rows: sql.startsWith('SELECT *') ? [row] : [], rowCount: 1 }
    }, release: () => { released = true } }
    const guard = () => {}
    const router = createCaseGiftQueueApi({ pool: { connect: async () => client }, requireTelegramUser: guard, requireAdminSession: guard, requireOwner: guard })
    const route = router.stack.find(item => item.route.methods.post).route.stack.at(-1).handle
    let responseStatus = 200, body
    await route({ params: { id: row.id }, telegramUser: { id: 42 }, body: { action, note: 'Provider receipt manually checked' } },
      { sendStatus: value => { responseStatus = value }, json: value => { body = value } }, error => { throw error })
    assert.equal(responseStatus, expected)
    assert.equal(released, true)
    if (expected === 409) {
      assert.ok(queries.some(item => item.sql === 'ROLLBACK'))
      assert.ok(queries.every(item => !item.sql.startsWith('UPDATE')))
    } else {
      assert.equal(body.status, action === 'retry' ? 'queued' : 'sent')
      const update = queries.find(item => item.sql.startsWith('UPDATE mini_app_case_deliveries'))
      assert.equal(JSON.parse(update.args[2])[0].actor, '42')
      assert.match(JSON.parse(update.args[2])[0].note, /receipt/)
      assert.ok(queries.some(item => item.sql.startsWith('UPDATE case_openings')))
      assert.equal(queries.at(-1).sql, 'COMMIT')
      assert.ok(queries.every(item => !/case_balances|UPDATE users|inventory/.test(item.sql)))
    }
  }
})

test('unconfirmed provider response cannot be marked delivered', async () => {
  const pool = memoryPool([job()])
  const queue = createCaseGiftQueue({ pool, logger: { error() {} }, deliver: async () => ({}) })
  await queue.runOnce()
  assert.equal(pool.rows[0].status, 'review')
  assert.equal(pool.history[7], 'review')
})

function findNode(node, name) {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'FunctionDeclaration' && node.id.name === name) return node
  for (const value of Object.values(node)) {
    const found = Array.isArray(value) ? value.map(item => findNode(item, name)).find(Boolean) : findNode(value, name)
    if (found) return found
  }
  return null
}

test('actual reward handler queues the selected gift without dispatch; internal rewards keep existing handlers', async () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const fn = findNode(parse(source, { sourceType: 'module' }), 'createCaseReward')
  for (const type of ['coins', 'starcoins', 'vip', 'shop_item', 'chart_skin', 'gift']) {
    let rolls = 0, queued = 0, granted = 0
    const selected = { type, giftId: '123', weight: 0.001 }
    const grant = async () => { granted++; return { type } }
    const scope = { pickWeightedContent: () => { rolls++; return selected }, giftIdText: String,
      grantCoinsReward: grant, grantStarcoinsReward: grant, grantVipReward: grant,
      grantShopItemReward: grant, grantChartSkinReward: grant,
      caseGiftDelivery: { mode: 'telegram', deliverGift: () => { throw new Error('External effect before COMMIT') } },
      enqueueCaseGift: async (_client, input) => { queued++; assert.equal(input.row, selected); assert.equal(input.index, 2); return { reward: { type, deliveryStatus: 'queued' } } } }
    const create = runInNewContext('(' + source.slice(fn.start, fn.end) + ')', scope)
    const result = await create({}, 123, { id: 'test', contents: [selected] }, { batchRequestId: requestId, batchIndex: 2 })
    assert.equal(result.reward.type, type)
    assert.equal(rolls, 1)
    assert.equal(queued, type === 'gift' ? 1 : 0)
    assert.equal(granted, type === 'gift' ? 0 : 1)
  }
})
