import { useMemo } from 'react';
import { caseTypes, giftTypes, rewardVisuals } from '../../config/casesV2.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { caseTitle, giftTitle, rewardLabel } from '../../utils/caseText.js';
const placeholderRewards = ['coins', 'starcoins', 'coins', 'vip', 'coins', 'starcoins', 'vip', 'coins'];
function CaseWheelModalV2({
  caseType,
  error,
  isOpening,
  reward,
  onClose
}) {
  const { t } = useTranslation();
  const caseMeta = caseTypes[caseType];
  const wheelItems = useMemo(() => buildWheelItems(reward), [reward]);
  if (!caseMeta) {
    return null;
  }
  return <div>
      <div role="dialog" aria-modal="true">
        <div>
          <div>
            <p>{t('cases.caseOpening')}</p>
            <h2>{caseTitle(caseTypes, caseType)}</h2>
          </div>
          <button disabled={isOpening} type="button" onClick={onClose}>
            {t('cases.close')}
          </button>
        </div>

        <div>
          <div />
          <div>
            {wheelItems.map((item, index) => <div key={`${item.id}-${index}`}>
                <span>{item.icon}</span>
              </div>)}
          </div>
          <img src={caseMeta.image} alt={caseTitle(caseTypes, caseType)} />
        </div>

        <div>
          {!reward && !error && <p>{isOpening ? t('cases.spinningShort') : t('cases.preparing')}</p>}
          {error && <>
              <span>{t('cases.failedTitle')}</span>
              <strong>{error}</strong>
              <p>{t('cases.failedTextV2')}</p>
            </>}
          {reward && <>
              <span>{rewardLabel(rewardVisuals, reward.type)}</span>
              <strong>{rewardDisplay(reward)}</strong>
              <p>{reward.description}</p>
            </>}
        </div>
      </div>
    </div>;
}
function buildWheelItems(reward) {
  const base = placeholderRewards.map((type, index) => ({
    id: `${type}-${index}`,
    ...rewardVisuals[type]
  }));
  if (!reward) {
    return base;
  }
  return base.map((item, index) => index === 2 ? {
    id: 'winner',
    ...rewardVisuals[reward.type]
  } : item);
}
function rewardDisplay(reward) {
  if (reward.type === 'gift') {
    return giftTitle(giftTypes, reward.giftCode);
  }
  return reward.title;
}
export default CaseWheelModalV2;
