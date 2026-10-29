import {
  FiAward,
  FiBarChart2,
  FiGrid,
  FiLogIn,
  FiMessageCircle,
  FiSmile,
  FiStar,
} from 'react-icons/fi';
import { activeLabelKeys } from '../../config/shop.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { themeRgb } from '../../theme/colors.js';
import { getChartSkinUrl, itemName } from '../../utils/shop.js';

const chipIcons = {
  title: <FiAward />,
  emoji: <FiSmile />,
  reply: <FiMessageCircle />,
  greeting: <FiLogIn />,
  button: <FiGrid />,
  chart: <FiBarChart2 />,
};

/**
 * Токены палитры (src/theme/colors.js) для ячеек оформления.
 * Цвет приходит в CSS через `--tone` — тогда рамка, подложка и иконка
 * всегда берут один и тот же оттенок, без дублирования цветов в JSX.
 */
const chipTokens = {
  title: 'accent',
  emoji: 'amber',
  reply: 'accent-2',
  greeting: 'green',
  button: 'pink',
  chart: 'danger',
};

const buttonTokens = {
  '🟥': 'danger',
  '🟩': 'success',
  '🟦': 'indigo',
};

function resolveButtonTone(colorName) {
  return buttonTokens[colorName] || 'indigo';
}

/**
 * Надетое оформление: одна строка на предмет — иконка, подпись и значение.
 * Раньше обычные чипы были «пилюлями», а эмодзи/кнопка/график — широкими
 * карточками, из-за чего блок выглядел собранным из разных наборов.
 */
function ActiveStyleChips({ activeItems }) {
  const { t } = useTranslation();

  const chips = activeLabelKeys
    .map(key => ({
      key,
      label: t(`shop.activeLabels.${key}`),
      value: activeItems?.[key] ? itemName(activeItems[key]) : '',
      icon: chipIcons[key] || <FiStar />,
      tone: chipTokens[key] || 'accent',
      item: activeItems?.[key] || null,
    }))
    .filter(chip => chip.value);

  if (chips.length === 0) {
    return <p className="profile-empty">{t('profile.styleEmpty')}</p>;
  }

  return (
    <div className="style-list">
      {chips.map(chip => (
        <div className={`style-row style-row--${chip.key}`} key={chip.key} style={{ '--tone': themeRgb(chip.tone) }}>
          <span className="style-row__icon" aria-hidden="true">{chip.icon}</span>

          <span className="style-row__body">
            <span className="style-row__label">{chip.label}</span>
            {renderValue(chip)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Значение предмета: у кнопки, графика, эмодзи и автоответа — свой вид. */
function renderValue(chip) {
  if (chip.key === 'button') {
    return (
      <span className="style-row__button" style={{ '--tone': themeRgb(resolveButtonTone(chip.item?.text_m)) }}>
        START
      </span>
    );
  }

  if (chip.key === 'chart') {
    const skinUrl = getChartSkinUrl(chip.item);

    if (!skinUrl) {
      return <span className="style-row__text">{chip.value}</span>;
    }

    return (
      <span className="style-row__chart">
        <img alt={chip.value} loading="lazy" src={skinUrl} />
      </span>
    );
  }

  if (chip.key === 'reply') {
    return <span className="style-row__text style-row__text--quote">{chip.value}</span>;
  }

  if (chip.key === 'emoji') {
    return <span className="style-row__emoji">{chip.value}</span>;
  }

  return <span className="style-row__text">{chip.value}</span>;
}

export default ActiveStyleChips;
