import Card from '../Card.jsx';
import { useTranslation } from '../../i18n/I18nContext.js';
import { formatCompactNumber, formatNumber } from '../../utils/formatters.js';
import saturnImg from '../../imgs/saturn.png';

function WalletGridV2({ user }) {
  const { t } = useTranslation();

  return <div>
      <Card>
        <span>{t('wallet.coins')}</span>
        <strong title={formatNumber(user.coins)}>{formatCompactNumber(user.coins)}</strong>
      </Card>
      <Card>
        <span>{t('wallet.banana')}</span>
        <strong title={formatNumber(user.banana)}>{formatCompactNumber(user.banana)}</strong>
      </Card>
      <Card>
        <span>{t('wallet.starcoins')}</span>
        <strong title={formatNumber(user.starcoins)}>
          {formatCompactNumber(user.starcoins)}
          <img src={saturnImg} alt="" />
        </strong>
      </Card>
    </div>;
}
export default WalletGridV2;
