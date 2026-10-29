import crypto from 'node:crypto'
import { caseStoreTitle } from './casesApi.js'
import { giftIdText, loadSavedGifts, savedGiftsSnapshot, transferSavedGift } from './giftsApi.js'

/**
 * Единая выдача подарков из кейсов и логи открытий для админов.
 *
 * Подарок, выпавший из кейса, — это не картинка, а настоящий подарок Telegram,
 * поэтому выдача разложена по тому, кто физически может его отдать:
 *
 *   - **уникальный (коллекционный)** — конкретный экземпляр с аккаунта юзербота;
 *     передать его вправе только владелец, поэтому его передаёт юзербот
 *     (`POST /api/gifts/transfer` → `payments.transferStarGift`). Обычные подарки
 *     так передать нельзя: Telegram отвечает `STARGIFT_NOT_UNIQUE`;
 *   - **обычный подарок каталога** — бот покупает его у Telegram и дарит игроку
 *     (`sendGift` Bot API). Платит бот из своего баланса звёзд, а он пополняется
 *     продажей кейсов, то есть кейс сам оплачивает свою награду;
 *   - **строка без подарка** (старое наполнение, ручной ввод в админке) и режим
 *     `CASE_GIFT_DELIVERY=internal` — внутренний подарок в коллекцию профиля, как
 *     было до появления настоящей выдачи.
 *
 * Любой сбой доставки — это `CaseGiftDeliveryError`: открытие кейса откатывается
 * целиком (кейс остаётся у игрока, награда не выдаётся), игроку уходит ошибка с
 * кодом обращения и подсказкой написать в поддержку, а админам в чат кейсов —
 * подробный лог: когда, кто, какой кейс, какой подарок и почему не ушёл.
 */

/** Режимы выдачи: реальный подарок в Telegram или внутренний «мишка». */
export const caseGiftDeliveryModes = ['telegram', 'internal']

const defaultCaseGiftMode = 'telegram'
/** Таймаут покупки и отправки подарка ботом (`CASE_GIFT_SEND_TIMEOUT_MS`). */
const defaultSendTimeoutMs = 20000
const minSendTimeoutMs = 5000
/** Лимит подписи к подарку в Telegram (`sendGift.text` — 0–128 символов). */
const giftTextLimit = 120
/** Лимит сообщения Telegram; лог длиннее — обрезаем, но не теряем причину. */
const logTextLimit = 3800
/** Часовой пояс в логах: по нему владелец сверяет сообщения поддержки. */
const logTimeZone = 'Asia/Tbilisi'

/** Как выдавать подарок: `telegram` (по умолчанию) или `internal`. */
export function caseGiftDeliveryMode() {
  const value = String(process.env.CASE_GIFT_DELIVERY || '').trim().toLowerCase()

  return caseGiftDeliveryModes.includes(value) ? value : defaultCaseGiftMode
}

/** Сколько ждём Bot API на покупке и отправке подарка. */
export function caseGiftSendTimeoutMs() {
  const value = Number(process.env.CASE_GIFT_SEND_TIMEOUT_MS)

  if (!Number.isFinite(value) || value <= 0) {
    return defaultSendTimeoutMs
  }

  return Math.max(minSendTimeoutMs, value)
}

/**
 * Код обращения: игрок называет его поддержке, а админ находит по нему строку в
 * логе чата кейсов. Время кодируем, чтобы код сортировался, случайность — чтобы
 * два обращения подряд не совпали.
 */
export function newCaseIncidentCode() {
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  const salt = crypto.randomBytes(2).toString('hex').toUpperCase()

  return `IS-${stamp}-${salt}`
}

/**
 * Подарок не ушёл: кейс считается неоткрытым.
 *
 * `reason` — короткая причина для игрока и лога, `details` — всё, что нужно
 * разбору (способ доставки, id подарка, номер экземпляра, адрес на аккаунте,
 * длительность попытки). Код обращения общий с тем, что увидит игрок.
 */
