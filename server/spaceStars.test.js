import { spaceStarProductUnits } from './tributeApi.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createSpaceStars, spaceStarPackages, spaceStarCustom, quoteCustom, quoteStars } from './spaceStars.js'
const id = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'
test('wallet explains disabled payments without enabling invoices or exposing secrets', async () => {
 const m=memory()
 const args={pool:m.pool,packages:[pack],canPurchase:async()=>true}
 for(const reason of ['disabled','botNotConfigured','relayNotConfigured']) {
  const service=createSpaceStars({...args,disabledReason:reason})
  const state=await service.snapshot(42)
  assert.equal(state.enabled,false);assert.equal(state.paymentUnavailable,reason)
  await assert.rejects(service.invoice(42,pack.id,requestId),/SPACE_STARS_DISABLED/)
 }
 assert.equal((await createSpaceStars({...args,enabled:true,packages:[]}).snapshot(42)).paymentUnavailable,'catalogNotReady')
 assert.equal((await createSpaceStars({...args,enabled:true,canPurchase:async()=>false}).snapshot(42)).paymentUnavailable,'ownerOnly')
 const state=await createSpaceStars({...args,enabled:true}).snapshot(42)
 assert.equal(state.enabled,true);assert.equal(state.paymentUnavailable,null)
 assert.equal(m.state().orders.length,0)
})
test('closed trial denies non-owner invoices and precheckout, defaults to deny', async () => {
 const m=memory(); const calls=[]
 const service=createSpaceStars({pool:m.pool,enabled:true,packages:[pack],canPurchase:async userId=>userId===42,
  telegram:async(method,args)=>{calls.push([method,args]);return 'https://t.me/$test'}})
 assert.equal((await service.snapshot(99)).enabled,false)
 assert.equal((await service.snapshot(42)).enabled,true)
 await assert.rejects(service.invoice(99,'test',requestId),/SPACE_STARS_DISABLED/)
 await assert.rejects(createSpaceStars({pool:m.pool,enabled:true}).invoice(42,'test',requestId),/SPACE_STARS_DISABLED/)
 assert.equal(m.state().orders.length,0)
 const order=await service.invoice(42,pack.id,requestId)
 const closed=createSpaceStars({pool:m.pool,enabled:true,telegram:async(method,args)=>calls.push([method,args])})
 await closed.handleUpdate({pre_checkout_query:{id:'q',from:{id:42},invoice_payload:'space-stars:'+order.orderId,currency:'XTR',total_amount:pack.xtr}})
 assert.equal(calls.at(-1)[1].ok,false)
 assert.equal(m.state().balance,0)
})
function memory() {
  let state = { balance: 0, orders: [], payments: [], ledger: [], purchases: [], stock: 0, vipOrders: [], vipDays: 0 }, backup
  let failWallet = false
  const db = { release() {}, async query(sql, p = []) {
    const rows = value => ({ rows: value, rowCount: value.length })
    if (sql.includes('AS payments_ready')) return rows([{ payments_ready: true, purchases_ready: true }])
    if (sql.includes('AS vip_ready')) return rows([{ vip_ready: true }])
    if (sql === 'BEGIN') { backup = structuredClone(state); return rows([]) }
    if (sql === 'COMMIT') { backup = null; return rows([]) }
    if (sql === 'ROLLBACK') { state = backup; return rows([]) }
    if (sql.startsWith('INSERT INTO space_star_wallets')) return rows([])
    if (sql.startsWith('SELECT balance')) return rows([{ balance: state.balance }])
    if (sql.startsWith('SELECT id,kind,amount,created_at FROM space_star_ledger')) return rows(state.ledger.filter(o=>o.user===p[0]))
    if (sql.startsWith('SELECT id,package_id,request_id,units FROM space_star_orders')) return rows(state.orders.filter(o=>o.telegram_user_id===p[0] && o.status==='pending' && o.amount_xtr!=null).slice(-1).map(o=>({id:o.id,package_id:o.package_id,request_id:o.request_id,units:o.units})))
    if (sql.startsWith('SELECT * FROM star_vip_orders')) return rows(state.vipOrders.filter(o => o.id === p[0] && o.chat_id === p[1]))
    if (sql.startsWith('INSERT INTO star_vip_orders')) {
      const order = { id:p[0], chat_id:p[1], plan_id:p[2], days:p[3], amount_stars:p[4], status:'fulfilled', payment_payload:JSON.parse(p[5]) }
      state.vipOrders.push(order); return rows([order])
    }
    if (sql.startsWith('SELECT * FROM space_star_case_purchases')) return rows(state.purchases.filter(o=>o.telegram_user_id===p[0] && o.request_id===p[1]))
    if (sql.startsWith('INSERT INTO space_star_case_purchases')) {
      const order={telegram_user_id:p[0],request_id:p[1],case_type:p[2],quantity:p[3],unit_price:p[4],total:p[5]}
      state.purchases.push(order);return rows([order])
    }
    if (sql.startsWith('SELECT * FROM space_star_orders WHERE telegram')) return rows(state.orders.filter(o => o.telegram_user_id === p[0] && o.request_id === p[1]))
    if (sql.startsWith('SELECT * FROM space_star_orders WHERE id')) return rows(state.orders.filter(o => o.id === p[0] && (p.length < 2 || o.telegram_user_id === p[1])))
    if (sql.startsWith('INSERT INTO space_star_orders')) {
      const order = { id:p[0],telegram_user_id:p[1],request_id:p[2],package_id:p[3],units:p[4],amount_xtr:p[5],status:'pending',credited_charge:null }
      state.orders.push(order); return rows([order])
    }
    if (sql.startsWith('UPDATE space_star_orders SET invoice_link')) { state.orders.find(o => o.id === p[0]).invoice_link = p[1]; return rows([]) }
    if (sql.startsWith('INSERT INTO space_star_payments')) {
      if (!state.payments.some(r=>r.charge_id===p[0])) state.payments.push({charge_id:p[0],order_id:p[1],refunded:false})
      return rows([])
    }
    if (sql.startsWith('SELECT * FROM space_star_payments')) return rows(state.payments.filter(r=>r.charge_id===p[0]))
    if (sql.startsWith('UPDATE space_star_payments')) { state.payments.find(r=>r.charge_id===p[0]).refunded=true; return rows([]) }
    if (sql.startsWith('INSERT INTO space_star_ledger')) {
      if(state.ledger.some(r=>r.charge===p[2] && r.kind===p[3])) return rows([])
      state.ledger.push({user:p[0],order:p[1],charge:p[2],kind:p[3],amount:p[4]}); return rows([{id:state.ledger.length}])
    }
    if(sql.startsWith('UPDATE space_star_wallets')) { if(failWallet) throw Error('DB write failed'); state.balance+=sql.includes('balance-$2') ? -p[1] : p[1];return rows([]) }
    if(sql.startsWith('UPDATE space_star_orders SET credited_charge')) { Object.assign(state.orders.find(o=>o.id===p[0]), {credited_charge:p[1],status:p[2]});return rows([]) }
    if(sql.includes("SET status='review'")) {state.orders.find(o=>o.id===p[0]).status='review';return rows([])}
    if(sql.includes("SET status='refunded'")) {state.orders.find(o=>o.id===p[0]).status='refunded';return rows([])}
    throw Error('Unexpected SQL: '+sql)
  }}
  return { pool:{connect:async()=>db,query:db.query},state:()=>state,fail:()=>{failWallet=true} }
}
const pack = { id:'test',units:100,xtr:70 }
function setup() {
 const m=memory(); m.state().orders.push({id,telegram_user_id:42,units:100,amount_xtr:70,status:'pending',credited_charge:null})
 const calls=[]
 const service=createSpaceStars({canPurchase: async () => true,pool:m.pool,enabled:true,packages:[pack],telegram:async(...args)=>{calls.push(args);return 'https://t.me/$test'}})
 return {m,service,calls}
}
function message(charge='charge1', refund=false) {return {from:{id:42},[refund?'refunded_payment':'successful_payment']:{invoice_payload:'space-stars:'+id,currency:'XTR',total_amount:70,telegram_payment_charge_id:charge}}}
test('server catalog validates rates, ranges, rounding and package IDs',()=>{
 assert.deepEqual(spaceStarPackages().map(p=>p.xtr),[50,100,250,500,1000,2500,5000,10000])
 assert.ok(spaceStarPackages().every(p=>p.units===Math.floor(p.xtr*9/10)))
 assert.deepEqual(spaceStarCustom(),{units:9,xtr:10,min:50,minStars:50,step:1,max:1000000000,maxXtr:1000000000})
 assert.throws(()=>spaceStarPackages('[{"id":"custom","units":1,"xtr":1}]'))
 assert.throws(()=>spaceStarPackages(JSON.stringify([pack,pack])))
 const config=spaceStarCustom('{"units":3,"xtr":2,"min":1,"max":100,"step":1}')
 assert.equal(quoteCustom(config,76).xtr,51)
 for(const value of [0,-1,1.5,49,Infinity,'4']) assert.throws(()=>quoteCustom(config,value))
})
test('settlement credits once, survives recreation and never calls Telegram',async()=>{
 const {m,service,calls}=setup()
 await service.handleUpdate({message:message()});await service.handleUpdate({message:message()})
 await createSpaceStars({canPurchase: async () => true,pool:m.pool}).handleUpdate({message:message()})
 assert.equal(m.state().balance,100);assert.equal(m.state().ledger.length,1);assert.equal(calls.length,0)
})
test('refund is idempotent, including arrival before payment and disabled sales',async()=>{
 for(const firstRefund of [false,true]){
  const {m,service}=setup()
  if(!firstRefund)await service.handleUpdate({message:message()})
  await service.handleUpdate({message:message('charge1',true)})
  await service.handleUpdate({message:message('charge1',true)})
  await service.handleUpdate({message:message()})
  assert.equal(m.state().balance,0);assert.equal(m.state().orders[0].status,'refunded')
 }
})
test('forged user, price and currency never grant; DB error rolls back payment and ledger',async()=>{
 for(const change of [m=>m.from.id=99,m=>m.successful_payment.total_amount=1,m=>m.successful_payment.currency='USD']){
  const {m,service}=setup();const msg=message();change(msg)
  await assert.rejects(service.handleUpdate({message:msg}));assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,0)
 }
 const {m,service}=setup();m.fail();await assert.rejects(service.handleUpdate({message:message()}));
 assert.equal(m.state().balance,0);assert.equal(m.state().payments.length,0);assert.equal(m.state().ledger.length,0)
})
test('second charge for one order is recorded for refund, never credited twice',async()=>{
 const {m,service}=setup();await service.handleUpdate({message:message()});await service.handleUpdate({message:message('charge2')})
 assert.equal(m.state().balance,100);assert.equal(m.state().payments.length,2);assert.equal(m.state().orders[0].status,'review')
 await service.handleUpdate({message:message('charge2',true)});assert.equal(m.state().balance,100)
})
test('invoice persists server price before Telegram, retries retain order, no client price or credit',async()=>{
 const m=memory();let failed=true,orderId
 const service=createSpaceStars({canPurchase: async () => true,pool:m.pool,enabled:true,packages:[pack],telegram:async(method,args)=>{
  assert.equal(method,'createInvoiceLink'); assert.equal(args.prices[0].amount,70)
  assert.equal(m.state().orders.length,1);orderId=m.state().orders[0].id
  if(failed)throw Error('timeout');return 'https://t.me/$test'
 }})
 await assert.rejects(service.invoice(42,'test',requestId))
 failed=false;const result=await service.invoice(42,'test',requestId)
 assert.equal(result.orderId,orderId);assert.equal(m.state().balance,0)
 await assert.rejects(service.invoice(42,'other',requestId))
 assert.equal(m.state().orders.length,1)
})
test('precheckout rejects changed sender, paid orders and disabled sales, unrelated payments untouched',async()=>{
 const {m,service,calls}=setup()
 assert.equal(await service.handleUpdate({message:{successful_payment:{invoice_payload:'case:x'}}}),false)
 for(const userId of [42,99]){
  await service.handleUpdate({pre_checkout_query:{...message().successful_payment,id:'q',from:{id:userId}}})
  assert.equal(calls.at(-1)[1].ok,userId===42)
 }
 await service.handleUpdate({message:message()})
 await service.handleUpdate({pre_checkout_query:{...message().successful_payment,id:'q',from:{id:42}}})
 assert.equal(calls.at(-1)[1].ok,false)
 await assert.rejects(createSpaceStars({canPurchase: async () => true,pool:m.pool}).invoice(42,'test',requestId))
})

