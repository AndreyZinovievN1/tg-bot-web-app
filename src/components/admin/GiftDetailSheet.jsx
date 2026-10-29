import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaStar } from 'react-icons/fa';
import { FiCheck, FiExternalLink, FiInfo, FiX } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import { formatNumber } from '../../utils/formatters.js';
import {
  giftAnimationKey,
  giftAttributes,
  giftBackdrop,
  giftBaseTitle,
  giftIdText,
  giftIsHosted,
  giftIsSoldOut,
  giftIsUnique,
  giftIssued,
  giftOnSale,
  giftOwner,
  giftRarityText,
  giftStars,
  giftTelegramUrl,
  giftTransferStars,
  giftUniqueNum,
  giftValue,
} from '../../utils/giftCatalog.js';
import GiftArt from '../cases/GiftArt.jsx';
import GiftBackdrop from '../cases/GiftBackdrop.jsx';

/**
 * Карточка подарка Telegram — то, что открывается по нажатию на подарок в редакторе кейса.
 *
 * Владельцу нужно понимать, какой именно подарок он кладёт в кейс: подарков в
 * каталоге полторы сотни, и одно название говорит только о виде, а не о номере
 * экземпляра, редкости модели и том, у кого подарок сейчас. Поэтому карточка
 * повторяет профиль подарка из Telegram: art на подложке подарка, название с
 * номером экземпляра и строки «Коллекция», «Модель», «Узор», «Фон» с редкостью,
 * «Владелец», «Наличие», «Размещение» и «Ценность».
 *
 * Данные приходят вместе с подарком (`giftAttributes`, `giftOwner`, `giftIssued`,
 * `giftValue` в `src/utils/giftCatalog.js`), а сервер прокидывает их из юзербота:
 * подарок каталога покажет цену в звёздах и остаток серии, уникальный — владельца,
 * оценку и редкость атрибутов. Нет данных — нет и строки: карточка не рисует
 * пустые подписи.
 *
 * Кнопка «в Telegram» (значок в углу и такая же широкая кнопка внизу) открывает
 * страницу подарка в Telegram (`giftTelegramUrl`): ссылка есть только у
 * уникального подарка — это страница его экземпляра (`t.me/nft/<slug>`, `slug`
 * даёт сам Telegram). У подарка каталога `slug` не приходит вовсе, а собранная из
 * названия ссылка в Telegram не открывается (`STARGIFT_SLUG_INVALID`) — поэтому
 * кнопки у него нет, чтобы она не вела в ошибку.
 *
 * Режим выбирает вызывающий: пикер отдаёт `onPick`, и карточка становится шагом
 * выбора («Выбрать подарок»); строка наполнения открывает её без `onPick` — просто
 * посмотреть, что за подарок стоит в призе.
 */

/** Подписи строк атрибутов: ключ из `giftAttributes` → ключ словаря. */
const attributeLabels = {
  model: 'admin.cases.giftSheetModel',
  pattern: 'admin.cases.giftSheetPattern',
  backdrop: 'admin.cases.giftSheetBackdrop',
  other: 'admin.cases.giftSheetAttribute',
};

/** Строка карточки: подпись слева, значение и значок редкости справа. */
function GiftRow({ chip, label, value }) {
  return (
    <div className="gift-sheet__row">
      <span className="gift-sheet__row-label">{label}</span>

      <span className="gift-sheet__row-value">
        {value}
        {chip ? <span className="gift-sheet__chip">{chip}</span> : null}
      </span>
    </div>
  );
}

