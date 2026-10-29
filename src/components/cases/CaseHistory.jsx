import { useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { caseTypes as legacyCaseTypes, rewardVisuals } from '../../config/casesMeta.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { localizeStoredRewardTitle } from '../../i18n/serverMessages.js';
import { caseShortTitle } from '../../utils/caseText.js';
import { formatDate } from '../../utils/formatters.js';

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
