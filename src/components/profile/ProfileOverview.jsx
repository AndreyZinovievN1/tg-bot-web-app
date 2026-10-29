import { ImCoinDollar } from 'react-icons/im';
import { IoPlanet } from 'react-icons/io5';
import { LuBanana } from 'react-icons/lu';
import { FiGift, FiMessageSquare, FiPackage } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import { formatCompactNumber, formatNumber } from '../../utils/formatters.js';

/**
 * Кошелёк и плитки статистики в одной карточке.
 *
 * Раньше это были два разных блока (glass-карточки кошелька и плитки
 * на «холодном» фоне) — теперь одна сетка с общим стилем ячеек,
 * чтобы профиль не выглядел собранным из разных наборов.
 */
function ProfileOverview({ user, caseCount, itemCount, riseStyle }) {
  const { t } = useTranslation();

  const wallets = [
    {
      key: 'coins',
      icon: <ImCoinDollar />,
      label: t('wallet.coins'),
      value: formatCompactNumber(user.coins),
      exact: formatNumber(user.coins),
    },
    {
      key: 'banana',
      icon: <LuBanana />,
      label: t('wallet.banana'),
      value: t('wallet.bananaUnit', { value: formatCompactNumber(user.banana) }),
      exact: formatNumber(user.banana),
    },
    {
      key: 'starcoins',
      icon: <IoPlanet />,
      label: t('wallet.starcoins'),
      value: formatCompactNumber(user.starcoins),
      exact: formatNumber(user.starcoins),
    },
  ];

  const minis = [
    { key: 'messages', icon: <FiMessageSquare />, label: t('profile.statsMessages'), value: formatNumber(user.msg_count) },
    { key: 'cases', icon: <FiGift />, label: t('profile.statsCases'), value: formatNumber(caseCount) },
    { key: 'items', icon: <FiPackage />, label: t('profile.statsInventory'), value: formatNumber(itemCount) },
  ];

  return (
    <section
      aria-label={t('profile.summaryAria')}
      className="profile-overview profile-rise"
      style={riseStyle}
    >
      <div className="profile-wallets">
        {wallets.map(wallet => (
          <div className={`profile-wallet profile-wallet--${wallet.key}`} key={wallet.key}>
            <span className="profile-wallet__icon" aria-hidden="true">{wallet.icon}</span>
            <strong title={wallet.exact}>{wallet.value}</strong>
            <small>{wallet.label}</small>
          </div>
        ))}
      </div>

      <div className="profile-minis">
        {minis.map(mini => (
          <div className={`profile-mini profile-mini--${mini.key}`} key={mini.key}>
            <span className="profile-mini__icon" aria-hidden="true">{mini.icon}</span>
            <span className="profile-mini__body">
              <strong>{mini.value}</strong>
              <small>{mini.label}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ProfileOverview;
