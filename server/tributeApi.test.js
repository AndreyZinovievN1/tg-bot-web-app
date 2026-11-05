import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import crypto from 'node:crypto'
import { loadTributeConfig, handleTributeEvent, createTributeApi, loadTributeCatalog, tributeSpaceStarsSnapshot } from './tributeApi.js'
import { validateSpaceStarPayment } from './spaceStars.js'
import { formatMoney } from '../src/utils/formatters.js'
import { setLocale } from '../src/i18n/index.js'

let configSequence=0
let remoteRows, catalogFails, catalogRequests
beforeEach(context => {
  catalogFails=false;catalogRequests=0
  remoteRows=[
    {id:8,type:'digital',status:'approved',amount:15000,currency:'RUB',link:'https://t.me/tribute/app?startapp=rub'},
    {id:173087,type:'digital',status:'approved',amount:199,currency:'USD',starsAmount:100,link:'https://t.me/tribute/app?startapp=pJ1J'},
  ]
  context.mock.method(globalThis,'fetch',async url => {
    if(url.includes('/products?')) { catalogRequests++; if(catalogFails)throw Error('catalog unavailable'); return {ok:true,json:async()=>({rows:remoteRows})} }
    return {ok:true,json:async()=>({result:[]})}
  })
})

function setup() {
  let state = { balance: 0, orders: [], payments: [], ledger: [], events: [] }, backup
  let fail = false
  const rows = values => ({ rows: structuredClone(values), rowCount: values.length })
  const db = { release() {}, async query(raw, p = []) {
    const sql = raw.trim()
    if (sql === 'BEGIN') { backup = structuredClone(state); return rows([]) }
    if (sql === 'COMMIT') return rows([])
    if (sql === 'ROLLBACK') { state = backup; return rows([]) }
    if (sql.startsWith('INSERT INTO space_star_wallets')) return rows([])
    if (sql.startsWith('SELECT balance')) return rows([{ balance: state.balance }])
    if (sql.startsWith('SELECT * FROM space_star_orders')) return rows(state.orders.filter(o => o.tribute_purchase_id === p[0]))
    if (sql.startsWith('INSERT INTO space_star_orders')) {
      if (!state.orders.some(o => o.tribute_purchase_id === p[5])) state.orders.push({ id:p[0], telegram_user_id:p[1], units:p[4], amount_xtr:null, tribute_purchase_id:p[5], tribute_product_id:p[6], amount_rub_kopecks:p[7], tribute_amount_minor:p[8], tribute_currency:p[9], credited_charge:null })
      return rows([])
    }
    if (sql.startsWith('INSERT INTO tribute_events')) {
      if (state.events.includes(p[0])) return rows([])
      state.events.push(p[0]); return rows([{ id:state.events.length }])
    }
    if (sql.startsWith('UPDATE tribute_events')) return rows([])
    if (sql.startsWith('INSERT INTO space_star_payments')) {
      if (!state.payments.some(r => r.charge_id === p[0])) state.payments.push({ charge_id:p[0], order_id:p[1], refunded:false })
      return rows([])
    }
    if (sql.startsWith('SELECT * FROM space_star_payments')) return rows(state.payments.filter(r => r.charge_id === p[0]))
    if (sql.startsWith('UPDATE space_star_payments')) { state.payments.find(r => r.charge_id === p[0]).refunded = true; return rows([]) }
    if (sql.startsWith('INSERT INTO space_star_ledger')) {
      if (state.ledger.some(r => r.charge === p[2] && r.kind === p[3])) return rows([])
      state.ledger.push({ charge:p[2], kind:p[3], amount:p[4] }); return rows([{ id:state.ledger.length }])
    }
    if (sql.startsWith('UPDATE space_star_wallets')) {
      if (fail) throw Error('DB failure')
      state.balance += p[1]; return rows([])
    }
    if (sql.startsWith('UPDATE space_star_orders')) {
      Object.assign(state.orders.find(o => o.id === p[0]), { credited_charge:p[1], status:p[2] }); return rows([])
    }
    throw Error('Unexpected SQL: ' + sql)
  } }
  const config = loadTributeConfig({ TRIBUTE_API_URL:`https://tribute.test/${++configSequence}`, TRIBUTE_API_KEY:'secret', TRIBUTE_VIP_PRODUCTS:'7:30', TRIBUTE_SPACE_STARS_ENABLED:'true', TRIBUTE_SPACE_STARS_PRODUCTS:'{"8":{"units":100,"rubKopecks":15000}}' })
  const args = { pool:{ connect:async () => db }, config, vipPlans:[], extendVipMembership:async () => { throw Error('Unexpected VIP grant') } }
  return { args, state:() => state, fail:() => { fail = true }, recover:() => { fail = false }, run:event => handleTributeEvent({ ...args, event }) }
}
const purchase = (overrides = {}, name = 'new_digital_product') => ({ name, payload:{ product_id:8, telegram_user_id:42, purchase_id:99, transaction_id:123, amount:15000, currency:'rub', ...overrides } })

