import { useEffect, useRef, useState } from 'react';
import { FiCopy, FiExternalLink, FiX } from 'react-icons/fi';
import { caseTypes as legacyCaseTypes, giftTypes, rewardRarities, rewardVisuals } from '../../config/casesMeta.js';
import { supportUrl } from '../../config/support.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { caseTitle, giftTitle } from '../../utils/caseText.js';
import { findGift } from '../../utils/casePrizes.js';
import { giftAnimationKey, giftIdText } from '../../utils/giftCatalog.js';
import GiftArt from './GiftArt.jsx';

/**
 * Открытие кейса в стиле CS2: рейка наград разгоняется, плавно тормозит до
 * победного слота, затем идёт вспышка и карточка награды. Редкость дропа
 * (`rewardRarities`) задаёт громкость выпадения: от тихого свечения у монет до
 * лучей, ударных волн и разлёта искр у легендарного подарка.
 *
 * Всё движение считает один rAF-цикл и пишет `transform` прямо в DOM: React не
 * перерисовывается на каждом кадре, поэтому рейка идёт без рывков. Каждый слот,
 * прошедший под указателем, отбивается тактильным «тиком» — как в CS2.
 */

/** Порядок наград в рейке: редкие попадаются реже, как и в реальном дропе. */
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
/** Сколько угольков поднимается вверх у легендарного дропа. */
const EMBER_COUNT = 7;
/** Уровни, у которых в выдаче появляются лучи и световой столб. */
const RAY_TIERS = ['rare', 'epic', 'legendary'];

/** Готовая рейка: узор размножается до нужной длины один раз при загрузке. */
const reelItems = Array.from({ length: REEL_LENGTH }, (_, index) => {
  const type = reelPattern[index % PATTERN_PERIOD];

  return { key: `${type}-${index}`, ...rewardVisuals[type] };
});

/** Порядок уровней редкости: индекс в списке = число полосок в слоте. */
const RARITY_STEPS = Object.keys(rewardRarities);

