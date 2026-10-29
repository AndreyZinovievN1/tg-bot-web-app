import { FiHeart } from 'react-icons/fi';
import Card from '../Card.jsx';
import ItemPreview from './ItemPreview.jsx';
import { useTranslation } from '../../i18n/I18nContext.js';
import { categoryText, isEquippable, itemName } from '../../utils/shop.js';

function ShopItemCard({ busy, item, onEquip, onFavorite, onPurchase }) {
  const { t } = useTranslation();
  const canEquip = item.is_owned && isEquippable(item.category);
  const actionLabel = item.is_active
    ? t('shop.active')
    : item.is_owned
      ? t('shop.equip')
      : t('purchase.confirm');
  const disabled = busy || item.is_active || (!item.is_owned && !onPurchase);

  const handleAction = () => {
    if (item.is_active) return;
    if (canEquip) { onEquip(item); return; }
    if (onPurchase) onPurchase(item);
  };

  return (
    <Card className={`shop-card ${item.is_active ? 'is-active' : ''}`}>
      <ItemPreview item={item} />

      <div className="shop-card__content">
        <div>
          <h3>{itemName(item)}</h3>
          <p>{categoryText(item.category)}</p>
        </div>

        <div className="shop-card__row">
          <span>{item.is_owned ? t('shop.owned') : `${item.price || 0} 🪐`}</span>
          <button className="btn btn-small" disabled={disabled} type="button" onClick={handleAction}>
            {busy ? '...' : actionLabel}
          </button>
        </div>
      </div>

      <button
        className={`favorite-button ${item.is_favorite ? 'is-active' : ''}`}
        aria-label={item.is_favorite ? t('shop.favoriteRemoveFull') : t('shop.favoriteAddFull')}
        type="button"
        onClick={() => onFavorite(item)}
      >
        <FiHeart />
      </button>
    </Card>
  );
}

export default ShopItemCard;
