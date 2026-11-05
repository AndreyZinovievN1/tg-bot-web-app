import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { parse } from '@babel/parser'
import { transformSync } from 'esbuild'
import { loadCaseDrops, openCaseBatch } from './casesApi.js'
import { createDropProfiles } from './dropProfiles.js'

registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('.png')) return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(url)}` }
  return nextLoad(url, context)
} })
const { sampleDemoReward, orderCaseDrops } = await import('../src/utils/casePrizes.js')
const screen = readFileSync(new URL('../src/screens/CasesScreen.jsx', import.meta.url), 'utf8')
const wheel = readFileSync(new URL('../src/components/cases/CaseWheelModal.jsx', import.meta.url), 'utf8')
const ast = source => parse(source, { sourceType: 'module', plugins: ['jsx'] })
function nodes(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(item => nodes(item, predicate, found))
    else if (value && typeof value === 'object') nodes(value, predicate, found)
  }
  return found
}
function handler(name, scope) {
  const node = nodes(ast(screen), n => n.type === 'VariableDeclarator' && n.id.name === name)[0].init
  return runInNewContext(`(${screen.slice(node.start, node.end)})`, scope)
}
const meta = { contents: [
  { type: 'coins', weight: 0.001, min: 2, max: 4 },
  { type: 'gift', weight: 0.002, giftId: '5170233102089322756', giftKind: 'unique' },
  { type: 'vip', weight: 0 },
] }

test('demo preserves thousandth weight boundaries, amounts, gift IDs and input', () => {
  const before = JSON.stringify(meta)
  assert.equal(sampleDemoReward(meta, () => 0).payload.amount, 2)
  assert.equal(sampleDemoReward(meta, () => 1 / 3).giftId, '5170233102089322756')
  assert.equal(sampleDemoReward(meta, () => 0.9999).type, 'gift')
  const picks = Array.from({ length: 3000 }, (_, i) => sampleDemoReward(meta, () => (i + 0.5) / 3000))
  assert.equal(picks.filter(row => row.type === 'coins').length, 1000)
  assert.equal(picks.filter(row => row.type === 'gift').length, 2000)
  assert.equal(sampleDemoReward({ contents: [{ type: 'coins', weight: 1, min: 2, max: 4 }] }, () => 0.999).payload.amount, 4)
  assert.equal(sampleDemoReward({ contents: [] }), null)
  assert.equal(sampleDemoReward({ odds: { coins: 100 } }), null)
  assert.equal(JSON.stringify(meta), before)
})

test('actual demo handler cannot call economy API; locks repeats and marks its result', () => {
  const updates = {}
  const scope = { sampleDemoReward, caseTypes: { test: meta }, giftsCatalog: [], buyingCase: '',
    openingLock: { current: false }, t: key => key, prizeVisual: () => ({ labelKey: 'reward' }),
    localizeReward: value => value, withGiftDetails: value => value, findGift: () => null,
    apiRequest: () => assert.fail('demo called API'), onData: () => assert.fail('demo changed bootstrap'),
    onToast: () => assert.fail('unexpected toast'),
  }
  for (const key of ['IsDemo', 'WheelRun', 'OpeningCase', 'OpenError', 'OpenIssue', 'Reward', 'IsOpening']) {
    scope[`set${key}`] = value => { updates[key] = value }
  }
  const open = handler('openDemo', scope)
  open('test')
  assert.equal(updates.IsDemo, true)
  assert.equal(updates.Reward.demo, true)
  assert.equal(updates.Reward.description, 'cases.demoNotice')
  assert.equal(scope.openingLock.current, true)
  const first = updates.Reward
  open('test')
  assert.equal(updates.Reward, first)
  scope.openingLock.current = false
  open('test')
  assert.notEqual(updates.Reward, first)
})

test('real handler submits one unchanged request despite double click; failures release lock', async () => {
  let resolve, calls = 0, received
  const scope = { openingLock: { current: false }, buyingCase: '', caseBalances: { test: 2 },
    initData: 'test-auth', giftsCatalog: [], triggerHaptic() {}, localizeReward: value => value,
    withGiftDetails: value => value, onData: value => { received = value }, onToast() {}, caseIssueFrom: () => null,
    apiRequest: (url, options, auth) => {
      calls++
      assert.equal(url, '/api/cases/open')
      assert.equal(options.body, '{"caseType":"test"}')
      assert.equal(auth, 'test-auth')
      return new Promise(done => { resolve = done })
    },
  }
  for (const key of ['IsDemo', 'WheelRun', 'OpeningCase', 'OpenError', 'OpenIssue', 'Reward', 'IsOpening']) scope[`set${key}`] = () => {}
  const open = handler('openCase', scope)
  const pending = open('test')
  await open('test')
  assert.equal(calls, 1)
  resolve({ reward: { type: 'coins' }, data: { coins: 20 } })
  await pending
  assert.equal(received.coins, 20)
  assert.equal(scope.openingLock.current, true) // stays locked until reveal
  scope.openingLock.current = false
  scope.apiRequest = async () => { throw new Error('network') }
  await open('test')
  assert.equal(scope.openingLock.current, false)
})

test('instant/reduced-motion wait for server result; normal and fast reveal same result once', () => {
  const effect = nodes(ast(wheel), n => n.type === 'CallExpression' && n.callee.name === 'useEffect')
    .find(n => wheel.slice(n.start, n.end).includes('const instant')).arguments[0]
  for (const speed of ['normal', 'fast', 'instant']) {
    for (const reduced of [false, true]) {
      for (const withReward of [false, true]) {
        const reward = withReward ? { type: 'gift', giftId: '123' } : null
        let now = 100, next = 0, reveals = 0
        const queue = new Map()
        const schedule = (fn, delay) => { queue.set(++next, { fn, at: now + delay }); return next }
        const context = { speed, reward, error: '', reelRef: { current: { style: {} } },
          spunRef: { current: 0 }, spinStartRef: { current: 0 }, tickRef: { current: {} },
          onRevealRef: { current: value => { assert.equal(value, reward); reveals++ } },
          setWinnerIndex() {}, setPhase() {}, triggerHaptic() {}, tickReel() {},
          idleOffset: () => 0, buildLanding: () => ({ winnerIndex: 1, distance: 100, target: 100 }),
          easeOutSpin: x => x, performance: { now: () => now },
          requestAnimationFrame: fn => schedule(() => fn(now), 16), cancelAnimationFrame: id => queue.delete(id),
          window: { matchMedia: () => ({ matches: reduced }), setTimeout: schedule, clearTimeout: id => queue.delete(id) },
          IDLE_SPEED: 2100, MIN_SPIN_MS: 900, LAND_MS: 4400, SETTLE_MS: 220, SETTLE_BACK: 7, FLASH_MS: 380,
        }
        const cleanup = runInNewContext(`(${wheel.slice(effect.start, effect.end)})`, context)()
        for (let step = 0; queue.size && step < 500; step++) {
          const [id, task] = [...queue].sort((a, b) => a[1].at - b[1].at)[0]
          queue.delete(id); now = task.at; task.fn()
        }
        assert.equal(reveals, withReward ? 1 : 0)
        cleanup?.()
        assert.equal(queue.size, 0)
      }
    }
  }
})

test('drop query reads existing history, whitelists output, keeps large IDs and exposes no private payload', async () => {
  const rows = await loadCaseDrops({ query: async (sql, values) => {
    assert.match(sql, /FROM case_openings/)
    assert.match(sql, /LIMIT 100/)
    assert.match(sql, /WHERE case_type = \$1/)
    assert.match(sql, /reward_payload->>'demo'/)
    assert.deepEqual(values, ['spring'])
    assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE|chat_id|msgId|slug/)
    return { rows: [{ id: '9007199254740993', reward_type: 'gift', gift_id: '5170233102089322756', gift_kind: 'unique', chat_id: 'secret', reward_payload: { msgId: 'secret' } }] }
  } }, 'spring')
  assert.equal(rows[0].id, '9007199254740993')
  assert.equal(rows[0].giftKind, 'unique')
  assert.doesNotMatch(JSON.stringify(rows), /secret|chat_id|msgId|reward_payload/)
  const server = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  assert.match(server, /app\.get\('\/api\/cases\/drops', requireTelegramUser,/)
})

test('drop queries isolate case IDs, parameterize input and fail closed without a case', async () => {
  const source = [
    { id: '1', case_type: 'spring', reward_type: 'gift', reward_title: 'Gift 123' },
    { id: '2', case_type: 'premium', reward_type: 'vip', days: '3' },
  ]
  let queries = 0
  const client = { query: async (sql, params) => {
    queries++
    assert.match(sql, /WHERE case_type = \$1/)
    assert.doesNotMatch(sql, /JOIN users|SELECT \*|chat_id/)
    return { rows: source.filter(row => row.case_type === params[0]) }
  } }
  assert.deepEqual(await loadCaseDrops(client), [])
  assert.equal(queries, 0)
  const spring = await loadCaseDrops(client, 'spring')
  assert.deepEqual(spring.map(row => row.id), ['1'])
  assert.equal(spring[0].title, '')
  assert.deepEqual((await loadCaseDrops(client, 'premium')).map(row => row.id), ['2'])
  assert.deepEqual(await loadCaseDrops(client, "spring' OR 1=1 --"), [])
  const ui = readFileSync(new URL('../src/components/cases/CaseHistory.jsx', import.meta.url), 'utf8')
  assert.match(ui, /caseType=\$\{encodeURIComponent\(caseType\)\}/)
  assert.match(ui, /row\.caseType === caseType/)
})

test('all three locales include experience strings; JSX components compile', async () => {
  for (const locale of ['ru', 'en', 'uk']) {
    const { default: dictionary } = await import(`../src/i18n/locales/${locale}.js`)
    for (const key of ['demo', 'demoAgain', 'demoNotice', 'demoUnavailable', 'speed', 'speed_normal', 'speed_fast', 'speed_instant', 'drops', 'drops_latest', 'drops_best', 'dropsScope', 'dropsEmpty', 'dropsError', 'dropsCurrentValue', 'dropsDetails', 'dropsPlayer', 'dropsAnonymous', 'dropsCase', 'dropsTime']) assert.ok(dictionary.cases[key], `${locale}:${key}`)
  }
  for (const source of [screen, wheel]) assert.ok(transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'esm' }).code)
})

test('feed sorting is stable, excludes demo, preserves source and compares value within types', () => {
  const rows = [
    { id: 'a', type: 'starcoins', amount: 10000 },
    { id: 'b', type: 'gift', giftId: '1' },
    { id: 'c', type: 'vip', days: 5 },
    { id: 'd', type: 'gift', giftId: '2' },
    { id: 'e', type: 'gift', demo: true },
    { id: 'f', type: 'vip', days: 20 },
  ]
  const before = JSON.stringify(rows)
  assert.deepEqual(orderCaseDrops(rows, false).map(row => row.id), ['a', 'b', 'c', 'd', 'f'])
  assert.deepEqual(orderCaseDrops(rows, true, [{ id: '1', stars: 10 }, { id: '2', stars: 50 }]).map(row => row.id), ['d', 'b', 'f', 'c', 'a'])
  assert.equal(JSON.stringify(rows), before)
  assert.deepEqual(orderCaseDrops([], true), [])
})

test('history keeps unknown reward types and normalizes existing aliases without changing stored data', () => {
  const source = [{ id: 'old', type: 'shopItem' }, { id: 'future', type: 'new_reward', amount: 4 }]
  assert.deepEqual(orderCaseDrops(source, false).map(row => row.id), ['old', 'future'])
  assert.equal(orderCaseDrops(source, true)[0].type, 'shop_item')
  assert.equal(orderCaseDrops(source, true)[1].type, 'new_reward')
  assert.equal(source[0].type, 'shopItem')
})

test('profile lookup failure never removes real drops or exposes unverified winners', async () => {
  const service = createDropProfiles({ pool: { query: async () => { throw new Error('profile lookup unavailable') } },
    requireTelegramUser: (_req, _res, next) => next(), botToken: '' })
  const drops = [{ id: '1', caseType: 'spring', type: 'gift', amount: 1 }]
  assert.deepEqual(await service.decorate(drops), [{ ...drops[0], winner: null }])
})


function batchDatabase(stock = 5) {
  let state = { stock, rewards: [], operation: null }
  let backup
  return {
    get state() { return state },
    async query(sql, args = []) {
      if (sql === 'BEGIN') backup = structuredClone(state)
      else if (sql === 'ROLLBACK') state = backup
      else if (sql.startsWith('INSERT INTO mini_app_case_batches') && !state.operation)
        state.operation = { case_type: args[2], quantity: args[3], results: null }
      else if (sql.startsWith('SELECT case_type')) return { rows: [state.operation] }
      else if (sql.startsWith('UPDATE mini_app_case_batches')) state.operation.results = JSON.parse(args[2])
      return { rows: [] }
    },
  }
}
const batchKey = '12345678-1234-1234-1234-123456789012'
const internalTemplate = { id: 'test', contents: [{ type: 'coins', weight: 1 }] }
function batchOptions(db, quantity, failAt = -1) {
  return { chatId: 1, requestId: batchKey, quantity, template: internalTemplate,
    take: async (_client, _chat, _case, count) => {
      if (db.state.stock < count) throw new Error('insufficient')
      db.state.stock -= count
    },
    grant: async (_client, _chat, _template, options) => {
      assert.equal(options.skipTake, true)
      if (db.state.rewards.length === failAt) throw new Error('grant failed')
      const reward = { type: 'coins', amount: db.state.rewards.length + 1 }
      db.state.rewards.push(reward)
      return { reward, delivery: null }
    } }
}

test('batch 2–5: one debit, independent grants, persisted results and replay without debit', async () => {
  for (let count = 2; count <= 5; count++) {
    const db = batchDatabase()
    const options = batchOptions(db, count)
    await db.query('BEGIN')
    const result = await openCaseBatch(db, options)
    await db.query('COMMIT')
    assert.equal(result.results.length, count)
    assert.equal(db.state.stock, 5 - count)
    assert.equal(db.state.rewards.length, count)
    const replay = await openCaseBatch(db, options)
    assert.equal(replay.replay, true)
    assert.deepEqual(replay.results, result.results)
    assert.equal(db.state.stock, 5 - count)
    await assert.rejects(openCaseBatch(db, { ...options, quantity: count === 5 ? 2 : 5 }), /conflict/)
  }
})

test('batch rejects invalid input and insufficient stock; gift pools retain all weighted rows', async () => {
  for (const quantity of [0, 1, 6, 2.5, '2']) {
    const db = batchDatabase()
    await assert.rejects(openCaseBatch(db, batchOptions(db, quantity)), /Invalid/)
    assert.equal(db.state.stock, 5)
  }
  const db = batchDatabase(1)
  await db.query('BEGIN')
  await assert.rejects(openCaseBatch(db, batchOptions(db, 2)), /insufficient/)
  await db.query('ROLLBACK')
  assert.equal(db.state.stock, 1)
  assert.equal(db.state.operation, null)
  const giftDb = batchDatabase()
  const template = { id: 'test', contents: [{ type: 'gift', weight: 0.001, giftId: '123' }, { type: 'coins', weight: 2 }] }
  const before = JSON.stringify(template)
  const indexes = []
  await giftDb.query('BEGIN')
  const result = await openCaseBatch(giftDb, { ...batchOptions(giftDb, 2), template,
    grant: async (_client, _chat, provided, options) => {
      assert.equal(provided, template)
      assert.equal(options.batchRequestId, batchKey)
      assert.equal(options.skipTake, true)
      indexes.push(options.batchIndex)
      return { reward: { type: 'gift', deliveryStatus: 'queued' } }
    } })
  assert.equal(result.results.length, 2)
  assert.deepEqual(indexes, [0, 1])
  assert.equal(JSON.stringify(template), before)
  assert.equal(giftDb.state.stock, 3)
  const replay = await openCaseBatch(giftDb, { ...batchOptions(giftDb, 2), template })
  assert.equal(replay.replay, true)
  assert.equal(giftDb.state.stock, 3)
})

test('batch grant failure rolls back debit, prior rewards and request together', async () => {
  const db = batchDatabase()
  await db.query('BEGIN')
  await assert.rejects(openCaseBatch(db, batchOptions(db, 5, 2)), /grant failed/)
  await db.query('ROLLBACK')
  assert.equal(db.state.stock, 5)
  assert.equal(db.state.operation, null)
  assert.deepEqual(db.state.rewards, [])
})

test('demo 2–5 publishes the complete parallel batch in each speed and holds repeat lock', () => {
  for (const speed of ['normal', 'fast', 'instant']) for (let quantity = 2; quantity <= 5; quantity++) {
    let results, publications = 0, samples = 0
    const generated = []
    const showBatch = handler('showBatch', { speed,
      setBatchRewards: value => { results = value; publications++ } })
    const lock = { current: false }
    const demo = handler('openDemoBatch', { openingLock: lock, buyingCase: '', caseTypes: { test: meta },
      sampleDemoReward: template => {
        const roll = (samples++ % 3) / 3
        const result = sampleDemoReward(template, () => roll)
        generated.push(JSON.stringify(result))
        return result
      },
      prepareBatch: () => { lock.current = true }, showBatch,
      localizeReward: value => value, withGiftDetails: value => value, t: key => key,
      prizeVisual: () => ({ labelKey: 'reward' }), giftsCatalog: [], findGift: () => null,
      onToast: () => { throw new Error('unexpected failure') },
      apiRequest: () => { throw new Error('Demo cannot call API') } })
    demo('test', quantity)
    assert.equal(publications, 1)
    assert.equal(results.length, quantity)
    assert.equal(samples, quantity)
    results.forEach((item, index) => {
      const original = JSON.parse(generated[index])
      assert.equal(item.type, original.type)
      assert.equal(item.giftId, original.giftId)
      assert.equal(JSON.stringify(item.payload), JSON.stringify(original.payload))
      assert.equal(item.demo, true)
    })
    const saved = results
    demo('test', quantity)
    assert.equal(results, saved)
    assert.equal(publications, 1)
    assert.equal(samples, quantity)
    assert.equal(lock.current, true)
  }
})

test('parallel batch stays locked until every reel stops; reveal unlocks once without economy calls', () => {
  const effect = nodes(ast(wheel), n => n.type === 'CallExpression' && n.callee.name === 'useEffect')
    .find(n => wheel.slice(n.start, n.end).includes('const instant')).arguments[0]
  for (let count = 1; count <= 5; count++) for (const speed of ['normal', 'fast', 'instant']) {
    let now = 100, next = 0, reveals = 0
    const lock = { current: true }, queue = new Map()
    const tracks = Array.from({ length: count }, () => ({ style: {} }))
    const reward = Object.freeze({ type: 'coins', title: 'Original result' })
    const schedule = (fn, delay) => { queue.set(++next, { fn, at: now + delay }); return next }
    let opening = true, toasts = 0
    const reveal = handler('revealPrize', { openingLock: lock, isDemo: false,
      setIsOpening: value => { opening = value }, onToast: () => { toasts++ }, t: key => key,
      apiRequest: () => { throw new Error('Revealing cannot call economy API') } })
    const scope = { speed, reward, error: '',
      reelRef: { current: { parentElement: { parentElement: { querySelectorAll: () => tracks } } } },
      spunRef: { current: 0 }, spinStartRef: { current: 0 }, tickRef: { current: {} },
      onRevealRef: { current: value => {
        assert.equal(value, reward)
        if (speed !== 'instant') assert.ok(tracks.every(track => track.style.transform === 'translate3d(-100px, 0, 0)'),
          'All reels must reach their final center before unlocking')
        reveals++
        reveal(value)
      } },
      setWinnerIndex() {}, setPhase() {}, triggerHaptic() {}, tickReel() {},
      idleOffset: () => 0, buildLanding: () => ({ winnerIndex: 1, distance: 107, target: 107 }),
      easeOutSpin: x => x, performance: { now: () => now },
      requestAnimationFrame: fn => schedule(() => fn(now), 16), cancelAnimationFrame: id => queue.delete(id),
      window: { matchMedia: () => ({ matches: false }), setTimeout: schedule, clearTimeout: id => queue.delete(id) },
      IDLE_SPEED: 2100, MIN_SPIN_MS: 900, LAND_MS: 4400, SETTLE_MS: 220, SETTLE_BACK: 7, FLASH_MS: 380,
    }
    const cleanup = runInNewContext('(' + wheel.slice(effect.start, effect.end) + ')', scope)()
    assert.equal(lock.current, true)
    for (let step = 0; queue.size && step < 500; step++) {
      if (!reveals) { assert.equal(lock.current, true); assert.equal(opening, true) }
      const [id, task] = [...queue].sort((a, b) => a[1].at - b[1].at)[0]
      queue.delete(id); now = task.at; task.fn()
      assert.equal(new Set(tracks.map(track => track.style.transform)).size, 1)
    }
    assert.equal(reveals, 1)
    assert.equal(lock.current, false)
    assert.equal(opening, false)
    assert.equal(toasts, 1)
    cleanup?.()
    assert.equal(queue.size, 0)
  }
})

test('batch HTTP uncertainty persists request ID and retry reuses it', async () => {
  const storage = new Map()
  const requests = []
  const lock = { current: false }
  let pendingBatch = null
  const scope = { openingLock: lock, buyingCase: '', pendingBatch, t: key => key,
    crypto: { randomUUID: () => batchKey }, initData: 'test',
    prepareBatch: () => { lock.current = true },
    sessionStorage: { setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setPendingBatch: value => { pendingBatch = value },
    apiRequest: async (_path, options) => { requests.push(JSON.parse(options.body)); throw new Error('lost response') },
    setIsOpening: () => {}, setOpenError: () => {}, onToast: () => {} }
  await handler('openBatch', scope)('test', 3)
  assert.equal(lock.current, false)
  assert.equal(JSON.parse(storage.get('space-case-batch')).requestId, batchKey)
  await handler('openBatch', { ...scope, pendingBatch })('test', 3)
  assert.deepEqual(requests[0], requests[1])
})

test('batch permits existing internal gift mode and legacy gifts without Telegram ID', async () => {
  for (const internalGifts of [false, true]) {
    const db = batchDatabase()
    const result = await openCaseBatch(db, { ...batchOptions(db, 2), internalGifts,
      template: { id: 'test', contents: [{ type: 'gift', weight: 1, giftId: internalGifts ? '123' : '' }] } })
    assert.equal(result.results.length, 2)
  }
})

test('actual debit uses quantity for both legacy columns and custom case rows', async () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const node = nodes(ast(source), n => n.type === 'FunctionDeclaration' && n.id.name === 'takeCaseFromBalance')[0]
  const take = runInNewContext('(' + source.slice(node.start, node.end) + ')', { caseBalanceColumns: ['premium'] })
  for (const caseType of ['premium', 'custom']) for (const count of [1, 2, 3, 4, 5]) {
    const updates = []
    const client = { query: async (sql, args) => {
      if (sql.includes('SELECT')) return { rows: [{ premium: 5, amount: 5 }] }
      if (sql.includes('UPDATE ')) updates.push({ sql, args })
      return { rows: [] }
    } }
    await take(client, 123, caseType, count)
    assert.equal(updates.length, 1)
    assert.equal(updates[0].args.at(-1), count)
    await assert.rejects(take({ query: async () => ({ rows: [{ premium: count - 1, amount: count - 1 }] }) }, 123, caseType, count), /закончился/)
  }
})

test('real batch success submits once under double click and updates bootstrap and all rewards', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  let calls = 0
  let updated
  let displayed
  let pending
  const scope = { openingLock: { current: false }, buyingCase: '', pendingBatch: null,
    crypto: { randomUUID: () => batchKey }, initData: '', t: key => key, giftsCatalog: [],
    prepareBatch: () => { scope.openingLock.current = true },
    sessionStorage: { setItem() {}, removeItem() {} }, setPendingBatch: value => { pending = value },
    apiRequest: async () => { calls++; await gate; return { data: { balance: 2 },
      rewards: [{ type: 'coins' }, { type: 'vip' }] } },
    localizeReward: value => value, withGiftDetails: value => value,
    onData: value => { updated = value }, showBatch: value => { displayed = value },
    setIsOpening() {}, setOpenError() {}, onToast() {} }
  const open = handler('openBatch', scope)
  const first = open('test', 2)
  await open('test', 2)
  assert.equal(calls, 1)
  release()
  await first
  assert.equal(displayed.length, 2)
  assert.equal(updated.balance, 2)
  assert.equal(pending, null)
  assert.equal(scope.openingLock.current, true) // animation, not HTTP, releases the lock
})

test('actual batch route commits before bootstrap; bootstrap failure can replay without a second grant', async () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const node = nodes(ast(source), n => n.type === 'FunctionDeclaration' && n.id.name === 'openBatchRequest')[0]
  const db = batchDatabase()
  let released = 0
  db.release = () => { released++ }
  const operations = batchOptions(db, 3)
  let bootstrapFails = true
  let payload
  const errors = []
  const route = runInNewContext('(' + source.slice(node.start, node.end) + ')', {
    pool: { connect: async () => db }, findCaseTemplate: async () => internalTemplate,
    openCaseBatch, takeCaseFromBalance: operations.take, openCaseAndGrantReward: operations.grant,
    caseGiftDelivery: { mode: 'telegram' }, notifyCaseOpening: async () => {},
    newCaseIncidentCode: () => 'test', console,
    buildBootstrapPayload: async () => { if (bootstrapFails) throw new Error('bootstrap failed'); return { stock: db.state.stock } },
  })
  const req = { body: { caseType: 'test', quantity: 3, requestId: batchKey }, telegramUser: { id: 1 } }
  const res = { status() { return this }, json(value) { payload = value } }
  await route(req, res, error => errors.push(error))
  assert.equal(errors[0].message, 'bootstrap failed')
  assert.equal(db.state.stock, 2)
  assert.equal(db.state.operation.results.length, 3)
  bootstrapFails = false
  await route(req, res, error => errors.push(error))
  assert.equal(payload.rewards.length, 3)
  assert.equal(payload.data.stock, 2)
  assert.equal(db.state.rewards.length, 3)
  assert.equal(released, 2)
})

test('actual batch route rolls back on grant failure and releases connection', async () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const node = nodes(ast(source), n => n.type === 'FunctionDeclaration' && n.id.name === 'openBatchRequest')[0]
  const db = batchDatabase()
  let released = false
  db.release = () => { released = true }
  const options = batchOptions(db, 3, 1)
  const route = runInNewContext('(' + source.slice(node.start, node.end) + ')', {
    pool: { connect: async () => db }, findCaseTemplate: async () => internalTemplate,
    openCaseBatch, takeCaseFromBalance: options.take, openCaseAndGrantReward: options.grant,
    caseGiftDelivery: { mode: 'telegram' },
  })
  let failure
  await route({ body: { caseType: 'test', quantity: 3, requestId: batchKey }, telegramUser: { id: 1 } },
    {}, error => { failure = error })
  assert.equal(failure.message, 'grant failed')
  assert.equal(db.state.stock, 5)
  assert.equal(db.state.operation, null)
  assert.deepEqual(db.state.rewards, [])
  assert.equal(released, true)
})

test('42P01 reports the actual stage and relation in logs, not a false missing-batch-table message', async () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const node = nodes(ast(source), n => n.type === 'FunctionDeclaration' && n.id.name === 'openBatchRequest')[0]
  for (const stage of ['catalog', 'record-request', 'debit-stock', 'grant-and-history', 'save-results']) {
    const queries = [], logs = []
    const missing = stage === 'record-request' ? 'mini_app_case_batches' : 'case_openings'
    const failure = Object.assign(new Error('relation "' + missing + '" does not exist'), { code: '42P01' })
    if (stage !== 'catalog') failure.batchStage = stage
    let released = false, status, body
    const client = { query: async sql => {
      queries.push(sql)
      return { rows: sql.includes('current_database') ? [{ database: 'testdb', role: 'joy', schema: 'public', search_path: 'public' }] : [] }
    }, release: () => { released = true } }
    const route = runInNewContext('(' + source.slice(node.start, node.end) + ')', {
      pool: { connect: async () => client }, newCaseIncidentCode: () => 'test-incident',
      findCaseTemplate: async () => { if (stage === 'catalog') throw failure; return internalTemplate },
      openCaseBatch: async () => { throw failure }, takeCaseFromBalance() {}, openCaseAndGrantReward() {},
      caseGiftDelivery: { mode: 'telegram' }, console: { error: (...args) => logs.push(args) },
    })
    await route({ body: { caseType: 'test', quantity: 2, requestId: batchKey }, telegramUser: { id: 123 } },
      { status: value => { status = value; return { json: value => { body = value } } } },
      error => { throw error })
    assert.equal(status, 503)
    assert.equal(body.code, 'CASE_BATCH_DATABASE_ERROR')
    assert.equal(body.incident, 'test-incident')
    assert.doesNotMatch(JSON.stringify(body), /ещё не настроено|case_openings|mini_app_case_batches|testdb/)
    assert.equal(logs[0][1].stage, stage)
    assert.equal(logs[0][1].message, failure.message)
    assert.equal(logs[0][1].database, 'testdb')
    assert.ok(queries.indexOf('ROLLBACK') < queries.findIndex(sql => sql.includes('current_database')))
    assert.ok(!queries.includes('COMMIT'))
    assert.equal(released, true)
  }
})

test('openCaseBatch preserves SQLSTATE and annotates failing SQL operations', async () => {
  for (const stage of ['record-request', 'read-request', 'debit-stock', 'grant-and-history', 'save-results']) {
    const failure = Object.assign(new Error('missing relation'), { code: '42P01' })
    const db = batchDatabase()
    const originalQuery = db.query.bind(db)
    db.query = async (sql, args) => {
      if ((stage === 'record-request' && sql.startsWith('INSERT INTO')) ||
          (stage === 'read-request' && sql.startsWith('SELECT case_type')) ||
          (stage === 'save-results' && sql.startsWith('UPDATE mini_app_case_batches'))) throw failure
      return originalQuery(sql, args)
    }
    const options = batchOptions(db, 2)
    if (stage === 'debit-stock') options.take = async () => { throw failure }
    if (stage === 'grant-and-history') options.grant = async () => { throw failure }
    await assert.rejects(openCaseBatch(db, options), error => error === failure &&
      error.code === '42P01' && error.batchStage === stage)
  }
})

test('batch UI translations live at cases, not help.sections.cases', async () => {
  for (const language of ['ru', 'en', 'uk']) {
    const { default: locale } = await import('../src/i18n/locales/' + language + '.js')
    for (const key of ['batchRetry', 'batchPending', 'batchDatabaseError', 'yourWinnings', 'openMore']) {
      assert.equal(typeof locale.cases[key], 'string')
      assert.ok(locale.cases[key].length > 0)
      assert.equal(locale.help.sections.cases[key], undefined)
    }
  }
})

test('demo modal cannot mount DB history or retry a pending real request', () => {
  const attributes = nodes(ast(screen), n => n.type === 'JSXAttribute')
  const retry = attributes.find(n => n.name.name === 'onRetry').value.expression
  const scope = { isDemo: true, openError: 'previous database error', pendingBatch: { caseType: 'test', quantity: 2 },
    openBatch: () => { throw new Error('Cannot open real cases from demo') } }
  assert.equal(runInNewContext('(' + screen.slice(retry.start, retry.end) + ')', scope), null)
  const drops = attributes.find(n => n.name.name === 'drops' &&
    screen.slice(n.start, n.end).includes('key={openingCase}')).value.expression
  assert.equal(runInNewContext(screen.slice(drops.test.start, drops.test.end), scope), false)
  assert.equal(drops.alternate.type, 'NullLiteral')
})
