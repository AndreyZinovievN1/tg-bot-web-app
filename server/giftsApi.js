import { Router } from 'express'

/**
 * Подарки Telegram (Star Gifts) из юзербота.
 *
 * Юзербот живёт отдельным сервисом (`app/user_bot/gifts_api.py`, aiohttp) и
 * умеет доставать «подарки за звёзды» через Pyrogram:
 *
 *   GET /api/gifts                      — каталог подарков (`payments.getStarGifts`);
 *   GET /api/gifts/saved                — подарки аккаунта: полученные, купленные и
 *                                         размещённые на профиле (`exclude_hosted=false`),
 *                                         включая уникальные — у каждого свой номер и art;
 *   GET /api/gifts/sticker/{id}.json    — Lottie-анимация подарка в JSON;
 *   GET /api/gifts/sticker/{id}.tgs     — та же анимация в gzip (`.tgs`);
 *   GET /api/gifts/sticker/unique/{id}  — анимация МОДЕЛИ уникального подарка
 *                                         (у него картинка лежит в атрибутах);
 *   POST /api/gifts/transfer            — передать подарок с аккаунта получателю.
 *
 * Мини-апп не может ходить в юзербот напрямую: сервис слушает localhost и
 * закрыт общим секретом, а плеер Lottie (как и `<img>`) не умеет передавать
 * заголовок с Telegram initData. Поэтому этот модуль — тонкий прокси:
 *
 *   GET /api/gifts                      — каталог подарков для bootstrap;
 *   GET /api/gifts/sticker/{id}.json    — Lottie-JSON (открыт, с кешем браузера);
 *   GET /api/gifts/sticker/{id}.tgs     — gzip-версия анимации;
 *   GET /api/gifts/sticker/unique-<id>  — то же для модели уникального подарка.
 *
 * Передача подарка с аккаунта (`transferSavedGift`) — не ручка мини-аппа, а
 * внутренний вызов юзербота: его делает открытие кейса, когда в наполнении стоит
 * уникальный подарок с аккаунта (см. `deliverGift` в `server/caseGifts.js`).
 *
 * Отдельной ручки «подарки аккаунта» у мини-аппа нет: список нужен только
 * админке (второй режим пикера подарков в редакторе кейса), поэтому он едет в
 * ответе `/api/admin/cases` рядом с каталогом — `catalog.savedGifts` и
 * `catalog.savedStatus` (см. `savedGiftsSnapshot` и `createCasesApi`).
 *
 * Каталог кешируется на несколько минут: bootstrap опрашивается часто, а
 * список подарков в аккаунте меняется редко. Прокси никогда не роняет
 * приложение: если юзербот недоступен, каталог отдаётся пустым, а стикер —
 * ошибкой с понятным кодом, а не падением запроса.
 *
 * Каталог ждёт юзербота только тогда, когда его просят явно (`/api/gifts`,
 * кнопка «обновить» в админке). Bootstrap не ждёт: он получает текущий снимок,
 * а запрос к юзерботу уходит в фон — приложение не должно открываться полторы
 * минуты из-за подарков.
 *
 * Настройки окружения:
 *   GIFTS_API_URL          — адрес REST-слоя юзербота (по умолчанию http://127.0.0.1:8090);
 *   GIFTS_API_SECRET       — общий секрет (падает обратно на MINIAPP_API_SECRET /
 *                            PAYMENT_RELAY_SECRET — тот же секрет, что у платёжного моста);
 *   GIFTS_CACHE_MS         — время кеша каталога (по умолчанию 5 минут);
 *   GIFTS_API_TIMEOUT_MS   — сколько ждём каталог (по умолчанию 15000 мс: это живой
 *                            поход в Telegram через юзербот, и его бюджет —
 *                            `GIFTS_CALL_DEADLINE`, по умолчанию 12 с; значения
 *                            меньше 5000 поднимаются до 5000);
 *   GIFTS_STICKER_TIMEOUT_MS — сколько ждём анимацию (по умолчанию 90000 мс: первый
 *                            показ подарка качает `.tgs` из Telegram, у юзербота
 *                            на это `GIFTS_DOWNLOAD_TIMEOUT`, по умолчанию 60 с);
 *   GIFTS_TRANSFER_TIMEOUT_MS — сколько ждём передачу подарка с аккаунта (по
 *                            умолчанию 40000 мс: юзербот и отправляет
 *                            `payments.transferStarGift`, и проверяет, что подарок
 *                            ушёл, — на каждый шаг у него свой бюджет).
 */

const defaultBaseUrl = 'http://127.0.0.1:8090'
const defaultCacheMs = 5 * 60 * 1000

/**
 * Сколько ждём каталог от юзербота.
 *
 * Это живой запрос в Telegram: `initConnection`, `invokeWithLayer`, ответ
 * MTProto. Прежние 2.5 секунды не покрывали даже один ответ, поэтому каталог
 * «не приходил» всегда, а виноватым выглядел юзербот. Юзербот обязан уложиться
 * в свой `GIFTS_CALL_DEADLINE` (12 с) и вернуть настоящую причину сбоя, так что
 * этот таймаут — только страховка на случай молчания.
 */
const defaultTimeoutMs = 15000

/**
 * Сколько ждём анимацию подарка.
 *
 * Первый показ подарка качает `.tgs` из Telegram (у юзербота на это
 * `GIFTS_DOWNLOAD_TIMEOUT`, по умолчанию 60 с), дальше файл лежит в кэше
 * юзербота и приходит за миллисекунды. Поэтому таймаут здесь с запасом.
 */
