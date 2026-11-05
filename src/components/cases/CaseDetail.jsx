import { useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
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
  onBuySpace,
  spaceStars,
  pendingSpacePurchase,
  onOpen,
  onDemo,
  onTopUp,
  speed = 'normal',
  onSpeed,
  drops,
  pendingBatch,
}) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState(pendingSpacePurchase?.caseType === caseId ? pendingSpacePurchase.quantity : 1);
  const meta = caseTypes[caseId];

  if (!meta) {
    return null;
  }

  const owned = Number(balance || 0);
  const retry = pendingBatch?.caseType === caseId && pendingBatch.quantity === quantity;
  const missing = Math.max(0, quantity - owned);
  const spaceRetry = pendingSpacePurchase?.caseType === caseId;
  const purchaseQuantity = spaceRetry ? pendingSpacePurchase.quantity : missing;
  const totalPrice = Number(meta.stars || 0) * purchaseQuantity;
  const spacePriceValid = Number.isSafeInteger(totalPrice) && totalPrice > 0;
  const spaceInsufficient = missing > 0 && !retry && spacePriceValid && spaceStars?.available && BigInt(spaceStars.balance) < BigInt(totalPrice);
  const prizes = buildCasePrizes(meta);
  const title = caseTitle(caseTypes, caseId);

  return (
    <>
      <button className="screen-back" type="button" onClick={onBack}>
        <FiArrowLeft /> {t('nav.back')}
      </button>

      {/* ===== шапка: арт кейса и что это за капсула ===== */}
      <header className="ops-hero loot-hero case-detail__hero">
        <span className="ops-hero__grid" aria-hidden="true" />
        <span className="ops-hero__beam" aria-hidden="true" />

        <div className="ops-hero__main">
          <h1>{title}</h1>
          <p>{caseDescription(caseTypes, caseId)}</p>
        </div>

        <div className="case-detail__art">
          {meta.image ? <img alt="" decoding="async" src={meta.image} /> : null}
        </div>
      </header>

      <div className="case-detail__actions">
        {(!spaceInsufficient || spaceRetry || retry || owned >= quantity) && <button className="ops-claim case-detail__open" type="button"
          disabled={isLocked || isBuying || (!(retry || owned >= quantity) && !spacePriceValid)}
          onClick={() => { if (retry || owned >= quantity) onOpen(caseId, quantity); else if (spaceInsufficient && !spaceRetry) onTopUp(); else onBuySpace(caseId, purchaseQuantity); }}>
          <span className="ops-claim__sheen" aria-hidden="true" />
          {isBuying ? t('vip.buying') : retry ? t('cases.batchRetry') : owned >= quantity ? t('cases.open') : spaceRetry ? t('cases.spaceRetry') : spaceInsufficient ? t('topUp.title') : t('cases.buyMissing', { quantity: missing, count: formatNumber(totalPrice) })}
        </button>}
        {owned >= quantity && spaceRetry && <button className="case-detail__buy" type="button"
          disabled={isLocked || isBuying || !spacePriceValid}
          onClick={() => { if (spaceInsufficient && !spaceRetry) onTopUp(); else onBuySpace(caseId, purchaseQuantity); }}>
          {spaceRetry ? t('cases.spaceRetry') : spaceInsufficient ? t('topUp.title') : t('cases.spaceBuy', { count: formatNumber(totalPrice) })}
        </button>}
        {spaceInsufficient && !spaceRetry && <div className="case-detail__shortfall" role="status">
          <p>{t('cases.spaceMissing', { count: formatNumber(Number(BigInt(totalPrice) - BigInt(spaceStars.balance))) })}</p>
          
        </div>}
        {spaceInsufficient && !spaceRetry && <button className="case-detail__wallet case-detail__topup" type="button" disabled={isLocked || isBuying} onClick={onTopUp}>{t('topUp.methodsTitle')}</button>}
        <button className="case-detail__buy" type="button" disabled={isLocked}
          onClick={() => { onDemo(caseId, quantity); }}>{t('cases.demo')}</button>
        <div className="case-detail__quantity" role="group" aria-label={t('cases.openQuantity')}>
          {[1, 2, 3, 4, 5].map(count => <button key={count} type="button" aria-pressed={quantity === count}
            disabled={isLocked || isBuying} onClick={() => setQuantity(count)}>×{count}</button>)}
        </div>
        <label className="case-playback">
          {t('cases.speed')}
          <select value={speed} disabled={isLocked} onChange={event => onSpeed(event.target.value)}>
            {['normal', 'fast', 'instant'].map(value => <option key={value} value={value}>{t('cases.speed_' + value)}</option>)}
          </select>
        </label>
        <span className="case-detail__stock">{t('cases.featuredStock', { count: owned })}</span>
      </div>
      {drops}
      {/* ===== состав капсулы: что лежит внутри и с каким шансом ===== */}
      <section className="ops-panel loot-panel">
        <div className="ops-panel__head">
          <span className="ops-panel__label">🎁 {t('cases.contents')}</span>
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
    </>
  );
}

export default CaseDetail;
