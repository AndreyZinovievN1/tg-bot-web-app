import { FiCreditCard, FiStar, FiZap } from 'react-icons/fi';
import { ImCoinDollar } from 'react-icons/im';
import { IoPlanet } from 'react-icons/io5';
import { TbBellOff, TbCrown, TbSparkles } from 'react-icons/tb';
import { useTranslation } from '../../i18n/I18nContext.js';
import { astronPacks, coinPacks, donateSections } from '../../config/donate.js';
import { formatCompactNumber, formatDateOnly, formatMoney, formatNumber } from '../../utils/formatters.js';

/**
 * Витрина магазина: VIP, астроны и монеты.
 *
 * Пока это визуальный слой — покупки не создаются (`onDemo` показывает
 * подсказку). VIP-тарифы берутся из bootstrap (`data.vipPlans` и
 * `data.tributeVip`), поэтому цены на экране те же, что в разделе VIP.
 * Пакеты валюты лежат в `src/config/donate.js`.
 */

/** Плавный переход к блоку витрины — кнопки-«якоря» над секциями. */
function jumpTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Преимущества VIP, которые показываем плашками (тексты — из словарей). */
const vipPerks = [
  { key: 'status', Icon: TbCrown },
  { key: 'quiet', Icon: TbBellOff },
  { key: 'commands', Icon: TbSparkles },
];

/** Звёзд в день — тот же расчёт, что на экране VIP (см. `VipScreen`). */
function perDayStars(plan) {
  const days = Number(plan?.days) || 0;
  const stars = Number(plan?.stars) || 0;

  return days > 0 && stars > 0 ? Math.max(1, Math.round(stars / days)) : 0;
}

/** Метаданные валютных блоков: иконка, id секции и ключи словаря. */
const currencyMeta = {
  astrons: {
    id: 'shop-astrons',
    Icon: IoPlanet,
    labelKey: 'wallet.starcoins',
    leadKey: 'shop.donate.astronLead',
    unitKey: 'shop.donate.astronUnit',
    footKey: 'shop.donate.astronFoot',
  },
  coins: {
    id: 'shop-coins',
    Icon: ImCoinDollar,
    labelKey: 'wallet.coins',
    leadKey: 'shop.donate.coinLead',
    unitKey: 'shop.donate.coinUnit',
    footKey: 'shop.donate.coinFoot',
  },
};

/* ---------- кошелёк: астроны, монеты и статус VIP ---------- */
function DonateWallet({ user, vip }) {
  const { t } = useTranslation();

  return (
    <div className="donate-wallet">
      <div className="donate-wallet__chip donate-wallet__chip--astrons">
        <span>{t('wallet.starcoins')}</span>
        <strong>
          <IoPlanet aria-hidden="true" />
          {formatCompactNumber(user?.starcoins ?? 0)}
        </strong>
      </div>

      <div className="donate-wallet__chip donate-wallet__chip--coins">
        <span>{t('wallet.coins')}</span>
        <strong>
          <ImCoinDollar aria-hidden="true" />
          {formatCompactNumber(user?.coins ?? 0)}
        </strong>
      </div>

      <div className={`donate-wallet__chip donate-wallet__chip--vip ${vip.active ? 'is-on' : ''}`}>
        <span>VIP</span>
        <strong>
          {vip.active ? t('shop.donate.vipUntil', { date: formatDateOnly(vip.until) }) : t('vip.cardInactive')}
        </strong>
      </div>
    </div>
  );
}

/* ---------- быстрые переходы по блокам витрины ---------- */
function DonateJump() {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('shop.donate.jumpLabel')} className="donate-jump">
      {donateSections.map(section => (
        <button key={section.id} type="button" onClick={() => jumpTo(section.id)}>
          {t(section.labelKey)}
        </button>
      ))}
    </nav>
  );
}