const defaultStickerTimeoutMs = 90000

/**
 * Сколько ждём передачу подарка с аккаунта, если `GIFTS_TRANSFER_TIMEOUT_MS` не
 * задан: юзерботу нужно и отправить `payments.transferStarGift`, и проверить, что
 * подарок ушёл (см. `transferTimeoutMs`).
 */
const defaultTransferTimeoutMs = 40000

/**
 * Нижняя граница таймаута каталога.
 *
 * Меньше нельзя: это живой поход в Telegram через юзербот (сессия, handshake,
 * ответ MTProto), и слишком маленькое значение возвращает ту же беду — клиент
 * обрывает запрос и показывает свой «таймаут» вместо причины сбоя.
 */
const minTimeoutMs = 5000

const stickerMaxAgeSeconds = 604800
const stickerCacheHeader = `public, max-age=${stickerMaxAgeSeconds}`

/**
 * Имя файла в нашей ручке: `<id>.json` для подарка каталога, `unique-<id>.json` для
 * модели уникального подарка и `unique-<id>.pattern` для узора его подложки.
 *
 * У юзербота это разные ручки: анимация каталога адресуется подарком
 * (`/api/gifts/sticker/<id>`), модель и узор уникального — экземпляром
 * (`/api/gifts/sticker/unique/<id>.json|.pattern`): id экземпляра в каталоге не
 * найти, по нему анимация не берётся. Префикс `unique-` держим в одном сегменте
 * пути, потому что читает эти файлы плеер Lottie и маска CSS по прямой ссылке.
 */
const stickerFilePattern = /^(unique-)?(\d+)\.(json|tgs|pattern)$/

/**
 * Сколько держим в кеше неудачный запрос к юзерботу.
 *
 * Успешный каталог живёт `GIFTS_CACHE_MS` (по умолчанию пять минут), а промах —
 * всего полминуты. Иначе после запуска юзербота каталог пришлось бы ждать пять
 * минут или жать «обновить» руками.
 */
const errorRetryMs = 30 * 1000

/** Снимок каталога: подарки, время загрузки и состояние последнего запроса. */
let catalogCache = { gifts: [], loadedAt: 0, ok: false, error: '' }

/** Адрес REST-слоя юзербота без хвостового слэша. */
function giftsBaseUrl() {
  return String(process.env.GIFTS_API_URL || defaultBaseUrl).trim().replace(/\/+$/, '')
}

/** Общий секрет: в юзерботе тот же порядок переменных, что и здесь. */
function giftsSecret() {
  return String(
    process.env.GIFTS_API_SECRET
    || process.env.MINIAPP_API_SECRET
    || process.env.PAYMENT_RELAY_SECRET
    || '',
  ).trim()
}

function giftsCacheMs() {
  const value = Number(process.env.GIFTS_CACHE_MS)

  return Number.isFinite(value) && value >= 0 ? value : defaultCacheMs
}

function giftsTimeoutMs() {
  const value = Number(process.env.GIFTS_API_TIMEOUT_MS)

  if (!Number.isFinite(value) || value <= 0) {
    return defaultTimeoutMs
  }

  // Каталог — это живой запрос в Telegram, он в принципе не укладывается в
  // считанные секунды. Слишком маленький таймаут (например, унаследованные
  // 2500 из старого `.env`) снова спрячет настоящую ошибку за «таймаутом»,
  // поэтому снизу поднимаем его до минимума и говорим об этом в лог.
  if (value < minTimeoutMs) {
    console.warn(
      `[gifts] GIFTS_API_TIMEOUT_MS=${value} мал для запроса в Telegram — использую ${minTimeoutMs}`,
    )

    return minTimeoutMs
  }

  return value
}

function stickerTimeoutMs() {
  const value = Number(process.env.GIFTS_STICKER_TIMEOUT_MS)

  return Number.isFinite(value) && value > 0 ? value : defaultStickerTimeoutMs
}

/**
 * Сколько ждём передачу подарка с аккаунта (`GIFTS_TRANSFER_TIMEOUT_MS`).
 *
 * Юзербот сначала отправляет `payments.transferStarGift`, а потом проверяет итог
 * списком подарков, и на каждый шаг у него свой бюджет (`GIFTS_CALL_DEADLINE`,
 * по умолчанию 12 с). Поэтому запас больше, чем у каталога: если оборвать запрос
 * раньше, подарок может уйти, а вызывающий решит, что ничего не вышло.
 */
function transferTimeoutMs() {
  const value = Number(process.env.GIFTS_TRANSFER_TIMEOUT_MS)

  if (!Number.isFinite(value) || value <= 0) {
    return defaultTransferTimeoutMs
  }

  return Math.max(minTimeoutMs, value)
}

/** Заголовки авторизации для юзербота: секрет, если он задан. */
function giftsAuthHeaders() {
  const secret = giftsSecret()

  return secret ? { 'X-API-Secret': secret } : {}
}

/**
 * Недоступность юзербота человеческим текстом — для лога и админки.
 *
 * `fetch` в Node падает с общим `TypeError: fetch failed`, а настоящая причина
 * лежит в `error.cause`: `Error: connect ECONNREFUSED …` — на этом порту никто
 * не слушает, `getaddrinfo ENOTFOUND …` — не тот адрес. У хоста с двумя адресами
 * (например `localhost`) причина приходит `AggregateError` со списком `errors`.
 * Без причины текст выглядит как ошибка в приложении, хотя на самом деле просто
 * не запущен юзербот.
 */
