import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import pg from 'pg'
import { transformSync } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  caseCategorySchemaSql, caseSchemaSql, createCasesApi,
  normalizeCasePayload, normalizeCategoryId, normalizeCategoryTitles,
} from './casesApi.js'

// Frontend metadata imports PNGs. Node-only tests replace assets, not application code.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.png')) return { format: 'module', source: `export default ${JSON.stringify(url)}`, shortCircuit: true }
    if (url.endsWith('.jsx')) return {
      format: 'module', shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'esm' }).code,
    }
    return nextLoad(url, context)
  },
})
const { buildCaseTypes, caseOrderFrom, groupCaseCatalog, caseCategoryTitle } = await import('../src/utils/caseCatalog.js')

function fixture() {
  return {
    categories: [
      { id: 'standard', titles: { ru: 'Стандартные' }, sort_order: 10 },
      { id: 'thematic', titles: { ru: 'Тематические' }, sort_order: 20 },
      { id: 'special', titles: { ru: 'Особые' }, sort_order: 30 },
    ],
    cases: ['homeless', 'spring', 'custom'].map((id, index) => ({
      id, titles: { ru: id }, texts: {}, stars: 25 + index, image: 'unchanged',
      contents: [{ id: 'coins', type: 'coins', weight: 100, min: 2, max: 5 }],
      accent: 'cyan', theme: {}, active: index !== 2, featured: index === 0,
      sort_order: index * 10, category_id: index === 1 ? 'thematic' : 'standard',
    })),
  }
}

function memoryPool() {
  let state = fixture(), snapshot
  const log = []
  const client = {
    release() {},
    async query(text, values = []) {
      const sql = text.replace(/\s+/g, ' ').trim()
      log.push({ sql, values })
      const rows = data => ({ rows: data, rowCount: data.length })
      if (sql === 'BEGIN') { snapshot = structuredClone(state); return rows([]) }
      if (sql === 'COMMIT') { snapshot = undefined; return rows([]) }
      if (sql === 'ROLLBACK') { state = snapshot; snapshot = undefined; return rows([]) }
      if (sql.includes('pg_advisory_xact_lock')) return rows([])
      if (sql.startsWith('SELECT COALESCE')) return rows([structuredClone(state)])
      if (sql.includes('FROM shop_items')) return rows([])
      if (sql === 'SELECT id FROM mini_app_case_categories') return rows(state.categories.map(({ id }) => ({ id })))
      if (sql === 'SELECT 1 FROM mini_app_case_categories WHERE id = $1') return rows(state.categories.filter(c => c.id === values[0]).map(() => ({ '?column?': 1 })))
      if (sql.startsWith('INSERT INTO mini_app_case_categories')) {
        state.categories.push({ id: values[0], titles: JSON.parse(values[1]), sort_order: 40 }); return rows([])
      }
      if (sql.startsWith('UPDATE mini_app_case_categories SET titles')) {
        const category = state.categories.find(c => c.id === values[0])
        if (category) category.titles = JSON.parse(values[1])
        return rows(category ? [category] : [])
      }
      if (sql.startsWith('UPDATE mini_app_case_categories AS c')) {
        values[0].forEach((id, index) => { state.categories.find(c => c.id === id).sort_order = (index + 1) * 10 })
        return rows([])
      }
      if (sql.startsWith('UPDATE mini_app_cases SET category_id')) {
        const matches = state.cases.filter(c => sql.includes('WHERE category_id') ? c.category_id === values[0] : c.id === values[0])
        matches.forEach(c => { c.category_id = values[1] })
        return rows(matches)
      }
      if (sql.startsWith('DELETE FROM mini_app_case_categories')) {
        if (client.failDelete) throw new Error('simulated write failure')
        const matches = state.categories.filter(c => c.id === values[0])
        state.categories = state.categories.filter(c => c.id !== values[0]); return rows(matches)
      }
      if (sql.startsWith('SELECT image FROM mini_app_cases')) return rows(state.cases.filter(c => c.id === values[0]).map(c => ({ image: c.image })))
      if (sql.startsWith('SELECT 1 FROM mini_app_cases')) return rows(state.cases.filter(c => c.id === values[0]))
      if (sql.startsWith('UPDATE mini_app_cases SET titles')) {
        const item = state.cases.find(c => c.id === values[0])
        if (values[11]) item.category_id = values[10]
        return rows([item])
      }
      if (sql.startsWith('INSERT INTO mini_app_cases')) {
        const category = state.categories.find(c => c.id === values[11])
        state.cases.push({ id: values[0], category_id: category?.id ?? null, contents: JSON.parse(values[6]), active: values[7] })
        return rows([])
      }
      if (sql.startsWith('UPDATE mini_app_cases SET featured')) {
        state.cases.forEach(c => { c.featured = c.id === values[0] }); return rows([])
      }
      throw new Error(`Unexpected test SQL: ${sql}`)
    },
  }
  return { connect: async () => client, client, log, get state() { return state } }
}

