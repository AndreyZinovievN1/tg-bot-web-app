import { useEffect, useRef, useState } from 'react';
import { FiCopy, FiExternalLink, FiX } from 'react-icons/fi';
import { caseTypes as legacyCaseTypes, giftTypes, rewardVisuals } from '../../config/casesMeta.js';
import { supportUrl } from '../../config/support.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { caseTitle, giftTitle } from '../../utils/caseText.js';
import { buildCasePrizes, findGift, prizeAmountText } from '../../utils/casePrizes.js';
import { giftAnimationKey, giftIdText } from '../../utils/giftCatalog.js';
import GiftArt from './GiftArt.jsx';
import GiftLottie from './GiftLottie.jsx';
import TelegramStar from '../common/TelegramStar.jsx';

/**
 * One animation timeline moves all case reels together. Each winning slot uses
 * its corresponding supplied reward; animation never chooses or grants rewards.
 */
/** Decorative fallback for legacy catalogs without contents; never used as RNG. */
const reelPattern = [
  'coins',
  'starcoins',
  'coins',
  'shop_item',
  'coins',
  'starcoins',
  'vip',
  'coins',
  'coins',
  'starcoins',
  'shop_item',
  'gift',
];

/** Геометрия рейки: ширина слота, зазор и шаг между центрами соседних слотов. */
const ITEM_WIDTH = 98;
const ITEM_GAP = 12;
const ITEM_STEP = ITEM_WIDTH + ITEM_GAP;
/**
 * Рейка конечная, но разгон по ней зацикливается: узор награды повторяется
 * каждые `PATTERN_PERIOD` слотов, поэтому сдвиг на период визуально незаметен
 * (слоты рейки не различаются по DOM, только по картинке). Длина подобрана под
 * торможение: путь разгона + `LAND_TRAVEL` + два слота справа, чтобы на
 * остановке окно не пустело. Так рейка остаётся лёгкой для отрисовки.
 */