test('separate config, disabled by default, reject overlapping VIP products', () => {
  assert.equal(loadTributeConfig({}).spaceStarsEnabled, false)
  assert.throws(() => loadTributeConfig({ TRIBUTE_VIP_PRODUCTS:'8:30', TRIBUTE_SPACE_STARS_PRODUCTS:'{"8":{"units":100,"rubKopecks":15000}}' }))
})
test('Space products bypass VIP allowlist; retry with another transaction ID cannot credit twice', async () => {
  const m = setup()
  await m.run(purchase()); await m.run(purchase({ transaction_id:456 }))
  assert.equal(m.state().balance, 100); assert.equal(m.state().ledger.length, 1)
  await m.run(purchase({ purchase_id:100 }))
  assert.equal(m.state().balance, 200); assert.equal(m.state().orders.length, 2)
})
test('verified refund uses original quote, is idempotent, and late payment cannot restore balance', async () => {
  const m = setup(); await m.run(purchase())
  m.args.config.spaceProducts['8'] = { units:500, rubKopecks:90000 }
  m.args.config.spaceStarsEnabled = false
  await m.run(purchase({}, 'digital_product_refunded')); await m.run(purchase({}, 'digital_product_refunded')); await m.run(purchase())
  assert.equal(m.state().balance, 0); assert.deepEqual(m.state().ledger.map(r => r.amount), [100, -100])
  assert.equal(m.state().orders[0].status, 'refunded')
})
test('refund arriving before purchase leaves no credit or debit', async () => {
  const m = setup(); await m.run(purchase({}, 'digital_product_refunded')); await m.run(purchase())
  assert.equal(m.state().balance, 0); assert.equal(m.state().ledger.length, 0)
})
test('wrong price, missing identity, unknown currency and disabled sales cannot credit', async () => {
  for (const patch of [{ amount:1 }, { telegram_user_id:null }, { purchase_id:null }, { currency:'XTR' }]) {
    const m = setup(); await assert.rejects(m.run(purchase(patch))); assert.equal(m.state().ledger.length, 0)
  }
  const m = setup(); m.args.config.spaceStarsEnabled = false
  await assert.rejects(m.run(purchase())); assert.equal(m.state().balance, 0)
})
test('mismatched refunds and subscription cancellation do not debit', async () => {
  const m = setup(); await m.run(purchase())
  await assert.rejects(m.run(purchase({ amount:1 }, 'digital_product_refunded')))
  await assert.rejects(m.run(purchase({ telegram_user_id:43 }, 'digital_product_refunded')))
  await m.run(purchase({}, 'cancelled_subscription'))
  assert.equal(m.state().balance, 100); assert.equal(m.state().ledger.length, 1)
})
test('DB error rolls back receipt and journal; delivery retry credits once', async () => {
  const m = setup(); m.fail(); await assert.rejects(m.run(purchase()), /DB failure/)
  assert.equal(m.state().orders.length, 0); assert.equal(m.state().ledger.length, 0)
  m.recover(); await m.run(purchase()); assert.equal(m.state().balance, 100)
})
test('existing VIP grant and duplicate protection remain intact', async () => {
  const m = setup(), calls = []
  m.args.extendVipMembership = async (_db, user, days) => calls.push([user, days])
  await m.run(purchase({ product_id:7 })); await m.run(purchase({ product_id:7 }))
  assert.deepEqual(calls, [[42, 30]]); assert.equal(m.state().balance, 0)
})
test('existing webhook requires valid signature before crediting', async () => {
  const m = setup(), router = createTributeApi(m.args)
  const handler = router.stack.find(s => s.route?.path === '/api/tribute/webhook' && s.route.methods.post).route.stack[0].handle
  const body = purchase(), rawBody = Buffer.from(JSON.stringify(body))
  const res = { code:200, status(n) { this.code=n; return this }, json() {} }
  await handler({ body, rawBody, get:() => 'bad' }, res, error => { throw error })
  assert.equal(res.code, 401); assert.equal(m.state().balance, 0)
  const signature = crypto.createHmac('sha256', 'secret').update(rawBody).digest('hex')
  await handler({ body, rawBody, get:() => signature }, res, error => { throw error })
  assert.equal(m.state().balance, 100)
})
test('RUB order cannot be credited through XTR payment handler', () => {
  assert.throws(() => validateSpaceStarPayment({ id:'a', telegram_user_id:42, amount_xtr:null }, { currency:'XTR', total_amount:0, invoice_payload:'space-stars:a' }, 42))
})