/** Сколько полосок редкости рисовать в слоте: 1 у common … 5 у legendary. */
function raritySteps(tier) {
  const index = RARITY_STEPS.indexOf(tier);

  return index < 0 ? 1 : index + 1;
}

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
}) {
  const { t } = useTranslation();
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

  const rewardMeta = reward ? rewardVisuals[reward.type] : null;
  // Подарок Telegram: если сервер вернул строку наполнения (`giftId`), в медальоне
  // показываем анимацию именно этого подарка, а не общий значок приза. Уникального
  // подарка в каталоге нет — это экземпляр с аккаунта, поэтому его собираем из
  // самой награды (`giftKind`/`giftNum` кладёт сервер, см. `deliverGift`
  // в `server/caseGifts.js`).
  const revealGift = reward?.type === 'gift'
    ? (findGift(gifts, reward.giftId) || (reward.giftKind === 'unique'
      ? {
        kind: 'unique',
        id: giftIdText(reward.giftId),
        title: reward.title,
        num: Math.max(0, Math.trunc(Number(reward.giftNum) || 0)),
      }
      : null))
    : null;
  const rarityKey = rewardMeta?.tier || '';
  const rarity = rewardRarities[rarityKey] || null;
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
      reel.style.transform = `translate3d(${-offset}px, 0, 0)`;
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

    const delay = Math.max(0, MIN_SPIN_MS - (performance.now() - spinStartRef.current));
    let landStart = 0;

    const land = now => {
      if (!landStart) {
        landStart = now;
      }

      const progress = Math.min(1, (now - landStart) / LAND_MS);
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
        }
      };

      raf = requestAnimationFrame(settle);
      triggerHaptic('impactOccurred', 'heavy');
      setPhase('flash');

      flashTimer = window.setTimeout(() => {
        setPhase('reveal');
        triggerHaptic('notificationOccurred', 'success');
        onRevealRef.current?.(reward);
      }, FLASH_MS);
    };

    const waitTimer = window.setTimeout(() => {
      raf = requestAnimationFrame(land);
    }, delay);

    return () => {
      window.clearTimeout(waitTimer);
      window.clearTimeout(flashTimer);
      cancelAnimationFrame(raf);
    };
  }, [error, reward]);

  if (!caseMeta) {
    return null;
  }

  // Искры вылетают веером: углы считаем детерминированно, без случайности.
  const sparks = rarity
    ? Array.from({ length: rarity.sparks }, (_, index) => (
        <span
          className="case-reveal__spark"
          key={index}
          style={{
            '--spark-angle': `${Math.round((360 / rarity.sparks) * index + (index % 3) * 9)}deg`,
            '--spark-delay': `${(index % 4) * 55}ms`,
          }}
        />
      ))
    : null;
  // У легендарного дропа искры не только разлетаются веером, но и поднимаются вверх.
  const embers = rarityKey === 'legendary'
    ? Array.from({ length: EMBER_COUNT }, (_, index) => (
        <span
          className="case-reveal__ember"
          key={index}
          style={{
            '--ember-x': `${11 + (index * 78) / (EMBER_COUNT - 1)}%`,
            '--ember-delay': `${index * 120}ms`,
          }}
        />
      ))
    : null;
  // Редкая выдача громче обычной: столб света, вторая волна, угольки.
  const isGrand = rarityKey === 'epic' || rarityKey === 'legendary';
  const showsRays = RAY_TIERS.includes(rarityKey);

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
        className={`case-modal case-modal--${caseMeta.accent} ${rarityKey ? `tier-${rarityKey}` : ''} is-${phase}`}
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
            <span>{t('cases.caseOpening')}</span>
            <h2>{caseTitle(caseTypes, caseType)}</h2>
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

        {/* Рейка: пока едет — разгон и торможение, на выдаче уходит в фон. */}
        <div className={`case-reel ${reward ? 'is-locked' : 'is-live'} ${isRevealed ? 'is-away' : ''}`}>
          <span className="case-reel__bed" aria-hidden="true" />
          <span className="case-reel__scan" aria-hidden="true" />

          <div className="case-reel__track" ref={reelRef}>
            {reelItems.map((item, index) => {
              const isStopped = index === winnerIndex && (phase === 'flash' || phase === 'reveal');
              const meta = index === winnerIndex && rewardMeta ? rewardMeta : item;

              return (
                <div className={`case-reel__item tier-${meta.tier} ${isStopped ? 'is-winner' : ''}`} key={item.key}>
                  <span className="case-reel__icon">{meta.icon}</span>
                  <small>{meta.labelKey ? t(meta.labelKey) : meta.label}</small>
                  <span className="case-reel__tier" aria-hidden="true">
                    {Array.from({ length: raritySteps(meta.tier) }, (_, bar) => <i key={bar} />)}
                  </span>
                </div>
              );
            })}
          </div>

          <span className="case-reel__fade case-reel__fade--left" aria-hidden="true" />
          <span className="case-reel__fade case-reel__fade--right" aria-hidden="true" />
          <span className="case-reel__pointer" aria-hidden="true" />
          <span className="case-reel__ruler" aria-hidden="true" />
        </div>

        {isRevealed && reward ? (
          /* ===== награда: лучи, волна и искры зависят от редкости дропа ===== */
          <div className={`case-reveal tier-${rarityKey}`}>
            {isGrand ? <span className="case-reveal__beam" aria-hidden="true" /> : null}
            {showsRays ? <span className="case-reveal__rays" aria-hidden="true" /> : null}
            <span className="case-reveal__wave" aria-hidden="true" />
            {isGrand ? <span className="case-reveal__wave case-reveal__wave--late" aria-hidden="true" /> : null}
            {embers ? <span className="case-reveal__embers" aria-hidden="true">{embers}</span> : null}
            <span className="case-reveal__sparks" aria-hidden="true">{sparks}</span>

            <span className={`case-reveal__medal ${revealGift ? 'is-gift' : ''}`}>
              <span className="case-reveal__medal-ring" aria-hidden="true" />

              {revealGift ? (
                <GiftArt
                  animated
                  className="gift-art case-reveal__gift"
                  gift={revealGift}
                  giftId={giftAnimationKey(revealGift)}
                />
              ) : rewardMeta?.icon}
            </span>

            <span className="case-reveal__rarity">{t(rarity.labelKey)}</span>
            <strong className="case-reveal__title">{rewardDisplay(reward)}</strong>
            <p className="case-reveal__text">{reward.description}</p>

            <button className="case-reveal__cta" disabled={!canClose} type="button" onClick={onClose}>
              <span className="ops-claim__sheen" aria-hidden="true" />
              {t('cases.revealDone')}
            </button>
          </div>
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
            <p className="case-status__text">{error ? t('cases.failedText') : t('cases.openingText')}</p>

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
 * Победный слот: берём ближайший слот, до которого рейка проедет не меньше
 * `LAND_TRAVEL` пикселей, и добавляем дрожание — слот встаёт не строго по
 * центру, как в настоящей рулетке.
 */
function buildLanding(startOffset) {
  const jitter = (Math.random() - 0.5) * ITEM_WIDTH * 0.36;
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
    return giftTitle(giftTypes, reward.giftCode);
  }

  return reward.title;
}

export default CaseWheelModal;
