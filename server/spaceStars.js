import { randomUUID } from 'node:crypto'
import { Router } from 'express'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const prefix = 'space-stars:'
const integer = n => Number.isSafeInteger(n) && n > 0 && n <= 1000000000
const fail = (code, status = 400) => Object.assign(new Error(code), { status })

const preparedPackages = [50, 100, 250, 500, 1000, 2500, 5000, 10000].map(xtr => ({ id: `space_${xtr}`, units: Math.floor(xtr * 9 / 10), xtr }))
export function spaceStarPackages(raw = JSON.stringify(preparedPackages)) {
  const rows = JSON.parse(raw)
  if (!Array.isArray(rows) || rows.length > 30) throw fail('Invalid Space Stars catalog')
  const seen = new Set()
  return rows.map(row => {
    if (!/^[a-z0-9_-]{1,40}$/.test(row.id) || row.id === 'custom' || seen.has(row.id) || !integer(row.units) || (row.xtr !== null && !integer(row.xtr))) throw fail('Invalid Space Stars package')
    seen.add(row.id)
    return { id: row.id, units: row.units, xtr: row.xtr }
  }).filter(pack => pack.xtr === null || pack.xtr >= 50)
}

export function spaceStarCustom(raw = '{"units":9,"xtr":10,"min":50,"step":1}') {
  const row = JSON.parse(raw)
  if (row === null) return null
  if (!['units','xtr','min','step'].every(key => integer(row[key]))) throw fail('Invalid Space Stars custom rate')
  // Technical bound fits the existing integer columns and exact JS accounting;
  // Telegram still validates each invoice. This is not a subscription limit.
  return { units: row.units, xtr: row.xtr, min: Math.max(row.min, Number((50n * BigInt(row.units) + BigInt(row.xtr) - 1n) / BigInt(row.xtr))), minStars: 50, step: row.step, max: 1000000000, maxXtr: 1000000000 }
}

export function quoteStars(config, amount) {
  if (!config || !integer(amount) || amount < 50) throw fail('SPACE_STARS_INVALID_AMOUNT')
  const units = Number(BigInt(amount) * BigInt(config.units) / BigInt(config.xtr))
  if (!integer(units)) throw fail('SPACE_STARS_INVALID_AMOUNT')
  return { id: 'custom', units, xtr: amount }
}

export function quoteCustom(config, units) {
  if (!config || !integer(units) || units < config.min || units > config.max || (units - config.min) % config.step) throw fail('SPACE_STARS_INVALID_AMOUNT')
  const xtr = Number((BigInt(units) * BigInt(config.xtr) + BigInt(config.units) - 1n) / BigInt(config.units))
  if (!integer(xtr) || xtr < 50) throw fail('SPACE_STARS_INVALID_AMOUNT')
  return { id: 'custom', units, xtr }
}

export function validateSpaceStarPayment(order, payment, userId) {
  if (!order || order.amount_xtr == null || String(order.telegram_user_id) !== String(userId) || payment.currency !== 'XTR'
    || payment.total_amount !== Number(order.amount_xtr) || payment.invoice_payload !== prefix + order.id) throw fail('SPACE_STARS_PAYMENT_MISMATCH')
}

// All mutations use one DB transaction. Never invoke Telegram inside this helper.
async function transaction(pool, action) {
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const result = await action(db)
    await db.query('COMMIT')
    return result
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    throw error
  } finally { db.release() }
}