const usdPack = { units:100, amount:199, currency:'USD', link:'https://t.me/tribute/app?startapp=pJ1J' }
function usdSetup() {
  const m=setup()
  m.args.config=loadTributeConfig({ TRIBUTE_API_URL:m.args.config.apiBaseUrl, TRIBUTE_API_KEY:'secret', TRIBUTE_SPACE_STARS_ENABLED:'true',
    TRIBUTE_SPACE_STARS_PRODUCTS:JSON.stringify({173087:usdPack}) })
  return m
}
const usdPurchase = (patch={}, name='new_digital_product') => purchase({ product_id:173087, amount:199, currency:'usd', ...patch }, name)

test('USD signed webhook credits configured units, never starsAmount; replay and refund remain idempotent', async () => {
  const m=usdSetup(),router=createTributeApi(m.args)
  const handler=router.stack.find(s=>s.route?.path==='/api/tribute/webhook'&&s.route.methods.post).route.stack[0].handle
  const deliver=async(body, valid=true)=>{
    const rawBody=Buffer.from(JSON.stringify(body))
    const signature=crypto.createHmac('sha256','secret').update(rawBody).digest('hex')
    const res={code:200,status(n){this.code=n;return this},json(){}}
    await handler({body,rawBody,get:()=>valid?signature:'bad'},res,error=>{throw error})
    return res.code
  }
  assert.equal(await deliver(usdPurchase({starsAmount:100}),false),401)
  assert.equal(m.state().balance,0)
  await deliver(usdPurchase({starsAmount:999999}));await deliver(usdPurchase())
  assert.equal(m.state().balance,100);assert.equal(m.state().ledger.length,1)
  assert.equal(m.state().orders[0].amount_rub_kopecks,null)
  assert.equal(m.state().orders[0].tribute_amount_minor,199)
  assert.equal(m.state().orders[0].tribute_currency,'USD')
  m.args.config.spaceProducts['173087']={...usdPack,amount:500,units:250}
  await deliver(usdPurchase({},'digital_product_refunded'));await deliver(usdPurchase({},'digital_product_refunded'))
  await deliver(usdPurchase())
  assert.equal(m.state().balance,0);assert.deepEqual(m.state().ledger.map(r=>r.amount),[100,-100])
})