function giftFailureText(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return `таймаут запроса к юзерботу (${giftsBaseUrl()})`
  }

  const cause = error?.cause
  const code = cause?.code
    || cause?.errors?.find((item) => item?.code)?.code
    || error?.code
    || ''
  const reason = (typeof code === 'string' && code) || String(cause?.message || '')

  // Юзербот ответил ошибкой: текст уже собран в `userbotFailureReason` — там
  // настоящая причина («Telegram просит подождать…», «юзербот не запущен»).
  if (!cause && !code && typeof error?.message === 'string' && error.message) {
    return error.message
  }

  return `юзербот не отвечает (${reason ? `${reason} ` : ''}${giftsBaseUrl()})`
}

/**
 * Причина из тела ответа юзербота.
 *
 * REST-слой отвечает JSON `{ ok: false, error: "…" }` с кодом 502/503/504 и
 * кладёт туда настоящую причину. Без чтения тела в лог и в админку попадал
 * только код статуса, поэтому «подарки недоступны» ничего не объясняло.
 */
async function userbotFailureReason(response) {
  try {
    const payload = await response.json()
    const reason = String(payload?.error || '').trim()

    if (reason) {
      return `юзербот ответил ${response.status}: ${reason} (${giftsBaseUrl()})`
    }
  } catch {
    // Не JSON — обходимся кодом статуса.
  }

  return `юзербот ответил ${response.status} (${giftsBaseUrl()})`
}

/** Целое число из метаданных подарка (Telegram отдаёт Long как число/строку). */
function numberOr(value, fallback) {
  const number = Number(value)

  return Number.isFinite(number) ? number : fallback
}

/**
 * id подарка цифрами — строкой.
 *
 * Id подарков Telegram девятнадцатизначные (`6003373314888696871`), а это
 * больше `Number.MAX_SAFE_INTEGER`: в числе последние цифры теряются
 * (`6003373314888696871` → `6003373314888697000`). По такому id юзербот подарок
 * не находит и отвечает 404 («анимация подарка недоступна»), поэтому id везде
 * едет строкой цифр — он же уходит в адрес `/api/gifts/sticker/<id>.json`.
 */
export function giftIdText(value) {
  const text = String(value ?? '').trim()

  return /^\d+$/.test(text) && text !== '0' ? text : ''
}

/**
 * Разбор ответа юзербота с сохранением длинных id.
 *
 * `JSON.parse` читает числа как double, и `6003373314888696871` из каталога
 * превращается в `6003373314888697000`. Поэтому перед разбором подписываем
 * кавычками все `"id"` от 16 цифр: это id подарков и их документов-анимаций
 * (`sticker.id`) и владельцев подарков (`released_by.id`) — целые в TL, а id
 * пользователей и чатов короче и остаются числами. Отдельно подписываем
 * `"gift_id"` — id «родителя» уникального подарка: он такой же девятнадцатизначный.
 */
function parseGiftPayload(text) {
  return JSON.parse(
    text.replace(/((?:"gift_id"|"id")\s*:\s*)(\d{16,})/g, '$1"$2"'),
  )
}

/** Цифры id из ссылки юзербота на файл подарка (`/api/gifts/sticker/<id>.json`). */
function urlGiftId(url) {
  const match = /\/sticker\/(?:unique\/)?(\d+)\.(?:json|tgs)$/.exec(String(url || '').trim())

  return match ? match[1] : ''
}

/**
 * Цвет Telegram в `#rrggbb` для CSS (мусор — пустая строка).
 *
 * Telegram отдаёт цвета подложки знаковым int32 (`-14803426`), а в CSS нужен
 * обычный `#rrggbb`, поэтому берём младшие 24 бита.
 */
function giftColor(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return ''
  }

  return `#${((Math.trunc(number) >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`
}

/**
 * Один подарок каталога в форму, удобную приложению.
 *
 * `id` — строка цифр (см. `giftIdText`): по ней приложение просит анимацию и
 * хранит выбранный подарок в кейсе. Точные цифры берём из `sticker.json_url`
 * юзербота, если длинный `id` до нас не дошёл. `stars` — цена подарка в звёздах
 * у Telegram, `convertStars` — сколько звёзд дадут за обмен (урезанная стоимость
 * для продажи). Ссылки на Lottie — наши ручки прокси.
 * `limited`/`soldOut`/`availabilityRemains`/`availabilityTotal` — состояние выпуска
 * серии: по ним карточка подарка в админке показывает, сколько экземпляров
 * осталось (см. `GiftDetailSheet`).

 *
 * Уникальные (коллекционные) подарки описываются отдельно: у них другое
 * значение `id` и картинка собирается из атрибутов (см. `normalizeUniqueGift`).
 */
