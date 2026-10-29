import TelegramStar from '../common/TelegramStar.jsx';
import { caseTypes as legacyCaseTypes } from '../../config/casesMeta.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { caseTitle } from '../../utils/caseText.js';
import { formatNumber } from '../../utils/formatters.js';

/**
 * Плитка кейса в сетке «рейки» — ровно две колонки на экран.
 *
 * Вся плитка кликабельна и ведёт на детальную страницу кейса: описание, состав
 * капсулы и цену покупки показывает уже она, поэтому в плитке остаются только
 * короткое название, крупный арт, запас и цена в звёздах. Такой же переход
 * работает с клавиатуры (`Tab` + `Enter`/`Space`), а `role="button"` объясняет
 * его скринридеру.
 *
 * Кейсы живут в БД, поэтому карта кейсов приходит пропом (`caseTypes`) — её
 * собирает экран из каталога bootstrap. Без пропа работает запасной вариант:
 * стартовые шесть кейсов из конфига.
 */
function CaseCard({ amount = 0, caseType, caseTypes = legacyCaseTypes, isLocked = false, onSelect }) {
  const { t } = useTranslation();
  const meta = caseTypes[caseType];

  if (!meta) {
    return null;
  }

  const owned = Number(amount || 0);
  const title = caseTitle(caseTypes, caseType);

  const selectCase = () => {
    if (!isLocked) {
      onSelect(caseType);
    }
  };

  return (
    <article
      aria-label={title}
      className={`loot-card loot-card--${meta.accent} ${owned > 0 ? 'is-stocked' : 'is-empty'}`}
      onClick={selectCase}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCase();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="loot-card__scan" aria-hidden="true" />

      <header className="loot-card__head">
        <h3 className="loot-card__title">{title}</h3>

        {owned > 0 ? (
          <span className="loot-card__stock" title={t('cases.featuredStock', { count: owned })}>
            {formatNumber(owned)}
          </span>
        ) : null}
      </header>

      <span className="loot-card__art">
        <span className="loot-card__aura" aria-hidden="true" />
        <span className="loot-card__floor" aria-hidden="true" />
        <span className="loot-card__orbit" aria-hidden="true" />
        {meta.image ? <img alt="" decoding="async" src={meta.image} /> : null}
      </span>

      <span className="loot-card__price">
        <TelegramStar />
        {formatNumber(meta.stars)}
      </span>
    </article>
  );
}

export default CaseCard;

