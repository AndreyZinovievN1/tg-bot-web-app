import { useMemo, useState } from 'react';
import { apiRequest } from '../api/client.js';
import CaseCard from '../components/cases/CaseCard.jsx';
import CaseDetail from '../components/cases/CaseDetail.jsx';
import CaseHistory from '../components/cases/CaseHistory.jsx';
import CaseWheelModal from '../components/cases/CaseWheelModal.jsx';
import FeaturedCase from '../components/cases/FeaturedCase.jsx';
import { giftTypes } from '../config/casesMeta.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { localizeReward } from '../i18n/serverMessages.js';
import { buildCaseTypes, caseOrderFrom } from '../utils/caseCatalog.js';
import { caseShortTitle, giftTitle } from '../utils/caseText.js';
import { findGift } from '../utils/casePrizes.js';
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
function CasesScreen({ data, initData, onData, onToast }) {
  const { t, tp } = useTranslation();
  const [openingCase, setOpeningCase] = useState(null);
  const [reward, setReward] = useState(null);
  const [openError, setOpenError] = useState('');
  // Сбой выдачи подарка: сервер отдаёт код обращения и просит написать в поддержку
  // (`support: true`, см. `respondCaseOpenFailure` в `server/index.js`).
  const [openIssue, setOpenIssue] = useState(null);
  const [isOpening, setIsOpening] = useState(false);
  const [buyingCase, setBuyingCase] = useState('');
  // Открытый кейс на детальной странице: своего роутера у мини-аппа нет, поэтому
  // «страницу» листает сам экран — рейка → детальная и обратно по «назад».
  const [detailCase, setDetailCase] = useState('');
  // Каталог пересобираем только на новом bootstrap (он приходит после каждого
  // открытия кейса и оплаты), а карта и порядок нужны всем карточкам и рулетке.
  const caseTypes = useMemo(() => buildCaseTypes(data.caseCatalog), [data.caseCatalog]);
  const caseOrder = useMemo(() => caseOrderFrom(data.caseCatalog), [data.caseCatalog]);
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
      setReward(null);
      setOpenError('');
      setOpenIssue(null);
    }
  };

  const openCase = async caseType => {

    if (isOpening || Number(caseBalances[caseType] || 0) <= 0) {
      return;
    }

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
      setIsOpening(false);
      setOpenError(error.message);
      setOpenIssue(caseIssueFrom(error));
      triggerHaptic('notificationOccurred', 'error');
      onToast(error.message);
    }
  };

  /** Награда показана на экране: разрешаем закрытие и напоминаем о дропе тостом. */
  const revealPrize = localizedReward => {
    setIsOpening(false);
    onToast(t('cases.rewardToast', { title: localizedReward?.title || '' }));
  };

  const buyCase = async caseType => {
    if (buyingCase || isOpening) {
      return;
    }

    setBuyingCase(caseType);
    triggerHaptic('impactOccurred', 'light');

    try {
      const payload = await apiRequest('/api/cases/purchase-link', {
        method: 'POST',
        body: JSON.stringify({
          caseType,
          quantity: 1,
        }),
      }, initData);

      const webApp = window.Telegram?.WebApp;

      if (webApp?.openInvoice) {
        webApp.openInvoice(payload.invoiceLink, async status => {
          try {
            if (status === 'paid') {
              const synced = await syncOrder(payload.orderId, initData);

              if (synced?.order?.status === 'fulfilled') {
                onData(synced.data);
                triggerHaptic('notificationOccurred', 'success');
                onToast(t('cases.caseGranted', { name: caseShortTitle(caseTypes, caseType) }));
              } else {
                onToast(t('cases.paymentSyncing'));
              }
            } else if (status === 'cancelled') {
              onToast(t('cases.paymentCancelled'));
            } else if (status === 'failed') {
              onToast(t('cases.paymentFailed'));
            }
          } catch (error) {
            onToast(error.message);
          } finally {
            setBuyingCase('');
          }
        });
        return;
      }

      window.open(payload.invoiceLink, '_blank', 'noopener,noreferrer');
      onToast(t('cases.invoiceOpened'));
    } catch (error) {
      onToast(error.message);
    } finally {
      if (!window.Telegram?.WebApp?.openInvoice) {
        setBuyingCase('');
      }
    }
  };

  // Рулетка открытия живёт над обеими страницами экрана: и над рейкой, и над
  // детальной страницей — открыть кейс можно из любой из них.
  const wheel = openingCase ? (
    <CaseWheelModal
      caseType={openingCase}
      caseTypes={caseTypes}
      error={openError}
      gifts={giftsCatalog}
      isOpening={isOpening}
      issue={openIssue}
      reward={reward}
      onClose={closeWheel}
      onReveal={revealPrize}
    />
  ) : null;

  // ===== детальная страница кейса: состав капсулы и покупка =====
  if (detailCase && caseTypes[detailCase]) {
    return (
      <section className="screen cases-screen">
        <CaseDetail
          balance={caseBalances[detailCase] || 0}
          caseId={detailCase}
          caseTypes={caseTypes}
          giftsCatalog={giftsCatalog}
          isBuying={buyingCase === detailCase}
          isLocked={Boolean(buyingCase) || isOpening}
          onBack={hideCase}
          onBuy={buyCase}
          onOpen={openCase}
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
          onBuy={buyCase}
          onOpen={openCase}
        />
      ) : null}

      {/* ===== рейка капсул: что можно открыть прямо сейчас ===== */}
      <section className="ops-panel loot-panel">
        <div className="ops-panel__head">
          <span className="ops-panel__label">{t('cases.available')}</span>
        </div>

        <div className="ops-panel__body loot-rack">
          {caseOrder.map(caseType => (
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
      </section>

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

async function syncOrder(orderId, initData) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = await apiRequest('/api/payments/sync', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }, initData);

    if (payload.order?.status === 'fulfilled') {
      return payload;
    }

    await wait(1400);
  }

  return null;
}

function wait(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function triggerHaptic(method, type) {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;

  if (haptic?.[method]) {
    haptic[method](type);
  }
}

export default CasesScreen;