test('custom amount uses server rate, validates limits, and binds repeat request to original amount',async()=>{
 const m=memory()
 const service=createSpaceStars({canPurchase: async () => true,pool:m.pool,enabled:true,custom:{units:3,xtr:2,min:1,max:100,step:1},telegram:async()=> 'https://t.me/$test'})
 await service.invoice(42,'custom',requestId,76)
 assert.equal(m.state().orders[0].amount_xtr,51)
 assert.equal(m.state().orders[0].units,76)
 await assert.rejects(service.invoice(42,'custom',requestId,5))
 assert.equal(m.state().balance,0)
})

test('refund service event need not have a user sender; charge cannot move to another order',async()=>{
 const {m,service}=setup()
 await service.handleUpdate({message:message()})
 const refund=message('charge1',true);delete refund.from
 await service.handleUpdate({message:refund});assert.equal(m.state().balance,0)
 const other='33333333-3333-4333-8333-333333333333'
 m.state().orders.push({id:other,telegram_user_id:42,units:100,amount_xtr:70,status:'pending',credited_charge:null})
 const forged=message();forged.successful_payment.invoice_payload='space-stars:'+other
 await assert.rejects(service.handleUpdate({message:forged}));assert.equal(m.state().balance,0)
})

test('integration keeps auth and private history, does not auto-migrate, and all UI locales exist',async()=>{
 const source=readFileSync(new URL('./spaceStars.js',import.meta.url),'utf8')
 const index=readFileSync(new URL('./index.js',import.meta.url),'utf8')
 assert.match(index,/app\.use\('\/api\/space-stars', requireTelegramUser, spaceStars\.router\)/)
 assert.match(source,/WHERE id=\$1 AND telegram_user_id=\$2/)
 assert.match(source,/WHERE telegram_user_id=\$1 ORDER BY id DESC LIMIT 30/)
 assert.doesNotMatch(source,/CREATE TABLE|UPDATE users|grantGift|openCase/)
 const topup=readFileSync(new URL('../src/screens/TopUpScreen.jsx',import.meta.url),'utf8')
 assert.doesNotMatch(topup,/coinPacks|astronPacks|setBalance|\/api\/cases\/open/)
 for(const lang of ['ru','en','uk']) {
  const locale=(await import(`../src/i18n/locales/${lang}.js`)).default
  for(const key of ['title','balance','method','packages','total','pay','unavailable','noPackages','telegramOnly','confirmed','pending','cancelled','failed','review','refresh','history','empty','credit','refund','telegramMethods','custom','invalidAmount','receive']) assert.ok(locale.topUp[key],lang+':'+key)
  assert.ok(locale.cases.chanceInfo)
 }
})

