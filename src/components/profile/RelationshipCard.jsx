import Card from '../Card.jsx';
import { useTranslation } from '../../i18n/I18nContext.js';
import { formatMarriageDate } from '../../utils/formatters.js';

function RelationshipCard({ marriage }) {
  const { t } = useTranslation();
  const partner = marriage?.partner_name || marriage?.partner_username || marriage?.partner_chat_id;

  return (
    <Card className="relationship-card">
      <div className="relationship-card__head">
        <span>{t('marriage.relationshipLabel')}</span>
        <strong>{marriage ? t('marriage.inMarriage') : t('marriage.free')}</strong>
      </div>
      {marriage ? (
        <div className="facts-grid">
          <div className="fact">
            <span>{t('marriage.partner')}</span>
            <strong>{partner}</strong>
          </div>
          <div className="fact">
            <span>{t('marriage.togetherSince')}</span>
            <strong>{formatMarriageDate(marriage.marriage_datetime)}</strong>
          </div>
        </div>
      ) : (
        <p>{t('marriage.emptyRecord')}</p>
      )}
    </Card>
  );
}

export default RelationshipCard;