function makeRouter(pool) {
  const stages = ['telegram', 'session', 'owner']
  const guards = stages.map(stage => (req, res, next) => {
    req.visited.push(stage)
    if (req.denied === stage) return res.status(stage === 'owner' ? 403 : 401).json({ error: stage })
    next()
  })
  return createCasesApi({ pool, requireTelegramUser: guards[0], requireAdminSession: guards[1], requireOwner: guards[2] })
}

async function invoke(router, method, path, body = {}, params = {}, denied) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method])?.route
  assert.ok(route, `${method} ${path}`)
  const req = { body, params, query: {}, denied, visited: [] }
  const res = {
    statusCode: 200, headersSent: false,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; this.headersSent = true; return this },
  }
  for (const layer of route.stack) {
    let called = false, failure
    await layer.handle(req, res, error => { called = true; failure = error })
    if (failure) throw failure
    if (!called || res.headersSent) break
  }
  return { ...res, visited: req.visited }
}

const categoryRoutes = [
  ['post', '/api/admin/case-categories'],
  ['put', '/api/admin/case-categories/:id'],
  ['post', '/api/admin/case-categories/reorder'],
  ['delete', '/api/admin/case-categories/:id'],
  ['patch', '/api/admin/cases/:id/category'],
]

test('all category operations use Telegram, session and owner guards before DB access', async () => {
  for (const [method, path] of categoryRoutes) {
    for (const denied of ['telegram', 'session', 'owner']) {
      const pool = memoryPool()
      const response = await invoke(makeRouter(pool), method, path, {}, { id: 'standard' }, denied)
      assert.equal(response.statusCode, denied === 'owner' ? 403 : 401)
      assert.equal(pool.log.length, 0)
      assert.deepEqual(response.visited, ['telegram', 'session', 'owner'].slice(0, ['telegram', 'session', 'owner'].indexOf(denied) + 1))
    }
  }
})

test('create, rename and reorder categories; reject blank names and stale reorder lists', async () => {
  const pool = memoryPool(), router = makeRouter(pool)
  assert.equal((await invoke(router, 'post', '/api/admin/case-categories', { titles: {} })).statusCode, 400)
  const result = await invoke(router, 'post', '/api/admin/case-categories', { titles: { ru: 'Новая', en: 'New', uk: 'Нова' } })
  const created = result.body.categories.find(c => c.titles.en === 'New')
  assert.ok(created)
  await invoke(router, 'put', '/api/admin/case-categories/:id', { titles: { en: 'Renamed' } }, { id: created.id })
  assert.deepEqual(pool.state.categories.find(c => c.id === created.id).titles, { en: 'Renamed' })
  assert.equal((await invoke(router, 'post', '/api/admin/case-categories/reorder', { ids: ['standard'] })).statusCode, 409)
  const ids = pool.state.categories.map(c => c.id).reverse()
  await invoke(router, 'post', '/api/admin/case-categories/reorder', { ids })
  assert.equal(pool.state.categories.find(c => c.id === ids[0]).sort_order, 10)
})

test('transfer changes only category_id and rejects unknown categories', async () => {
  const pool = memoryPool(), router = makeRouter(pool)
  const before = structuredClone(pool.state.cases[0])
  await invoke(router, 'patch', '/api/admin/cases/:id/category', { categoryId: 'special' }, { id: 'homeless' })
  assert.deepEqual(pool.state.cases[0], { ...before, category_id: 'special' })
  assert.equal((await invoke(router, 'patch', '/api/admin/cases/:id/category', { categoryId: 'missing' }, { id: 'homeless' })).statusCode, 400)
  assert.equal((await invoke(router, 'patch', '/api/admin/cases/:id/category', {}, { id: 'homeless' })).statusCode, 400)
  await invoke(router, 'patch', '/api/admin/cases/:id/category', { categoryId: null }, { id: 'homeless' })
  assert.equal(pool.state.cases[0].category_id, null)
})

test('delete transfers active AND disabled cases without changing other fields', async () => {
  const pool = memoryPool(), router = makeRouter(pool), before = structuredClone(pool.state.cases)
  await invoke(router, 'delete', '/api/admin/case-categories/:id', { targetCategoryId: 'special' }, { id: 'standard' })
  assert.deepEqual(pool.state.cases, before.map(c => ({ ...c, category_id: c.category_id === 'standard' ? 'special' : c.category_id })))
  assert.ok(!pool.state.categories.some(c => c.id === 'standard'))
  const statements = pool.log.map(entry => entry.sql)
  assert.ok(statements.indexOf('COMMIT') > statements.findIndex(sql => sql.startsWith('DELETE FROM')))
  assert.ok(statements.findIndex(sql => sql.startsWith('SELECT COALESCE')) > statements.indexOf('COMMIT'))
})