test('USD quote rejects RUB/XTR, wrong amount, product-price objects and starsAmount without actual amount', async () => {
  for(const patch of [{currency:'RUB'},{currency:'XTR',amount:100,starsAmount:100},{amount:100},{amount:undefined,starsAmount:100},{amount:1.99},{currency:undefined}]) {
    const m=usdSetup();await assert.rejects(m.run(usdPurchase(patch)))
    assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,0)
  }
  const m=usdSetup();await m.run({name:'product_updated',payload:{id:173087,...usdPack,starsAmount:100}})
  assert.equal(m.state().balance,0)
})

test('USD refund-first and mismatched refund currency never create or remove unverified funds', async () => {
  const m=usdSetup()
  await m.run(usdPurchase({},'digital_product_refunded'));await m.run(usdPurchase())
  assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,0)
  await m.run(usdPurchase({purchase_id:100}))
  await assert.rejects(m.run(usdPurchase({purchase_id:100,currency:'RUB'},'digital_product_refunded')))
  assert.equal(m.state().balance,100)
})

test('legacy RUB config and persisted RUB orders remain refundable without currency fields', async () => {
  const m=setup();assert.equal(m.args.config.spaceProducts['8'].currency,'RUB')
  assert.equal(m.args.config.spaceProducts['8'].amount,15000)
  await m.run(purchase())
  delete m.state().orders[0].tribute_amount_minor;delete m.state().orders[0].tribute_currency
  await m.run(purchase({},'digital_product_refunded'))
  assert.equal(m.state().balance,0)
})

test('config rejects mixed currency fields; USD 199 minor units renders as 1.99 dollars', () => {
  for(const pack of [{...usdPack,rubKopecks:199},{...usdPack,currency:'XTR'},{...usdPack,amount:undefined,starsAmount:100}])
    assert.throws(()=>loadTributeConfig({TRIBUTE_SPACE_STARS_PRODUCTS:JSON.stringify({173087:pack})}))
  setLocale('ru')
  const price=formatMoney(199/100,'USD')
  assert.match(price,/1,99/);assert.match(price,/\$/)
  assert.match(formatMoney(15000/100,'RUB'),/150/)
})

test('existing catalog automatically supplies known package without per-product env, ignoring names and starsAmount', async () => {
  const config=loadTributeConfig({ TRIBUTE_API_URL:`https://tribute.test/${++configSequence}`, TRIBUTE_API_KEY:'secret', TRIBUTE_SPACE_STARS_ENABLED:'true' })
  remoteRows[1].name='A renamed product';remoteRows[1].starsAmount=9000
  remoteRows.push({...remoteRows[1],id:999,name:'Space Stars — 10000'})
  const first=await tributeSpaceStarsSnapshot(config)
  assert.deepEqual(first.packages,[{id:'173087',units:100,amount:199,currency:'USD',link:'https://t.me/tribute/app?startapp=pJ1J',starsAmount:9000}])
  await tributeSpaceStarsSnapshot(config);assert.equal(catalogRequests,1)
  remoteRows[1].amount=299
  await loadTributeCatalog(config,[],{force:true})
  assert.equal((await tributeSpaceStarsSnapshot(config)).packages[0].amount,299)
})

test('disabled payments still expose cached catalog packages but cannot credit a new purchase', async () => {
  const m=usdSetup();m.args.config.spaceStarsEnabled=false
  const snapshot=await tributeSpaceStarsSnapshot(m.args.config)
  assert.equal(snapshot.enabled,false)
  assert.deepEqual(snapshot.packages,[{id:'173087',units:100,amount:199,currency:'USD',link:'https://t.me/tribute/app?startapp=pJ1J',starsAmount:100}])
  await tributeSpaceStarsSnapshot(m.args.config)
  assert.equal(catalogRequests,1)
  await assert.rejects(m.run(usdPurchase()),/disabled/)
  assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,0)
  m.args.config.spaceStarsEnabled=true
  assert.equal((await tributeSpaceStarsSnapshot(m.args.config)).enabled,true)
  assert.equal(catalogRequests,1)
})