test('case purchase 1–5 atomically debits once and preserves replay after price change',async()=>{
 for(let quantity=1;quantity<=5;quantity++){
  const m=memory();m.state().balance=1000;const prices={premium:17};let grants=0
  const service=createSpaceStars({canPurchase: async () => true,pool:m.pool,casePurchasesEnabled:true,findCase:async()=>({id:'premium',active:true,stars:prices.premium}),
   incrementCases:async(db,user,type,n)=>{assert.equal(user,42);assert.equal(type,'premium');m.state().stock+=n;grants++}})
  const order=await service.buyCases(42,'premium',quantity,requestId)
  prices.premium=900
  assert.deepEqual(await service.buyCases(42,'premium',quantity,requestId),order)
  assert.equal(m.state().balance,1000-17*quantity);assert.equal(m.state().stock,quantity);assert.equal(grants,1)
  await assert.rejects(service.buyCases(42,'other',quantity,requestId))
 }
})
test('case purchase rejects invalid count, disabled sales and insufficient balance; failed grant rolls back debit and stock',async()=>{
 for(const n of [0,6,1.5,'2']){
  await assert.rejects(createSpaceStars({canPurchase: async () => true,pool:memory().pool,casePurchasesEnabled:true}).buyCases(42,'premium',n,requestId))
 }
 const m=memory();m.state().balance=10
 const args={pool:m.pool,casePurchasesEnabled:true,findCase:async()=>({active:true,stars:20}),incrementCases:async()=>{m.state().stock++;throw Error('stock write failure')}}
 await assert.rejects(createSpaceStars({canPurchase: async () => true,...args,casePurchasesEnabled:false}).buyCases(42,'premium',1,requestId))
 await assert.rejects(createSpaceStars(args).buyCases(42,'premium',1,requestId));assert.equal(m.state().balance,10)
 m.state().balance=100
 await assert.rejects(createSpaceStars(args).buyCases(42,'premium',1,requestId));assert.equal(m.state().balance,100);assert.equal(m.state().stock,0);assert.equal(m.state().purchases.length,0)
})

test('VIP wallet purchase uses existing activation, debits once and retries original quote after restart', async () => {
 const m=memory();m.state().balance=1000
 const plan={id:'vip_30',days:30,stars:250}
 const args={pool:m.pool,canPurchase:async()=>true,vipPurchasesEnabled:true,vipPlans:[plan],extendVipMembership:async(db,user,days)=>{assert.equal(user,42);m.state().vipDays+=days}}
 const order=await createSpaceStars(args).buyVip(42,plan.id,requestId)
 plan.days=365;plan.stars=900
 assert.deepEqual(await createSpaceStars(args).buyVip(42,plan.id,requestId.toUpperCase()),order)
 assert.equal(m.state().balance,750);assert.equal(m.state().vipDays,30);assert.equal(m.state().vipOrders.length,1)
 assert.equal(order.payment_payload.currency,'SPACE_STARS')
 await assert.rejects(createSpaceStars(args).buyVip(42,'vip_365',requestId),/REQUEST_CONFLICT/)
})