test('delete rollback restores assignments on failure; all categories may be deleted', async () => {
  const pool = memoryPool(), router = makeRouter(pool), before = structuredClone(pool.state)
  pool.client.failDelete = true
  await assert.rejects(invoke(router, 'delete', '/api/admin/case-categories/:id', { targetCategoryId: null }, { id: 'standard' }), /simulated/)
  assert.deepEqual(pool.state, before)
  pool.client.failDelete = false
  for (const { id } of before.categories) await invoke(router, 'delete', '/api/admin/case-categories/:id', { targetCategoryId: null }, { id })
  assert.equal(pool.state.categories.length, 0)
  assert.equal(pool.state.cases.length, before.cases.length)
  assert.ok(pool.state.cases.every(c => c.category_id === null))
})

test('old PUT requests preserve category; explicit null clears it; old POST defaults safely', async () => {
  const pool = memoryPool(), router = makeRouter(pool)
  const body = { ...pool.state.cases[0], image: undefined, sortOrder: 0 }
  assert.equal((await invoke(router, 'put', '/api/admin/cases/:id', body, { id: 'homeless' })).statusCode, 200)
  assert.equal(pool.state.cases[0].category_id, 'standard')
  assert.equal((await invoke(router, 'put', '/api/admin/cases/:id', { ...body, categoryId: null }, { id: 'homeless' })).statusCode, 200)
  assert.equal(pool.state.cases[0].category_id, null)
  await invoke(router, 'post', '/api/admin/cases', { ...body, id: 'new_case', image: '' })
  assert.equal(pool.state.cases.find(c => c.id === 'new_case').category_id, 'standard')
  await invoke(router, 'post', '/api/admin/cases/featured', { caseId: 'spring' })
  assert.deepEqual(pool.state.cases.filter(c => c.featured).map(c => c.id), ['spring'])
})

test('payload validation distinguishes omitted category from null', () => {
  assert.equal(normalizeCategoryId(undefined), undefined)
  assert.equal(normalizeCategoryId(null), null)
  assert.throws(() => normalizeCategoryId({ id: 'standard' }))
  assert.throws(() => normalizeCategoryTitles({ ru: ' ' }))
  assert.deepEqual(normalizeCategoryTitles({ ru: '  Name ', xx: 'ignored' }), { ru: 'Name' })
  const contents = [{ id: 'coins', type: 'coins', weight: 1, min: 1, max: 2 }]
  assert.equal(normalizeCasePayload({ contents }).categoryId, undefined)
})

test('empty server catalog stays empty; grouping preserves order and never loses unassigned IDs', () => {
  assert.deepEqual(caseOrderFrom([]), [])
  assert.deepEqual(groupCaseCatalog(caseOrderFrom([]), buildCaseTypes([]), []), [])
  assert.ok(caseOrderFrom(undefined).length > 0)
  const categories = [{ id: 'thematic', sortOrder: 20 }, { id: 'standard', sortOrder: 10 }, { id: 'empty', sortOrder: 30 }]
  const types = { a: { categoryId: 'thematic' }, b: { categoryId: 'standard' }, c: { categoryId: null }, d: { categoryId: 'deleted' } }
  const groups = groupCaseCatalog(['d','b','a','c','b'], types, categories)
  assert.deepEqual(groups.map(g => [g.id, g.cases]), [['standard',['b']], ['thematic',['a']], ['__uncategorized',['d','c']]])
  assert.deepEqual(groupCaseCatalog(['a'], types, []).map(g => g.cases), [['a']])
  assert.equal(caseCategoryTitle({ id: 'x', titles: { ru: 'Имя' } }, 'en', x => x), 'Имя')
})

test('all category UI/error translations exist in ru, en, uk', async () => {
  const keys = ['title','create','edit','delete','name','category','up','down','hint','count','transferTo','deleteConfirm','saved','deleted','moved','moveCase']
  for (const code of ['ru','en','uk']) {
    const { default: dictionary } = await import(`../src/i18n/locales/${code}.js`)
    for (const key of keys) assert.ok(dictionary.caseCategoryAdmin[key], `${code}.${key}`)
    assert.ok(dictionary.cases.categories.unassigned)
    for (const suffix of ['Invalid','Required','Missing','Conflict','Target']) assert.ok(dictionary.errors.server[`caseCategory${suffix}`])
  }
})

