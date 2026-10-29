import Card from '../Card.jsx';
import ItemPreview from './ItemPreview.jsx';
import { itemName } from '../../utils/shop.js';

function MiniShopItem({ item }) {
  return (
    <Card className="mini-shop-card">
      <ItemPreview item={item} />
      <strong>{itemName(item)}</strong>
      <p>{item.price} 🪐</p>
    </Card>
  );
}

export default MiniShopItem;
