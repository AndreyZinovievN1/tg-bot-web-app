/**
 * Каталог подарков Telegram: порядок и поиск для выбора подарка в админке.
 *
 * Каталог приходит из юзербота и нормализуется на сервере (`normalizeGift` в
 * `server/giftsApi.js`): `{ id, title, stars, convertStars, image, jsonUrl, tgsUrl }`,
 * где `id` — строка цифр (см. `giftIdText` — в числе девятнадцать знаков не
 * сохраняются).
 * `stars` — цена подарка в звёздах у Telegram; `stars <= 0` значит «в продаже нет»
 * (лимитированные серии и подарки, снятые с продажи) — такие держим в конце списка.
 * У подарков, полученных аккаунтом юзербота (`savedGifts` в ответе админки), есть
 * ещё `count` — сколько таких штук лежит на аккаунте (см. `giftOwnedCount`).
 *
 * Уникальные (коллекционные) подарки приходят с `kind: 'unique'`: у них `num`
 * (номер экземпляра `#35 651`), `slug` (имя экземпляра у Telegram), `backdrop`
 * (цвета подложки и узор — `giftBackdrop`) и своя анимация модели
 * (`giftAnimationKey`), а `id` — это id ЭКЗЕМПЛЯРА, которого в каталоге нет.
 * Названия и подписи собирает `giftTitle`.
 *
 * Карточка подарка в админке (`GiftDetailSheet`) показывает подарок так же, как
 * профиль подарка в Telegram: атрибуты с редкостью (`giftAttributes`), владельца
 * (`giftOwner`), выпуск серии (`giftIssued`), оценку (`giftValue`) и ссылку на
 * страницу подарка в Telegram (`giftTelegramUrl` — она есть только у уникального
 * подарка, см. ниже). Все эти поля приходят с
 * сервера (`normalizeGift`/`normalizeUniqueGift` в `server/giftsApi.js`), а
 * подписи и проценты собираются здесь — карточка только рисует.
 *
 * Лимитированные серии Telegram (`limited` — выпуск ограничен, `soldOut` —
 * серия распродана) пикер держит отдельной вкладкой (`giftIsLimitedSeries`): в
 * общем списке остаются подарки в свободной продаже, а серии с лимитом — под
 * своей кнопкой. Уникальный подарок отданного аккаунта, который стоит на его
 * профиле (`starGiftUnique.host_id`), помечен `hosted` — такой подарок передаёт
 * владелец кошелька, а не аккаунт (`giftIsHosted`).
 *
 * Здесь только чистые функции: их используют и пикер подарков в редакторе кейса, и
 * подписи строк наполнения, поэтому ни состояния, ни запросов тут нет.
 */