test('VIP purchase rejects insufficient funds, invalid plan, disabled sales; activation failure rolls back balance and journal', async () => {
 const m=memory();m.state().balance=100
 const args={pool:m.pool,canPurchase:async()=>true,vipPurchasesEnabled:true,vipPlans:[{id:'vip_30',days:30,stars:250}],extendVipMembership:async()=>{m.state().vipDays+=30;throw Error('activation failed')}}
 await assert.rejects(createSpaceStars(args).buyVip(42,'vip_30',requestId),/INSUFFICIENT/)
 await assert.rejects(createSpaceStars(args).buyVip(42,'invalid',requestId),/UNAVAILABLE/)
 await assert.rejects(createSpaceStars({canPurchase: async () => true,...args,vipPurchasesEnabled:false}).buyVip(42,'vip_30',requestId),/DISABLED/)
 m.state().balance=1000
 await assert.rejects(createSpaceStars(args).buyVip(42,'vip_30',requestId),/activation failed/)
 assert.equal(m.state().balance,1000);assert.equal(m.state().vipDays,0);assert.equal(m.state().vipOrders.length,0)
})

test('VIP client prevents duplicate clicks and preserves request through uncertain refresh', async () => {
 const source=readFileSync(new URL('../src/screens/VipScreen.jsx',import.meta.url),'utf8')
 const start=source.indexOf('const buyPlan = ')+'const buyPlan = '.length
 const end=source.indexOf('\n  return (',start)
 const code=source.slice(start,end).trim().replace(/;$/,'')
 let refreshFails=true,updates=0;const sent=[];const stored=new Map()
 const ctx={lock:{current:false},data:{spaceStars:{vipPurchasesEnabled:true,balance:1000}},pending:null,requestKey:'vip',initData:'signed',
  crypto:{randomUUID:()=>requestId},sessionStorage:{setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
  setPending:v=>ctx.pending=v,setBuyingPlanId:()=>{},onTopUp:()=>{throw Error('unexpected topup')},onToast:()=>{},t:k=>k,tp:k=>k,triggerHaptic:()=>{},onData:()=>updates++,
  apiRequest:async(path,options)=>{if(path.endsWith('/purchase')){sent.push(JSON.parse(options.body));return {}}if(refreshFails)throw Object.assign(Error('refresh rejected'),{status:409});return {vip:{active:true}}}}
 const buy=runInNewContext('('+code+')',ctx),plan={id:'vip_30',stars:250,days:30}
 await Promise.all([buy(plan),buy(plan)])
 assert.equal(sent.length,1);assert.equal(ctx.pending.requestId,requestId)
 refreshFails=false;await buy(plan)
 assert.equal(sent.length,2);assert.equal(sent[0].requestId,sent[1].requestId);assert.equal(updates,1);assert.equal(stored.size,0)
})

test('current UI uses native Stars invoices for topups and retains Tribute catalog; goods unchanged', async () => {
 const cases=readFileSync(new URL('../src/screens/CasesScreen.jsx',import.meta.url),'utf8')
 const vip=readFileSync(new URL('../src/screens/VipScreen.jsx',import.meta.url),'utf8')
 const topup=readFileSync(new URL('../src/screens/TopUpScreen.jsx',import.meta.url),'utf8')
 assert.doesNotMatch(cases+vip,/purchase-link|openInvoice|openTributePlan/)
 assert.match(topup,/openInvoice/)
 assert.match(topup,/space-stars\/invoice/)
 assert.match(topup,/wallet\?\.tribute\?\.packages/)
 assert.match(cases,/space-stars\/cases\/purchase/);assert.match(vip,/space-stars\/vip\/purchase/)
 for(const lang of ['ru','en','uk']) {
  const locale=(await import(`../src/i18n/locales/${lang}.js`)).default
  assert.ok(locale.vip.spaceDisabled);assert.ok(locale.vip.spaceRetryFirst);assert.ok(locale.topUp.tributeMethods)
 }
})
function topupHarness() {
 const source=readFileSync(new URL('../src/screens/TopUpScreen.jsx',import.meta.url),'utf8')
 const code=source.slice(source.indexOf('  const pay =')+'  const pay ='.length,source.indexOf('  return <section')).trim().replace(/;$/,'')
 const timers=new Map(),events=new Map(),sent=[];let sequence=0,callback,busy=false,refreshes=0,failRequest=false
 const ctx={method:'stars',wallet:{enabled:true},selected:{id:'space_100',units:100,xtr:100},payment:{current:null},paying:{current:false},
  alive:{current:true},watchedOrders:{current:new Set()},finishInvoice:{current:null},initData:'signed',AbortController,
  crypto:{randomUUID:()=>String(++sequence)},formatNumber:String,t:()=> 'Confirm',
  window:{setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),Telegram:{WebApp:{
   onEvent:(name,fn)=>events.set(name,fn),offEvent:name=>events.delete(name),openInvoice:(_link,cb)=>{callback=cb}}}},
  setNotice:()=>{},setBusy:value=>{busy=value},setError:()=>{},setRefreshCycle:()=>{refreshes++},
  apiRequest:async(path,options)=>{assert.equal(path,'/api/space-stars/invoice');sent.push(JSON.parse(options.body));if(failRequest)throw Error('network');return {orderId:id,status:'pending',invoiceLink:'https://t.me/$test'}}}
 return {ctx,sent,timers,events,pay:runInNewContext('('+code+')',ctx),callback:status=>callback(status),busy:()=>busy,refreshes:()=>refreshes,fail:value=>{failRequest=value}}
}
test('all Invoice close statuses unlock selection without trusting a client payment result',async()=>{
 for(const status of ['paid','cancelled','failed','pending']) {
  const h=topupHarness();const first=h.pay();await h.pay();await new Promise(resolve=>setImmediate(resolve))
  assert.equal(h.sent.length,1);assert.equal(h.busy(),true)
  h.callback(status);await first
  assert.equal(h.busy(),false);assert.equal(h.ctx.paying.current,false);assert.equal(h.ctx.payment.current,null)
  assert.equal(h.refreshes(),1);assert.ok(h.ctx.watchedOrders.current.has(id));assert.equal(h.timers.size,0)
  h.ctx.selected={id:'custom',units:37,xtr:37};const second=h.pay();await new Promise(resolve=>setImmediate(resolve));h.callback('cancelled');await second
  assert.equal(h.sent[1].amount,37);assert.notEqual(h.sent[0].requestId,h.sent[1].requestId)
 }
})
test('uncertain invoice creation retries same request; changing amount starts a separate intent',async()=>{
 const h=topupHarness();h.fail(true);await h.pay();assert.equal(h.busy(),false)
 h.fail(false);const retry=h.pay();await new Promise(resolve=>setImmediate(resolve))
 assert.equal(h.sent[0].requestId,h.sent[1].requestId)
 h.events.get('invoiceClosed')({url:'https://t.me/$test',status:'cancelled'});await retry
 assert.equal(h.ctx.payment.current,null);assert.equal(h.events.size,0)
})
test('missing invoice callback times out safely and permits retry without credit',async()=>{
 const h=topupHarness();const run=h.pay();await new Promise(resolve=>setImmediate(resolve))
 for(const fn of [...h.timers.values()])fn();await run
 assert.equal(h.busy(),false);assert.ok(h.ctx.payment.current);assert.equal(h.events.size,0)
})
test('wallet restores only authenticated users native pending invoice after screen restart', async () => {
 const m=memory()
 const service=createSpaceStars({pool:m.pool,enabled:true,canPurchase:async()=>true,packages:[pack],telegram:async()=> 'https://t.me/$test'})
 const order=await service.invoice(42,pack.id,requestId)
 const route=service.router.stack.find(layer=>layer.route?.path==='/' && layer.route.methods.get).route.stack[0].handle
 const get=userId=>new Promise((resolve,reject)=>route({telegramUser:{id:userId}},{json:resolve},reject))
 assert.equal((await get(99)).pendingOrder,null)
 assert.deepEqual((await get(42)).pendingOrder,{id:order.orderId,package_id:pack.id,request_id:requestId,units:pack.units})
 await service.settle({from:{id:42},successful_payment:{invoice_payload:'space-stars:'+order.orderId,currency:'XTR',total_amount:pack.xtr,telegram_payment_charge_id:'restored'}})
 const state=await get(42)
 assert.equal(state.pendingOrder,null);assert.equal(state.balance,pack.units);assert.equal(state.history.length,1)
})
test('declining confirmation creates no invoice',async()=>{
 const h=topupHarness();h.ctx.window.Telegram.WebApp.showConfirm=(_text,cb)=>cb(false)
 await h.pay();assert.equal(h.sent.length,0);assert.equal(h.busy(),false);assert.equal(h.ctx.payment.current,null);assert.equal(h.timers.size,0)
})
test('unpriced prepared package never creates an invoice or credits balance',async()=>{
 const m=memory();let invoices=0
 const service=createSpaceStars({canPurchase: async () => true,pool:m.pool,enabled:true,packages:spaceStarPackages().map(p=>({...p,xtr:null})),telegram:async()=>{invoices++}})
 await assert.rejects(service.invoice(42,'space_25',requestId))
 assert.equal(invoices,0);assert.equal(m.state().orders.length,0);assert.equal(m.state().balance,0)
})
test('custom UI validates server limits and deselects fixed packages without changing Tribute',()=>{
 const source=readFileSync(new URL('../src/screens/TopUpScreen.jsx',import.meta.url),'utf8')
 const code=source.slice(source.indexOf('  const custom ='),source.indexOf('  const cardAllowed'))
 const quote=(customAmount,selectedId='custom',method='stars',custom=spaceStarCustom())=>runInNewContext(code+';selected',{
  wallet:{custom},customAmount,selectedId,method,packs:[{id:'space_25',units:25,xtr:25}]})
 for(const n of ['50','100','10000','10001']) {assert.equal(quote(n).units,Math.floor(Number(n)*9/10));assert.equal(quote(n).xtr,Number(n))}
 for(const n of ['', '0','49','1000000001','-1','1.5','1e2','Infinity']) assert.equal(quote(n),null)
 assert.equal(quote('100','space_25').id,'space_25')
 assert.equal(quote('100','custom','card').id,'space_25')
 assert.equal(quote('3','custom','stars',{min:2,max:8,step:2,units:2,xtr:3}),null)
 assert.equal(quote('60','custom','stars',{minStars:50,max:100,maxXtr:100,units:2,xtr:3}).units,40)
})
test('historical pending orders only refresh wallet and never restore selection or block purchases',async()=>{
 const source=readFileSync(new URL('../src/screens/TopUpScreen.jsx',import.meta.url),'utf8')
 const code=source.slice(source.indexOf('  const load =')+'  const load ='.length,source.indexOf('  useEffect(() => {',source.indexOf('  const load ='))).trim().replace(/;$/,'')
 let updates=0;const calls=[]
 const ctx={loading:{current:false},alive:{current:true},watchedOrders:{current:new Set()},initData:'test',AbortController,
  window:{setTimeout:()=>1,clearTimeout:()=>{}},useCallback:fn=>fn,setError:()=>{},setWallet:()=>{updates++},onWalletRef:{current:()=>{}},
  apiRequest:async path=>{calls.push(path);if(path.endsWith('/sync'))throw Error('offline');if(path.includes('/orders/'))return {order:{status:'pending'}};return {balance:50,pendingOrder:{id,request_id:requestId}}}}
 const load=runInNewContext(code,ctx);await load()
 assert.equal(updates,1);assert.ok(ctx.watchedOrders.current.has(id));assert.equal(ctx.loading.current,false)
 assert.equal(calls[0],'/api/space-stars')
})

