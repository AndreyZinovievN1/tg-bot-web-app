import { FiArrowLeft } from 'react-icons/fi';
import TelegramStar from '../common/TelegramStar.jsx';
import { useTranslation } from '../../i18n/I18nContext.js';
import { buildCasePrizes, findGift } from '../../utils/casePrizes.js';
import { caseDescription, caseTitle } from '../../utils/caseText.js';
import { formatNumber } from '../../utils/formatters.js';
import CasePrizeSlot from './CasePrizeSlot.jsx';

/**
 * Детальная страница кейса: арт, состав капсулы и кнопки действий.
 *
 * Страница листается внутри `CasesScreen` (своего роутера у мини-аппа нет):
 * карточка рейки шлёт сюда `caseId`, а «назад» возвращает рейку. Слоты строятся
 * из `contents` каталога (`buildCasePrizes`), поэтому состав на экране — ровно
 * то, что разыгрывает сервер. Подарок Telegram рисуется Lottie-анимацией и
 * ценой в звёздах из каталога юзербота (`giftsCatalog` в bootstrap).
 */
function CaseDetail({
  balance = 0,
  caseId,
  caseTypes,
  giftsCatalog = [],
  isBuying = false,
  isLocked = false,
  onBack,
  onBuy,
  onOpen,
}) {
  const { t } = useTranslation();
  const meta = caseTypes[caseId];

  if (!meta) {
    return null;
  }

  const owned = Number(balance || 0);
  const prizes = buildCasePrizes(meta);
  const title = caseTitle(caseTypes, caseId);

  return (
    <>
      <button className="screen-back" type="button" onClick={onBack}>
        <FiArrowLeft /> {t('nav.back')}
      </button>

      {/* ===== шапка: арт кейса и что это за капсула ===== */}
      <header className="ops-hero loot-hero">
        <span className="ops-hero__grid" aria-hidden="true" />
        <span className="ops-hero__beam" aria-hidden="true" />

        <div className="ops-hero__main">
          <span className="ops-hero__eyebrow">{t('cases.detailEyebrow')}</span>
          <h1>{title}</h1>
          <p>{caseDescription(caseTypes, caseId)}</p>
        </div>

        <div className="case-detail__art">
          {meta.image ? <img alt="" decoding="async" src={meta.image} /> : null}
        </div>
      </header>

      {/* ===== состав капсулы: что лежит внутри и с каким шансом ===== */}
      <section className="ops-panel loot-panel">
        <div className="ops-panel__head">
          <span className="ops-panel__label">{t('cases.contents')}</span>
          <span className="ops-panel__count">{t('cases.panelTotal', { count: prizes.length })}</span>
        </div>

        <div className="ops-panel__body">
          <div className="loot-slots">
            {prizes.map(prize => (
              <CasePrizeSlot
                gift={findGift(giftsCatalog, prize.giftId)}
                key={prize.key}
                prize={prize}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===== действия: открыть из склада или купить за звёзды ===== */}
      <div className="case-detail__actions">
        <button
          className="ops-claim case-detail__open"
          disabled={isLocked || owned <= 0}
          type="button"
          onClick={() => onOpen(caseId)}
        >
          <span className="ops-claim__sheen" aria-hidden="true" />
          {owned > 0 ? t('cases.open') : t('cases.noCases')}
        </button>

        <button
          className="case-detail__buy"
          disabled={isLocked || isBuying}
          type="button"
          onClick={() => onBuy(caseId)}
        >
          {isBuying ? (
            t('cases.invoiceLoading')
          ) : (
            <>
              <TelegramStar />
              {formatNumber(meta.stars)}
            </>
          )}
        </button>

        <span className="case-detail__stock">{t('cases.featuredStock', { count: owned })}</span>
      </div>
    </>
  );
}

export default CaseDetail;