function normalizeGift(gift) {
  if (gift?.kind === 'unique') {
    return normalizeUniqueGift(gift)
  }

  const sticker = gift?.sticker && typeof gift.sticker === 'object' ? gift.sticker : {}
  const background = gift?.background && typeof gift.background === 'object' ? gift.background : {}
  const id = giftIdText(gift?.id) || giftIdText(urlGiftId(sticker.json_url))

  if (!id) {
    return null
  }

  return {
    kind: 'gift',
    id,
    title: String(gift?.title || gift?.name || `Gift ${id}`),
    stars: numberOr(gift?.stars, 0),
    convertStars: numberOr(gift?.convert_stars ?? gift?.convertStars, 0),
    // Выпуск серии — то, что в Telegram видно в карточке подарка («390 094 из
    // 457 382 выпущено»). У лимитированных серий числа заполнены, у остальных
    // остаются нулями: карточка по ним строит строку «Наличие» только когда есть
    // что показать (см. `giftIssued` в `src/utils/giftCatalog.js`).
    limited: Boolean(gift?.limited),
    soldOut: Boolean(gift?.sold_out),
    availabilityRemains: numberOr(gift?.availability_remains, 0),
    availabilityTotal: numberOr(gift?.availability_total, 0),
    image: String(sticker?.thumb_url || sticker?.image_url || ''),
    jsonUrl: `/api/gifts/sticker/${id}.json`,
    tgsUrl: `/api/gifts/sticker/${id}.tgs`,
    // Фон подарка каталога (`starGift.background`) — те же три цвета, что и у
    // подложки уникального подарка, только без узора. Отдаём их под тем же ключом
    // (`backdrop`): карточка рисует подарок обеих пород одним кодом, а у
    // уникального к цветам добавляется ещё и узор (`patternUrl`).
    backdrop: {
      centerColor: giftColor(background.center_color),
      edgeColor: giftColor(background.edge_color),
      textColor: giftColor(background.text_color),
      patternColor: '',
      patternUrl: '',
      patternMime: '',
    },
  }
}

/**
 * Вендорный тип атрибута → короткий ключ приложения (`StarGiftAttributeModel` → `model`).
 *
 * Ключ нужен подписи строки в карточке подарка: по нему берётся название
 * («Модель», «Узор», «Фон») из словаря (`admin.cases.giftSheet*`).
 */
function giftAttributeType(type) {
  const name = String(type || '')

  if (name.endsWith('Backdrop')) {
    return 'backdrop'
  }

  if (name.endsWith('Pattern')) {
    return 'pattern'
  }

  if (name.endsWith('Model')) {
    return 'model'
  }

  if (name.endsWith('OriginalDetails')) {
    return 'original'
  }

  return 'other'
}

/**
 * Атрибут уникального подарка в форму приложения.
 *
 * Юзербот отдаёт атрибуты вендорными типами Pyrogram (`starGiftAttributeModel`,
 * `…Pattern`, `…Backdrop`, `…OriginalDetails`) вместе с редкостью в промилле.
 * Карточке подарка нужны только имя и редкость, поэтому тип ужимается до ключа
 * (`giftAttributeType`), а промилле остаётся числом: проценты из него считает
 * приложение (`giftRarityText` в `src/utils/giftCatalog.js`). Атрибут без имени
 * бесполезен — он выкидывается (`null`), и список чистится фильтром.
 */
function normalizeGiftAttribute(attribute) {
  const name = String(attribute?.name || '').trim()

  if (!name) {
    return null
  }

  return {
    type: giftAttributeType(attribute?.type),
    name,
    rarity: Math.max(0, numberOr(attribute?.rarity?.permille, 0)),
  }
}

/** Все атрибуты подарка: модель, узор, подложка и данные первого вручения. */
function normalizeGiftAttributes(attributes) {
  return (Array.isArray(attributes) ? attributes : [])
    .map(normalizeGiftAttribute)
    .filter(Boolean)
}

/**
 * Уникальный (коллекционный) подарок в форму приложения.
 *
 * Такой подарок — экземпляр: `id` — это id экземпляра (то самое `#35 651`),
 * `parentId` — id «родителя» в каталоге (по нему подарок когда-то купили), `slug`
 * — имя экземпляра у Telegram. В продаже его нет (`stars = 0`), зато он лежит на
 * аккаунте, и владелец может передать его получателю: `msgId`/`slug` приезжают
 * в записи списка подарков (`normalizeSavedGift`) и уходят в юзербот
 * (`transferSavedGift`).
 *
 * Атрибуты, владелец, выпуск и оценка экземпляра едут вместе с подарком:
 * `attributes` (модель, узор и подложка с редкостью), `ownerName`/`ownerAddress`,
 * `availabilityIssued`/`availabilityTotal` и `valueCurrency`/`valueAmount` — то,
 * что Telegram показывает в профиле подарка, а в админке рисует карточку
 * подарка (`GiftDetailSheet`).
 *
 * `hosted` — подарок выставлен на профиль аккаунта: Telegram отдаёт у такого
 * экземпляра `host_id` («ownership remains with the TON wallet in
 * owner_address»), поэтому он лежит в списке аккаунта, но передать его с
 * аккаунта нельзя — передаёт владелец кошелька. Сетка и карточка такие подарки
 * помечают (`giftIsHosted` в `src/utils/giftCatalog.js`).
 *
 * Картинка — модель подарка из его атрибутов: это своя ручка
 * `/api/gifts/sticker/unique-<id>`. Цвета подложки приходят вместе с подарком и
 * рисуют карточку похожей на Telegram, а узор подложки (атрибут «узор») — ещё одна
 * ручка, `/api/gifts/sticker/unique-<id>.pattern`: Telegram накладывает этот стикер
 * на подложку повторяющимся рисунком цветом `pattern_color`.
 */