test('wallet snapshots read the existing Tribute catalog callback instead of freezing startup prices', async () => {
 const m=memory();let price=199
 const service=createSpaceStars({canPurchase: async () => true,pool:m.pool,tribute:async userId=>{assert.equal(userId,42);return {enabled:true,packages:[{id:'173087',units:100,amount:price,currency:'USD'}]}}})
 assert.equal((await service.snapshot(42)).tribute.packages[0].amount,199)
 price=299
 assert.equal((await service.snapshot(42)).tribute.packages[0].amount,299)
 assert.equal(m.state().balance,0)
})

test('owner trial wiring uses existing owner check and hides purchase links from other users', async () => {
 const index=readFileSync(new URL('./index.js',import.meta.url),'utf8')
 const start=index.indexOf('  tribute: async userId => ')+ '  tribute: '.length
 const end=index.indexOf('\n  findCase:',start)
 const code=index.slice(start,end).trim().replace(/,$/,'')
 const snapshot={enabled:false,packages:[{id:'173087',units:100,amount:199,currency:'USD',link:'https://t.me/tribute/app?startapp=pJ1J'},{id:'8',link:'https://t.me/tribute/app?startapp=other'}]}
 const call=runInNewContext('('+code+')',{spaceStarProductUnits,tributeConfig:{},vipPlans:[],canTestSpaceStarsPurchase:async id=>id===42,
  tributeSpaceStarsSnapshot:async(_config,_plans,allowed)=>({...snapshot,enabled:allowed})})
 const owner=await call(42),other=await call(43)
 assert.equal(owner.enabled,true);assert.ok(owner.packages[0].link);assert.equal(owner.packages[1].link,'')
 assert.equal(other.enabled,false);assert.ok(other.packages.every(pack=>pack.link===''))
 assert.equal(owner.packages[0].webLink,'https://web.tribute.tg/p/J1J')
 assert.ok(other.packages.every(pack=>pack.webLink===''))
 snapshot.packages[0].webLink='https://web.tribute.tg/p/catalogLink'
 assert.equal((await call(42)).packages[0].webLink,snapshot.packages[0].webLink)
 snapshot.packages[0].amount=299
 assert.equal((await call(42)).packages[0].webLink,'')
 assert.ok(snapshot.packages.every(pack=>pack.link))
 const policy=index.match(/async function canTestSpaceStarsPurchase\(userId, productId\) \{[\s\S]*?\n\}/)[0]
 const check=runInNewContext('('+policy+')',{spaceStarProductUnits,pool:{},isBotOwner:async(_db,id)=>id===42})
 assert.equal(await check(42,'173087'),true);assert.equal(await check(43,'173087'),false);assert.equal(await check(42,'8'),false)
 for(const id of Object.keys(spaceStarProductUnits)){assert.equal(await check(42,id),true);assert.equal(await check(43,id),false)}
 assert.match(index,/canPurchaseSpaceStars: canTestSpaceStarsPurchase/)
})