test('catalog never invents an XTR display price from USD or credited units', async () => {
  for (const starsAmount of [undefined, 0, -1, 1.5, '100']) {
    const m=usdSetup()
    remoteRows[1].starsAmount=starsAmount
    const {packages}=await tributeSpaceStarsSnapshot(m.args.config)
    assert.equal(packages[0].units,100)
    assert.equal(packages[0].amount,199)
    assert.equal(Object.hasOwn(packages[0],'starsAmount'),false)
  }
})

test('catalog outage hides purchases and prevents new credits, but saved refunds and replays work', async () => {
  const m=usdSetup();await m.run(usdPurchase());catalogFails=true
  await loadTributeCatalog(m.args.config,[],{force:true})
  assert.deepEqual(await tributeSpaceStarsSnapshot(m.args.config),{enabled:false,packages:[]})
  await assert.rejects(m.run(usdPurchase({purchase_id:100})),/catalog unavailable/)
  await m.run(usdPurchase());assert.equal(m.state().balance,100)
  await m.run(usdPurchase({},'digital_product_refunded'));assert.equal(m.state().balance,0)
})

test('valid new product is visible with payments disabled and never credits from catalog status', async () => {
  const m=usdSetup();m.args.config.spaceStarsEnabled=false
  Object.assign(remoteRows[1],{status:'new',currency:'usd'})
  const snapshot=await tributeSpaceStarsSnapshot(m.args.config)
  assert.equal(snapshot.enabled,false)
  assert.deepEqual(snapshot.packages,[{id:'173087',units:100,amount:199,currency:'USD',link:'https://t.me/tribute/app?startapp=pJ1J',starsAmount:100}])
  assert.equal(m.state().balance,0);assert.equal(m.state().orders.length,0)
  await assert.rejects(m.run(usdPurchase()),/disabled/)
  assert.equal(m.state().ledger.length,0)
})

test('new products still require valid trusted catalog fields', async () => {
  for (const patch of [{amount:0},{amount:1.99},{currency:'XTR'},{link:'javascript:alert(1)'},{type:'physical'},{id:999}]) {
    const m=usdSetup()
    const original={...remoteRows[1]}
    Object.assign(remoteRows[1],{status:'new'},patch)
    assert.equal((await tributeSpaceStarsSnapshot(m.args.config)).packages.length,0)
    assert.equal(m.state().balance,0)
    remoteRows[1]=original
  }
})

test('new product cannot bypass webhook signature or payment amount checks', async () => {
  const m=usdSetup();remoteRows[1].status='new'
  const router=createTributeApi(m.args)
  const handler=router.stack.find(s=>s.route?.path==='/api/tribute/webhook'&&s.route.methods.post).route.stack[0].handle
  const deliver=async(body,signature)=>{
    const rawBody=Buffer.from(JSON.stringify(body))
    const res={code:200,status(n){this.code=n;return this},json(){}}
    await handler({body,rawBody,get:()=>signature ?? crypto.createHmac('sha256','secret').update(rawBody).digest('hex')},res,error=>{throw error})
    return res.code
  }
  assert.equal(await deliver(usdPurchase(),'bad'),401)
  await assert.rejects(deliver(usdPurchase({amount:100})),/price mismatch/)
  await assert.rejects(deliver(usdPurchase({currency:'XTR',amount:100})),/unverified/)
  await assert.rejects(deliver(usdPurchase({purchase_id:null})),/unverified/)
  assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,0)
})

