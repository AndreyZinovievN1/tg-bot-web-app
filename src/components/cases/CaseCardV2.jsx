import Card from '../Card.jsx';
import { caseTypes } from '../../config/casesV2.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { caseDescription, caseTitle } from '../../utils/caseText.js';

function CaseCardV2({
  amount = 0,
  caseType,
  isBuying = false,
  onBuy,
  onOpen
}) {
  const { t } = useTranslation();
  const meta = caseTypes[caseType];
  if (!meta) {
    return null;
  }
  return <Card>
      <div>
        <img src={meta.image} alt={caseTitle(caseTypes, caseType)} decoding="async" />
        <span>{amount}</span>
      </div>

      <div>
        <div>
          <h3>{caseTitle(caseTypes, caseType)}</h3>
          <p>{caseDescription(caseTypes, caseType)}</p>
        </div>

        <div>
          <button disabled={amount <= 0} type="button" onClick={() => onOpen(caseType)}>
            {amount > 0 ? t('cases.open') : t('cases.noCases')}
          </button>
          <button disabled={isBuying} type="button" onClick={() => onBuy(caseType)}>
            {isBuying ? t('cases.invoiceSending') : `${meta.stars} Stars`}
          </button>
        </div>
      </div>
    </Card>;
}
export default CaseCardV2;