test('server 9:10 rate rounds down and validates payment amount boundaries',()=>{
 for(const pack of spaceStarPackages()) assert.equal(pack.units,Math.floor(pack.xtr*9/10))
 const config=spaceStarCustom()
 for(const units of [50,999,10000,10001,1000000]) assert.equal(quoteStars(config,units).units,Math.floor(units*9/10))
 for(const units of [0,49,-1,1.1,1000000001,Number.MAX_SAFE_INTEGER]) assert.throws(()=>quoteStars(config,units))
})
test('API enforces 50 Stars minimum for custom and stale packages before invoice creation',async()=>{
 const m=memory();let calls=0
 const service=createSpaceStars({pool:m.pool,enabled:true,canPurchase:async()=>true,
  packages:[{id:'space_25',units:25,xtr:25}],custom:spaceStarCustom(),telegram:async()=>{calls++;return 'https://t.me/$test'}})
 for(const units of [1,49,50.1,1000000001,Number.MAX_SAFE_INTEGER,'50']) {
  await assert.rejects(service.invoice(42,'custom',requestId,units),/SPACE_STARS_INVALID_AMOUNT/)
 }
 await assert.rejects(service.invoice(42,'space_25',requestId),/SPACE_STARS_UNKNOWN_PACKAGE/)
 assert.equal(calls,0);assert.equal(m.state().orders.length,0)
 await service.invoice(42,'custom',requestId,undefined,10001)
 assert.equal(calls,1);assert.equal(m.state().orders[0].amount_xtr,10001);assert.equal(m.state().orders[0].units,9000)
 assert.equal(m.state().balance,0)
 const legacy=spaceStarCustom('{"units":1,"xtr":1,"min":1,"max":10000,"step":1}')
 assert.equal(legacy.min,50);assert.equal(quoteCustom(legacy,10001).xtr,10001)
})
test('actual Space Stars client locks double clicks and retries uncertain bootstrap with the same UUID',async()=>{
 const source=readFileSync(new URL('../src/screens/CasesScreen.jsx',import.meta.url),'utf8')
 const start=source.indexOf('const buySpaceCase = ')+ 'const buySpaceCase = '.length
 const end=source.indexOf('\n  // Рулетка',start)
 const code=source.slice(start,end).trim().replace(/;$/,'')
 let sent=[],failRefresh=true,pending=null,updated=0
 const stored=new Map()
 const ctx={openingLock:{current:false},buyingCase:'',data:{spaceStars:{casePurchasesEnabled:true}},pendingSpacePurchase:null,
  spaceRequestKey:'test',crypto:{randomUUID:()=>requestId},initData:'signed',caseTypes:{},caseShortTitle:()=> 'Premium',t:key=>key,onToast:()=>{},
  setBuyingCase:value=>{ctx.buyingCase=value},setPendingSpacePurchase:value=>{pending=value;ctx.pendingSpacePurchase=value},
  sessionStorage:{setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},onData:()=>updated++,
  apiRequest:async(path,options)=>{if(path.includes('/purchase')){sent.push(JSON.parse(options.body));return {order:{}}}if(failRefresh)throw Object.assign(Error('refresh rejected'),{status:400});return {cases:{premium:3}}}}
 const buy=runInNewContext('('+code+')',ctx)
 await Promise.all([buy('premium',3),buy('premium',3)])
 assert.equal(sent.length,1);assert.equal(updated,0);assert.equal(pending.requestId,requestId)
 failRefresh=false
 await buy('premium',3)
 assert.equal(sent.length,2);assert.equal(sent[0].requestId,sent[1].requestId)
 assert.equal(updated,1);assert.equal(pending,null);assert.equal(stored.size,0)
 ctx.data.spaceStars.casePurchasesEnabled=false
 await buy('premium',3);assert.equal(sent.length,2)
})

test('missing tables or grants block new invoices and purchases before side effects',async()=>{
 let telegramCalls=0,connections=0
 const pool={query:async()=>({rows:[{payments_ready:false,purchases_ready:false}]}),connect:async()=>{connections++;throw Error('must not mutate')}}
 const service=createSpaceStars({canPurchase: async () => true,pool,enabled:true,casePurchasesEnabled:true,packages:spaceStarPackages(),telegram:async()=>telegramCalls++})
 await assert.rejects(service.invoice(42,'space_25',requestId),/SPACE_STARS_NOT_READY/)
 await assert.rejects(service.buyCases(42,'premium',1,requestId),/SPACE_STARS_NOT_READY/)
 assert.equal(telegramCalls,0);assert.equal(connections,0)
})

