import { useEffect, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { caseTypes as legacyCaseTypes, rewardVisuals } from '../../config/casesMeta.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { localizeStoredRewardTitle } from '../../i18n/serverMessages.js';
import { caseShortTitle } from '../../utils/caseText.js';
import { formatDate } from '../../utils/formatters.js';
import { apiRequest } from '../../api/client.js';
import { findGift, orderCaseDrops } from '../../utils/casePrizes.js';
import GiftArt from './GiftArt.jsx';
import TelegramStar from '../common/TelegramStar.jsx';

const PER_PAGE = 5;

/**
 * Журнал открытий: строки терминала с тегом кейса, иконкой награды и датой.
 * Листается стрелками или свайпом, по пять записей на страницу.
 *
 * Тег кейса берёт название и акцент из карты `caseTypes` (каталог bootstrap):
 * открытия пишутся по коду кейса, а кейс владельца мог быть переименован или
 * выключен уже после открытия.
 */
function CaseHistory({ caseTypes = legacyCaseTypes, openings = [] }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [knownCount, setKnownCount] = useState(openings.length);
  const touchStartX = useRef(null);

  // Список вырос (пришёл новый bootstrap после открытия кейса) — журнал
  // возвращаем на первую страницу, чтобы свежая запись была видна без листания.
  // Правим состояние прямо в рендере: так React не гоняет лишний проход эффекта.
  if (openings.length !== knownCount) {
    setKnownCount(openings.length);
    setPage(0);
  }

  if (openings.length === 0) {
    return null;
  }

  const totalPages = Math.ceil(openings.length / PER_PAGE);
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = openings.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  const goTo = next => {
    setPage(Math.max(0, Math.min(next, totalPages - 1)));
  };

  const onTouchStart = event => {
    touchStartX.current = event.touches[0].clientX;
  };

  const onTouchEnd = event => {
    if (touchStartX.current === null) {
      return;
    }

    const delta = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(delta) < 40) {
      return;
    }

    if (delta < 0) {
      goTo(safePage + 1);
    } else {
      goTo(safePage - 1);
    }
  };

  return (
    <div className="loot-log">
      <div
        className="loot-log__track"
        onTouchEnd={onTouchEnd}
        onTouchStart={onTouchStart}
      >
        {pageItems.map(opening => {
          const reward = rewardVisuals[opening.reward_type];

          return (
            <div className="loot-log__row" key={opening.id}>
              <span className={`loot-log__case loot-log__case--${caseTypes[opening.case_type]?.accent || 'cyan'}`}>
                {caseShortTitle(caseTypes, opening.case_type)}
              </span>

              <div className="loot-log__info">
                <strong>{localizeStoredRewardTitle(opening.reward_title)}</strong>
                <small>{formatDate(opening.created_at)}</small>
                {opening.delivery_id ? <>
                  <small>{t('cases.delivery_' + (opening.delivery_status || 'queued'))}</small>
                  <small style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{t('cases.deliveryReference', { id: opening.delivery_id })}</small>
                </> : null}
              </div>

              <span
                aria-hidden="true"
                className={`loot-log__reward loot-log__reward--${reward?.tone || 'cyan'}`}
                title={reward ? t(reward.labelKey) : t('cases.rewardLabelFallback')}
              >
                {reward?.icon || '✦'}
              </span>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="loot-log__nav">
          <button
            className="loot-log__arrow"
            disabled={safePage === 0}
            type="button"
            onClick={() => goTo(safePage - 1)}
            aria-label={t('cases.historyPrev')}
          >
            <FiChevronLeft />
          </button>

          <div className="loot-log__dots">
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                className={`loot-log__dot ${index === safePage ? 'is-active' : ''}`}
                key={index}
                type="button"
                onClick={() => goTo(index)}
                aria-label={t('cases.historyPage', { page: index + 1 })}
              />
            ))}
          </div>

          <button
            className="loot-log__arrow"
            disabled={safePage === totalPages - 1}
            type="button"
            onClick={() => goTo(safePage + 1)}
            aria-label={t('cases.historyNext')}
          >
            <FiChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}

export default CaseHistory;

/** Anonymous read-only history feed. Demo results are never accepted as input. */
export function CaseDrops({ initData, gifts = [], refreshKey = null, caseType }) {
  const { t, tp } = useTranslation();
  const [result, setResult] = useState({ rows: [], loading: true, error: false });
  const [flipped, setFlipped] = useState({});
  const [failedAvatars, setFailedAvatars] = useState({});
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/api/cases/drops?caseType=${encodeURIComponent(caseType)}`, { signal: controller.signal }, initData)
      .then(payload => {
        if (!Array.isArray(payload.drops)) throw new Error('Invalid drops response');
        if (!controller.signal.aborted) {
          setFlipped({});
          setFailedAvatars({});
          setResult({ rows: payload.drops, loading: false, error: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ rows: [], loading: false, error: true });
      });
    return () => controller.abort();
  }, [initData, refreshKey, caseType]);
  const rows = orderCaseDrops(result.rows.filter(row => row.caseType === caseType), true, gifts);
  const details = row => {
    const gift = row.type === 'gift' ? (findGift(gifts, row.giftId) || (row.giftId ? { id: row.giftId, kind: row.giftKind } : null)) : null;
    const visual = rewardVisuals[row.type] || { icon: '✦', labelKey: 'cases.rewardLabelFallback' };
    const rawTitle = gift?.title || row.title || '';
    const title = rawTitle && !/^gift\s+\d+$/i.test(rawTitle.trim()) ? localizeStoredRewardTitle(rawTitle) : t(visual.labelKey);
    const value = gift?.stars > 0 ? <span title={t('cases.dropsCurrentValue')}><TelegramStar /> {gift.stars}</span>
      : row.type === 'vip' && row.days > 0 ? tp('cases.days', row.days)
        : row.amount > 0 ? row.amount : visual.tier ? t(`cases.rarity.${visual.tier}`) : '—';
    return { gift, visual, title, value };
  };
  return <section className="case-drops" aria-label={t('cases.drops')}>
    <div className="case-drops__head">
      <strong><svg className="case-drops__emblem" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <path d="m4 24 8-15 6 5 12-9 6 18-16 13Z" fill="#b88225" />
        <path d="m4 21 8-15 6 7L30 3l6 18-16 12Z" fill="#ffd05b" />
        <path d="m12 6 3 15 5 12L4 21Zm18-3-6 18 12 0Z" fill="#f3a92e" />
        <path d="m18 13 6 8-4 12-5-12Z" fill="#fff0ae" />
        <path d="m3 31 6 3 9 3 16-10" fill="none" stroke="#ac78ef" strokeWidth="2.5" strokeLinecap="round" />
        <path d="m36 4 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#ffe4a0" />
      </svg>{t('cases.drops')}</strong>

    </div>
    {result.loading || result.error || !rows.length ? <p role="status">
      {t(result.loading ? 'cases.dropsLoading' : result.error ? 'cases.dropsError' : 'cases.dropsEmpty')}
    </p> : <div className="case-drops__track"
      onPointerDown={event => {
        suppressClick.current = false;
        if (event.pointerType === 'mouse' && event.button === 0) dragRef.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft };
      }}
      onPointerMove={event => {
        const drag = dragRef.current;
        if (!drag) return;
        const distance = event.clientX - drag.x;
        if (Math.abs(distance) > 6) {
          suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.scrollLeft = drag.scroll - distance;
          event.preventDefault();
        }
      }}
      onPointerUp={() => { dragRef.current = null; }}
      onPointerCancel={() => { dragRef.current = null; }}
      onLostPointerCapture={() => { dragRef.current = null; }}
      onPointerLeave={() => { if (!suppressClick.current) dragRef.current = null; }}
      onDragStart={event => event.preventDefault()}
      onClickCapture={event => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }}>
      {rows.slice(0, 20).map(row => {
        const { gift, visual, title, value } = details(row);
        const isFlipped = Boolean(flipped[row.id]);
        const winnerName = row.winner?.name || t('cases.dropsPlayer');
        const avatar = /^\/api\/cases\/drop-avatar\/[a-f0-9]{48}$/.test(row.winner?.avatarUrl || '') ? row.winner.avatarUrl : '';
        return <div className="case-drops__entry" key={row.id}>
          <article className={`case-drops__item${isFlipped ? ' is-flipped' : ''}`}
            onClick={() => {
              if (!isFlipped && avatar) setFailedAvatars(previous => ({ ...previous, [avatar]: false }));
              setFlipped(previous => ({ ...previous, [row.id]: !previous[row.id] }));
            }}>
            <button type="button" className="case-drops__flip" aria-pressed={isFlipped}
              aria-label={`${title} — ${winnerName}`} />
            <div className="case-drops__rotor">
              <div className="case-drops__face case-drops__face--front" aria-hidden={isFlipped} inert={isFlipped}>
                <span className="case-drops__art">{gift ? <GiftArt animated interactive gift={gift} label={title} /> : visual.icon}</span>
                <strong className="case-drops__name" title={title}>{title}</strong>
                <span className="case-drops__value">{value}</span>
              </div>
              <div className="case-drops__face case-drops__face--back" aria-hidden={!isFlipped} inert={!isFlipped}>
                <span className="case-drops__avatar" aria-hidden="true">
                  {isFlipped && avatar && !failedAvatars[avatar]
                    ? <img src={avatar} alt="" referrerPolicy="no-referrer" decoding="async"
                      onError={() => setFailedAvatars(previous => ({ ...previous, [avatar]: true }))} />
                    : '✦'}
                </span>
                <strong title={winnerName}>{winnerName}</strong>
              </div>
            </div>
          </article><time dateTime={row.createdAt}>{formatDate(row.createdAt)}</time>
        </div>;
      })}
    </div>}
  </section>;
}