test('manual and runtime migrations are identical and do not update case business fields', () => {
  const sql = readFileSync(new URL('./admin_setup.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const block = sql.slice(sql.indexOf('-- CASE CATEGORIES MIGRATION'), sql.indexOf('-- END CASE CATEGORIES MIGRATION') + '-- END CASE CATEGORIES MIGRATION'.length)
  assert.equal(block, caseCategorySchemaSql.trim())
  assert.match(block, /END;\n\$case_categories\$;/)
  assert.match(block, /ON DELETE SET NULL/)
  assert.match(block, /attname = 'category_id'/)
  assert.equal((block.match(/UPDATE mini_app_cases/g) || []).length, 1)
  assert.match(block, /UPDATE mini_app_cases SET category_id = CASE/)
})

// Opt-in only. Never reads .env or DATABASE_URL. Requires loopback and a *_test database.
const testUrl = process.env.CASE_CATEGORIES_TEST_URL

test('PostgreSQL: migration is atomic/idempotent and preserves existing case fields', { skip: !testUrl }, async () => {
  const url = new URL(testUrl)
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'Only a local test PostgreSQL is allowed')
  assert.match(url.pathname, /_test$/, 'Database name must end with _test')
  const client = new pg.Client({ connectionString: testUrl })
  await client.connect()
  const schema = `case_categories_test_${process.pid}_${Date.now()}`
  try {
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET LOCAL search_path TO "${schema}"`)
    await client.query(caseSchemaSql)
    await client.query(`INSERT INTO mini_app_cases(id, stars, active, contents) VALUES
      ('homeless',25,true,'[]'),('spring',95,false,'[]'),('custom',500,false,'[]')`)
    const before = (await client.query('SELECT * FROM mini_app_cases ORDER BY id')).rows
    await client.query(caseCategorySchemaSql)
    let after = (await client.query('SELECT * FROM mini_app_cases ORDER BY id')).rows
    assert.deepEqual(after.map(({ category_id, ...row }) => { assert.ok(category_id); return row }), before)
    assert.equal(after.find(row => row.id === 'spring').category_id, 'thematic')
    await client.query("UPDATE mini_app_cases SET category_id = 'special' WHERE id = 'custom'")
    await client.query("DELETE FROM mini_app_case_categories WHERE id = 'thematic'")
    await client.query(caseCategorySchemaSql)
    after = (await client.query('SELECT * FROM mini_app_cases ORDER BY id')).rows
    assert.equal(after.find(row => row.id === 'spring').category_id, null)
    assert.equal(after.find(row => row.id === 'custom').category_id, 'special')
    assert.equal((await client.query("SELECT 1 FROM mini_app_case_categories WHERE id = 'thematic'")).rowCount, 0)
    await client.query('SAVEPOINT failed_delete')
    await client.query("UPDATE mini_app_cases SET category_id = 'standard' WHERE category_id = 'special'")
    await client.query("DELETE FROM mini_app_case_categories WHERE id = 'special'")
    await client.query('ROLLBACK TO SAVEPOINT failed_delete')
    assert.equal((await client.query("SELECT category_id FROM mini_app_cases WHERE id = 'custom'")).rows[0].category_id, 'special')
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})


test('React renders dynamic case categories and editor/list category selectors', async () => {
  const { default: CasesScreen } = await import('../src/screens/CasesScreen.jsx')
  const { default: CaseEditor } = await import('../src/components/admin/CaseEditor.jsx')
  const { default: CasesAdminList } = await import('../src/components/admin/CasesAdminList.jsx')
  const { I18nContext } = await import('../src/i18n/I18nContext.js')
  const { t, tp, setLocale } = await import('../src/i18n/index.js')
  setLocale('ru')
  const render = (Component, props) => renderToStaticMarkup(createElement(I18nContext.Provider,
    { value: { t, tp, locale: 'ru' } }, createElement(Component, props)))
  const categories = [
    { id: 'custom_category', titles: { ru: 'Категория из БД' }, sortOrder: 10 },
    { id: 'empty', titles: { ru: 'Пустая категория' }, sortOrder: 20 },
  ]
  const item = { id: 'homeless', titles: { ru: 'Кейс' }, texts: {}, stars: 25,
    categoryId: 'custom_category', contents: [], accent: 'cyan', active: true, sortOrder: 10 }
  const data = { caseCatalog: [item], caseCategories: categories, cases: {}, user: {} }
  const html = render(CasesScreen, { data })
  assert.match(html, /Категория из БД/)
  assert.doesNotMatch(html, /Пустая категория/)
  assert.match(html, /aria-expanded="true"/)
  assert.equal((html.match(/class="loot-card loot-card--/g) || []).length, 1)
  const empty = render(CasesScreen, { data: { ...data, caseCatalog: [] } })
  assert.doesNotMatch(empty, /class="loot-card loot-card--/)
  const editor = render(CaseEditor, { caseItem: item, categories, catalog: {} })
  assert.match(editor, /value="custom_category" selected=""/)
  assert.match(editor, /Пустая категория/)
  const list = render(CasesAdminList, { cases: [item], categories, language: 'ru' })
  assert.match(list, /value="custom_category" selected=""/)
})