function starTransaction(refund=false) {
 return {id:'charge1',amount:refund ? -70 : 70,date:1700000000,[refund?'receiver':'source']:{type:'user',transaction_type:'invoice_payment',user:{id:42},invoice_payload:'space-stars:'+id}}
}
function syncing(pages) {
 const {m}=setup();const calls=[]
 const service=createSpaceStars({canPurchase: async () => true,pool:m.pool,telegram:async(method,params)=>{
  calls.push({method,...params});assert.equal(method,'getStarTransactions');
  if(typeof pages==='function')return pages(params)
  return {transactions:pages[params.offset/100]||[]}
 }})
 return {m,service,calls}
}
test('Space Stars sync confirms real Star transactions, replays safely and isolates owners/legacy IDs',async()=>{
 const {m,service,calls}=syncing([[starTransaction()]])
 assert.equal(await service.syncOrder(42,'legacy-case-id'),null);assert.equal(calls.length,0)
 await assert.rejects(service.syncOrder(99,id),/ORDER_NOT_FOUND/);assert.equal(calls.length,0)
 assert.equal((await service.syncOrder(42,id)).order.status,'paid')
 await service.syncOrder(42,id);await service.handleUpdate({message:message()})
 assert.equal(m.state().balance,100);assert.equal(m.state().ledger.length,1)
})
test('sync scans beyond first page; network failure and incomplete scan cannot credit',async()=>{
 const irrelevant=Array.from({length:100},(_,n)=>({id:'other'+n,amount:1,source:{type:'other'}}))
 const ok=syncing([irrelevant,[starTransaction()]])
 assert.equal((await ok.service.syncOrder(42,id)).syncStatus,'confirmed');assert.deepEqual(ok.calls.map(c=>c.offset),[0,100])
 const fail=syncing(({offset})=>{if(offset)throw Error('network');return {transactions:[starTransaction(),...irrelevant.slice(1)]}})
 await assert.rejects(fail.service.syncOrder(42,id),/network/);assert.equal(fail.m.state().balance,0)
 const capped=syncing(()=>({transactions:[starTransaction(),...irrelevant.slice(1)]}))
 assert.equal((await capped.service.syncOrder(42,id)).syncStatus,'incomplete');assert.equal(capped.m.state().balance,0)
})
test('sync rejects mismatched user, amount, currency, fractional stars and conflicting charge IDs',async()=>{
 const changes=[r=>r.source.user.id=99,r=>r.amount=1,r=>r.currency='USD',r=>r.nanostar_amount=1,r=>r.source.transaction_type='gift_purchase',r=>r.source.affiliate={}]
 for(const change of changes){const row=starTransaction();change(row);const {m,service}=syncing([[row]]);assert.equal((await service.syncOrder(42,id)).syncStatus,'unverified');assert.equal(m.state().balance,0)}
 const {m,service}=syncing([[starTransaction(),{...starTransaction(),id:'charge2'}]])
 assert.equal((await service.syncOrder(42,id)).syncStatus,'unverified');assert.equal(m.state().balance,0)
})
test('sync refunds before credit; later sync and relay cannot resurrect a refunded payment',async()=>{
 const refund=starTransaction(true);delete refund.receiver.invoice_payload
 const {m,service}=syncing([[starTransaction(),refund]])
 assert.equal((await service.syncOrder(42,id)).order.status,'refunded')
 await service.syncOrder(42,id);await service.handleUpdate({message:message()})
 assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,0)
})
test('sync can reverse a previously confirmed payment using its charge ID; unmatched refund is unverified',async()=>{
 const refund=starTransaction(true);delete refund.receiver.invoice_payload
 const {m,service}=syncing([[refund]])
 await service.handleUpdate({message:message()})
 await service.syncOrder(42,id);await service.syncOrder(42,id)
 assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,2)
 const unknown=syncing([[starTransaction(true)]])
 assert.equal((await unknown.service.syncOrder(42,id)).syncStatus,'unverified');assert.equal(unknown.m.state().balance,0)
})
test('sync not found does not claim payment; existing route keeps VIP and case sync behind separate branch',async()=>{
 const {m,service}=syncing([[]]);assert.equal((await service.syncOrder(42,id)).syncStatus,'not_found');assert.equal(m.state().balance,0)
 const source=readFileSync(new URL('./index.js',import.meta.url),'utf8')
 const start=source.indexOf("app.post('/api/payments/sync'")
 const route=source.slice(start,source.indexOf("app.post('/api/payments/telegram/update'",start))
 assert.match(route,/requireTelegramUser/)
 assert.ok(route.indexOf('spaceStars.syncOrder')<route.indexOf('pool.connect()'))
 assert.match(route,/await syncVipPurchaseOrder\(client, req.telegramUser.id, orderId\)/)
 assert.match(route,/await syncCasePurchaseOrder\(client, req.telegramUser.id, orderId\)/)
})

 test('paid-amount orders retain quoted credit across rate changes, duplicate events and refunds',async()=>{
 const m=memory();const args={pool:m.pool,enabled:true,canPurchase:async()=>true,telegram:async()=> 'https://t.me/$test'};
 const service=createSpaceStars({...args,custom:spaceStarCustom()});
 for(const amount of [49,50.5,'50',1000000001]) await assert.rejects(service.invoice(42,'custom',requestId,undefined,amount),/INVALID_AMOUNT/);
 const order=await service.invoice(42,'custom',requestId,undefined,51);
 assert.equal(m.state().orders[0].units,45);assert.equal(m.state().balance,0);
 const changed=createSpaceStars({...args,custom:spaceStarCustom('{"units":1,"xtr":1,"min":50,"step":1}')});
 assert.equal((await changed.invoice(42,'custom',requestId,undefined,51)).orderId,order.orderId);
 await assert.rejects(changed.invoice(42,'custom',requestId,undefined,52),/REQUEST_CONFLICT/);
 const payment={invoice_payload:'space-stars:'+order.orderId,currency:'XTR',total_amount:51,telegram_payment_charge_id:'new-rate'};
 for(let n=0;n<2;n++)await changed.handleUpdate({message:{from:{id:42},successful_payment:payment}});
 assert.equal(m.state().balance,45);assert.equal(m.state().ledger.length,1);
 for(let n=0;n<2;n++)await changed.handleUpdate({message:{from:{id:42},refunded_payment:payment}});
 assert.equal(m.state().balance,0);assert.equal(m.state().ledger.length,2);
 });

