import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../api/client.js';
import CaseCard from '../components/cases/CaseCard.jsx';
import CaseDetail from '../components/cases/CaseDetail.jsx';
import CaseHistory, { CaseDrops } from '../components/cases/CaseHistory.jsx';
import CaseWheelModal from '../components/cases/CaseWheelModal.jsx';
import FeaturedCase from '../components/cases/FeaturedCase.jsx';
import { giftTypes } from '../config/casesMeta.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { localizeReward } from '../i18n/serverMessages.js';
import { buildCaseTypes, caseOrderFrom, groupCaseCatalog, caseCategoryTitle } from '../utils/caseCatalog.js';
import { caseShortTitle, giftTitle } from '../utils/caseText.js';
import { findGift, prizeVisual, sampleDemoReward } from '../utils/casePrizes.js';
import { giftTitle as catalogGiftTitle } from '../utils/giftCatalog.js';

/**
 * Экран кейсов в оформлении «лут-терминала»: тот же техно-каркас, что у миссий
 * (`ops-hero` / `ops-panel` с угловыми скобками), но со своей подачей —
 * шапка-терминал, рейка капсул, подарки Telegram и журнал открытий. Запас
 * виден в счётчике на каждой капсуле, отдельной сводки склада нет.
 * Таймлайн самого открытия (разгон, торможение, выдача) ведёт `CaseWheelModal`,
 * а экран только подставляет награду и разблокирует закрытие после выдачи.
 *
 * Рейка строится из каталога БД (`data.caseCatalog`): владелец сам решает, какие
 * кейсы видны и в каком они порядке (выключенные сервер в каталог не кладёт).
 * Если каталога нет — показываем стартовые шесть кейсов из
 * `src/config/casesMeta.js`, поэтому до заполнения админки экран выглядит как
 * раньше.
 */