test('rejected or XTR catalog product cannot be used as a USD quote', async () => {
  for(const patch of [{status:'pending'},{status:'rejected'},{type:'physical'},{currency:'XTR',amount:100}]) {
    const m=usdSetup();Object.assign(remoteRows[1],patch)
    assert.equal((await tributeSpaceStarsSnapshot(m.args.config)).packages.length,0)
    await assert.rejects(m.run(usdPurchase()))
    assert.equal(m.state().balance,0)
    Object.assign(remoteRows[1],{status:'approved',type:'digital',currency:'USD',amount:199})
  }
})

test('webhook diagnostics whitelist fields and preserve signature, currency, duplicate and refund checks', async context => {
  const logs=[]
  for(const method of ['info','log','warn']) context.mock.method(console,method,(...args)=>logs.push(args))
  const m=usdSetup(),router=createTributeApi(m.args)
  const handler=router.stack.find(s=>s.route?.path==='/api/tribute/webhook'&&s.route.methods.post).route.stack[0].handle
  const signatures=[]
  const deliver=async(body,mode='valid')=>{
    body.payload={...body.payload,telegram_username:'PRIVATE_USERNAME',name:'PRIVATE_NAME',email:'PRIVATE_EMAIL',chat_id:'PRIVATE_CHAT'}
    const rawBody=Buffer.from(JSON.stringify(body))
    const signed=crypto.createHmac('sha256','secret').update(rawBody).digest('hex');signatures.push(signed)
    const res={code:200,status(n){this.code=n;return this},json(){}}
    let failure
    await handler({body,rawBody,get:()=>mode==='missing'?'':mode==='invalid'?'PRIVATE_SIGNATURE':signed},res,error=>{failure=error})
    return {code:res.code,failure}
  }
  await deliver(usdPurchase(),'missing')
  assert.equal((await deliver(usdPurchase(),'invalid')).code,401)
  assert.equal(m.state().balance,0)
  assert.ok((await deliver(usdPurchase({currency:'XTR',amount:100}))).failure)
  assert.equal(m.state().balance,0)
  await deliver(usdPurchase());await deliver(usdPurchase())
  assert.equal(m.state().balance,100)
  await deliver(usdPurchase({},'digital_product_refunded'))
  assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,2)
  const diagnostics=logs.filter(row=>row[0]==='[tribute] webhook diagnostic').map(row=>row[1])
  assert.deepEqual(diagnostics[0],{event:'new_digital_product',product_id:173087,amount:199,currency:'USD',purchase_id:99,signature_check:'missing'})
  assert.equal(diagnostics[1].signature_check,'invalid')
  assert.deepEqual(diagnostics[2],{event:'new_digital_product',product_id:173087,amount:100,currency:'XTR',purchase_id:99,signature_check:'valid'})
  assert.equal(diagnostics[5].event,'digital_product_refunded')
  assert.equal(diagnostics[5].signature_check,'valid')
  await deliver({name:'PRIVATE_NAME\nFAKE_LOG',payload:{product_id:'PRIVATE_PRODUCT',amount:'PRIVATE_AMOUNT',currency:'PRIVATE_CURRENCY',purchase_id:'PRIVATE_PURCHASE'}},'missing')
  const last=logs.filter(row=>row[0]==='[tribute] webhook diagnostic').at(-1)[1]
  assert.deepEqual(last,{event:'unknown',product_id:null,amount:null,currency:null,purchase_id:null,signature_check:'missing'})
  m.args.config.apiKey=''
  assert.equal((await deliver(usdPurchase())).code,503)
  assert.equal(logs.filter(row=>row[0]==='[tribute] webhook diagnostic').at(-1)[1].signature_check,'not_configured')
  const output=JSON.stringify(logs)
  for(const value of ['PRIVATE_','secret','telegram_user_id','telegram_username','chat_id',...signatures]) assert.ok(!output.includes(value),value)
})

