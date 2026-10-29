import { useEffect } from 'react';
import {
  FiAward, FiSmile, FiStar, FiLogIn, FiGrid, FiMessageCircle, FiImage,
  FiFlag, FiPlay, FiGlobe, FiMeh, FiLayers, FiBox, FiX, FiCheck, FiAlertTriangle,
} from 'react-icons/fi';
import { IoPlanet } from 'react-icons/io5';
import { useTranslation } from '../../i18n/I18nContext.js';
import { themeColor } from '../../theme/colors.js';
import { formatNumber } from '../../utils/formatters.js';
import { categoryIcon, categoryLabel, categoryText, getChartSkinUrl, itemName, previewText } from '../../utils/shop.js';

/* ---------- иконки категорий (как в маркете и инвентаре) ---------- */
const iconMap = {
  award: FiAward, smile: FiSmile, diamond: FiStar, 'log-in': FiLogIn,
  grid: FiGrid, 'message-circle': FiMessageCircle, image: FiImage,
  flag: FiFlag, play: FiPlay, globe: FiGlobe, meh: FiMeh, layers: FiLayers,
  box: FiBox,
};

function CatIcon({ category }) {
  const Icon = iconMap[categoryIcon(category)] || FiBox;
  return <Icon />;
}

/* ---------- цвет превью-кнопки по эмодзи (цвета — из палитры) ---------- */
const buttonColorMap = {
  '🟥': themeColor('danger'),
  '🟩': themeColor('success'),
  '🟦': themeColor('indigo'),
};

function resolveButtonColor(colorName) {
  return buttonColorMap[colorName] || themeColor('indigo');
}

/* ---------- крупное превью товара: скин, эмодзи, буква или кнопка ---------- */
function ItemHero({ item }) {
  const skinUrl = getChartSkinUrl(item);
  const text = previewText(item);

  return (
    <div className="purchase-hero">
      <span className="purchase-hero__grid" aria-hidden="true" />
      <span className="purchase-hero__tag" aria-hidden="true"><CatIcon category={item.category} /></span>

      {skinUrl ? (
        <img src={skinUrl} alt={itemName(item)} decoding="async" loading="lazy" />
      ) : item.category === 'buttons' ? (
        <span
          className="purchase-hero__btn"
          style={{ background: resolveButtonColor(item.text_m) }}
        >
          START
        </span>
      ) : item.category === 'emojis' || item.category === 'premium_emojis' ? (
        <span className="purchase-hero__emoji">{text}</span>
      ) : (
        <span className="purchase-hero__letter">{text}</span>
      )}
    </div>
  );
}

function PurchaseSheet({ busy, item, user, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const balance = Number(user.starcoins || 0);
  const price = Number(item.price || 0);
  const enough = balance >= price;
  const after = balance - price;

  // Esc закрывает окно — как в шторке предмета инвентаря.
  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !busy) onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel]);

  const requestClose = () => {
    if (!busy) onCancel();
  };

  return (
    <div className="sheet-backdrop purchase-backdrop" role="presentation" onClick={requestClose}>
      <div
        aria-label={t('purchase.title')}
        aria-modal="true"
        className={`purchase-sheet${enough ? '' : ' is-short'}`}
        role="dialog"
        onClick={event => event.stopPropagation()}
      >
        <span className="purchase-sheet__glow" aria-hidden="true" />
        <span className="sheet-handle" />

        <div className="purchase-sheet__head">
          <span className="purchase-sheet__eyebrow">{t('purchase.title')}</span>
          <button
            aria-label={t('purchase.cancel')}
            className="purchase-sheet__close"
            title={t('purchase.cancel')}
            type="button"
            onClick={requestClose}
          >
            <FiX />
          </button>
        </div>

        <ItemHero item={item} />

        <div className="purchase-sheet__intro">
          <h2>{itemName(item)}</h2>
          <span>{categoryText(item.category)}</span>
        </div>

        <p className="purchase-sheet__text">{t('purchase.text')}</p>

        <div className="purchase-summary">
          <div className="purchase-summary__row">
            <span className="purchase-summary__label">{t('purchase.category')}</span>
            <span className="purchase-summary__value purchase-summary__value--icon">
              <CatIcon category={item.category} />
              {categoryLabel(item.category)}
            </span>
          </div>

          <div className="purchase-summary__row">
            <span className="purchase-summary__label">{t('purchase.price')}</span>
            <span className="purchase-summary__value purchase-summary__value--coin">
              <IoPlanet /> {formatNumber(price)}
            </span>
          </div>

          <div className="purchase-summary__row">
            <span className="purchase-summary__label">{t('purchase.balance')}</span>
            <span className="purchase-summary__value purchase-summary__value--coin">
              <IoPlanet /> {formatNumber(balance)}
            </span>
          </div>

          <div className={`purchase-summary__row purchase-summary__row--total${enough ? ' is-ok' : ' is-short'}`}>
            <span className="purchase-summary__label">{t('purchase.after')}</span>
            <span className="purchase-summary__value purchase-summary__value--coin">
              <IoPlanet /> {formatNumber(after)}
            </span>
          </div>
        </div>

        {!enough && (
          <div className="purchase-alert" role="alert">
            <FiAlertTriangle />
            <span>{t('purchase.notEnough')}</span>
          </div>
        )}

        <div className="sheet-actions">
          <button
            className="purchase-btn purchase-btn--ghost"
            disabled={busy}
            type="button"
            onClick={requestClose}
          >
            <FiX />
            {t('purchase.cancel')}
          </button>

          <button
            className="purchase-btn purchase-btn--buy"
            disabled={!enough || busy}
            type="button"
            onClick={onConfirm}
          >
            {!busy && <span className="purchase-btn__sheen" aria-hidden="true" />}
            {busy ? t('purchase.buying') : <><FiCheck /> {t('purchase.confirm')}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PurchaseSheet;