function CasesScreen({ data, initData, onData, onToast, onTopUp }) {
  const { t, tp, locale } = useTranslation();
  const [openingCase, setOpeningCase] = useState(null);
  const [reward, setReward] = useState(null);
  const [openError, setOpenError] = useState('');
  // Сбой выдачи подарка: сервер отдаёт код обращения и просит написать в поддержку
  // (`support: true`, см. `respondCaseOpenFailure` в `server/index.js`).
  const [openIssue, setOpenIssue] = useState(null);
  const [isOpening, setIsOpening] = useState(false);
  const openingLock = useRef(false);
  const spaceRequestKey = `space-case-purchase:${data.user?.chat_id}`;
  const [pendingSpacePurchase, setPendingSpacePurchase] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(spaceRequestKey)) || null; } catch { return null; }
  });
  const [isDemo, setIsDemo] = useState(false);
  const [wheelRun, setWheelRun] = useState(0);
  const [speed, setSpeed] = useState('normal');
  const [batchRewards, setBatchRewards] = useState([]);
  const [deliveryStates, setDeliveryStates] = useState({});
  const [deliveryStatusError, setDeliveryStatusError] = useState(false);
  const [batchQuantity, setBatchQuantity] = useState(1);
  const [pendingBatch, setPendingBatch] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('space-case-batch') || 'null'); } catch { return null; }
  });
  const deliveryRequestId = batchRewards.find(item => item.deliveryId)?.deliveryRequestId;
  useEffect(() => {
    if (isDemo || !openingCase || !deliveryRequestId) return;
    const controller = new AbortController();
    let timer;
    const refresh = async () => {
      let done = false;
      try {
        const payload = await apiRequest('/api/cases/batches/' + encodeURIComponent(deliveryRequestId) + '/deliveries',
          { signal: controller.signal }, initData);
        if (!Array.isArray(payload.deliveries) || !payload.deliveries.length) throw new Error('Invalid delivery status');
        if (!controller.signal.aborted) {
          setDeliveryStates(Object.fromEntries(payload.deliveries.map(item => [item.id, item.status])));
          setDeliveryStatusError(false);
          done = payload.deliveries.every(item => item.status === 'sent');
        }
      } catch {
        if (!controller.signal.aborted) setDeliveryStatusError(true);
      }
      if (!controller.signal.aborted && !done) timer = window.setTimeout(refresh, 10000);
    };
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [isDemo, openingCase, deliveryRequestId, initData]);

  const [buyingCase, setBuyingCase] = useState('');
  // Открытый кейс на детальной странице: своего роутера у мини-аппа нет, поэтому
  // «страницу» листает сам экран — рейка → детальная и обратно по «назад».
  const [detailCase, setDetailCase] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState({});
  // Каталог пересобираем только на новом bootstrap (он приходит после каждого
  // открытия кейса и оплаты), а карта и порядок нужны всем карточкам и рулетке.
  const caseTypes = useMemo(() => buildCaseTypes(data.caseCatalog), [data.caseCatalog]);
  const caseOrder = useMemo(() => caseOrderFrom(data.caseCatalog), [data.caseCatalog]);
  const groupedCases = useMemo(
    () => groupCaseCatalog(caseOrder, caseTypes, data.caseCategories),
    [caseOrder, caseTypes, data.caseCategories],
  );
  // Кейс для блока «Кейс дня»: владелец помечает его в админке (флаг `featured`).
  const featuredCase = useMemo(
    () => Object.values(caseTypes).find(item => item?.featured)?.id || '',
    [caseTypes],
  );
  const caseBalances = data.cases || {};
  const gifts = data.gifts || [];
  // Каталог подарков юзербота: им детальная страница подписывает подарки в
  // слотах (анимация Lottie и цена в звёздах). Юзербот лежит — список пуст.
  const giftsCatalog = data.giftsCatalog || [];
  const recentOpenings = data.caseOpenings || [];

  const giftCount = gifts.reduce((sum, gift) => sum + Number(gift.amount || 0), 0);

  /** Переход на детальную страницу кейса: её рисует `CaseDetail`. */
  const showCase = caseType => {
    triggerHaptic('selectionChanged');
    setDetailCase(caseType);
  };

  const hideCase = () => setDetailCase('');

  const closeWheel = () => {
    if (!isOpening) {
      setOpeningCase(null);
      setBatchRewards([]);
      setBatchQuantity(1);
      setReward(null);
      setOpenError('');
      setOpenIssue(null);
    }
  };

  const openCase = async (caseType, quantity = 1) => {
    if (quantity > 1) return openBatch(caseType, quantity);

    if (openingLock.current || buyingCase || Number(caseBalances[caseType] || 0) <= 0) {
      return;
    }

    openingLock.current = true;
    setIsDemo(false);
    setWheelRun(value => value + 1);
    setOpeningCase(caseType);
    setReward(null);
    setOpenError('');
    setOpenIssue(null);
    setIsOpening(true);
    triggerHaptic('impactOccurred', 'medium');

    try {
      const payload = await apiRequest('/api/cases/open', {
        method: 'POST',
        body: JSON.stringify({ caseType }),
      }, initData);

      onData(payload.data);
      setReward(withGiftDetails(localizeReward(payload.reward), giftsCatalog));
    } catch (error) {
      openingLock.current = false;
      setIsOpening(false);
      setOpenError(error.message);
      setOpenIssue(caseIssueFrom(error));
      triggerHaptic('notificationOccurred', 'error');
      onToast(error.message);
    }
  };

  /** Награда показана на экране: разрешаем закрытие и напоминаем о дропе тостом. */
  const revealPrize = localizedReward => {
    openingLock.current = false;
    setIsOpening(false);
    if (!isDemo) onToast(t('cases.rewardToast', { title: localizedReward?.title || '' }));
  };

  const openDemo = (caseType, quantity = 1) => {
    if (quantity > 1) return openDemoBatch(caseType, quantity);
    if (openingLock.current || buyingCase) return;
    const simulated = sampleDemoReward(caseTypes[caseType]);
    if (!simulated) { onToast(t('cases.demoUnavailable')); return; }
    const localized = withGiftDetails(localizeReward({
      ...simulated, title: t(prizeVisual(simulated.type).labelKey),
    }), giftsCatalog);
    openingLock.current = true;
    setIsDemo(true);
    setWheelRun(value => value + 1);
    setOpeningCase(caseType);
    setOpenError('');
    setOpenIssue(null);
    setReward({ ...localized,
      title: simulated.type === 'gift' && !findGift(giftsCatalog, simulated.giftId) ? t('cases.rewards.gift') : localized.title,
      description: t('cases.demoNotice') });
    setIsOpening(true);
  };

  const prepareBatch = (caseType, quantity, demo) => {
    openingLock.current = true;
    setIsOpening(true);
    setIsDemo(demo);
    setBatchQuantity(quantity);
    setBatchRewards([]);
    setReward(null);
    setOpenError('');
    setOpenIssue(null);
    setOpeningCase(caseType);
    setWheelRun(value => value + 1);
  };

  const showBatch = rewards => {
    setBatchRewards(rewards);
  };

  const openBatch = async (caseType, quantity) => {
    if (openingLock.current || buyingCase || !Number.isInteger(quantity) || quantity < 2 || quantity > 5) return;
    if (pendingBatch && (pendingBatch.caseType !== caseType || pendingBatch.quantity !== quantity)) {
      onToast(t('cases.batchPending', pendingBatch)); return;
    }
    prepareBatch(caseType, quantity, false);
    try {
      const operation = pendingBatch || { caseType, quantity, requestId: crypto.randomUUID() };
      // Persist BEFORE any request. A lost HTTP response must reuse the same key.
      sessionStorage.setItem('space-case-batch', JSON.stringify(operation));
      setPendingBatch(operation);
      const payload = await apiRequest('/api/cases/open', {
        method: 'POST', body: JSON.stringify(operation),
      }, initData);
      if (!Array.isArray(payload.rewards) || payload.rewards.length !== quantity || !payload.data) throw new Error(t('cases.batchRetry'));
      const rewards = payload.rewards.map(item => withGiftDetails(localizeReward(item), giftsCatalog));
      onData(payload.data);
      showBatch(rewards);
      sessionStorage.removeItem('space-case-batch');
      setPendingBatch(null);
    } catch (error) {
      // Only explicit, pre-commit rejection is safe to forget; 5xx/network errors retain the key.
      if ([400, 409].includes(error.status)) {
        sessionStorage.removeItem('space-case-batch');
        setPendingBatch(null);
      }
      openingLock.current = false;
      setIsOpening(false);
      const message = error.payload?.code === 'CASE_BATCH_DATABASE_ERROR'
        ? t('cases.batchDatabaseError', { code: error.payload.incident })
        : error.message || t('cases.batchRetry');
      setOpenError(message);
      onToast(message);
    }
  };

  const openDemoBatch = (caseType, quantity) => {
    if (openingLock.current || buyingCase || !Number.isInteger(quantity) || quantity < 2 || quantity > 5) return;
    const samples = Array.from({ length: quantity }, () => sampleDemoReward(caseTypes[caseType]));
    if (samples.some(item => !item)) { onToast(t('cases.demoUnavailable')); return; }
    prepareBatch(caseType, quantity, true);
    showBatch(samples.map(item => {
      const localized = withGiftDetails(localizeReward({ ...item, title: t(prizeVisual(item.type).labelKey) }), giftsCatalog);
      return { ...localized, title: item.type === 'gift' && !findGift(giftsCatalog, item.giftId)
        ? t('cases.rewards.gift') : localized.title, description: t('cases.demoNotice') };
    }));
  };

  const buySpaceCase = async (caseType, quantity = 1) => {
    if (openingLock.current || buyingCase) return;
    if (!data.spaceStars?.casePurchasesEnabled) { onToast(t('cases.purchaseUnavailable')); return; }
    if (pendingSpacePurchase && (pendingSpacePurchase.caseType !== caseType || pendingSpacePurchase.quantity !== quantity)) {
      onToast(t('cases.spaceRetryFirst')); return;
    }
    openingLock.current = true;
    setBuyingCase(caseType);
    let purchased = false;
    try {
      const request = pendingSpacePurchase || { caseType, quantity, requestId: crypto.randomUUID() };
      sessionStorage.setItem(spaceRequestKey, JSON.stringify(request));
      setPendingSpacePurchase(request);
      await apiRequest('/api/space-stars/cases/purchase', { method: 'POST', body: JSON.stringify(request) }, initData);
      purchased = true;
      const refreshed = await apiRequest('/api/bootstrap', {}, initData);
      onData(refreshed);
      sessionStorage.removeItem(spaceRequestKey);
      setPendingSpacePurchase(null);
      onToast(t('cases.caseGranted', { name: caseShortTitle(caseTypes, caseType) }));
    } catch (error) {
      if (!purchased && (error.status === 400 || error.status === 409)) {
        sessionStorage.removeItem(spaceRequestKey); setPendingSpacePurchase(null);
      }
      onToast(t(error.payload?.error === 'SPACE_STARS_INSUFFICIENT_BALANCE' ? 'cases.spaceInsufficient' : 'cases.spacePurchaseError'));
    } finally { openingLock.current = false; setBuyingCase(''); }
  };

  // Рулетка открытия живёт над обеими страницами экрана: и над рейкой, и над
  // детальной страницей — открыть кейс можно из любой из них.
  const wheel = openingCase ? (
    <CaseWheelModal
      key={wheelRun}
      demo={isDemo}
      speed={speed}
      onRepeat={() => openDemo(openingCase, batchRewards.length || 1)}
      onRetry={!isDemo && openError && pendingBatch ? () => openBatch(pendingBatch.caseType, pendingBatch.quantity) : null}
      results={batchRewards}
      deliveryStates={deliveryStates}
      deliveryStatusError={!isDemo && deliveryStatusError && Boolean(deliveryRequestId)}
      totalResults={batchRewards.length || batchQuantity}
      drops={!isDemo ? <CaseDrops key={openingCase} caseType={openingCase} caseTypes={caseTypes} initData={initData} gifts={giftsCatalog} refreshKey={reward} /> : null}
      caseType={openingCase}
      caseTypes={caseTypes}
      error={openError}
      gifts={giftsCatalog}
      isOpening={isOpening}
      issue={openIssue}
      reward={batchRewards[0] || reward}
      onClose={() => { if (!isOpening) { setDetailCase(openingCase); closeWheel(); } }}
      onReveal={revealPrize}
    />
  ) : null;

  // ===== детальная страница кейса: состав капсулы и покупка =====
  if (detailCase && caseTypes[detailCase]) {
    return (
      <section className="screen cases-screen">
        <CaseDetail
          key={detailCase}
          drops={!openingCase ? <CaseDrops key={detailCase} caseType={detailCase} initData={initData} gifts={giftsCatalog} /> : null}
          balance={caseBalances[detailCase] || 0}
          caseId={detailCase}
          caseTypes={caseTypes}
          giftsCatalog={giftsCatalog}
          isBuying={buyingCase === detailCase}
          isLocked={Boolean(buyingCase) || isOpening}
          onBack={hideCase}
          onBuySpace={buySpaceCase}
          spaceStars={data.spaceStars}
          pendingSpacePurchase={pendingSpacePurchase}
          onOpen={openCase}
          onDemo={openDemo}
          onTopUp={onTopUp}
          speed={speed}
          onSpeed={setSpeed}
          pendingBatch={pendingBatch}
        />


        {wheel}
      </section>
    );
  }

  return (
    <section className="screen cases-screen">
      {/* ===== шапка-терминал: что это за раздел и что внутри ===== */}
      <header className="ops-hero loot-hero">
        <span className="ops-hero__grid" aria-hidden="true" />
        <span className="ops-hero__beam" aria-hidden="true" />

        <div className="ops-hero__main">
          <span className="ops-hero__eyebrow">{t('cases.heroEyebrow')}</span>
          <h1>{t('cases.heroTitle')}</h1>
          <p>{t('cases.heroSub')}</p>
        </div>
      </header>

      {/* ===== блок «Кейс дня»: кейс, выбранный владельцем в админке ===== */}
      {featuredCase ? (
        <FeaturedCase
          balance={caseBalances[featuredCase] || 0}
          caseId={featuredCase}
          caseTypes={caseTypes}
          isBuying={buyingCase === featuredCase}
          isLocked={Boolean(buyingCase) || isOpening}
          onBuy={showCase}
          onOpen={openCase}
        />
      ) : null}

      {/* ===== категории капсул: независимые раскрывающиеся панели ===== */}
      {groupedCases.map(category => {
        const collapsed = Boolean(collapsedCategories[category.id]);
        const contentId = `case-category-${category.id}`;
        return (
          <section className="ops-panel loot-panel loot-category" key={category.id}>
            <div className="ops-panel__head">
              <h2 className="ops-panel__label loot-category__title" id={`${contentId}-title`}>
                {caseCategoryTitle(category, locale, t)}
              </h2>
              <button
                aria-controls={contentId}
                aria-expanded={!collapsed}
                className="loot-category__toggle"
                onClick={() => setCollapsedCategories(previous => ({
                  ...previous,
                  [category.id]: !previous[category.id],
                }))}
                type="button"
              >
                {t(collapsed ? 'cases.expand' : 'cases.collapse')}
                <span aria-hidden="true" className="loot-category__arrow">⌃</span>
              </button>
            </div>
            <div
              aria-labelledby={`${contentId}-title`}
              className={`loot-category__content${collapsed ? ' is-collapsed' : ''}`}
              id={contentId}
              inert={collapsed}
            >
              <div className="loot-category__clip">
                <div className="ops-panel__body loot-rack">
                  {category.cases.map(caseType => (
                    <CaseCard
                      amount={caseBalances[caseType] || 0}
                      caseType={caseType}
                      caseTypes={caseTypes}
                      isLocked={Boolean(buyingCase) || isOpening}
                      key={caseType}
                      onSelect={showCase}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* ===== подарки Telegram ===== */}
      {gifts.length > 0 && (
        <section className="ops-panel loot-panel loot-gifts">
          <div className="ops-panel__head">
            <span className="ops-panel__label">{t('cases.gifts')}</span>
            <span className="ops-panel__count">{t('cases.panelTotal', { count: giftCount })}</span>
          </div>

          <div className="ops-panel__body loot-gifts__body">
            {gifts.map(gift => (
              <div className="loot-gift" key={gift.gift_code}>
                <span className="loot-gift__thumb">
                  <img alt="" decoding="async" src={giftTypes[gift.gift_code]?.image} />
                </span>

                <span className="loot-gift__body">
                  <strong>{giftTitle(giftTypes, gift.gift_code)}</strong>
                  <small>{String(gift.gift_code || '').toUpperCase()}</small>
                </span>

                <span className="ops-chip ops-chip--case">{tp('cases.giftAmount', gift.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== журнал открытий ===== */}
      {recentOpenings.length > 0 && (
        <section className="ops-panel loot-panel">
          <div className="ops-panel__head">
            <span className="ops-panel__label">{t('cases.history')}</span>
            <span className="ops-panel__count">
              {t('cases.panelTotal', { count: recentOpenings.length })}
            </span>
          </div>

          <div className="ops-panel__body">
            <CaseHistory caseTypes={caseTypes} openings={recentOpenings} />
          </div>
        </section>
      )}

      {wheel}
    </section>
  );
}

/**
 * Причина сбоя открытия для экрана: сервер вместе с ошибкой отдаёт код обращения
 * и флаг `support` (`server/caseGifts.js` + `respondCaseOpenFailure`
 * в `server/index.js`). Код показываем игроку — по нему поддержка находит лог
 * выдачи в чате кейсов, а не разбирается по скриншоту. Техническая причина
 * (`reason`) остаётся в логе и в журнале сервера: игроку она ничего не объясняет.
 * У остальных ошибок (кейс закончился, сеть) кода нет — возвращаем `null`.
 */
function caseIssueFrom(error) {
  const payload = error?.payload;

  if (!payload?.support) {
    return null;
  }

  const code = String(payload.code || '').trim();

  return code ? { code } : null;
}

/**
 * Награда-подарок в модалке открытия: сервер вместе с наградой отдаёт строку
 * наполнения (`giftId`), поэтому название берём из каталога юзербота — тогда в
 * выпадении видно тот самый подарок, который владелец выбрал в админке.
 * Каталог недоступен — остаётся подпись из словаря по коду награды.
 */
function withGiftDetails(reward, gifts) {
  const gift = reward?.type === 'gift' ? findGift(gifts, reward.giftId) : null;

  return gift ? { ...reward, title: catalogGiftTitle(gift) } : reward;
}

function triggerHaptic(method, type) {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;

  if (haptic?.[method]) {
    haptic[method](type);
  }
}

export default CasesScreen;
