import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiCreditCard, FiStar, FiZap } from 'react-icons/fi';
import { ImCoinDollar } from 'react-icons/im';
import { IoPlanet, IoStar } from 'react-icons/io5';
import {
  TbBellOff,
  TbCrown,
  TbHeartHandshake,
  TbPalette,
  TbSparkles,
} from 'react-icons/tb';
import { apiRequest } from '../api/client.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { formatDateOnly, formatMoney, formatNumber } from '../utils/formatters.js';

/**
 * Преимущества подписки — те же пункты, что и в документации бота.
 * Порядок фиксирован, иконки живут здесь, а тексты — в словарях
 * (`vip.benefits.<key>.title` / `.text`), чтобы не дублировать их на трёх языках.
 */
const vipBenefits = [
  { key: 'status', Icon: TbCrown },
  { key: 'style', Icon: TbPalette },
  { key: 'quiet', Icon: TbBellOff },
  { key: 'commands', Icon: TbSparkles },
  { key: 'divorce', Icon: TbHeartHandshake },
];

/**
 * Раздел «VIP-подписка»: текущий статус, тарифы и оплата.
 *
 * Оплата звёздами идёт тем же путём, что и кейсы (см. `CasesScreen`): сервер
 * создаёт заказ и `createInvoiceLink`, приложение открывает счёт через
 * `WebApp.openInvoice`, а после закрытия счёта досчитывает заказ
 * `/api/payments/sync`.
 *
 * Оплата реальными деньгами (карта, СБП) идёт через Tribute: у подписок
 * Tribute нет ручки «создать счёт», поэтому приложение открывает ссылку
 * подписки из кабинета автора, а VIP включает вебхук Tribute (см.
 * `server/tributeApi.js`). Кнопка «Проверить оплату» сверяется с Tribute на
 * случай задержки вебхука.
 *
 * Срок хранится в базе бота (`vip_users`), поэтому новая покупка продлевает
 * подписку, а не сбрасывает её. Статус, срок и тарифы приходят в bootstrap
 * (`data.vip`, `data.vipPlans`, `data.tributeVip`): цены живут на сервере,
 * подделать их из приложения нельзя.
 */