function GiftDetailSheet({ busy = false, gift, onClose, onPick, selected = false }) {
  const { t } = useTranslation();

  // Esc закрывает карточку — как в шторке предмета инвентаря.
  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!gift) {
    return null;
  }

  const unique = giftIsUnique(gift);
  const attributes = giftAttributes(gift);
  const model = attributes.find(item => item.type === 'model') || null;
  const backdrop = giftBackdrop(gift);
  const owner = giftOwner(gift);
  const hosted = giftIsHosted(gift);
  const issued = giftIssued(gift);
  const value = giftValue(gift);
  const transfer = giftTransferStars(gift);
  const url = giftTelegramUrl(gift);
  const stars = giftStars(gift);
  const onSale = giftOnSale(gift);
  const convert = Math.max(0, Math.round(Number(gift.convertStars) || 0));
  const num = giftUniqueNum(gift);
  const id = giftIdText(gift);
  // Подложка уникального подарка приходит из Telegram: центр и край дают фон
  // карточки, а цвет подписей на нём — из того же атрибута подложки.
  const heroStyle = backdrop.center
    ? { background: `linear-gradient(180deg, ${backdrop.center}, ${backdrop.edge || backdrop.center})` }
    : undefined;
  const heroTextStyle = backdrop.center && backdrop.text ? { color: backdrop.text } : undefined;

  /** Строки карточки: сначала атрибуты с редкостью, потом состояние и оценка. */
  const rows = [];

  if (unique) {
    rows.push({
      key: 'collection',
      label: t('admin.cases.giftSheetCollection'),
      value: giftBaseTitle(gift),
    });
  }

  for (const item of attributes) {
    rows.push({
      chip: giftRarityText(item.rarity),
      key: `attribute-${item.type}-${item.name}`,
      label: t(attributeLabels[item.type]),
      value: item.name,
    });
  }

  if (!unique) {
    // Подарок каталога: цена в звёздах и обмен — те же строки, что в магазине
    // подарков Telegram. Распроданная серия остаётся в каталоге с ценой, поэтому
    // её подписываем отдельно: купить подарок уже нельзя, и владелец должен
    // видеть это до выбора.
    rows.push({
      key: 'price',
      label: t('admin.cases.giftSheetPrice'),
      value: onSale
        ? <><FaStar aria-hidden="true" /> {formatNumber(stars)}</>
        : t(giftIsSoldOut(gift) ? 'admin.cases.giftSoldOut' : 'admin.cases.giftLimited'),
    });

    if (convert > 0) {
      rows.push({
        key: 'exchange',
        label: t('admin.cases.giftSheetExchange'),
        value: t('admin.cases.giftPrice', { stars: formatNumber(convert) }),
      });
    }
  }

  if (owner.text) {
    rows.push({ key: 'owner', label: t('admin.cases.giftSheetOwner'), value: owner.text });
  }

  // Подарок стоит на профиле аккаунта («hosted»), а владеет им кошелёк TON:
  // передаёт подарок владелец кошелька, а не аккаунт юзербота (`giftIsHosted`).
  // Владельцу важно знать это до выбора: такой подарок нельзя выдать призом
  // передачей с аккаунта.
  if (hosted) {
    rows.push({
      key: 'hosted',
      label: t('admin.cases.giftSheetHosted'),
      value: t('admin.cases.giftSheetHostedText'),
    });
  }

  if (issued.total > 0) {
    rows.push({
      key: 'issued',
      label: t('admin.cases.giftSheetAvailability'),
      value: t(unique ? 'admin.cases.giftSheetIssued' : 'admin.cases.giftSheetRemains', {
        issued: formatNumber(issued.issued),
        remains: formatNumber(Math.max(0, issued.total - issued.issued)),
        total: formatNumber(issued.total),
      }),
    });
  }

  if (value.amount > 0) {
    rows.push({
      key: 'value',
      label: t('admin.cases.giftSheetValue'),
      value: t('admin.cases.giftSheetValueText', {
        amount: formatNumber(value.amount),
        currency: value.currency || 'TON',
      }),
    });
  }

  if (transfer > 0) {
    rows.push({
      key: 'transfer',
      label: t('admin.cases.giftSheetTransfer'),
      value: t('admin.cases.giftPrice', { stars: formatNumber(transfer) }),
    });
  }

  if (id) {
    rows.push({ key: 'id', label: t('admin.cases.giftSheetId'), value: `#${id}` });
  }

  return createPortal(
    <div className="sheet-backdrop gift-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={t('admin.cases.giftSheetTitle')}
        aria-modal="true"
        className="gift-sheet"
        role="dialog"
        onClick={event => event.stopPropagation()}
      >
        <span className="sheet-handle" />

        <div className={`gift-sheet__hero${backdrop.center ? ' is-backdrop' : ''}`} style={heroStyle}>
          {/* Подложка подарка: цвета и узор из Telegram — те же слои, что в сетке
              пикера (`GiftBackdrop`). Идёт первым, значки и картинка лежат выше. */}
          <GiftBackdrop className="gift-backdrop gift-sheet__backdrop" gift={gift} />

          <button
            aria-label={t('admin.cases.giftSheetClose')}
            className="gift-sheet__icon gift-sheet__icon--close"
            title={t('admin.cases.giftSheetClose')}
            type="button"
            onClick={onClose}
          >
            <FiX />
          </button>

          {/* Значок профиля подарка в Telegram — как на карточке подарка в самом
              Telegram. Ссылки нет (неизвестное название) — значка нет. */}
          {url ? (
            <a
              aria-label={t('admin.cases.giftSheetOpen')}
              className="gift-sheet__icon gift-sheet__icon--info"
              href={url}
              rel="noreferrer"
              target="_blank"
              title={t('admin.cases.giftSheetOpen')}
            >
              <FiInfo />
            </a>
          ) : null}

          <GiftArt animated className="gift-sheet__art" gift={gift} giftId={giftAnimationKey(gift)} />

          <strong className="gift-sheet__title" style={heroTextStyle}>
            {giftBaseTitle(gift)}
            {unique && num > 0 ? <span>#{formatNumber(num)}</span> : null}
          </strong>

          <small className="gift-sheet__subtitle" style={heroTextStyle}>
            {model ? model.name : t(unique ? 'admin.cases.giftOnAccount' : 'admin.cases.giftSheetCatalog')}
          </small>
        </div>

        {rows.length > 0 ? (
          <div className="gift-sheet__rows">
            {rows.map(row => (
              <GiftRow chip={row.chip} key={row.key} label={row.label} value={row.value} />
            ))}
          </div>
        ) : null}

        <div className={`sheet-actions gift-sheet__actions${url ? '' : ' is-single'}`}>
          {url ? (
            <a className="gift-sheet__btn is-ghost" href={url} rel="noreferrer" target="_blank">
              <FiExternalLink />
              {t('admin.cases.giftSheetOpen')}
            </a>
          ) : null}

          {onPick ? (
            <button
              className="gift-sheet__btn is-primary"
              disabled={busy || selected}
              type="button"
              onClick={() => onPick(gift)}
            >
              {selected ? <FiCheck /> : null}
              {selected ? t('admin.cases.giftSheetPicked') : t('admin.cases.giftSheetPick')}
            </button>
          ) : (
            <button className="gift-sheet__btn is-primary" type="button" onClick={onClose}>
              {t('admin.cases.giftSheetClose')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default GiftDetailSheet;