/* ---------- способ оплаты: звёзды Telegram или карта / СБП ---------- */
function PayTabs({ method, onChange }) {
  const { t } = useTranslation();

  return (
    <div aria-label={t('vip.payMethodLabel')} className="vip-pay" role="group">
      <button
        aria-pressed={method === 'stars'}
        className={`vip-pay__tab ${method === 'stars' ? 'is-active' : ''}`}
        type="button"
        onClick={() => onChange('stars')}
      >
        <FiStar aria-hidden="true" />
        {t('vip.payMethodStars')}
      </button>

      <button
        aria-pressed={method === 'card'}
        className={`vip-pay__tab ${method === 'card' ? 'is-active' : ''}`}
        type="button"
        onClick={() => onChange('card')}
      >
        <FiCreditCard aria-hidden="true" />
        {t('vip.payMethodCard')}
      </button>
    </div>
  );
}

/* ---------- VIP: статус, преимущества и три тарифа ---------- */
function VipBlock({ data, method, onDemo }) {
  const { t, tp } = useTranslation();
  const vip = data?.vip || { active: false, until: null, daysLeft: 0 };
  const plans = Array.isArray(data?.vipPlans) ? data.vipPlans : [];
  const tribute = data?.tributeVip || null;
  const cardPlans = tribute?.enabled && Array.isArray(tribute.plans) ? tribute.plans : [];
  const isCard = method === 'card';
  // Цены картой приходят товарами Tribute: сверяем тариф по сроку в днях.
  const cardPlanFor = plan => cardPlans.find(item => Number(item.days) === Number(plan.days)) || null;

  return (
    <section className="ops-panel donate-panel donate-panel--vip" id="shop-vip">
      <div className="ops-panel__head">
        <span className="ops-panel__label">{t('shop.donate.vipLabel')}</span>
        <span className="ops-panel__count">
          <TbCrown aria-hidden="true" />
          {vip.active ? tp('vip.daysLeft', vip.daysLeft, { days: vip.daysLeft }) : t('vip.cardInactive')}
        </span>
      </div>

      <div className="ops-panel__body donate-body">
        <article className={`donate-vip ${vip.active ? 'is-active' : ''}`}>
          <span className="donate-vip__crown" aria-hidden="true">
            <TbCrown />
          </span>
          <span className="donate-vip__text">
            <strong>Space VIP</strong>
            <p>{vip.active ? t('shop.donate.vipUntil', { date: formatDateOnly(vip.until) }) : t('shop.donate.vipLead')}</p>
          </span>
          <span className={`donate-vip__state ${vip.active ? 'is-on' : ''}`}>
            {vip.active ? t('vip.cardActive') : t('vip.cardInactive')}
          </span>
        </article>

        <ul className="donate-perks">
          {vipPerks.map(perk => {
            const Icon = perk.Icon;

            return (
              <li key={`donate-perk-${perk.key}`}>
                <Icon aria-hidden="true" />
                {t(`vip.benefits.${perk.key}.title`)}
              </li>
            );
          })}
        </ul>

        <div className="vip-plans">
          {plans.length === 0 ? (
            <p className="vip-plans__empty">{t('vip.plansEmpty')}</p>
          ) : (
            plans.map(plan => {
              const cardPlan = cardPlanFor(plan);
              const cardPrice =
                cardPlan?.price === null || cardPlan?.price === undefined
                  ? null
                  : formatMoney(cardPlan.price, cardPlan.currency || tribute?.currency);

              return (
                <article className={`vip-plan ${plan.popular ? 'is-popular' : ''}`} key={plan.id}>
                  {plan.popular ? <span className="vip-plan__badge">{t('vip.popular')}</span> : null}

                  <span className="vip-plan__info">
                    <strong>{tp('vip.planDays', plan.days, { days: plan.days })}</strong>
                    <small>
                      {isCard
                        ? t('vip.cardRowHint')
                        : t('vip.perDay', { stars: formatNumber(perDayStars(plan)) })}
                    </small>
                  </span>

                  <button
                    className={`vip-plan__buy ${isCard ? 'vip-plan__buy--card' : ''}`}
                    type="button"
                    onClick={() => onDemo(t('shop.donate.demoVip', { days: plan.days }))}
                  >
                    {isCard ? <FiCreditCard aria-hidden="true" /> : <FiStar aria-hidden="true" />}
                    <span>{isCard ? cardPrice || t('vip.payByCard') : formatNumber(plan.stars)}</span>
                  </button>
                </article>
              );
            })
          )}
        </div>

        <p className="vip-pay__hint">{isCard ? t('vip.cardPayHint') : t('vip.note')}</p>
      </div>
    </section>
  );
}
/* ---------- пакеты валюты: астроны и монеты ---------- */
function CurrencyBlock({ tone, packs, balance, method, onDemo }) {
  const { t } = useTranslation();
  const meta = currencyMeta[tone];
  const Icon = meta.Icon;
  const isCard = method === 'card';

  return (
    <section className={`ops-panel donate-panel donate-panel--${tone}`} id={meta.id}>
      <div className="ops-panel__head">
        <span className="ops-panel__label">{t(meta.labelKey)}</span>
        <span className="ops-panel__count">
          <Icon aria-hidden="true" />
          {formatCompactNumber(balance)}
        </span>
      </div>

      <div className="ops-panel__body donate-body">
        <p className="donate-lead">{t(meta.leadKey)}</p>

        <div className="donate-packs">
          {packs.map(pack => (
            <article className={`donate-pack donate-pack--${tone} ${pack.popular ? 'is-popular' : ''}`} key={pack.id}>
              {pack.bonus ? <span className="donate-pack__bonus">{pack.bonus}</span> : null}

              <span className="donate-pack__icon" aria-hidden="true">
                <Icon />
              </span>
              <strong className="donate-pack__amount">{formatNumber(pack.amount)}</strong>
              <span className="donate-pack__unit">{t(meta.unitKey)}</span>

              <button
                className="donate-pack__buy"
                type="button"
                onClick={() => onDemo(t('shop.donate.demoPack', { amount: formatNumber(pack.amount) }))}
              >
                {isCard ? (
                  formatMoney(pack.rub, 'RUB')
                ) : (
                  <>
                    <FiStar aria-hidden="true" />
                    {formatNumber(pack.stars)}
                  </>
                )}
              </button>
            </article>
          ))}
        </div>

        <p className="donate-foot">
          <FiZap aria-hidden="true" />
          {t(meta.footKey)}
        </p>
      </div>
    </section>
  );
}

