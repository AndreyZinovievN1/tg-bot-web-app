import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { parse } from '@babel/parser'
import { transformSync } from 'esbuild'
const wheel = readFileSync(new URL('./CaseWheelModal.jsx', import.meta.url), 'utf8')
const screen = readFileSync(new URL('../../screens/CasesScreen.jsx', import.meta.url), 'utf8')
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
test('parallel 1–5 reels: all speeds, reduced motion, one reveal and cleanup', () => {
  const effect = nodes(ast(wheel), n => n.type === 'CallExpression' && n.callee.name === 'useEffect')
    .find(n => wheel.slice(n.start, n.end).includes('const instant')).arguments[0]
  for (let count = 1; count <= 5; count++) for (const speed of ['normal', 'fast', 'instant']) {
    for (const reduced of [false, true]) {
      for (const withReward of [false, true]) {
        const reward = withReward ? { type: 'gift', giftId: '123' } : null
        const tracks = Array.from({ length: count }, () => ({ style: {} }))
        let now = 100, next = 0, reveals = 0
        const queue = new Map()
        const schedule = (fn, delay) => { queue.set(++next, { fn, at: now + delay }); return next }
        const context = { speed, reward, error: '', reelRef: { current: { style: {}, parentElement: { parentElement: { querySelectorAll: () => tracks } } } },
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
          assert.equal(new Set(tracks.map(track => track.style.transform)).size, 1, 'Tracks must move together on every frame')
        }
        assert.equal(reveals, withReward ? 1 : 0)
        assert.equal(new Set(tracks.map(track => track.style.transform)).size, 1)
        if (withReward && speed !== 'instant' && !reduced) assert.ok(tracks.every(track => track.style.transform))
        cleanup?.()
        assert.equal(queue.size, 0)
      }
    }
  }
})


test('1–5 rows preserve supplied winners; one marker; results return without opening', () => {
  const fn = nodes(ast(wheel), n => n.type === 'FunctionDeclaration' && n.id.name === 'CaseWheelModal')[0]
  const code = transformSync('const render = ' + wheel.slice(fn.start, fn.end) + '; render;', { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'Fragment' }).code
  for (let count = 1; count <= 5; count++) for (const phase of ['land', 'reveal']) {
    let state = 0, closed = 0, repeated = 0
    const scope = {
      h: (type, props, ...children) => ({ type, props: props || {}, children }), Fragment: 'fragment',
      useState: () => [[phase, 30, ''][state++], () => {}], useRef: value => ({ current: value }), useEffect() {},
      useTranslation: () => ({ t: key => key, tp: (key, count) => key + count }),
      buildCasePrizes: meta => meta.contents, findGift: () => null,
      rewardVisuals: { coins: { icon: 'coin', labelKey: 'coins', tier: 'common' } },
      giftIdText: String, prizeAmountText: () => '1', rewardDisplay: item => item.title,
      FiX: 'close-icon', FiCopy: 'copy-icon', FiExternalLink: 'external-icon', TelegramStar: 'star',
      REEL_LENGTH: 60, PATTERN_PERIOD: 12, reelPattern: ['coins'], supportUrl: '', caseTitle: () => 'Test case',
    }
    const render = runInNewContext(code, scope)
    const rewards = Array.from({ length: count }, (_, index) => ({ type: 'coins', title: 'Winner ' + index, payload: { amount: 10 + index } }))
    const before = JSON.stringify(rewards)
    const tree = render({ caseType: 'test', caseTypes: { test: { contents: [{ type: 'coins' }], accent: 'purple' } },
      reward: rewards[0], results: rewards, totalResults: count, onClose: () => closed++, onRepeat: () => repeated++ })
    const elements = []
    function walk(value) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object' && value.props) { elements.push(value); walk(value.children) }
    }
    walk(tree)
    const withClass = name => elements.filter(el => String(el.props.className || '').split(' ').includes(name))
    assert.equal(withClass('case-reel').length, count)
    assert.equal(withClass('case-reels__marker').length, 1)
    const tracks = withClass('case-reel__track')
    for (let i = 0; i < count; i++) {
      const winningCard = tracks[i].children[0][30]
      const label = winningCard.children.find(child => child.type === 'small')
      const amount = winningCard.children.find(child => child.props?.className === 'case-reel__value')
      assert.equal(label.children[0], rewards[i].title)
      assert.equal(amount.children[0], rewards[i].payload.amount)
    }
    const winners = withClass('is-winner')
    if (phase === 'land') assert.equal(winners.length, 0)
    if (phase === 'reveal') {
      assert.equal(withClass('case-batch-results__item').length, count)
      for (let i = 0; i < count; i++) assert.ok(JSON.stringify(winners[i]).includes('Winner ' + i))
      const again = elements.find(el => el.type === 'button' && el.children.includes('cases.openMore'))
      again.props.onClick()
      assert.equal(closed, 1)
      assert.equal(repeated, 0)
    }
    assert.equal(JSON.stringify(rewards), before)
  }
})
test('batch presentation keeps entire response and has no sequential remount', () => {
  assert.doesNotMatch(screen, /batchIndex|revealBatch|batchRevealTimer/)
  assert.match(screen, /key={wheelRun}/)
  assert.match(screen, /results={batchRewards}/)
  assert.ok(screen.includes('setDetailCase(openingCase); closeWheel()'))
})

test('landing centers the predetermined slot exactly after settling', () => {
  const fn = nodes(ast(wheel), n => n.type === 'FunctionDeclaration' && n.id.name === 'buildLanding')[0]
  const landing = runInNewContext('(' + wheel.slice(fn.start, fn.end) + ')',
    { ITEM_WIDTH: 98, ITEM_STEP: 110, SETTLE_BACK: 7, LAND_TRAVEL: 3400, REEL_LENGTH: 60 })
  for (const start of [1320, 1500, 2000, 2639]) {
    const result = landing(start)
    assert.equal(result.target - 7, result.winnerIndex * 110 + 49)
    assert.ok(result.winnerIndex < 60)
  }
})

test('demo batch supplies all results together without economy calls or repeated clicks', () => {
  const getHandler = (name, scope) => {
    const fn = nodes(ast(screen), n => n.type === 'VariableDeclarator' && n.id.name === name)[0].init
    return runInNewContext('(' + screen.slice(fn.start, fn.end) + ')', scope)
  }
  for (let count = 2; count <= 5; count++) {
    let results, calls = 0
    const lock = { current: false }
    const scope = {
      openingLock: lock, buyingCase: '', caseTypes: { test: {} }, giftsCatalog: [],
      sampleDemoReward: () => ({ type: 'coins', payload: { amount: ++calls } }),
      prepareBatch: () => { lock.current = true },
      showBatch: getHandler('showBatch', { setBatchRewards: value => { results = value } }),
      localizeReward: value => value, withGiftDetails: value => value,
      prizeVisual: () => ({ labelKey: 'coins' }), t: key => key,
      apiRequest: () => { throw new Error('Unexpected economy request') },
      onToast: () => { throw new Error('Unexpected error') },
    }
    const demo = getHandler('openDemoBatch', scope)
    demo('test', count)
    assert.equal(results.length, count)
    assert.equal(calls, count)
    demo('test', count)
    assert.equal(calls, count)
  }
})
