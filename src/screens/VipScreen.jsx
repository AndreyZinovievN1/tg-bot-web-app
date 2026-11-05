import { useRef, useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
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
import { formatDateOnly, formatNumber } from '../utils/formatters.js';

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

function VipScreen({ data, initData, onBack, onData, onToast, onTopUp }) {
  const { t, tp } = useTranslation();
  const [buyingPlanId, setBuyingPlanId] = useState('');
  const lock = useRef(false);
  const requestKey = `space-vip-purchase:${data.user?.chat_id}`;
  const [pending, setPending] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(requestKey)); } catch { return null; }
  });
  const vip = data?.vip || { active: false, until: null, daysLeft: 0 };
  const plans = Array.isArray(data?.vipPlans) ? data.vipPlans : [];
  const user = data?.user || {};
  const coins = user.coins ?? 0;
  const holder = cardHolder(user) || t('vip.cardHolderFallback');

  const buyPlan = async plan => {
    if (data.spaceStars?.balance != null && BigInt(data.spaceStars.balance) < BigInt(plan.stars)) { return; }
    if (lock.current || !data.spaceStars?.vipPurchasesEnabled) return;
    if (pending && pending.planId !== plan.id) { onToast(t('vip.spaceRetryFirst')); return; }
    lock.current = true; setBuyingPlanId(plan.id);
    let purchased = false;
    try {
      const request = pending || { planId:plan.id, requestId:crypto.randomUUID() };
      sessionStorage.setItem(requestKey, JSON.stringify(request)); setPending(request);
      await apiRequest('/api/space-stars/vip/purchase', { method:'POST', body:JSON.stringify(request) }, initData);
      purchased = true;
      const refreshed = await apiRequest('/api/bootstrap', {}, initData);
      onData(refreshed);
      sessionStorage.removeItem(requestKey); setPending(null);
      triggerHaptic('notificationOccurred', 'success');
      onToast(tp('vip.granted', plan.days, { days:plan.days }));
    } catch (error) {
      if (!purchased && (error.status === 400 || error.status === 409)) { sessionStorage.removeItem(requestKey); setPending(null); }
      onToast(t(error.payload?.error === 'SPACE_STARS_INSUFFICIENT_BALANCE' ? 'cases.spaceInsufficient' : 'cases.spacePurchaseError'));
    } finally { lock.current = false; setBuyingPlanId(''); }
  };

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
          <span>{t('vip.plansHint')}</span>
        </header>

        {plans.length === 0 ? (
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
                disabled={Boolean(buyingPlanId) || !data.spaceStars?.vipPurchasesEnabled || (data.spaceStars?.balance != null && BigInt(data.spaceStars.balance) < BigInt(plan.stars))}
                type="button"
                onClick={() => buyPlan(plan)}
              >
                {t('cases.spaceBuy', { count: formatNumber(plan.stars) })}
              </button>
              {data.spaceStars?.balance != null && BigInt(data.spaceStars.balance) < BigInt(plan.stars) && <div className="vip-plan__shortfall">
                <p role="status">{t('vip.spaceMissing', { count: formatNumber(Number(BigInt(plan.stars) - BigInt(data.spaceStars.balance))) })}</p>
                <button type="button" className="vip-plan__buy" onClick={onTopUp}>{t('topUp.methodsTitle')}</button>
              </div>}
            </article>
          ))
        )}
        {!data.spaceStars?.vipPurchasesEnabled && <p>{t('vip.spaceDisabled')}</p>}
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

function triggerHaptic(method, type) {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;

  if (haptic?.[method]) {
    haptic[method](type);
  }
}

export default VipScreen;