export function createSpaceStars({ pool, telegram, enabled = false, packages = [], custom = null, canPurchase = async () => false, disabledReason = 'disabled',
  casePurchasesEnabled = false, findCase, incrementCases,
  vipPurchasesEnabled = false, vipPlans = [], extendVipMembership, tribute = null }) {
  async function vipReady() {
    const result = await pool.query(`SELECT
      COALESCE(has_table_privilege(to_regclass('star_vip_orders'),'SELECT'),false)
      AND COALESCE(has_table_privilege(to_regclass('star_vip_orders'),'INSERT'),false)
      AND COALESCE(has_table_privilege(to_regclass('vip_users'),'SELECT'),false)
      AND COALESCE(has_table_privilege(to_regclass('vip_users'),'INSERT'),false)
      AND COALESCE(has_table_privilege(to_regclass('vip_users'),'UPDATE'),false) AS vip_ready`)
    return result.rows[0]?.vip_ready === true
  }
  async function readiness() {
    const result = await pool.query(`SELECT
      COALESCE((SELECT bool_and(COALESCE(has_table_privilege(to_regclass(r.name), p.privilege),false))
        FROM (VALUES ('space_star_wallets',ARRAY['SELECT','INSERT','UPDATE']),
          ('space_star_orders',ARRAY['SELECT','INSERT','UPDATE']),
          ('space_star_payments',ARRAY['SELECT','INSERT','UPDATE']),
          ('space_star_ledger',ARRAY['SELECT','INSERT'])) AS r(name,privileges)
        CROSS JOIN LATERAL unnest(r.privileges) AS p(privilege)),false)
        AND COALESCE(has_sequence_privilege(to_regclass('space_star_ledger_id_seq'),'USAGE'),false) AS payments_ready,
      COALESCE(has_table_privilege(to_regclass('space_star_case_purchases'),'SELECT'),false)
        AND COALESCE(has_table_privilege(to_regclass('space_star_case_purchases'),'INSERT'),false) AS purchases_ready`)
    return result.rows[0]
  }

  async function snapshot(userId) {
    try {
      const ready = await readiness()
      const result = await pool.query('SELECT balance FROM space_star_wallets WHERE telegram_user_id=$1', [userId])
      const paymentUnavailable = !(await canPurchase(userId)) ? 'ownerOnly' : !enabled ? disabledReason
        : !ready.payments_ready ? 'databaseNotReady' : !(packages.some(pack => integer(pack.xtr)) || Boolean(custom)) ? 'catalogNotReady' : null
      return { available: true, enabled: !paymentUnavailable, paymentUnavailable,
        balance: result.rows[0]?.balance ?? '0', packages, custom,
        tribute: (typeof tribute === 'function' ? await tribute(userId) : tribute) || { enabled: false, packages: [] },
        vipPurchasesEnabled: vipPurchasesEnabled && ready.payments_ready && await vipReady(),
        casePurchasesEnabled: casePurchasesEnabled && ready.payments_ready && ready.purchases_ready }
    } catch (error) {
      if (!['42P01','42501'].includes(error.code)) throw error
      return { available: false, enabled: false, paymentUnavailable: 'databaseNotReady', balance: null, packages, custom }
    }
  }

  async function invoice(userId, packageId, requestId, customUnits, amount) {
    if (!enabled) throw fail('SPACE_STARS_DISABLED', 503)
    if (!(await canPurchase(userId))) throw fail('SPACE_STARS_DISABLED', 403)
    if (!(await readiness()).payments_ready) throw fail('SPACE_STARS_NOT_READY', 503)
    if (!uuid.test(requestId || '')) throw fail('SPACE_STARS_INVALID_REQUEST')
    if (amount !== undefined && (packageId !== 'custom' || customUnits !== undefined || !integer(amount) || amount < 50)) throw fail('SPACE_STARS_INVALID_AMOUNT')
    const order = await transaction(pool, async db => {
      await db.query('INSERT INTO space_star_wallets(telegram_user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId])
      // Serialize requests for one wallet, including repeated request IDs.
      await db.query('SELECT balance FROM space_star_wallets WHERE telegram_user_id=$1 FOR UPDATE', [userId])
      const old = await db.query('SELECT * FROM space_star_orders WHERE telegram_user_id=$1 AND request_id=$2', [userId, requestId])
      if (old.rows[0]) {
        if (old.rows[0].package_id !== packageId || (packageId === 'custom' && (amount !== undefined ? Number(old.rows[0].amount_xtr) !== amount : Number(old.rows[0].units) !== customUnits))) throw fail('SPACE_STARS_REQUEST_CONFLICT', 409)
        return old.rows[0]
      }
      const pack = packageId === 'custom' ? (amount !== undefined ? quoteStars(custom, amount) : quoteCustom(custom, customUnits)) : packages.find(row => row.id === packageId)
      if (!pack || !integer(pack.xtr) || pack.xtr < 50) throw fail('SPACE_STARS_UNKNOWN_PACKAGE')
      const result = await db.query(`INSERT INTO space_star_orders(id,telegram_user_id,request_id,package_id,units,amount_xtr)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [randomUUID(), userId, requestId, pack.id, pack.units, pack.xtr])
      return result.rows[0]
    })
    if (order.status !== 'pending') return { orderId: order.id, status: order.status }
    // Creating another link for the SAME persisted order cannot credit it twice.
    let link = order.invoice_link
    if (!link) {
      link = await telegram('createInvoiceLink', { title: 'Space Stars', description: `${order.units} Space Stars`,
        payload: prefix + order.id, provider_token: '', currency: 'XTR', prices: [{ label: 'Space Stars', amount: Number(order.amount_xtr) }] })
      if (typeof link !== 'string' || !/^https:\/\/t\.me\//.test(link)) throw fail('SPACE_STARS_INVALID_INVOICE', 502)
      await pool.query('UPDATE space_star_orders SET invoice_link=COALESCE(invoice_link,$2) WHERE id=$1', [order.id, link])
    }
    return { orderId: order.id, invoiceLink: link, status: order.status }
  }

  async function buyCases(userId, caseType, quantity, requestId) {
    if (!casePurchasesEnabled) throw fail('SPACE_STARS_CASES_DISABLED', 503)
    const ready = await readiness()
    if (!ready.payments_ready || !ready.purchases_ready) throw fail('SPACE_STARS_NOT_READY', 503)
    if (!uuid.test(requestId || '') || typeof caseType !== 'string' || !caseType || !Number.isInteger(quantity) || quantity < 1 || quantity > 5) throw fail('SPACE_STARS_INVALID_REQUEST')
    return transaction(pool, async db => {
      // Same wallet lock serializes purchases against each other and payment refunds.
      const wallet = (await db.query('SELECT balance FROM space_star_wallets WHERE telegram_user_id=$1 FOR UPDATE', [userId])).rows[0]
      if (!wallet) throw fail('SPACE_STARS_INSUFFICIENT_BALANCE', 409)
      const old = (await db.query('SELECT * FROM space_star_case_purchases WHERE telegram_user_id=$1 AND request_id=$2', [userId, requestId])).rows[0]
      if (old) {
        if (old.case_type !== caseType || old.quantity !== quantity) throw fail('SPACE_STARS_REQUEST_CONFLICT', 409)
        return old // Replay succeeds even if the price/catalog has since changed.
      }
      const template = await findCase(db, caseType)
      const unitPrice = Number(template?.stars)
      if (!template || template.active === false || !integer(unitPrice)) throw fail('SPACE_STARS_CASE_UNAVAILABLE')
      const total = unitPrice * quantity
      if (BigInt(wallet.balance) < BigInt(total)) throw fail('SPACE_STARS_INSUFFICIENT_BALANCE', 409)
      await db.query('UPDATE space_star_wallets SET balance=balance-$2,updated_at=now() WHERE telegram_user_id=$1', [userId, total])
      // Reuse the direct-XTR purchase's stock handler; no opening or reward draw here.
      await incrementCases(db, userId, caseType, quantity)
      const result = await db.query(`INSERT INTO space_star_case_purchases(telegram_user_id,request_id,case_type,quantity,unit_price,total)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [userId, requestId, caseType, quantity, unitPrice, total])
      return result.rows[0]
    })
  }

  async function buyVip(userId, planId, requestId) {
    if (!vipPurchasesEnabled) throw fail('SPACE_STARS_VIP_DISABLED', 503)
    if (!uuid.test(requestId || '') || typeof planId !== 'string') throw fail('SPACE_STARS_INVALID_REQUEST')
    if (!(await readiness()).payments_ready || !await vipReady()) throw fail('SPACE_STARS_NOT_READY', 503)
    return transaction(pool, async db => {
      const wallet = (await db.query('SELECT balance FROM space_star_wallets WHERE telegram_user_id=$1 FOR UPDATE', [userId])).rows[0]
      if (!wallet) throw fail('SPACE_STARS_INSUFFICIENT_BALANCE', 409)
      // Existing VIP orders are also the purchase journal. A distinct prefix and
      // payment currency isolate internal debits from historical XTR receipts.
      const id = `space-vip:${userId}:${requestId.toLowerCase()}`
      const old = (await db.query('SELECT * FROM star_vip_orders WHERE id=$1 AND chat_id=$2', [id, userId])).rows[0]
      if (old) {
        if (old.plan_id !== planId || old.payment_payload?.currency !== 'SPACE_STARS' || old.status !== 'fulfilled') throw fail('SPACE_STARS_REQUEST_CONFLICT', 409)
        return old
      }
      const plan = vipPlans.find(row => row.id === planId)
      if (!plan || !integer(plan.stars) || !integer(plan.days)) throw fail('SPACE_STARS_VIP_UNAVAILABLE')
      if (BigInt(wallet.balance) < BigInt(plan.stars)) throw fail('SPACE_STARS_INSUFFICIENT_BALANCE', 409)
      await db.query('UPDATE space_star_wallets SET balance=balance-$2,updated_at=now() WHERE telegram_user_id=$1', [userId, plan.stars])
      await extendVipMembership(db, userId, plan.days)
      const result = await db.query(`INSERT INTO star_vip_orders
        (id,chat_id,plan_id,days,amount_stars,status,invoice_payload,payment_payload,paid_at,fulfilled_at)
        VALUES ($1,$2,$3,$4,$5,'fulfilled',$1,$6::jsonb,now(),now()) RETURNING *`,
      [id, userId, plan.id, plan.days, plan.stars, JSON.stringify({ currency:'SPACE_STARS', requestId:requestId.toLowerCase(), amount:plan.stars })])
      return result.rows[0]
    })
  }

  async function settle(message, refund = false) {
    const payment = refund ? message.refunded_payment : message.successful_payment
    if (!payment?.telegram_payment_charge_id) throw fail('SPACE_STARS_MISSING_CHARGE')
    return transaction(pool, async db => {
      const id = payment.invoice_payload.slice(prefix.length)
      if (!uuid.test(id)) throw fail('SPACE_STARS_INVALID_ORDER')
      const order = (await db.query('SELECT * FROM space_star_orders WHERE id=$1 FOR UPDATE', [id])).rows[0]
      // A refund is a service event, whose sender need not be the original buyer.
      // It is accepted only through the existing authenticated Telegram relay.
      validateSpaceStarPayment(order, payment, refund ? order?.telegram_user_id : message.from?.id)
      const charge = payment.telegram_payment_charge_id
      await db.query(`INSERT INTO space_star_payments(charge_id,order_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [charge, id])
      const receipt = (await db.query('SELECT * FROM space_star_payments WHERE charge_id=$1 FOR UPDATE', [charge])).rows[0]
      if (receipt.order_id !== id) throw fail('SPACE_STARS_CHARGE_CONFLICT')
      if (refund) {
        await db.query('UPDATE space_star_payments SET refunded=true,refunded_at=COALESCE(refunded_at,now()) WHERE charge_id=$1', [charge])
        if (order.credited_charge !== charge) {
          if (!order.credited_charge) await db.query("UPDATE space_star_orders SET status='refunded' WHERE id=$1", [id])
          return // Refund arrived before credit, or duplicate charge never credited.
        }
      } else {
        if (receipt.refunded) {
          if (!order.credited_charge) await db.query("UPDATE space_star_orders SET status='refunded' WHERE id=$1", [id])
          return // Delayed payment update cannot resurrect refunded funds.
        }
        if (order.credited_charge && order.credited_charge !== charge) {
          await db.query("UPDATE space_star_orders SET status='review' WHERE id=$1", [id])
          console.error('[space-stars] duplicate paid order; refund required', { orderId: id })
          return // Track every charge; never grant twice for the same order.
        }
      }
      const amount = (refund ? -1 : 1) * Number(order.units)
      const ledger = await db.query(`INSERT INTO space_star_ledger(telegram_user_id,order_id,charge_id,kind,amount)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (charge_id,kind) DO NOTHING RETURNING id`,
      [order.telegram_user_id, id, charge, refund ? 'refund' : 'credit', amount])
      if (!ledger.rowCount) return
      await db.query('UPDATE space_star_wallets SET balance=balance+$2,updated_at=now() WHERE telegram_user_id=$1', [order.telegram_user_id, amount])
      await db.query('UPDATE space_star_orders SET credited_charge=$2,status=$3 WHERE id=$1', [id, charge, refund ? 'refunded' : 'paid'])
    })
  }

  async function syncOrder(userId, orderId) {
    // Legacy case/VIP IDs are not UUIDs: their existing sync path stays untouched.
    if (!uuid.test(orderId)) return null
    const readOrder = async () => (await pool.query(
      'SELECT * FROM space_star_orders WHERE id=$1 AND telegram_user_id=$2', [orderId, userId])).rows[0]
    const order = await readOrder()
    if (!order) throw fail('SPACE_STARS_ORDER_NOT_FOUND', 404)
    if (order.amount_xtr == null) throw fail('SPACE_STARS_PAYMENT_MISMATCH')
    const result = async syncStatus => {
      const current = await readOrder()
      return { order: { id: current.id, status: current.status }, syncStatus }
    }
    // Read Telegram's real Star ledger, never a client-supplied receipt. No DB lock
    // is held during HTTP. A bounded/incomplete scan must not authorize a credit.
    const transactions = []
    let complete = false
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await telegram('getStarTransactions', { offset, limit: 100 })
      if (!Array.isArray(page?.transactions) || page.transactions.length > 100) throw fail('SPACE_STARS_INVALID_HISTORY', 502)
      transactions.push(...page.transactions)
      if (page.transactions.length < 100) { complete = true; break }
    }
    if (!complete) return result('incomplete')
    const expectedPayload = prefix + order.id
    const incoming = transactions.filter(row => row.source?.invoice_payload === expectedPayload)
    const valid = (row, partner) => typeof row.id === 'string' && row.id.length > 0
      && partner?.type === 'user' && partner.transaction_type === 'invoice_payment'
      && String(partner.user?.id) === String(userId)
      && Number.isSafeInteger(row.amount)
      && (row.receiver ? Math.abs(row.amount) : row.amount) === Number(order.amount_xtr)
      && (row.nanostar_amount === undefined || row.nanostar_amount === 0)
      // StarTransaction is denominated in XTR by definition, not a fiat payment.
      && (row.currency === undefined || row.currency === 'XTR')
      && !partner.affiliate && !partner.subscription_period
    if (incoming.some(row => row.receiver || !valid(row, row.source))) return result('unverified')
    const charges = new Set(incoming.map(row => row.id))
    if (order.credited_charge) charges.add(order.credited_charge)
    if (charges.size > 1) return result('unverified')
    const refunds = transactions.filter(row => row.receiver &&
      (row.receiver.invoice_payload === expectedPayload || charges.has(row.id)))
    if (refunds.some(row => row.source || !charges.has(row.id) || !valid(row, row.receiver)
      || (row.receiver.invoice_payload !== undefined && row.receiver.invoice_payload !== expectedPayload))) return result('unverified')
    if (transactions.some(row => charges.has(row.id) && !incoming.includes(row) && !refunds.includes(row))) return result('unverified')
    if (!incoming.length && !refunds.length) return result('not_found')
    const message = row => ({ from: { id: userId },
      [row.receiver ? 'refunded_payment' : 'successful_payment']: {
        currency: 'XTR', invoice_payload: expectedPayload, total_amount: Math.abs(row.amount),
        telegram_payment_charge_id: row.id,
      } })
    // Apply refunds first: a refund found together with an old payment must never
    // temporarily make refunded funds spendable. settle also deduplicates relay races.
    for (const row of refunds) await settle(message(row), true)
    for (const row of incoming) await settle(message(row))
    return result('confirmed')
  }

  async function handleUpdate(update) {
    const query = update.pre_checkout_query
    const message = update.message
    const payload = query?.invoice_payload || message?.successful_payment?.invoice_payload || message?.refunded_payment?.invoice_payload
    if (typeof payload !== 'string' || !payload.startsWith(prefix)) return false
    if (query) {
      let ok = false
      try {
        const id = payload.slice(prefix.length)
        if (!uuid.test(id)) throw fail('SPACE_STARS_INVALID_ORDER')
        const order = (await pool.query('SELECT * FROM space_star_orders WHERE id=$1', [id])).rows[0]
        validateSpaceStarPayment(order, query, query.from?.id)
        ok = enabled && await canPurchase(query.from?.id) && order.status === 'pending' && (await readiness()).payments_ready
      } catch { ok = false }
      await telegram('answerPreCheckoutQuery', { pre_checkout_query_id: query.id, ok,
        ...(!ok ? { error_message: 'Space Stars: payment unavailable. Please reopen the app.' } : {}) })
    } else await settle(message, Boolean(message.refunded_payment))
    // Settlements remain enabled after sales are disabled: previously paid orders must be honoured.
    return true
  }

  const router = Router()
  function api(action) {
    return async (req, res, next) => {
      try { res.json(await action(req)) } catch (error) {
        if (error.status) res.status(error.status).json({ error: error.message })
        else next(error)
      }
    }
  }
  // Authentication middleware is mounted by index.js, not duplicated here.
  router.get('/', api(async req => {
    const state = await snapshot(req.telegramUser.id)
    if (!state.available) return { ...state, history: [] }
    const history = await pool.query(`SELECT id,kind,amount,created_at FROM space_star_ledger
      WHERE telegram_user_id=$1 ORDER BY id DESC LIMIT 30`, [req.telegramUser.id])
    const pending = await pool.query(`SELECT id,package_id,request_id,units FROM space_star_orders
      WHERE telegram_user_id=$1 AND status='pending' AND amount_xtr IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`, [req.telegramUser.id]).catch(error => {
      if (['42P01','42501'].includes(error.code)) return { rows: [] }
      throw error
    })
    return { ...state, history: history.rows, pendingOrder: pending.rows[0] || null }
  }))
  router.post('/invoice', api(req => invoice(req.telegramUser.id, req.body.packageId, req.body.requestId, req.body.units, req.body.amount)))
  router.post('/cases/purchase', api(async req => {
    const order = await buyCases(req.telegramUser.id, req.body.caseType, req.body.quantity, req.body.requestId)
    return { order: { requestId: order.request_id, caseType: order.case_type, quantity: order.quantity, total: order.total } }
  }))
  router.post('/vip/purchase', api(async req => {
    const order = await buyVip(req.telegramUser.id, req.body.planId, req.body.requestId)
    return { order: { id:order.id, planId:order.plan_id, days:order.days, total:order.amount_stars, status:order.status } }
  }))
  router.get('/cases/purchases', api(async req => {
    const result = await pool.query(`SELECT request_id,case_type,quantity,total,created_at FROM space_star_case_purchases
      WHERE telegram_user_id=$1 ORDER BY created_at DESC LIMIT 30`, [req.telegramUser.id])
    return { purchases: result.rows }
  }))
  router.get('/orders/:id', api(async req => {
    if (!uuid.test(req.params.id)) throw fail('SPACE_STARS_INVALID_ORDER')
    const result = await pool.query('SELECT id,status FROM space_star_orders WHERE id=$1 AND telegram_user_id=$2', [req.params.id, req.telegramUser.id])
    if (!result.rows[0]) throw fail('SPACE_STARS_ORDER_NOT_FOUND', 404)
    return { order: result.rows[0], ...await snapshot(req.telegramUser.id) }
  }))
  return { router, snapshot, invoice, handleUpdate, settle, buyCases, buyVip, syncOrder }
}
