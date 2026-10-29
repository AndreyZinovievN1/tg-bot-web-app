import { FiAward, FiSmile, FiStar, FiLogIn, FiGrid, FiMessageCircle, FiImage, FiFlag, FiPlay, FiGlobe, FiMeh, FiLayers, FiBox } from 'react-icons/fi';
import { categoryIcon, getChartSkinUrl, itemName, previewText } from '../../utils/shop.js';

const iconComponents = {
  award: FiAward,
  smile: FiSmile,
  diamond: FiStar,
  'log-in': FiLogIn,
  grid: FiGrid,
  'message-circle': FiMessageCircle,
  image: FiImage,
  flag: FiFlag,
  play: FiPlay,
  globe: FiGlobe,
  meh: FiMeh,
  layers: FiLayers,
  box: FiBox,
};

function resolveIcon(category) {
  const iconKey = categoryIcon(category);
  const IconComponent = iconComponents[iconKey] || FiBox;
  return <IconComponent />;
}

function ItemPreview({ item }) {
  const skinUrl = getChartSkinUrl(item);

  if (skinUrl) {
    return (
      <div className="item-preview item-preview--image">
        <img src={skinUrl} alt={itemName(item)} decoding="async" loading="lazy" />
        <span>{resolveIcon(item.category)}</span>
      </div>
    );
  }

  return (
    <div className="item-preview">
      <span>{resolveIcon(item.category)}</span>
      <strong>{previewText(item)}</strong>
    </div>
  );
}

export default ItemPreview;