/** Целое число из значения: пустое и мусорное превращается в 0. */
function numberOr(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

/**
 * Id подарка цифрами — строкой: ключ каталога и то, что уходит в строку наполнения.
 *
 * У подарков Telegram id девятнадцатизначный (`6003373314888696871`), а это
 * больше `Number.MAX_SAFE_INTEGER`: в числе последние цифры теряются
 * (`…696871` → `…697000`). По такому id юзербот подарок не находит и отвечает
 * 404, а анимация остаётся заглушкой. Поэтому id едет строкой цифр везде: в
 * каталоге, в адресе `/api/gifts/sticker/<id>.json`, в строке наполнения кейса и
 * в ответе об открытии кейса. Принимает и сам подарок, и готовый id.
 */
export function giftIdText(value) {
  const source = value && typeof value === 'object' ? value.id : value;
  const text = String(source ?? '').trim();

  return /^\d+$/.test(text) && text !== '0' ? text : '';
}

/** Порядок по id: у строк цифр разной длины числовое сравнение не работает. */
function compareGiftIds(left, right) {
  const byNumber = numberOr(left) - numberOr(right);

  if (byNumber !== 0) {
    return byNumber;
  }

  return left < right ? -1 : Number(left > right);
}

/** Цена подарка в звёздах: 0 — сейчас не продаётся (лимитированная серия). */
export function giftStars(gift) {
  return Math.max(0, Math.round(numberOr(gift?.stars)));
}

/**
 * Подарок продаётся в каталоге Telegram прямо сейчас?
 *
 * Распроданная серия (`soldOut`) остаётся в каталоге с ценой, но купить её уже
 * нельзя — поэтому такая серия «не продаётся»: по этому признаку карточка и
 * строка наполнения пишут статус, а список держит покупаемые подарки выше.
 */
export function giftOnSale(gift) {
  return giftStars(gift) > 0 && !giftIsSoldOut(gift);
}

/**
 * Лимитированная серия в каталоге Telegram: у подарка стоит `starGift.limited`.
 *
 * У такой серии выпуск ограничен (`availabilityTotal` — сколько всего
 * экземпляров), поэтому её место — отдельная вкладка пикера («Лимитированные»),
 * а не общий список подарков в свободной продаже. Распроданная серия тоже
 * лимитированная (`soldOut`): подарок мог уже лежать на аккаунте, и владельцу
 * важно видеть его в каталоге.
 *
 * У уникального подарка (`kind: 'unique'`) `limited` тоже выставлен, но лимит там
 * ни при чём: это экземпляр, а не серия — его место в режиме «на аккаунте».
 */
export function giftIsLimitedSeries(gift) {
  return Boolean(gift?.limited) && !giftIsUnique(gift);
}

/**
 * Лимитированная серия распродана: в Telegram такой подарок уже не купить
 * (`starGift.sold_out`), и выдать его из бота можно только с аккаунта, если он
 * там лежит. У уникального подарка признак не работает: экземпляр в каталоге и
 * не продаётся вовсе.
 */
export function giftIsSoldOut(gift) {
  return Boolean(gift?.soldOut) && !giftIsUnique(gift);
}

/**
 * Уникальный (коллекционный) подарок: экземпляр с номером, а не строка каталога.
 */
export function giftIsUnique(gift) {
  return gift?.kind === 'unique';
}

/**
 * Подарок выставлен на профиль аккаунта юзербота («hosted»).
 *
 * Telegram отдаёт у такого экземпляра `host_id` (`starGiftUnique.host_id`):
 * подарок стоит на профиле, а владеет им кошелёк TON — передать его с аккаунта
 * нельзя, передаёт владелец кошелька. Юзербот отдаёт признак готовым (`hosted` в
 * `unique_gift_to_dict`), поэтому пикер помечает такие карточки: владельцу важно
 * видеть, чем можно выдать приз, а чем нет.
 */
export function giftIsHosted(gift) {
  return giftIsUnique(gift) && (Boolean(gift?.hosted) || Boolean(gift?.hostId));
}

/**
 * Номер экземпляра уникального подарка (то самое `#35 651`); у обычного — 0.
 *
 * Номер приходит с сервера (`normalizeUniqueGift` в `server/giftsApi.js`): он
 * единственное, чем два экземпляра одного подарка отличаются друг от друга.
 */
export function giftUniqueNum(gift) {
  return Math.max(0, Math.round(numberOr(gift?.num)));
}

/** Название подарка без номера: у подарка без имени остаётся читаемый код. */
export function giftBaseTitle(gift) {
  const title = String(gift?.title || '').trim();

  return title || `Gift ${giftIdText(gift)}`;
}

/**
 * Название подарка для подписей: у уникального к нему добавлен номер экземпляра.
 *
 * В строке наполнения и в истории виден именно номер: «Мишка #35 651», а не
 * просто «Мишка», иначе владелец не поймёт, какой из экземпляров он выбрал.
 */
export function giftTitle(gift) {
  const base = giftBaseTitle(gift);
  const num = giftUniqueNum(gift);

  return giftIsUnique(gift) && num > 0 ? `${base} #${num}` : base;
}

/**
 * Ключ анимации подарка — то, что уходит в адрес `/api/gifts/sticker/<ключ>.json`.
 *
 * У подарка каталога это его id, у уникального — `unique-<id>`: картинка
 * уникального подарка лежит в его атрибутах, и юзербот отдаёт её отдельной ручкой
 * (см. `stickerFilePattern` в `server/giftsApi.js`).
 */
export function giftAnimationKey(gift) {
  const id = giftIdText(gift);

  if (!id) {
    return '';
  }

  return giftIsUnique(gift) ? `unique-${id}` : id;
}

/**
 * Цвета подложки подарка для карточки: `#rrggbb` или пустая строка.
 *
 * Подложка приходит с сервера уже в виде CSS-цветов, поэтому карточка подарка
 * выглядит как в Telegram, а не серой рамкой. `center`/`edge` рисуют фон карточки
 * (центр и края), `pattern` — цвет узора поверх него, `text` — цвет подписей на
 * нём (у светлых подложек Telegram он тёмный).
 *
 * Узор — отдельный файл (`patternUrl`), и он бывает не у всех подарков: у подарка
 * каталога Telegram кладёт в фон только три цвета (`starGift.background`), а узор
 * (`starGiftAttributePattern`) есть только у коллекционного. `patternMime` —
 * тип этого файла из Telegram: по нему видно, можно ли красить его маской
 * (см. `giftPatternUrl`).
 */
export function giftBackdrop(gift) {
  const backdrop = gift?.backdrop || {};

  return {
    center: String(backdrop.centerColor || '').trim(),
    edge: String(backdrop.edgeColor || '').trim(),
    pattern: String(backdrop.patternColor || '').trim(),
    text: String(backdrop.textColor || '').trim(),
    patternUrl: String(backdrop.patternUrl || '').trim(),
    patternMime: String(backdrop.patternMime || '').trim(),
  };
}

/**
 * Подложку подарка есть чем нарисовать: центром, краями или узором.
 *
 * У подарка каталога цвета есть всегда (Telegram отдаёт их вместе с подарком), но
 * если юзербот старой версии их не прислал, карточка остаётся прежней — на
 * поверхности приложения.
 */
export function giftHasBackdrop(gift) {
  const backdrop = giftBackdrop(gift);

  return Boolean(backdrop.center || backdrop.edge || giftPatternUrl(gift));
}

/**
 * Адрес картинки-узора, если её можно наложить маской.
 *
 * Узор подложки Telegram — стикер, который кладётся на подложку повторяющимся
 * рисунком, и цвет ему даёт подложка (`pattern_color`). Красится это маской CSS,
 * а маска принимает только картинку: тип берём из `patternMime`, и Lottie-узор
 * (`application/x-tgsticker`) пропускаем — подложка тогда остаётся одними цветами.
 */
export function giftPatternUrl(gift) {
  const backdrop = giftBackdrop(gift);

  return backdrop.patternMime.toLowerCase().startsWith('image/') ? backdrop.patternUrl : '';
}

/**
 * Редкость атрибута в процентах: сервер отдаёт промилле (36 — это 3.6%).
 *
 * Проценты округляем до двух знаков и убираем хвост нулей: «0.4%», «3.6%», «12%»
 * — так же, как их показывает Telegram. Нет редкости (0) — пустая строка, и
 * значок редкости в строке не рисуется.
 */
export function giftRarityText(permille) {
  const percent = Math.max(0, numberOr(permille)) / 10;

  return percent > 0 ? `${Number(percent.toFixed(2))}%` : '';
}

/** Порядок строк атрибутов в карточке подарка: как в профиле подарка Telegram. */
const giftAttributeOrder = ['model', 'pattern', 'backdrop', 'other'];

/**
 * Атрибуты подарка для карточки: модель, узор и подложка с редкостью.
 *
 * Сервер уже ужал вендорные типы Pyrogram до ключей (`model`/`pattern`/…), здесь
 * остаётся убрать данные первого вручения (в карточке они не нужны) и
 * упорядочить строки. Подарок каталога атрибутов не имеет — список пустой, и
 * строки просто не рисуются.
 */
export function giftAttributes(gift) {
  const list = Array.isArray(gift?.attributes) ? gift.attributes : [];

  return list
    .filter(item => item && item.name && item.type !== 'original')
    .map(item => {
      const type = String(item.type || '');

      return {
        type: giftAttributeOrder.includes(type) ? type : 'other',
        name: String(item.name),
        rarity: numberOr(item.rarity),
      };
    })
    .sort((left, right) => (
      giftAttributeOrder.indexOf(left.type) - giftAttributeOrder.indexOf(right.type)
    ));
}

/**
 * Владелец экземпляра: имя, а без имени — адрес кошелька Telegram.
 *
 * Владельца подписывает сам Telegram (`ownerName` — например «MRKT Bank»), но у
 * скрытых профилей имени нет: тогда показываем адрес из `ownerAddress`, он есть
 * всегда. `text` — то, что рисует строка «Владелец»: пусто значит «данных нет»,
 * и строка не показывается.
 */
export function giftOwner(gift) {
  const name = String(gift?.ownerName || '').trim();
  const address = String(gift?.ownerAddress || '').trim();

  return { name, address, text: name || address };
}

/**
 * Сколько экземпляров серии выпущено: `{ issued, total }`.
 *
 * У уникального подарка Telegram отдаёт выпущенное готовым (`availabilityIssued`),
 * у подарка каталога — только остаток (`availabilityRemains`), поэтому
 * выпущенное считаем сами. Нет данных (нули) — строка «Наличие» не рисуется.
 */
export function giftIssued(gift) {
  const total = Math.max(0, Math.round(numberOr(gift?.availabilityTotal)));

  if (giftIsUnique(gift)) {
    return { issued: Math.max(0, Math.round(numberOr(gift?.availabilityIssued))), total };
  }

  const remains = Math.max(0, Math.round(numberOr(gift?.availabilityRemains)));

  return { issued: total > remains ? total - remains : 0, total };
}

/**
 * Оценка подарка из профиля Telegram: `{ currency, amount }` (например TON и 39).
 *
 * Оценка есть только у уникальных подарков (`valueCurrency`/`valueAmount`); у
 * подарка каталога её нет — нули, и строка «Ценность» не рисуется.
 */
export function giftValue(gift) {
  const amount = Number(gift?.valueAmount);

  return {
    currency: String(gift?.valueCurrency || '').trim(),
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
  };
}

/**
 * Сколько звёзд Telegram берёт за передачу подарка с аккаунта (`transferStars`).
 *
 * Число приезжает вместе с подарком аккаунта (`normalizeSavedGift` в
 * `server/giftsApi.js`): это плата владельца за передачу, и в админке её полезно
 * видеть рядом с подарком. У подарка каталога передачи нет — 0.
 */
export function giftTransferStars(gift) {
  return Math.max(0, Math.round(numberOr(gift?.transferStars)));
}

/**
 * Страница подарка в Telegram — ссылка кнопки «в Telegram» в карточке подарка.
 *
 * Ссылка есть только у уникального (коллекционного) подарка: Telegram отдаёт
 * готовый `slug` ЭКЗЕМПЛЯРА (`InstantRamen-216128`; в схеме это
 * «`starGiftUnique.slug` — slug that can be used to create a collectible gift
 * deep link»), и `t.me/nft/<slug>` открывает ровно этот подарок.
 *
 * У подарка каталога (`starGift`) `slug` не приходит вовсе: название серии и slug
 * — разные вещи, и собранная из названия ссылка («Signet Ring» →
 * `t.me/nft/SignetRing`) в Telegram не открывается: клиент отвечает ошибкой
 * `STARGIFT_SLUG_INVALID`. Поэтому для каталога ссылки нет — кнопка в карточке
 * прячется (`GiftDetailSheet`), а не ведёт в ошибку.
 */
export function giftTelegramUrl(gift) {
  const slug = String(gift?.slug || '').trim();

  return giftIsUnique(gift) && slug ? `https://t.me/nft/${slug}` : '';
}

/**
 * Подарки для выбора: сначала продаваемые по цене (дешёвые выше), потом
 * непродаваемые по алфавиту. Порядок стабильный — список не «прыгает» между
 * открытиями пикера, а id разрешает ничьи.
 */
export function sortGiftCatalog(gifts) {
  const list = Array.isArray(gifts) ? gifts.filter(Boolean) : [];

  return [...list].sort((left, right) => {
    const bySale = Number(giftOnSale(right)) - Number(giftOnSale(left));

    if (bySale !== 0) {
      return bySale;
    }

    const byStars = giftStars(left) - giftStars(right);

    if (byStars !== 0) {
      return byStars;
    }

    return giftTitle(left).localeCompare(giftTitle(right), 'ru')
      || compareGiftIds(giftIdText(left), giftIdText(right));
  });
}

/** Поиск по каталогу: название и id, без учёта регистра. Пустой запрос — весь каталог. */
export function filterGiftCatalog(gifts, query) {
  const list = Array.isArray(gifts) ? gifts : [];
  const needle = String(query || '').trim().toLowerCase();

  if (!needle) {
    return list;
  }

  return list.filter(gift => (
    giftTitle(gift).toLowerCase().includes(needle) || giftIdText(gift).includes(needle)
  ));
}

/**
 * Сколько таких подарков лежит на аккаунте юзербота.
 *
 * Подарки аккаунта («есть на аккаунте» в пикере) приходят с сервера схлопнутыми
 * по id и с числом полученных штук в `count` (`aggregateSavedGifts` в
 * `server/giftsApi.js`): один и тот же подарок можно получить несколько раз.
 */
export function giftOwnedCount(gift) {
  return Math.max(0, Math.round(numberOr(gift?.count)));
}

/**
 * Карта «id подарка → сколько штук на аккаунте юзербота».
 *
 * Нужна каталогу: сам каталог подарков про аккаунт ничего не знает, а пометить
 * карточку значком «есть на аккаунте ×N» нужно. Считается один раз на список
 * (в пикере — через `useMemo`), а не в каждой карточке.
 *
 * Числа складываются, а не перезаписываются: сервер отдаёт список уже схлопнутым
 * (`count` у каждого подарка), но если придут записи по штуке на подарок, сумма
 * даст то же самое.
 */
export function ownedGiftCounts(gifts) {
  const counts = new Map();

  for (const gift of Array.isArray(gifts) ? gifts : []) {
    const id = giftIdText(gift);

    if (!id) {
      continue;
    }

    counts.set(id, (counts.get(id) || 0) + Math.max(1, giftOwnedCount(gift)));
  }

  return counts;
}
