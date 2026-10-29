import { ImCoinDollar } from 'react-icons/im';
import { LuBanana } from 'react-icons/lu';
import { IoPlanet } from 'react-icons/io5';
import Card from '../Card.jsx';
import { useTranslation } from '../../i18n/I18nContext.js';
import { formatCompactNumber, formatNumber } from '../../utils/formatters.js';

function WalletGrid({ user }) {
  const { t } = useTranslation();

  return (
    <div className="wallet-grid">
      <Card className="wallet-card wallet-card--coin">
        <div className="wallet-card__icon">
          <ImCoinDollar />
        </div>
        <span>{t('wallet.coins')}</span>
        <strong title={formatNumber(user.coins)}>{formatCompactNumber(user.coins)}</strong>
      </Card>
      <Card className="wallet-card wallet-card--banana">
        <div className="wallet-card__icon">
          <LuBanana />
        </div>
        <span>{t('wallet.banana')}</span>
        <strong title={formatNumber(user.banana)}>{t('wallet.bananaUnit', { value: formatCompactNumber(user.banana) })}</strong>
      </Card>
      <Card className="wallet-card wallet-card--accent">
        <div className="wallet-card__icon">
          <IoPlanet />
        </div>
        <span>{t('wallet.starcoins')}</span>
        <strong title={formatNumber(user.starcoins)}>
          {formatCompactNumber(user.starcoins)}
        </strong>
      </Card>
    </div>
  );
}

export default WalletGrid;
