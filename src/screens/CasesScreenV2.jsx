import { useState } from 'react';
import { apiRequest } from '../api/client.js';
import Card from '../components/Card.jsx';
import CaseCard from '../components/cases/CaseCardV2.jsx';
import CaseWheelModal from '../components/cases/CaseWheelModalV2.jsx';
import SectionTitle from '../components/common/SectionTitle.jsx';
import WalletGrid from '../components/profile/WalletGridV2.jsx';
import { caseTypes, giftTypes } from '../config/casesV2.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { localizeReward, localizeStoredRewardTitle } from '../i18n/serverMessages.js';
import { caseShortTitle, giftTitle } from '../utils/caseText.js';
import { formatDate } from '../utils/formatters.js';
function CasesScreenV2({
  data,
  initData,
  onData,
  onToast
}) {
  const { t, tp } = useTranslation();
  const [openingCase, setOpeningCase] = useState(null);
  const [reward, setReward] = useState(null);
  const [openingError, setOpeningError] = useState('');
  const [isOpening, setIsOpening] = useState(false);
  const [buyingCase, setBuyingCase] = useState('');
  const caseBalances = data.cases || {};
  const gifts = data.gifts || [];
  const recentOpenings = data.caseOpenings || [];
  const caseOrder = ['homeless', 'standard', 'unusual', 'premium', 'spring', 'march_8th'];
  const openCase = async caseType => {
    if (isOpening || Number(caseBalances[caseType] || 0) <= 0) {
      return;
    }
    setOpeningCase(caseType);
    setReward(null);
    setOpeningError('');
    setIsOpening(true);
    try {
      const payload = await apiRequest('/api/cases/open', {
        method: 'POST',
        body: JSON.stringify({
          caseType
        })
      }, initData);
      window.setTimeout(() => {
        const localizedReward = localizeReward(payload.reward);
        setReward(localizedReward);
        onData(payload.data);
        onToast(t('cases.rewardGranted', { title: localizedReward.title }));
        setIsOpening(false);
      }, 1600);
    } catch (error) {
      setOpeningError(error.message);
      setIsOpening(false);
      onToast(error.message);
    }
  };
  const buyCase = async caseType => {
    if (buyingCase) {
      return;
    }
    setBuyingCase(caseType);
    try {
      const payload = await apiRequest('/api/cases/purchase-link', {
        method: 'POST',
        body: JSON.stringify({
          caseType,
          quantity: 1
        })
      }, initData);
      onToast(payload.delivery === 'dm' ? t('cases.invoiceSentToDm') : t('cases.invoiceCreated'));
      const synced = await syncOrder(payload.orderId, initData);
      if (synced?.order?.status === 'fulfilled') {
        onData(synced.data);
        onToast(t('cases.caseGranted', { name: caseShortTitle(caseTypes, caseType) }));
      } else {
        onToast(t('cases.afterPayment'));
      }
    } catch (error) {
      onToast(error.message);
    } finally {
      setBuyingCase('');
    }
  };
  return <section>
      <Card>
        <div>
          <p>SPACE LOOT</p>
          <h2>{t('cases.lootTitle')}</h2>
          <p>{t('cases.lootSub')}</p>
        </div>
      </Card>

      <WalletGrid user={data.user} />

      <div>
        {caseOrder.map(caseType => <CaseCard key={caseType} amount={caseBalances[caseType] || 0} caseType={caseType} isBuying={buyingCase === caseType} onBuy={buyCase} onOpen={openCase} />)}
      </div>

      {gifts.length > 0 && <>
          <SectionTitle title={t('cases.gifts')} />
          <div>
            {gifts.map(gift => <Card key={gift.gift_code}>
                <img src={giftTypes[gift.gift_code]?.image} alt={giftTitle(giftTypes, gift.gift_code)} />
                <div>
                  <strong>{giftTitle(giftTypes, gift.gift_code)}</strong>
                  <span>{tp('cases.giftAmount', gift.amount)}</span>
                </div>
              </Card>)}
          </div>
        </>}

      {recentOpenings.length > 0 && <>
          <SectionTitle title={t('cases.recent')} />
          <div>
            {recentOpenings.slice(0, 5).map(opening => <Card key={opening.id}>
                <span>{caseShortTitle(caseTypes, opening.case_type)}</span>
                <strong>{localizeStoredRewardTitle(opening.reward_title)}</strong>
                <small>{formatDate(opening.created_at)}</small>
              </Card>)}
          </div>
        </>}

      {openingCase && <CaseWheelModal caseType={openingCase} error={openingError} isOpening={isOpening} reward={reward} onClose={() => {
      if (!isOpening) {
        setOpeningCase(null);
        setReward(null);
        setOpeningError('');
      }
    }} />}
    </section>;
}
async function syncOrder(orderId, initData) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const payload = await apiRequest('/api/payments/sync', {
      method: 'POST',
      body: JSON.stringify({
        orderId
      })
    }, initData);
    if (payload.order?.status === 'fulfilled') {
      return payload;
    }
    await wait(2500);
  }
  return null;
}
function wait(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}
export default CasesScreenV2;