test('owner-only trial accepts only signed matching purchases, keeps public sales off and deduplicates refunds', async () => {
  const m=usdSetup();m.args.config.spaceStarsEnabled=false
  const ownerChecks=[]
  m.args.canPurchaseSpaceStars=async(userId,productId)=>{
    ownerChecks.push([userId,productId]);return userId==='42' && productId==='173087'
  }
  const router=createTributeApi(m.args)
  const handler=router.stack.find(s=>s.route?.path==='/api/tribute/webhook'&&s.route.methods.post).route.stack[0].handle
  const deliver=async(body,valid=true)=>{
    const rawBody=Buffer.from(JSON.stringify(body)), signature=crypto.createHmac('sha256','secret').update(rawBody).digest('hex')
    const res={code:200,status(n){this.code=n;return this},json(){}}
    let failure
    await handler({body,rawBody,get:()=>valid?signature:'invalid'},res,error=>{failure=error})
    return {code:res.code,failure}
  }
  assert.equal((await deliver(usdPurchase(),false)).code,401)
  assert.equal(ownerChecks.length,0)
  assert.ok((await deliver(usdPurchase({telegram_user_id:43}))).failure)
  assert.ok((await deliver(usdPurchase({currency:'XTR',amount:100}))).failure)
  assert.ok((await deliver(usdPurchase({amount:100}))).failure)
  assert.equal(m.state().balance,0)
  assert.equal((await deliver(usdPurchase())).failure,undefined)
  await deliver(usdPurchase());assert.equal(m.state().balance,100)
  m.args.config.spaceStarsEnabled=true
  assert.ok((await deliver(usdPurchase({telegram_user_id:43,purchase_id:101}))).failure)
  await deliver(usdPurchase({},'digital_product_refunded'));await deliver(usdPurchase({},'digital_product_refunded'))
  assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,2)
})

test('owner trial catalog override is per response and does not enable payments globally', async () => {
  const m=usdSetup();m.args.config.spaceStarsEnabled=false
  assert.equal((await tributeSpaceStarsSnapshot(m.args.config,[],true)).enabled,true)
  assert.equal((await tributeSpaceStarsSnapshot(m.args.config,[],false)).enabled,false)
  assert.equal((await tributeSpaceStarsSnapshot(m.args.config)).enabled,false)
  assert.equal(m.args.config.spaceStarsEnabled,false)
  assert.equal(catalogRequests,1)
})

test('six verified Tribute products use trusted credits and live prices, never names or starsAmount', async()=>{
 const config=loadTributeConfig({TRIBUTE_API_KEY:'secret',TRIBUTE_API_URL:'https://tribute.test/'+(++configSequence)});
 const rows=[[173087,100,199,'J1J'],[174052,500,899,'Jhi'],[174053,1000,1699,'Jhj'],[174055,2500,3999,'Jhl'],[174056,5000,6999,'Jhm'],[174058,10000,12999,'Jho']];
 remoteRows=rows.map(([id,,amount,link])=>({id,amount,type:'digital',status:'new',currency:'usd',starsAmount:999999,name:'untrusted',link:'https://t.me/tribute/app?startapp=p'+link}));
 const result=await tributeSpaceStarsSnapshot(config,[],true);
 assert.equal(result.packages.length,6);
 for(let i=0;i<rows.length;i++){assert.equal(result.packages[i].units,rows[i][1]);assert.equal(result.packages[i].amount,rows[i][2]);assert.equal(result.packages[i].currency,'USD')}
 remoteRows[1].amount=999;remoteRows[2].status='deleted';remoteRows[3].amount=0;
 await loadTributeCatalog(config,[],{force:true});const updated=await tributeSpaceStarsSnapshot(config,[],true);
 assert.equal(updated.packages.find(p=>p.id==='174052').amount,999);
 assert.ok(!updated.packages.some(p=>['174053','174055'].includes(p.id)));
});