export class CaseGiftDeliveryError extends Error {
  constructor(message, { code = '', reason = '', details = {} } = {}) {
    super(message)
    this.name = 'CaseGiftDeliveryError'
    this.code = code
    this.reason = reason
    this.details = details
  }
}


/**
 * Выдача подарка из кейса.
 *
 * Возвращает `{ reward, delivery }`: `reward` уходит в ответ приложения и в
 * историю открытий, `delivery` — в лог админов (им же подписывается причина,
 * когда подарок заменён внутренним). `grantInternalGift` — выдача внутреннего
 * подарка из `server/index.js` (там же SQL), чтобы модуль не знал про базу.
 */
export function createCaseGiftDelivery({ botToken = '', mode = caseGiftDeliveryMode(), grantInternalGift } = {}) {
  if (typeof grantInternalGift !== 'function') {
    throw new Error('createCaseGiftDelivery: нужен grantInternalGift')
  }

  /**
   * Покупка и отправка подарка ботом (`sendGift`).
   *
   * В ответе Telegram важна причина отказа (`description`), а не только статус:
   * «не хватает звёзд», «подарок закончился», «подарок не найден» требуют разных
   * действий владельца, поэтому текст ошибки собираем вместе с кодом ответа.
   */
  async function sendCatalogGift({ giftId, userId, text }) {
    if (!botToken) {
      throw new Error('BOT_TOKEN не настроен на сервере — подарок отправить нечем')
    }

    const timeoutMs = caseGiftSendTimeoutMs()
    const body = { gift_id: giftId, user_id: Math.trunc(Number(userId) || 0) }
    const caption = String(text || '').slice(0, giftTextLimit).trim()

    if (caption) {
      body.text = caption
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendGift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const raw = await response.text()
      let payload = {}

      try {
        payload = raw ? JSON.parse(raw) : {}
      } catch {
        payload = { description: raw.slice(0, 200) }
      }

      if (!response.ok || !payload?.ok) {
        const description = String(payload?.description || '').trim()
        const code = Number(payload?.error_code) || response.status

        throw new Error(`${description || 'Bot API отклонил отправку подарка'} (код ${code})`)
      }

      return { sent: true, text: caption }
    } catch (error) {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new Error(`Bot API sendGift не ответил за ${Math.round(timeoutMs / 1000)} с`)
      }

      throw error instanceof Error ? error : new Error(String(error))
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Адрес уникального подарка на аккаунте юзербота.
   *
   * В строке наполнения адрес уже есть (пикер запомнил `msgId`/`slug`), но строка
   * могла быть сохранена раньше или подарок переслали — тогда адрес ищем в списке
   * подарков аккаунта. Пустой адрес значит не «ошибку связи», а «подарок
   * потерялся», и это уже другой разбор.
   */
  async function resolveUniqueAddress(base) {
    if (base.msgId || base.slug) {
      return { msgId: base.msgId, slug: base.slug, source: 'наполнение кейса' }
    }

    const cached = findSavedAddress(savedGiftsSnapshot()?.gifts, base.giftId)

    if (cached) {
      return { ...cached, source: 'кеш подарков аккаунта' }
    }

    const fresh = await loadSavedGifts().catch(() => null)
    const found = findSavedAddress(fresh?.gifts, base.giftId)

    return found ? { ...found, source: 'список подарков аккаунта' } : { msgId: 0, slug: '', source: 'не найден' }
  }

  /**
   * Отправка подарка игроку: способ выбирается по строке наполнения кейса.
   *
   * `client` нужен только внутренней выдаче (мишка в коллекцию), поэтому
   * реальный подарок её не трогает.
   */
  async function deliverGift({ client, chatId, row, template, incident = newCaseIncidentCode(), langCode = '' }) {
    const started = Date.now()
    const caseType = String(template?.id || '')
    const giftId = giftIdText(row?.giftId)
    const kind = row?.giftKind === 'unique' ? 'unique' : 'regular'
    const num = Math.max(0, Math.trunc(Number(row?.giftNum) || 0))
    const targetUserId = Math.trunc(Number(chatId) || 0)
    // Общая часть лога: по ней видно и попытку передачи, и её провал.
    const base = {
      incident,
      caseType,
      caseTitle: caseStoreTitle(template),
      mode,
      giftId,
      kind,
      num,
      weight: Number(row?.weight || 0),
      slug: String(row?.giftSlug || '').trim(),
      msgId: Math.max(0, Math.trunc(Number(row?.giftMsgId) || 0)),
      targetUserId,
    }
    const done = (strategy, extra = {}) => ({
      ...base,
      strategy,
      ok: true,
      durationMs: Date.now() - started,
      ...extra,
    })
    const fail = (strategy, reason, extra = {}) => {
      throw new CaseGiftDeliveryError(`Подарок не доставлен: ${reason}`, {
        code: incident,
        reason,
        details: { ...base, strategy, ok: false, durationMs: Date.now() - started, ...extra },
      })
    }
    // Внутренний подарок: причина остаётся в логе, игрок видит обычную награду.
    const internal = async (reason) => {
      const reward = await grantInternalGift(client, chatId, row)

      return {
        reward: { ...reward, giftId, giftKind: kind, delivery: 'internal' },
        delivery: done('internal', { reason, text: '' }),
      }
    }

    // Подарка в строке нет (старое наполнение, ручной ввод id в админке) или владелец
    // сознательно вернул прежнюю выдачу: отправлять в Telegram нечего.
    if (!giftId) {
      return internal('в строке наполнения нет подарка Telegram')
    }

    if (mode === 'internal') {
      return internal('включён режим CASE_GIFT_DELIVERY=internal')
    }

    if (kind === 'unique') {
      const address = await resolveUniqueAddress(base)

      if (!address.msgId && !address.slug) {
        fail('userbot-transfer', 'у уникального подарка нет адреса на аккаунте (ни msg_id, ни slug)', { address })
      }

      let result = null

      try {
        result = await transferSavedGift({ msgId: address.msgId, slug: address.slug, toUserId: chatId })
      } catch (error) {
        fail('userbot-transfer', String(error?.message || error), { address })
      }

      return {
        reward: {
          type: 'gift',
          code: 'tg-unique',
          giftCode: '',
          giftId,
          giftKind: 'unique',
          giftNum: num,
          delivery: 'telegram',
          title: num > 0 ? `Подарок Telegram #${num}` : 'Уникальный подарок Telegram',
          description: 'Уникальный подарок передан вам с аккаунта.',
          payload: { giftId, num, msgId: address.msgId, slug: address.slug, delivery: 'telegram' },
        },
        delivery: done('userbot-transfer', {
          ...address,
          verified: Boolean(result?.verified),
          note: String(result?.note || ''),
        }),
      }
    }

    // Обычный подарок каталога: его передать с аккаунта нельзя (`STARGIFT_NOT_UNIQUE`),
    // поэтому бот покупает подарок у Telegram и дарит его игроку из своего баланса звёзд.
    let sent = null

    try {
      sent = await sendCatalogGift({ giftId, userId: targetUserId, text: giftCaption(langCode, base.caseTitle) })
    } catch (error) {
      fail('bot-sendgift', String(error?.message || error))
    }

    return {
      reward: {
        type: 'gift',
        code: 'tg-gift',
        giftCode: '',
        giftId,
        giftKind: 'regular',
        delivery: 'telegram',
        title: 'Подарок Telegram',
        description: 'Подарок отправлен вам в Telegram.',
        payload: { giftId, delivery: 'telegram' },
      },
      delivery: done('bot-sendgift', { text: sent?.text || '' }),
    }
  }

  return { mode, deliverGift }
}

/** Адрес уникального подарка в записи списка аккаунта: `msg_id` и `slug`. */
function findSavedAddress(gifts, giftId) {
  const found = (Array.isArray(gifts) ? gifts : []).find((gift) => giftIdText(gift?.id) === giftId)

  if (!found) {
    return null
  }

  return {
    msgId: Math.max(0, Math.trunc(Number(found.msgId) || 0)),
    slug: String(found.slug || '').trim(),
  }
}

/** Подпись под подарком в Telegram: язык игрока, а не язык админки. */
function giftCaption(langCode, caseTitle) {
  const title = String(caseTitle || '').trim()
  const code = String(langCode || '').toLowerCase().slice(0, 2)

  if (code === 'en') {
    return title ? `Gift from the case “${title}”` : 'Gift from a Space case'
  }

  if (code === 'uk') {
    return title ? `Подарунок з кейса «${title}»` : 'Подарунок з кейса Space'
  }

  return title ? `Подарок из кейса «${title}»` : 'Подарок из кейса Space'
}

// ===== логи открытий: уходят владельцу в чат кейсов =====

/** HTML-экранирование: в лог попадают имена игроков и ответы Telegram. */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** Обрезка текста: Telegram не принимает сообщение длиннее 4096 символов. */
function clipLog(text) {
  const value = String(text || '')

  return value.length > logTextLimit ? `${value.slice(0, logTextLimit)}\n… (лог обрезан)` : value
}

/** Блок «когда»: местное время (по нему сверяют обращения) и метка UTC. */
function timeLines(now) {
  const local = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: logTimeZone,
  }).format(now)

  return [`🕒 ${escapeHtml(local)} (${escapeHtml(logTimeZone)}) · UTC ${escapeHtml(now.toISOString())}`]
}