function normalizeUniqueGift(gift) {
  const sticker = gift?.sticker && typeof gift.sticker === 'object' ? gift.sticker : {}
  const backdrop = gift?.backdrop && typeof gift.backdrop === 'object' ? gift.backdrop : {}
  const pattern = gift?.pattern && typeof gift.pattern === 'object' ? gift.pattern : {}
  const id = giftIdText(gift?.id) || giftIdText(urlGiftId(sticker.json_url))

  if (!id) {
    return null
  }

  // Узор подложки — стикер, который Telegram накладывает поверх подложки
  // повторяющимся рисунком (`starGiftAttributePattern`, цвет ему даёт
  // `pattern_color`). Юзербот отдаёт его отдельной ручкой, и адрес нужен только
  // тогда, когда Telegram вообще прислал узор: у подарков без узора запрос
  // возвращал бы 404 на каждой карточке.
  const patternMime = String(pattern.mime_type || '').trim()
  const hasPattern = Boolean(pattern.url || patternMime || pattern.id)
  const patternUrl = hasPattern ? `/api/gifts/sticker/unique-${id}.pattern` : ''

  return {
    kind: 'unique',
    id,
    title: String(gift?.title || `Gift ${id}`),
    num: numberOr(gift?.num, 0),
    slug: String(gift?.slug || ''),
    parentId: giftIdText(gift?.gift_id),
    // Подарок стоит на профиле аккаунта, а владеет им кошелёк TON: передать его
    // с аккаунта нельзя, и об этом владельцу говорят сетка и карточка подарка.
    hosted: Boolean(gift?.hosted) || Boolean(gift?.host_id),
    // Экземпляр на аккаунте: владелец, состояние выпуска и оценка. Карточка
    // подарка показывает их теми же подписями, что и Telegram: «Владелец»,
    // «Наличие», «Ценность».
    ownerName: String(gift?.owner_name || ''),
    ownerAddress: String(gift?.owner_address || ''),
    availabilityIssued: numberOr(gift?.availability_issued, 0),
    availabilityTotal: numberOr(gift?.availability_total, 0),
    valueCurrency: String(gift?.value_currency || ''),
    valueAmount: numberOr(gift?.value_amount, 0),
    valueUsdAmount: numberOr(gift?.value_usd_amount, 0),
    stars: 0,
    convertStars: 0,
    image: String(sticker?.thumb_url || sticker?.image_url || ''),
    jsonUrl: `/api/gifts/sticker/unique-${id}.json`,
    tgsUrl: `/api/gifts/sticker/unique-${id}.tgs`,
    // Атрибуты экземпляра: модель, узор, подложка и (если Telegram отдал) данные
    // первого вручения. Из них карточка собирает строки с редкостью — ровно так
    // они выглядят в профиле подарка в Telegram (`GiftDetailSheet`).
    attributes: normalizeGiftAttributes(gift?.attributes),
    backdrop: {
      centerColor: giftColor(backdrop.center_color),
      edgeColor: giftColor(backdrop.edge_color),
      patternColor: giftColor(backdrop.pattern_color),
      textColor: giftColor(backdrop.text_color),
      patternUrl,
      patternMime,
    },
  }
}

/**
 * Каталог подарков с юзербота с кешем.
 *
 * Возвращает снимок `{ gifts, ok, error, loadedAt }`. При недоступном юзерботе
 * отдаёт прежний кеш (может быть пустым) и помечает `ok: false`, но не бросает
 * исключение — приложение должно открываться даже без юзербота.
 */
async function fetchGiftCatalog({ force = false, background = false } = {}) {
  // Промах держим недолго: как только юзербот поднимется, каталог вернётся сам.
  const cacheMs = catalogCache.ok ? giftsCacheMs() : Math.min(errorRetryMs, giftsCacheMs())
  const fresh = catalogCache.loadedAt > 0 && Date.now() - catalogCache.loadedAt < cacheMs

  if (fresh && !force) {
    return catalogCache
  }

  // `background` — путь bootstrap: отдаём текущий снимок сразу, а юзербота
  // спрашиваем в фоне. Ответ попадёт в следующий снимок (промах кешируется всего
  // на 30 секунд), поэтому поднятый юзербот подхватывается сам, без перезапуска
  // приложения и без «обновить» в админке.
  if (background) {
    void refreshCatalog().catch(() => {})

    return catalogCache
  }

  return refreshCatalog()
}

/** Запрос каталога к юзерботу: пока один идёт, второй не начинаем. */
let catalogInFlight = null

async function refreshCatalog() {
  if (catalogInFlight) {
    return catalogInFlight
  }

  const request = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), giftsTimeoutMs())

    try {
      const response = await fetch(`${giftsBaseUrl()}/api/gifts`, {
        headers: giftsAuthHeaders(),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await userbotFailureReason(response))
      }

      const payload = parseGiftPayload(await response.text())
      const list = Array.isArray(payload?.gifts) ? payload.gifts : []
      // `not_modified: true` — Telegram ответил «каталог не менялся», список пуст.
      // В этом случае держим прежний кеш, иначе приложение на пять минут осталось
      // бы без подарков.
      const unchanged = payload?.not_modified === true

      catalogCache = {
        gifts: unchanged ? catalogCache.gifts : list.map(normalizeGift).filter(Boolean),
        loadedAt: Date.now(),
        ok: true,
        error: '',
      }

      console.log(
        unchanged
          ? '[gifts] каталог не менялся'
          : `[gifts] каталог обновлён: подарков=${catalogCache.gifts.length}`,
      )
    } catch (error) {
      catalogCache = {
        gifts: catalogCache.gifts,
        loadedAt: Date.now(),
        ok: false,
        error: giftFailureText(error),
      }

      console.warn('[gifts] каталог подарков недоступен:', catalogCache.error)
    } finally {
      clearTimeout(timer)
    }

    return catalogCache
  })()

  catalogInFlight = request

  try {
    return await request
  } finally {
    if (catalogInFlight === request) {
      catalogInFlight = null
    }
  }
}