function VipScreen({ data, initData, onBack, onData, onToast }) {
  const { t, tp } = useTranslation();
  const [buyingPlanId, setBuyingPlanId] = useState('');
  const [payMethod, setPayMethod] = useState('stars');
  const [tributeAwaiting, setTributeAwaiting] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const vip = data?.vip || { active: false, until: null, daysLeft: 0 };
  const plans = Array.isArray(data?.vipPlans) ? data.vipPlans : [];
  const tribute = data?.tributeVip || null;
  const cardPlans = tribute?.enabled && Array.isArray(tribute.plans) ? tribute.plans : [];
  // Оплата картой выключена или тарифов нет — звёзды остаются единственным способом.
  const activeMethod = payMethod === 'card' && cardPlans.length > 0 ? 'card' : 'stars';
  const user = data?.user || {};
  const coins = user.coins ?? 0;
  const holder = cardHolder(user) || t('vip.cardHolderFallback');

  const buyPlan = async plan => {
    if (buyingPlanId) {
      return;
    }

    setBuyingPlanId(plan.id);
    triggerHaptic('impactOccurred', 'light');

    try {
      const payload = await apiRequest('/api/vip/purchase-link', {
        method: 'POST',
        body: JSON.stringify({
          planId: plan.id,
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
                onToast(tp('vip.granted', plan.days, { days: plan.days }));
              } else {
                onToast(t('vip.paymentSyncing'));
              }
            } else if (status === 'cancelled') {
              onToast(t('vip.paymentCancelled'));
            } else if (status === 'failed') {
              onToast(t('vip.paymentFailed'));
            }
          } catch (error) {
            onToast(error.message);
          } finally {
            setBuyingPlanId('');
          }
        });
        return;
      }

      window.open(payload.invoiceLink, '_blank', 'noopener,noreferrer');
      onToast(t('vip.invoiceOpened'));
    } catch (error) {
      onToast(error.message);
    } finally {
      if (!window.Telegram?.WebApp?.openInvoice) {
        setBuyingPlanId('');
      }
    }
  };

  /**
   * Оплата картой: открываем ссылку подписки Tribute (внутри Telegram — через
   * `openLink`, иначе — новое окно). Дальше ждём вебхук и подсказываем
   * «Проверить оплату»: мини-апп при возврате из Tribute не перезагружается.
   */
  const openTributePlan = () => {
    if (!tribute?.link) {
      onToast(t('vip.cardUnavailable'));
      return;
    }

    triggerHaptic('impactOccurred', 'light');

    const webApp = window.Telegram?.WebApp;

    if (webApp?.openLink) {
      webApp.openLink(tribute.link);
    } else {
      window.open(tribute.link, '_blank', 'noopener,noreferrer');
    }

    setTributeAwaiting(true);
    onToast(t('vip.cardOpened'));
  };

  /**
   * «Проверить оплату»: сервер сверяется с Tribute и отдаёт свежий bootstrap.
   * Обычно вебхук приходит раньше, поэтому VIP уже включён — остаётся обновить экран.
   */
  const checkTributePayment = useCallback(async () => {
    if (checkingPayment) {
      return;
    }

    setCheckingPayment(true);

    try {
      const payload = await apiRequest('/api/vip/tribute/sync', { method: 'POST' }, initData);

      if (payload?.data) {
        onData(payload.data);
      }

      if (payload?.vip?.active) {
        triggerHaptic('notificationOccurred', 'success');
        onToast(t('vip.checkPaid', { date: formatDateOnly(payload.vip.until) }));
        setTributeAwaiting(false);
      } else {
        onToast(t('vip.checkNotFound'));
      }
    } catch (error) {
      onToast(error.message);
    } finally {
      setCheckingPayment(false);
    }
  }, [checkingPayment, initData, onData, onToast, t]);

  // Возврат из Tribute: экран не перезагружается, поэтому проверяем оплату,
  // когда мини-апп снова становится видимым (и по событию `activated`).
  useEffect(() => {
    if (!tributeAwaiting) {
      return undefined;
    }

    const webApp = window.Telegram?.WebApp;
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkTributePayment();
      }
    };

    document.addEventListener('visibilitychange', handleVisible);
    webApp?.onEvent?.('activated', checkTributePayment);

    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      webApp?.offEvent?.('activated', checkTributePayment);
    };
  }, [checkTributePayment, tributeAwaiting]);

  // Первый bootstrap может прийти без цен Tribute (каталог ещё не загрузился):
  // один раз перезапрашиваем данные, чтобы под тарифами появились суммы.
  const pricesRetryRef = useRef(false);
  useEffect(() => {
    if (!tribute?.enabled || tribute.pricesReady || pricesRetryRef.current) {
      return undefined;
    }

    pricesRetryRef.current = true;

    const timer = window.setTimeout(async () => {
      try {
        const payload = await apiRequest('/api/bootstrap', {}, initData);

        // В режиме тех. работ bootstrap отдаёт заглушку — её не применяем.
        if (payload?.user || payload?.vip) {
          onData(payload);
        }
      } catch {
        // Цены необязательны: тарифы работают и без них.
      }
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [tribute?.enabled, tribute?.pricesReady, initData, onData]);

  return (
    <section className="screen vip-screen">
      {/* ===== верхняя строка: возврат в профиль, имя приложения и баланс ===== */}
      <header className="vip-topbar">
        {onBack ? (
          <button
            aria-label={t('nav.back')}
            className="vip-topbar__back"
            title={t('nav.back')}
            type="button"
            onClick={onBack}
          >
            <FiArrowLeft aria-hidden="true" />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}

        <span className="vip-topbar__brand">{t('vip.topbarBrand')}</span>

        <span className="vip-topbar__coins" title={t('header.coins', { value: coins })}>
          <ImCoinDollar aria-hidden="true" />
          <span>{formatNumber(coins)}</span>
        </span>
      </header>

      {/* ===== шапка: корона, слоган и крупный заголовок раздела ===== */}
      <header className={`vip-hero ${vip.active ? 'is-active' : ''}`}>
        <span className="vip-hero__halo" aria-hidden="true" />
        <span className="vip-hero__seal" aria-hidden="true">
          <TbCrown />
        </span>

        <span className="vip-hero__tagline">{t('vip.tagline')}</span>

        <h1 className="vip-hero__title">
          <span className="vip-hero__title-brand">{t('vip.titleBrand')}</span>
          <span className="vip-hero__title-accent">{t('vip.titleAccent')}</span>
        </h1>

        <p className="vip-hero__subtitle">
          <span>{t('vip.subtitleFirst')}</span>
          <span>{t('vip.subtitleSecond')}</span>
        </p>
      </header>

      {/* ===== золотая карточка членства: наклон, блик и «звёздная» фактура ===== */}
      <div className="vip-card-stage">
        <article className={`vip-card ${vip.active ? 'is-active' : ''}`}>
          <span className="vip-card__grain" aria-hidden="true" />
          <span className="vip-card__shine" aria-hidden="true" />

          <span className="vip-card__top">
            <span className="vip-card__label">{t('vip.cardLabel')}</span>
            <IoPlanet className="vip-card__planet" aria-hidden="true" />
          </span>

          <span className="vip-card__word">{t('vip.cardWord')}</span>
          <IoStar className="vip-card__star" aria-hidden="true" />

          <span className="vip-card__bottom">
            <span className="vip-card__holder">{holder}</span>
            <span className="vip-card__state">
              {vip.active ? t('vip.cardActive') : t('vip.cardInactive')}
            </span>
          </span>
        </article>
      </div>

      {/* ===== преимущества: сразу под карточкой, до тарифов ===== */}
      <ul className="vip-perks">
        {vipBenefits.map(benefit => {
          const Icon = benefit.Icon;

          return (
            <li key={`vip-benefit-${benefit.key}`}>
              <span className="vip-perks__icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="vip-perks__body">
                <strong>{t(`vip.benefits.${benefit.key}.title`)}</strong>
                <small>{t(`vip.benefits.${benefit.key}.text`)}</small>
              </span>
            </li>
          );
        })}
      </ul>

      {/* ===== тарифы: цену и срок задаёт сервер, приложение только показывает ===== */}
      <section className="vip-plans">
        <header className="vip-plans__head">
          <h2>{t('vip.plansLabel')}</h2>
          <span>{activeMethod === 'card' ? t('vip.cardHint') : t('vip.plansHint')}</span>
        </header>

        {/* Способ оплаты показываем только когда Tribute настроен на сервере
            (`data.tributeVip.enabled`), иначе остаются звёзды. */}
        {cardPlans.length > 0 ? (
          <div aria-label={t('vip.payMethodLabel')} className="vip-pay" role="group">
            <button
              aria-pressed={activeMethod === 'stars'}
              className={`vip-pay__tab ${activeMethod === 'stars' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setPayMethod('stars')}
            >
              <FiStar aria-hidden="true" />
              {t('vip.payMethodStars')}
            </button>
            <button
              aria-pressed={activeMethod === 'card'}
              className={`vip-pay__tab ${activeMethod === 'card' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setPayMethod('card')}
            >
              <FiCreditCard aria-hidden="true" />
              {t('vip.payMethodCard')}
            </button>
          </div>
        ) : null}

        {activeMethod === 'card' ? (
          <>
            {cardPlans.map(plan => (
              <article className={`vip-plan ${plan.popular ? 'is-popular' : ''}`} key={`card-${plan.id}`}>
                {plan.popular ? <span className="vip-plan__badge">{t('vip.popular')}</span> : null}

                <span className="vip-plan__info">
                  <strong>{tp('vip.planDays', plan.days, { days: plan.days })}</strong>
                  <small>
                    {plan.price === null || plan.price === undefined
                      ? t('vip.cardRowHint')
                      : t('vip.perDayMoney', { price: formatMoney(perDayMoney(plan), tribute?.currency) })}
                  </small>
                </span>

                <button
                  className="vip-plan__buy vip-plan__buy--card"
                  type="button"
                  onClick={openTributePlan}
                >
                  <FiCreditCard aria-hidden="true" />
                  <span>
                    {plan.price === null || plan.price === undefined
                      ? t('vip.payByCard')
                      : formatMoney(plan.price, tribute?.currency)}
                  </span>
                </button>
              </article>
            ))}

            <p className="vip-pay__hint">{t('vip.cardPayHint')}</p>

            {/* После открытия Tribute подсказываем проверку: вебхук может
                прийти с задержкой, а экран не перезагружается. */}
            {tributeAwaiting ? (
              <div className="vip-awaiting">
                <span>{t('vip.cardOpened')}</span>
                <button disabled={checkingPayment} type="button" onClick={checkTributePayment}>
                  {checkingPayment ? t('vip.checkingPayment') : t('vip.checkPayment')}
                </button>
              </div>
            ) : null}
          </>
        ) : plans.length === 0 ? (
          <p className="vip-plans__empty">{t('vip.plansEmpty')}</p>
        ) : (
          plans.map(plan => (
            <article className={`vip-plan ${plan.popular ? 'is-popular' : ''}`} key={plan.id}>
              {plan.popular ? <span className="vip-plan__badge">{t('vip.popular')}</span> : null}

              <span className="vip-plan__info">
                <strong>{tp('vip.planDays', plan.days, { days: plan.days })}</strong>
                <small>{t('vip.perDay', { stars: formatNumber(perDayStars(plan)) })}</small>
              </span>

              <button
                className="vip-plan__buy"
                disabled={Boolean(buyingPlanId)}
                type="button"
                onClick={() => buyPlan(plan)}
              >
                {buyingPlanId === plan.id ? (
                  t('vip.buying')
                ) : (
                  <>
                    <FiZap aria-hidden="true" />
                    <span>{formatNumber(plan.stars)}</span>
                    <FiStar aria-hidden="true" />
                  </>
                )}
              </button>
            </article>
          ))
        )}
      </section>

      {/* ===== примечание: срок действия и правила продления ===== */}
      <p className="vip-note">
        <span>
          {vip.active
            ? `${t('vip.activeUntil', { date: formatDateOnly(vip.until) })} · ${tp('vip.daysLeft', vip.daysLeft, { days: vip.daysLeft })}`
            : t('vip.inactiveText')}
        </span>
        <span>{t('vip.note')}</span>
      </p>
    </section>
  );
}

/** Имя для карточки: юзернейм без «@», иначе первое слово имени. */
function cardHolder(user) {
  const raw = String(user?.username || user?.name || '').trim().replace(/^@+/, '');

  return raw.split(/\s+/)[0] || '';
}

/** Звёзд в день — чтобы сравнивать тарифы было проще. */
function perDayStars(plan) {
  const days = Number(plan?.days) || 0;
  const stars = Number(plan?.stars) || 0;

  return days > 0 && stars > 0 ? Math.max(1, Math.round(stars / days)) : 0;
}

/** Цена дня в валюте тарифа — подпись под сроком у тарифов за карту. */
function perDayMoney(plan) {
  const days = Number(plan?.days) || 0;
  const price = Number(plan?.price) || 0;

  return days > 0 && price > 0 ? price / days : 0;
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

export default VipScreen;