const PATTERN_PERIOD = reelPattern.length;
const IDLE_SPAN = PATTERN_PERIOD * ITEM_STEP;
const IDLE_START = IDLE_SPAN;
const REEL_LENGTH = 60;
/** Скорость разгона (px/s), пока сервер выбирает награду. */
const IDLE_SPEED = 2100;
/** Даже мгновенный ответ сервера крутит рейку заметное время. */
const MIN_SPIN_MS = 900;
/** Торможение: длительность, минимальный путь и микро-откат «щелчка» в слот. */
const LAND_MS = 4400;
const LAND_TRAVEL = 3400;
const SETTLE_MS = 220;
const SETTLE_BACK = 7;
/** Вспышка при попадании в слот — перед карточкой награды (совпадает с CSS). */
const FLASH_MS = 380;
/** Минимальный зазор между тактильными «тиками» рейки. */
const TICK_MS = 70;
function CaseWheelModal({
  caseType,
  caseTypes = legacyCaseTypes,
  error = '',
  gifts = [],
  isOpening,
  issue = null,
  reward,
  onClose,
  onReveal,
  demo = false,
  speed = 'normal',
  onRepeat,
  drops = null,
  results = [],
  deliveryStates = {},
  deliveryStatusError = false,
  totalResults = 1,
  onRetry,
}) {
  const { t, tp } = useTranslation();
  const caseMeta = caseTypes[caseType];
  const [phase, setPhase] = useState('spin');
  const [winnerIndex, setWinnerIndex] = useState(-1);
  // Какой код обращения уже скопирован: строка вместо флага — новый сбой с новым
  // кодом сам покажет «Скопировать», без сброса состояния эффектом.
  const [copiedCode, setCopiedCode] = useState('');
  const reelRef = useRef(null);
  const spunRef = useRef(0);
  const spinStartRef = useRef(0);
  const tickRef = useRef({ slot: -1, at: 0 });
  const onRevealRef = useRef(onReveal);

  const rowCount = Math.min(5, Math.max(1, totalResults));
  const prizes = buildCasePrizes(caseMeta || {});
  const winners = results.length ? results : reward ? [reward] : [];
  const rarityKey = rewardVisuals[reward?.type]?.tier || '';
  const visual = item => rewardVisuals[item?.type] || { icon: '✦' };
  const giftFor = item => item?.type === 'gift' ? findGift(gifts, item.giftId) ||
    (item.giftId ? { id: giftIdText(item.giftId), kind: item.giftKind, num: item.giftNum, title: item.title } : null) : null;
  const art = (item, animated = false) => {
    const gift = giftFor(item);
    return gift ? animated
      ? <GiftArt animated interactive gift={gift} label={item.title || t('cases.rewards.gift')} />
      : <GiftLottie lazy playing={false} giftId={giftAnimationKey(gift)} fallback={<GiftArt interactive gift={gift} />} />
      : item?.image ? <img src={item.image} alt="" decoding="async" /> : visual(item).icon;
  };
  const value = item => {
    const gift = giftFor(item);
    if (Number(gift?.stars) > 0) return <><TelegramStar /> {gift.stars}</>;
    const amount = item?.payload?.amount ?? item?.amount;
    const days = item?.payload?.days ?? item?.days;
    if (Number(days) > 0) return tp('cases.days', days);
    if (Number(amount) > 0) return amount;
    return prizeAmountText(item || {}, tp);
  };
  const isRevealed = phase === 'reveal';
  const canClose = !isOpening;
  // Код обращения из ответа сервера: он есть только у сбоя выдачи подарка
  // (`support: true`, см. `respondCaseOpenFailure` в `server/index.js`).
  const issueCode = String(issue?.code || '').trim();
  const isCodeCopied = issueCode !== '' && copiedCode === issueCode;

  // Экранный колбэк отдаём эффекту через ref: таймлайн не должен перезапускаться.
  useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  /**
   * Копируем код обращения в буфер: поддержке его вставляют как есть, без
   * перепечатывания. Если буфер недоступен (старый вебвью), кнопка ничего не
   * ломает — код просто видно на экране.
   */
  const copyIssueCode = async () => {
    if (!navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(issueCode);
      setCopiedCode(issueCode);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch {
      // Буфер закрыт (нет разрешения) — код остаётся на экране, это не ошибка.
    }
  };

  /**
   * Таймлайн открытия: разгон → торможение до победного слота → вспышка →
   * карточка награды. Эффект перезапускается только когда приходит награда
   * (или ошибка), поэтому путь рейки не сбивается на обычных перерисовках.
   */
  useEffect(() => {
    const reel = reelRef.current;

    if (!reel) {
      return undefined;
    }

    const haptic = window.Telegram?.WebApp?.HapticFeedback;
    const paint = offset => {
      const tracks = reel.parentElement?.parentElement?.querySelectorAll('.case-reel__track') || [reel];
      for (const track of tracks) track.style.transform = 'translate3d(' + (-offset) + 'px, 0, 0)';
    };
    let raf = 0;
    let flashTimer = 0;

    // Ошибка сервера: рейка замирает, тексты объясняют, что кейс не списан.
    if (error) {
      paint(idleOffset(spunRef.current));

      return undefined;
    }

    // Награды ещё нет — держим разгон, пока сервер выбирает дроп. Сдвиг
    // зацикливается на период узора, поэтому рейка крутится бесконечно.
    const instant = speed === 'instant' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fast = speed === 'fast';
    if (instant) {
      if (!reward) return undefined;
      const timer = window.setTimeout(() => {
        setWinnerIndex(0);
        setPhase('reveal');
        onRevealRef.current?.(reward);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!reward) {
      spinStartRef.current = performance.now();
      let last = spinStartRef.current;

      const spin = now => {
        const dt = Math.min(64, now - last);
        last = now;
        spunRef.current += (IDLE_SPEED * dt) / 1000;
        paint(idleOffset(spunRef.current));
        tickReel(idleOffset(spunRef.current), now, haptic, tickRef.current);
        raf = requestAnimationFrame(spin);
      };

      raf = requestAnimationFrame(spin);

      return () => cancelAnimationFrame(raf);
    }

    // Награда пришла: считаем победный слот от текущего положения рейки.
    const start = idleOffset(spunRef.current);
    const landing = buildLanding(start);

    setWinnerIndex(landing.winnerIndex);
    setPhase('land');

    const delay = Math.max(0, (fast ? 100 : MIN_SPIN_MS) - (performance.now() - spinStartRef.current));
    let landStart = 0;

    const land = now => {
      if (!landStart) {
        landStart = now;
      }

      const progress = Math.min(1, (now - landStart) / (fast ? 900 : LAND_MS));
      const offset = start + landing.distance * easeOutSpin(progress);

      paint(offset);
      tickReel(offset, now, haptic, tickRef.current);

      if (progress < 1) {
        raf = requestAnimationFrame(land);

        return;
      }

      // Последний штрих: слот откатывается на пару пикселей, будто «щелкнул».
      const settleStart = performance.now();

      const settle = settleNow => {
        const settleProgress = Math.min(1, (settleNow - settleStart) / SETTLE_MS);

        paint(landing.target - SETTLE_BACK * easeOutSpin(settleProgress));

        if (settleProgress < 1) {
          raf = requestAnimationFrame(settle);
        } else {
          flashTimer = window.setTimeout(() => {
            setPhase('reveal');
            triggerHaptic('notificationOccurred', 'success');
            onRevealRef.current?.(reward);
          }, fast ? 120 : FLASH_MS);
        }
      };

      raf = requestAnimationFrame(settle);
      triggerHaptic('impactOccurred', 'heavy');
      setPhase('flash');
    };

    const waitTimer = window.setTimeout(() => {
      raf = requestAnimationFrame(land);
    }, delay);

    return () => {
      window.clearTimeout(waitTimer);
      window.clearTimeout(flashTimer);
      cancelAnimationFrame(raf);
    };
  }, [error, reward, speed]);

  if (!caseMeta) {
    return null;
  }

  return (
    <div
      className="modal-backdrop case-backdrop"
      role="presentation"
      onClick={() => {
        if (canClose) {
          onClose();
        }
      }}
    >
      <div
        className={`case-modal case-modal--parallel case-modal--${caseMeta.accent} ${rarityKey ? `tier-${rarityKey}` : ''} is-${phase}`}
        role="dialog"
        aria-modal="true"
        onClick={event => {
          event.stopPropagation();
        }}
      >
        <span className="case-modal__grid" aria-hidden="true" />
        <span className="case-modal__beam" aria-hidden="true" />
        {phase === 'flash' ? <span className="case-flash" aria-hidden="true" /> : null}

        <header className="case-modal__head">
          <span className="case-modal__thumb">
            <img alt="" decoding="async" src={caseMeta.image} />
          </span>

          <div className="case-modal__title">
            <span>{demo ? t('cases.demo') : t('cases.caseOpening')}</span>
            <h2>{caseTitle(caseTypes, caseType)}{totalResults > 1 ? ` · ×${totalResults}` : ''}</h2>
          </div>

          <button
            aria-label={t('cases.close')}
            className="icon-button case-modal__close"
            disabled={!canClose}
            type="button"
            onClick={onClose}
          >
            <FiX />
          </button>
        </header>

        <div className={'case-reels' + (isRevealed ? ' is-complete' : '')} aria-hidden="true" inert>
          {Array.from({ length: rowCount }, (_, rowIndex) => {
            const rowReward = winners[rowIndex];
            return <div className="case-reel" key={rowIndex}>
              <div className="case-reel__track" ref={rowIndex === 0 ? reelRef : undefined}>
                {Array.from({ length: REEL_LENGTH }, (_, index) => {
                  const stopped = index === winnerIndex && (phase === 'flash' || phase === 'reveal');
                  const item = index === winnerIndex && rowReward ? rowReward
                    : prizes.length ? prizes[(index % PATTERN_PERIOD + rowIndex * 3) % prizes.length]
                      : { type: reelPattern[(index + rowIndex) % PATTERN_PERIOD] };
                  return <div className={'case-reel__item' + (stopped ? ' is-winner' : '')} key={index}>
                    <span className="case-reel__art">{art(item)}</span>
                    <small>{item.title || t(visual(item).labelKey || 'cases.rewardLabelFallback')}</small>
                    <span className="case-reel__value">{value(item)}</span>
                  </div>;
                })}
              </div>
            </div>;
          })}
          <span className="case-reels__marker" />
        </div>

        {error && onRetry ? <button className="case-reveal__cta" type="button" onClick={onRetry}>{t('cases.batchRetry')}</button> : null}
        {isRevealed && reward ? (
          <section className="case-results" aria-live="polite">
            <h3>{demo ? t('cases.demo') + ' · ' : ''}{t('cases.yourWinnings')}</h3>
            <div className="case-batch-results">
              {winners.map((item, index) => <div className="case-batch-results__item" key={index}>
                <span>{art(item, true)}</span>
                <strong>{rewardDisplay(item)}</strong>
                <span className="case-reel__value">{value(item)}</span>
                <small>{!demo && item.deliveryId
                  ? t('cases.delivery_' + (deliveryStates[item.deliveryId] || item.deliveryStatus || 'queued'))
                  : item.description}</small>
                {!demo && item.deliveryId ? <small>{t('cases.deliveryReference', { id: item.deliveryId })}</small> : null}
              </div>)}
            </div>
            {deliveryStatusError ? <p role="status">{t('cases.deliveryStatusError')}</p> : null}
            {demo ? <button className="case-reveal__cta" disabled={!canClose} type="button" onClick={onRepeat}>{t('cases.demoAgain')}</button> : null}
            <button className="case-reveal__cta" disabled={!canClose} type="button" onClick={onClose}>
              {t('cases.openMore')}
            </button>
          </section>
        ) : (
          /* ===== статус: сканирование, торможение или ошибка открытия ===== */
          <div className={`case-status ${error ? 'is-error' : ''}`}>
            <span className="case-status__eyebrow">
              {error
                ? t('cases.failedTitle')
                : reward
                  ? t('cases.landing')
                  : isOpening
                    ? t('cases.scanning')
                    : t('cases.spinning')}
            </span>
            <strong className="case-status__title">{error || t('cases.openingTitle')}</strong>
            <p className="case-status__text">{error ? t('cases.failedText') : t(demo ? 'cases.demoNotice' : 'cases.openingText')}</p>

            {/* Сбой выдачи подарка: игрок называет поддержке код обращения, по нему
                админ находит лог в чате кейсов и выдаёт подарок руками. */}
            {error && issueCode ? (
              <div className="case-status__support">
                <span className="case-status__support-head">
                  <span className="case-status__support-icon" aria-hidden="true">🎫</span>
                  <span className="case-status__support-label">{t('cases.issueCode')}</span>
                  <code className="case-status__support-code">{issueCode}</code>
                  <button
                    className={`case-status__support-copy ${isCodeCopied ? 'is-copied' : ''}`}
                    type="button"
                    onClick={copyIssueCode}
                  >
                    <FiCopy aria-hidden="true" />
                    {isCodeCopied ? t('cases.issueCopied') : t('cases.issueCopy')}
                  </button>
                </span>

                <small className="case-status__support-hint">
                  {supportUrl ? t('cases.issueSupportText') : t('cases.issueSupportHint')}
                </small>

                {supportUrl ? (
                  <a
                    className="case-status__support-btn"
                    href={supportUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FiExternalLink aria-hidden="true" />
                    {t('cases.issueSupportAction')}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        {drops}
      </div>
    </div>
  );
}

/**
 * Торможение рейки: слоты быстро сбрасывают обороты и «доползают» к финишу.
 * Показатель степени 2.7 подобран так, чтобы скорость на входе совпала со
 * скоростью разгона — переход к докруту не читается рывком.
 */
function easeOutSpin(progress) {
  return 1 - (1 - progress) ** 2.7;
}

/**
 * Сдвиг рейки на разгоне: едем внутри одного периода узора и заворачиваем его
 * назад — лента выглядит бесконечной, а DOM остаётся коротким.
 */
function idleOffset(spun) {
  return IDLE_START + (spun % IDLE_SPAN);
}

/**
 * Победный слот после торможения и микро-отката встаёт строго по центру.
 * Позиция влияет только на анимацию, не на полученную награду.
 */
function buildLanding(startOffset) {
  const jitter = SETTLE_BACK;
  const index = Math.round((startOffset + LAND_TRAVEL) / ITEM_STEP);
  const winnerIndex = Math.max(1, Math.min(index, REEL_LENGTH - 3));
  const target = winnerIndex * ITEM_STEP + ITEM_WIDTH / 2 + jitter;

  return {
    winnerIndex,
    target,
    distance: Math.max(ITEM_STEP, target - startOffset),
  };
}

/** Тактильный «тик»: бьёт, когда под указателем сменился слот, но не чаще TICK_MS. */
function tickReel(offset, now, haptic, state) {
  const slot = Math.floor((offset + ITEM_WIDTH / 2) / ITEM_STEP);

  if (slot === state.slot) {
    return;
  }

  state.slot = slot;

  if (now - state.at < TICK_MS) {
    return;
  }

  state.at = now;

  if (haptic?.selectionChanged) {
    haptic.selectionChanged();
  }
}

function triggerHaptic(method, type) {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;

  if (haptic?.[method]) {
    haptic[method](type);
  }
}

function rewardDisplay(reward) {
  if (reward.type === 'gift') {
    return reward.title || giftTitle(giftTypes, reward.giftCode);
  }

  return reward.title;
}

export default CaseWheelModal;