/**
 * Список подарков для bootstrap и админки: всегда массив, без исключений.
 * `force` игнорирует кеш — так админка обновляет каталог кнопкой «обновить».
 * `background` возвращает текущий снимок, а юзербота спрашивает в фоне.
 */
export async function loadGiftCatalog({ force = false, background = false } = {}) {
  const snapshot = await fetchGiftCatalog({ force, background })

  return snapshot.gifts
}

/** Текущий снимок каталога: подарки и состояние последнего запроса. */
export function giftCatalogSnapshot() {
  return { ...catalogCache, gifts: [...catalogCache.gifts] }
}

/**
 * Подарки, которые уже есть на аккаунте юзербота (`payments.getSavedStarGifts`).
 *
 * Нужны админке: второй режим пикера показывает не весь каталог Telegram, а
 * только то, что аккаунт юзербота реально получил — по такому подарку видно,
 * что его есть чем выдать. Мини-апп получает список не отдельной ручкой, а в
 * ответе `/api/admin/cases` (см. `savedGifts` в `createCasesApi`).
 *
 * Юзербот отдаёт по подарку его «сохранённую» запись (`savedStarGift`), внутри
 * которой лежит обычный подарок каталога. Нам из записи нужен только сам
 * подарок, поэтому список схлопывается по id и к каждому добавляется `count` —
 * сколько таких подарков на аккаунте (три «мишки» — одна карточка «×3»).
 * Уникальные (коллекционные) подарки приходят наравне с обычными: юзербот
 * разбирает их теми же вендорными типами, поэтому список не рвётся. У каждого
 * такого подарка свой id экземпляра, номер (`#35 651`), картинка-модель и цвета
 * подложки, а передать его получателю можно только с аккаунта — поэтому вместе с
 * подарком едут `msgId`/`slug` для ручки передачи (`transferSavedGift`).
 * «Размещённые» (hosted) подарки приезжают вместе с остальными: Telegram отдаёт
 * их методом `payments.getSavedStarGifts` без флага `exclude_hosted`, и это ровно
 * тот список, который владелец видит на профиле аккаунта (см.
 * `savedGiftRequests`). У такого экземпляра выставлен `hosted` — подарок стоит на
 * профиле, а владеет им кошелёк TON.
 */
let savedCache = { gifts: [], loadedAt: 0, ok: false, error: '', mode: '' }

/**
 * Один подарок аккаунта в форму каталога плюс то, что нужно для передачи.
 *
 * `count` — сколько таких подарков на аккаунте; `msgId`/`transferStars`/
 * `canTransferAt` — данные для передачи получателю (`transferSavedGift`:
 * юзерботу нужен либо `msgId` записи, либо `slug` уникального подарка).
 */
function normalizeSavedGift(saved) {
  const gift = normalizeGift(saved?.gift)

  if (!gift) {
    return null
  }

  return {
    ...gift,
    count: 1,
    msgId: numberOr(saved?.msg_id, 0),
    transferStars: numberOr(saved?.transfer_stars, 0),
    canTransferAt: numberOr(saved?.can_transfer_at, 0),
    giftNum: numberOr(saved?.gift_num, 0),
  }
}

/**
 * Список подарков аккаунта: `[{ …подарок, count }]`.
 *
 * Обычные подарки схлопываем по id: три «мишки» — одна карточка «×3». Уникальные
 * оставляем штуками: у каждого экземпляра свой id, свой номер и, бывает, своя
 * подложка, поэтому «×2» у них означало бы совсем другое. Id — то, что уходит в
 * строку наполнения кейса.
 */
function aggregateSavedGifts(list) {
  const byId = new Map()

  for (const saved of Array.isArray(list) ? list : []) {
    const gift = normalizeSavedGift(saved)

    if (!gift) {
      continue
    }

    if (gift.kind === 'unique') {
      byId.set(`unique:${gift.id}`, gift)
      continue
    }

    const known = byId.get(gift.id)

    byId.set(gift.id, known ? { ...known, count: known.count + 1 } : gift)
  }

  return [...byId.values()]
}

/**
 * Список подарков аккаунта с юзербота и с кешем.
 *
 * Устроен как каталог (`fetchGiftCatalog`): отдаёт снимок
 * `{ gifts, ok, error, loadedAt }`, при недоступном юзерботе возвращает прежний
 * кеш с `ok: false` и не бросает исключение — админка должна открыться и без
 * юзербота.
 */
async function fetchSavedGifts({ force = false, background = false } = {}) {
  const cacheMs = savedCache.ok ? giftsCacheMs() : Math.min(errorRetryMs, giftsCacheMs())
  const fresh = savedCache.loadedAt > 0 && Date.now() - savedCache.loadedAt < cacheMs

  if (fresh && !force) {
    return savedCache
  }

  if (background) {
    void refreshSavedGifts().catch(() => {})

    return savedCache
  }

  return refreshSavedGifts()
}

