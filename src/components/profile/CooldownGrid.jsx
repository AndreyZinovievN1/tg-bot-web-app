import { useTranslation } from '../../i18n/I18nContext.js';
import CircularCountdown from './CircularCountdown.jsx';

/** Ключи совпадают с иконками и цветами в CircularCountdown. */
const cooldownItems = [
  { key: 'banana', field: 'banana_cooldown', labelKey: 'countdown.banana', icon: 'banana' },
  { key: 'bag', field: 'bag_cooldown', labelKey: 'countdown.bag', icon: 'bag' },
  { key: 'roulette', field: 'roulette_cooldown', labelKey: 'countdown.roulette', icon: 'roulette' },
];

function CooldownGrid({ user }) {
  const { t } = useTranslation();

  return (
    <div className="cooldown-grid">
      {cooldownItems.map(item => (
        <CircularCountdown
          key={item.key}
          cooldown={user[item.field]}
          icon={item.icon}
          label={t(item.labelKey)}
        />
      ))}
    </div>
  );
}

export default CooldownGrid;