/**
 * Витрина магазина в сборе: кошелёк, якоря, способ оплаты и три блока покупок.
 * `onDemo` вызывается кнопками покупки — пока это подсказка вместо платежа.
 */
export default function DonatePanels({ data, method, onMethod, onDemo }) {
  const { t } = useTranslation();
  const user = data?.user || {};
  const vip = data?.vip || { active: false, until: null, daysLeft: 0 };

  return (
    <section className="donate-hub">
      <DonateWallet user={user} vip={vip} />
      <DonateJump />

      <div className="donate-method">
        <span className="donate-method__label">{t('vip.payMethodLabel')}</span>
        <PayTabs method={method} onChange={onMethod} />
        <p className="donate-method__hint">
          {method === 'card' ? t('shop.donate.cardHint') : t('shop.donate.starsHint')}
        </p>
      </div>

      <VipBlock data={data} method={method} onDemo={onDemo} />
      <CurrencyBlock tone="astrons" packs={astronPacks} balance={user.starcoins ?? 0} method={method} onDemo={onDemo} />
      <CurrencyBlock tone="coins" packs={coinPacks} balance={user.coins ?? 0} method={method} onDemo={onDemo} />

      <p className="donate-note">
        <TbSparkles aria-hidden="true" />
        <span>{t('shop.donate.note')}</span>
      </p>
    </section>
  );
}