/** Запрос подарков аккаунта к юзерботу: пока один идёт, второй не начинаем. */
let savedInFlight = null

/**
 * Как просим у юзербота подарки аккаунта — от полного списка к самому скромному.
 *
 * Telegram описывает `payments.getSavedStarGifts` как «fetch the full list of gifts
 * owned, received or hosted by a peer», но подарки, размещённые на профиле
 * (`hosted`), отдаёт только без флага `exclude_hosted`. У юзербота этот флаг
 * выставлен по умолчанию (владелец видел на аккаунте один обычный подарок, а
 * коллекционные, стоящие на профиле, — нет), поэтому спрашиваем явно:
 *
 *   `full`  — всё: полученные, купленные и размещённые на профиле
 *             (`exclude_unique=false`, `exclude_hosted=false`);
 *   `owned` — только полученные и купленные: юзербот старой версии не разобрал
 *             hosted-подарки и ответил ошибкой;
 *   `plain` — совсем без параметров: юзербот не понимает и `exclude_unique`, и
 *             его ответ может прийти без уникальных подарков.
 *
 * В каком режиме добыли список, уезжает в админку (`mode` в `savedStatus`), и
 * пикер честно пишет, чего в списке нет. Таймаут повторов не запускает: если
 * юзербот молчит `GIFTS_API_TIMEOUT_MS`, другие параметры не помогут — на весь
 * перебор один общий бюджет.
 */
const savedGiftRequests = [
  { mode: 'full', query: 'exclude_unique=false&exclude_hosted=false' },
  { mode: 'owned', query: 'exclude_unique=false&exclude_hosted=true' },
  { mode: 'plain', query: '' },
]

/** Одна попытка получить список подарков аккаунта: запрос и разбор ответа. */
async function fetchSavedGiftsPage(query, signal) {
  const url = `${giftsBaseUrl()}/api/gifts/saved${query ? `?${query}` : ''}`
  const response = await fetch(url, { headers: giftsAuthHeaders(), signal })

  if (!response.ok) {
    throw new Error(await userbotFailureReason(response))
  }

  return parseGiftPayload(await response.text())
}

async function refreshSavedGifts() {
  if (savedInFlight) {
    return savedInFlight
  }

  const request = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), giftsTimeoutMs())

    try {
      let failure = null

      for (const attempt of savedGiftRequests) {
        try {
          const payload = await fetchSavedGiftsPage(attempt.query, controller.signal)
          const list = Array.isArray(payload?.gifts) ? payload.gifts : []
          const gifts = aggregateSavedGifts(list)

          savedCache = {
            gifts,
            loadedAt: Date.now(),
            ok: true,
            error: '',
            mode: attempt.mode,
          }

          console.log(
            `[gifts] подарки аккаунта обновлены: получено=${list.length}, в списке=${gifts.length}, `
              + `уникальных=${gifts.filter(gift => gift.kind === 'unique').length}, запрос=${attempt.mode}`,
          )

          return savedCache
        } catch (error) {
          failure = error

          // Юзербот молчит: перебор параметров ничего не даст, ждём его.
          if (error?.name === 'AbortError') {
            break
          }

          if (attempt !== savedGiftRequests[savedGiftRequests.length - 1]) {
            console.warn(
              `[gifts] подарки аккаунта: запрос «${attempt.mode}» не прошёл (${giftFailureText(error)}), пробуем скромнее`,
            )
          }
        }
      }

      throw failure || new Error('юзербот не ответил')
    } catch (error) {
      savedCache = {
        gifts: savedCache.gifts,
        loadedAt: Date.now(),
        ok: false,
        error: giftFailureText(error),
        mode: savedCache.mode,
      }

      console.warn('[gifts] подарки аккаунта недоступны:', savedCache.error)
    } finally {
      clearTimeout(timer)
    }

    return savedCache
  })()

  savedInFlight = request

  try {
    return await request
  } finally {
    if (savedInFlight === request) {
      savedInFlight = null
    }
  }
}

/**
 * Подарки аккаунта юзербота для админки: всегда массив, без исключений.
 * `force` игнорирует кеш — так работает кнопка «обновить» в пикере подарков.
 */
export async function loadSavedGifts({ force = false, background = false } = {}) {
  const snapshot = await fetchSavedGifts({ force, background })

  return snapshot.gifts
}

/** Текущий снимок подарков аккаунта: подарки и состояние последнего запроса. */
export function savedGiftsSnapshot() {
  return { ...savedCache, gifts: [...savedCache.gifts] }
}

/**
 * Сброс кешей подарков (например, после ручного обновления в админке).
 *
 * Каталог и подарки аккаунта держим в одном состоянии: оба читаются из юзербота,
 * а обновляет их одна кнопка в пикере («обновить каталог»).
 */
export function resetGiftCatalogCache() {
  catalogCache = { gifts: [], loadedAt: 0, ok: false, error: '' }
  savedCache = { gifts: [], loadedAt: 0, ok: false, error: '', mode: '' }
}

/**
 * Передать подарок с аккаунта юзербота получателю (`POST /api/gifts/transfer`).
 *
 * Подарок вправе передать только владелец, поэтому это делает юзербот: бот так не
 * умеет. Подарок адресуется либо `msgId` (подарок из «своих» подарков), либо
 * `slug` (уникальный подарок по имени) — достаточно одного из них; для
 * уникальных в пикере есть оба.
 *
 * Юзербот подтверждает передачу отдельным запросом и возвращает `verified`.
 * `verified: false` — не ошибка: ответ Telegram без сбоя уже значит, что передача
 * принята, просто подтвердить её списком не вышло. А вот исключение означает, что
 * подарок НЕ ушёл, и вызывающий обязан считать награду невыданной (см.
 * `deliverGift` в `server/caseGifts.js`).
 */