/** Блок «кто»: игрок по данным initData и по записи в базе бота. */
function whoLines(telegramUser, user) {
  const chatId = telegramUser?.id || 0
  const name = userNameOf(telegramUser, user)
  const username = String(telegramUser?.username || user?.username || '').trim()
  const lang = String(telegramUser?.language_code || '').trim()
  const extra = [
    lang ? `язык <code>${escapeHtml(lang)}</code>` : '',
    telegramUser?.is_premium ? 'Premium' : '',
  ].filter(Boolean)

  return [
    `👤 <b>${escapeHtml(name)}</b>${username ? ` (@${escapeHtml(username)})` : ' · без @username'}`,
    `🆔 <code>${escapeHtml(String(chatId))}</code>${extra.length ? ` · ${extra.join(' · ')}` : ''}`,
  ]
}

/** Имя игрока: из базы бота, из initData, иначе хотя бы id. */
function userNameOf(telegramUser, user) {
  const parts = [telegramUser?.first_name, telegramUser?.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  return user?.name || parts.join(' ') || String(user?.username || telegramUser?.username || '') || `ID ${telegramUser?.id || 0}`
}

/** Блок «кейс»: какой именно кейс открывали и под каким кодом обращения. */
function caseLines(template, incident) {
  const caseType = String(template?.id || '')
  const stars = Number(template?.stars || 0)
  const contents = Array.isArray(template?.contents) ? template.contents.length : 0

  return [
    `📦 Кейс: <b>${escapeHtml(caseStoreTitle(template))}</b> · код <code>${escapeHtml(caseType || '—')}</code>`,
    `⚙️ строк в наполнении: <code>${contents}</code>${stars > 0 ? ` · цена <code>${stars}</code> ⭐` : ' · бесплатный'}`,
    `🎫 код обращения: <code>${escapeHtml(incident || '—')}</code>`,
  ]
}

/** Блок «награда»: что именно выпало игроку. */
function rewardLines(reward) {
  if (!reward) {
    return []
  }

  const kind = [reward.type, reward.code].filter(Boolean).map((value) => `<code>${escapeHtml(value)}</code>`).join(' · ')

  return [
    `🏆 Награда: <b>${escapeHtml(reward.title || '—')}</b>${kind ? ` · ${kind}` : ''}`,
    `📝 ${escapeHtml(reward.description || '—')}`,
    `🧾 детали: <code>${escapeHtml(formatRewardPayload(reward))}</code>`,
  ]
}

/** Блок подарка Telegram: по нему админ находит подарок в каталоге и на аккаунте. */
function deliveryLines(delivery) {
  const lines = [
    `🎁 Подарок: ${giftKindLabel(delivery.kind)} · id <code>${escapeHtml(delivery.giftId || '—')}</code>`,
  ]

  if (Number(delivery.num) > 0) {
    lines.push(`🔢 номер экземпляра: <code>#${Number(delivery.num)}</code>`)
  }

  if (delivery.slug) {
    lines.push(`🏷 slug: <code>${escapeHtml(delivery.slug)}</code>`)
  }

  if (Number(delivery.msgId) > 0) {
    lines.push(`✉️ msg_id на аккаунте: <code>${Number(delivery.msgId)}</code>`)
  }

  if (delivery.source) {
    lines.push(`🔍 адрес подарка: ${escapeHtml(delivery.source)}`)
  }

  lines.push(`🚚 способ выдачи: <b>${escapeHtml(strategyLabel(delivery.strategy))}</b>`)

  if (delivery.text) {
    lines.push(`💬 подпись под подарком: ${escapeHtml(delivery.text)}`)
  }

  if (delivery.verified === true) {
    lines.push('✅ юзербот подтвердил передачу списком подарков')
  } else if (delivery.verified === false) {
    lines.push('ℹ️ юзербот принял передачу, но подтвердить её списком подарков не смог')
  }

  if (delivery.note) {
    lines.push(`📡 ответ юзербота: ${escapeHtml(delivery.note)}`)
  }

  if (delivery.reason) {
    lines.push(`ℹ️ почему не реальный подарок: ${escapeHtml(delivery.reason)}`)
  }

  if (Number.isFinite(delivery.weight)) {
    lines.push(`🎲 вес строки в кейсе: <code>${delivery.weight}</code>`)
  }

  if (Number.isFinite(delivery.durationMs)) {
    lines.push(`⏱ выдача заняла: <code>${delivery.durationMs} мс</code>`)
  }

  return lines
}

/** Как подарок ушёл игроку — человеческим текстом для лога. */
function strategyLabel(strategy) {
  if (strategy === 'userbot-transfer') {
    return 'юзербот: payments.transferStarGift (подарок с аккаунта)'
  }

  if (strategy === 'bot-sendgift') {
    return 'бот: Bot API sendGift (покупка из баланса звёзд)'
  }

  if (strategy === 'internal') {
    return 'внутренний подарок в коллекцию профиля'
  }

  return String(strategy || 'не определён')
}

/** Уникальный подарок — конкретный экземпляр, обычный — позиция каталога. */
function giftKindLabel(kind) {
  return kind === 'unique' ? 'уникальный (с аккаунта)' : 'обычный (из каталога)'
}

/** Что проверить владельцу: подсказки зависят от способа выдачи. */
function hintLines(details) {
  const hints = []

  if (details?.strategy === 'userbot-transfer') {
    hints.push('юзербот запущен и в сети: лог [gifts] на сервере, адрес GIFTS_API_URL')
    hints.push('подарок мог уйти в момент сбоя — сверьте список подарков аккаунта, прежде чем выдавать вручную')
    hints.push('уникальный подарок мог быть переслан или передача ещё закрыта Telegram (can_transfer_at)')
  } else if (details?.strategy === 'bot-sendgift') {
    hints.push('у бота хватает звёзд: баланс пополняется продажей кейсов, списание — за каждый подарок')
    hints.push('подарок не распродан в Telegram (у лимитированных бывает sold out)')
    hints.push('id подарка из наполнения кейса всё ещё есть в каталоге Telegram — устаревший id бот не найдёт')
  } else {
    hints.push('стек ошибки и журнал сервера за это время (journalctl -u ispace)')
    hints.push('наполнение кейса в админке: строка, из которой выдавалась награда')
  }

  return ['<b>Что проверить</b>', ...hints.map((hint) => `➡️ ${escapeHtml(hint)}`)]
}

/** Детали награды строкой: те же поля, что и раньше, плюс подарок. */
function formatRewardPayload(reward) {
  const payload = reward?.payload || {}

  if (reward?.type === 'coins' || reward?.type === 'starcoins') {
    return `amount=${payload.amount || 0}`
  }

  if (reward?.type === 'vip') {
    return `days=${payload.days || 0}`
  }

  if (reward?.type === 'shop_item') {
    return `item_id=${payload.itemId || reward.code || '-'}, category=${payload.category || '-'}`
  }

  if (reward?.type === 'gift') {
    return [
      `gift_id=${payload.giftId || reward.giftId || '-'}`,
      `kind=${reward.giftKind || '-'}`,
      `num=${payload.num || reward.giftNum || 0}`,
      `delivery=${payload.delivery || reward.delivery || '-'}`,
    ].join(', ')
  }

  return JSON.stringify(payload)
}

/**
 * Подробный лог открытого кейса: когда, кто, какой кейс, что выпало и как подарок
 * ушёл игроку. Возвращает HTML — вызывающий только отправляет строку в чат кейсов.
 */
export function buildCaseOpeningLog({
  telegramUser,
  user = null,
  template,
  reward,
  delivery = null,
  incident = '',
  now = new Date(),
}) {
  const lines = [
    delivery ? '<b>🎁 Кейс открыт — подарок выдан</b>' : '<b>🎁 Кейс открыт — награда выдана</b>',
    '',
    ...timeLines(now),
    ...whoLines(telegramUser, user),
    ...caseLines(template, incident),
    '',
    ...rewardLines(reward),
  ]

  if (delivery) {
    lines.push('', ...deliveryLines(delivery))
  }

  lines.push(
    '',
    '<b>Итог</b>',
    delivery?.strategy === 'internal'
      ? '✅ Награда выдана в профиль (реального подарка в Telegram нет)'
      : '✅ Награда выдана, кейс списан',
  )

  return clipLog(lines.join('\n'))
}

/**
 * Подробный лог провала открытия: подарок не ушёл или кейс упал с ошибкой.
 *
 * Лог обязателен: по нему владелец находит обращение игрока (код обращения), видит
 * причину и понимает, что проверить. Кейс к этому моменту уже вернулся игроку.
 */
export function buildCaseFailureLog({
  telegramUser,
  user = null,
  template,
  error,
  incident = '',
  reward = null,
  now = new Date(),
}) {
  const details = error instanceof CaseGiftDeliveryError ? error.details : null
  const code = incident || details?.incident || (error instanceof CaseGiftDeliveryError ? error.code : '')
  const lines = [
    details ? '<b>⚠️ Подарок не доставлен — кейс НЕ списан</b>' : '<b>⚠️ Кейс не открылся — ошибка сервера</b>',
    '',
    ...timeLines(now),
    ...whoLines(telegramUser, user),
    ...caseLines(template, code),
    '',
    '<b>Почему</b>',
    `❗ ${escapeHtml(error?.message || 'неизвестная ошибка')}`,
    ...(details?.reason ? [`🔎 причина: ${escapeHtml(details.reason)}`] : []),
    ...stackLines(error),
  ]

  if (reward) {
    lines.push('', ...rewardLines(reward))
  }

  if (details) {
    lines.push('', ...deliveryLines(details))
  }

  lines.push(
    '',
    ...hintLines(details),
    '',
    '<b>Итог</b>',
    '↩️ Транзакция откатилась: кейс остался у игрока, награда не выдана',
    `💬 Игроку показано «напишите в поддержку», код обращения <code>${escapeHtml(code || '—')}</code>`,
  )

  return clipLog(lines.join('\n'))
}

/** Стек ошибки: серверный сбой ищут по нему, поэтому кладём первые строки. */
function stackLines(error) {
  const stack = String(error?.stack || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (stack.length < 2) {
    return []
  }

  return [`🧵 <code>${escapeHtml(stack.slice(1, 4).join(' | ').slice(0, 500))}</code>`]
}