test('Tribute checkout opens only the fresh server Telegram link without crediting the wallet',async()=>{
 const source=readFileSync(new URL('../src/screens/TopUpScreen.jsx',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  const payCard =')+'  const payCard ='.length,source.indexOf('  const xtrPrice')).trim().replace(/;$/,'');
 for(const [id,units,link] of [['173087',100,'J1J'],['174052',500,'Jhi'],['174053',1000,'Jhj'],['174055',2500,'Jhl'],['174056',5000,'Jhm'],['174058',10000,'Jho']]){
 const pack={id,units,amount:199,currency:'USD',link:'https://t.me/tribute/app?startapp=p'+link};let opened=[],failed=false;
 const ctx={cardAllowed:true,paying:{current:false},alive:{current:true},selected:pack,initData:'signed',window:{Telegram:{WebApp:{openTelegramLink:url=>opened.push(url)}}},setCardNotice:()=>{},setBusy:()=>{},setError:value=>{failed=value},apiRequest:async()=>({tribute:{enabled:true,packages:[pack]}})};
 const pay=runInNewContext(code,ctx);await pay();assert.deepEqual(opened,[pack.link]);assert.equal(ctx.paying.current,false);
 ctx.apiRequest=async()=>({tribute:{enabled:false,packages:[pack]}});await pay();assert.equal(opened.length,1);assert.equal(failed,true);
 ctx.apiRequest=async()=>({tribute:{enabled:true,packages:[{...pack,amount:299}]}});await pay();assert.equal(opened.length,1);
 }
});

test('case detail charges only missing stock and retains pending purchase quantity',()=>{
 const source=readFileSync(new URL('../src/components/cases/CaseDetail.jsx',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('  const owned ='),source.indexOf('  const prizes ='));
 const calc=(balance,quantity,pendingSpacePurchase=null,pendingBatch=null)=>runInNewContext(code+';({missing,purchaseQuantity,totalPrice,spaceInsufficient,spaceRetry,retry})',{balance,quantity,pendingSpacePurchase,pendingBatch,caseId:'premium',meta:{stars:25},spaceStars:{balance:5,available:true,casePurchasesEnabled:false}});
 for(let q=1;q<=5;q++){const state=calc(13,q);assert.equal(state.missing,0);assert.equal(state.totalPrice,0);assert.equal(state.spaceInsufficient,false)}
 assert.equal(calc(2,5).purchaseQuantity,3);assert.equal(calc(2,5).totalPrice,75);assert.equal(calc(2,5).spaceInsufficient,true);
 const restored=calc(5,5,{caseType:'premium',quantity:3});assert.equal(restored.purchaseQuantity,3);assert.equal(restored.spaceRetry,true);assert.equal(restored.spaceInsufficient,false);
 assert.equal(calc(0,5,null,{caseType:'premium',quantity:5}).spaceInsufficient,false);
 assert.match(source,/if \(retry \|\| owned >= quantity\) onOpen\(caseId, quantity\)/);
 assert.match(source,/onBuySpace\(caseId, purchaseQuantity\)/);
});

test('VIP is available to authenticated non-owners independently of top-up owner policy',async()=>{
 for(const plan of [{id:'vip_30',days:30,stars:250},{id:'vip_180',days:180,stars:1200},{id:'vip_365',days:365,stars:2200}]){
 const m=memory();m.state().balance=5000;let days=0;
 const args={pool:m.pool,canPurchase:async()=>false,vipPurchasesEnabled:true,vipPlans:[plan],extendVipMembership:async(_db,user,amount)=>{assert.equal(user,43);days+=amount}};
 const service=createSpaceStars(args);
 const snapshot=await service.snapshot(43);assert.equal(snapshot.vipPurchasesEnabled,true);assert.equal(snapshot.enabled,false);
 await service.buyVip(43,plan.id,requestId);await service.buyVip(43,plan.id,requestId);
 assert.equal(m.state().balance,5000-plan.stars);assert.equal(days,plan.days);assert.equal(m.state().vipOrders.length,1);
 const disabled=createSpaceStars({...args,vipPurchasesEnabled:false});assert.equal((await disabled.snapshot(43)).vipPurchasesEnabled,false);
 await assert.rejects(disabled.buyVip(43,plan.id,requestId),/VIP_DISABLED/);
 }
 const index=readFileSync(new URL('./index.js',import.meta.url),'utf8');
 assert.ok(index.includes("app.use('/api/space-stars', requireTelegramUser, spaceStars.router)"));
 assert.ok(index.includes('spaceStars: await spaceStars.snapshot(chatId)'));
 assert.ok(index.includes('canPurchase: userId => isBotOwner(pool, userId)'));
});

test('VIP topup click bypasses purchase flags and stale pending without sending purchase requests',async()=>{
 const source=readFileSync(new URL('../src/screens/VipScreen.jsx',import.meta.url),'utf8');
 const start=source.indexOf('const buyPlan = ')+'const buyPlan = '.length;
 const code=source.slice(start,source.indexOf('\n  return (',start)).trim().replace(/;$/,'');
 const disabled=source.match(/disabled=\{([^\n]+)\}/)[1];
 for(const enabled of [false,true])for(const pending of [null,{planId:'vip_365',requestId},{planId:'vip_30',requestId}]){
 let topups=0;
 const ctx={data:{spaceStars:{balance:5,vipPurchasesEnabled:enabled}},pending,lock:{current:true},buyingPlanId:'vip_365',plan:{id:'vip_30',stars:250},onTopUp:()=>topups++};
 assert.equal(runInNewContext(disabled,ctx),false);
 await runInNewContext('('+code+')',ctx)(ctx.plan);assert.equal(topups,1);
 }
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');assert.match(app,/<VipScreen\s+onTopUp=\{\(\) => setTopUpOpen\(true\)\}/);
});