export async function transferSavedGift({ msgId = 0, slug = '', toUserId = 0 } = {}) {
  const target = Math.trunc(Number(toUserId))
  const messageId = Math.trunc(Number(msgId))
  const giftSlug = String(slug || '').trim()

  if (!Number.isFinite(target) || target <= 0) {
    throw new Error('Не указан получатель подарка')
  }

  if (!(Number.isFinite(messageId) && messageId > 0) && !giftSlug) {
    throw new Error('У подарка нет ни msg_id, ни slug — передать его нельзя')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), transferTimeoutMs())

  try {
    const response = await fetch(`${giftsBaseUrl()}/api/gifts/transfer`, {
      method: 'POST',
      headers: { ...giftsAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_user_id: target,
        msg_id: Number.isFinite(messageId) && messageId > 0 ? messageId : 0,
        slug: giftSlug,
      }),
      signal: controller.signal,
    })

    const text = await response.text()
    let payload = {}

    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { error: text.slice(0, 200) }
    }

    if (!response.ok) {
      throw new Error(payload?.error || `юзербот ответил ${response.status}`)
    }

    if (!payload?.ok) {
      throw new Error(payload?.error || 'юзербот не подтвердил передачу подарка')
    }

    return {
      ok: true,
      verified: Boolean(payload.verified),
      note: String(payload.note || ''),
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`юзербот не ответил за ${Math.round(transferTimeoutMs() / 1000)} с`)
    }

    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timer)
  }
}


/**
 * Прокси Lottie-анимации подарка: байты отдаются как есть (`.json` или `.tgs`),
 * чтобы плеер в приложении получал их с того же домена, что и приложение.
 *
 * Работают оба вида файлов: `<id>.json` (анимация подарка каталога) и
 * `unique-<id>.json` (модель уникального подарка — у юзербота это отдельная
 * ручка `/api/gifts/sticker/unique/<id>`).
 */
/**
 * Прокси Lottie-анимации и узора подложки подарка: байты отдаются как есть
 * (`.json`, `.tgs` или `.pattern`), чтобы плеер и маска в приложении получали их с
 * того же домена, что и приложение.
 *
 * Работают оба вида подарков: `<id>.json` (анимация подарка каталога) и
 * `unique-<id>.json` (модель уникального подарка — у юзербота это отдельная ручка
 * `/api/gifts/sticker/unique/<id>`). Узор подложки уникального подарка —
 * `unique-<id>.pattern`: это картинка-стикер, и её тип (`image/webp` и подобные)
 * отдаём как есть — по `octet-stream` браузер не наложит её маской.
 */
async function proxySticker(req, res) {
  const match = stickerFilePattern.exec(String(req.params.file || ''))

  if (!match) {
    res.status(404).json({ error: 'Подарок не найден' })
    return
  }

  const [, uniquePrefix, giftId, ext] = match
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), stickerTimeoutMs())
  const stickerPath = uniquePrefix
    ? `/api/gifts/sticker/unique/${giftId}.${ext}`
    : `/api/gifts/sticker/${giftId}.${ext}`

  try {
    const response = await fetch(`${giftsBaseUrl()}${stickerPath}`, {
      headers: giftsAuthHeaders(),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn('[gifts] файл подарка недоступен:', await userbotFailureReason(response))
      res.status(response.status === 404 ? 404 : 502).json({ error: 'Файл подарка недоступен' })
      return
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    // Тип узора важен: юзербот отдаёт его по типу документа в Telegram, и только с
    // ним браузер наложит стикер маской. Остальное отдаём как раньше — плеер Lottie
    // разбирает и `octet-stream`.
    const upstreamType = String(response.headers.get('content-type') || '').split(';')[0].trim()

    res.setHeader(
      'Content-Type',
      ext === 'json'
        ? 'application/json; charset=utf-8'
        : (ext === 'pattern' && upstreamType ? upstreamType : 'application/octet-stream'),
    )
    res.setHeader('Cache-Control', stickerCacheHeader)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(buffer)
  } catch (error) {
    console.warn('[gifts] файл подарка недоступен:', giftFailureText(error))
    res.status(502).json({ error: 'Юзербот недоступен' })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ручки подарков для приложения.
 *
 * `/api/gifts` закрыт Telegram-авторизацией (как `/api/bootstrap`), а стикеры
 * открыты: их читает браузерный плеер Lottie и маска CSS, которые initData передать
 * не могут — по id можно получить только анимацию подарка и узор его подложки.
 */
export function createGiftsApi({ requireTelegramUser } = {}) {
  const router = Router()
  const guards = [requireTelegramUser].filter(Boolean)

  router.get('/api/gifts', ...guards, async (req, res) => {
    const snapshot = await fetchGiftCatalog({ force: String(req.query?.refresh || '') === '1' })

    res.json({
      ok: true,
      available: snapshot.ok,
      error: snapshot.error || null,
      count: snapshot.gifts.length,
      gifts: snapshot.gifts,
    })
  })

  router.get('/api/gifts/sticker/:file', proxySticker)

  return router
}

export default createGiftsApi
