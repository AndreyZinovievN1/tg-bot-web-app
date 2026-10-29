import { FiArrowRight } from 'react-icons/fi';
import TelegramStar from '../common/TelegramStar.jsx';
import { useTranslation } from '../../i18n/I18nContext.js';
import { caseDescription, caseTitle } from '../../utils/caseText.js';
import { caseThemeStyle } from '../../utils/caseTheme.js';

/**
 * Блок «Кейс дня» на экране кейсов.
 *
 * Повторяет подачу витринного блока: слева название и описание кейса (какие
 * задал владелец), справа — арт капсулы в кольце. Цвет фона берётся из темы
 * кейса (`theme`), поэтому каждый кейс красится в свой цвет, а не в один
 * фиолетовый, как в макете. Заголовка «Сегодня в Space» здесь нет — вместо него
 * короткий надзаголовок `cases.featuredEyebrow`.
 *
 * Какой кейс показывать, решает владелец в админке (флаг `featured`); экран
 * подставляет его картинку, название и описание сам.
 *
 * Разметку держит один `FeaturedCaseView`: приложение передаёт кнопку
 * «Открыть/Купить», админка — такую же карточку в превью без действий.
 */
function FeaturedCase({ balance = 0, caseId, caseTypes, isBuying = false, isLocked = false, onBuy, onOpen }) {
  const { t } = useTranslation();
  const meta = caseTypes?.[caseId];

  if (!meta) {
    return null;
  }

  const owned = Number(balance || 0);
  const stars = Number(meta.stars || 0);
  const canOpen = owned > 0 && !isLocked;

  return (
    <FeaturedCaseView
      accent={meta.accent}
      description={caseDescription(caseTypes, caseId)}
      eyebrow={t('cases.featuredEyebrow')}
      image={meta.image}
      theme={meta.theme}
      title={caseTitle(caseTypes, caseId)}
      footer={
        <>
          {canOpen ? (
            <button className="featured-case__cta" type="button" onClick={() => onOpen?.(caseId)}>
              <span>{t('cases.openCase')}</span>
              <FiArrowRight aria-hidden="true" />
            </button>
          ) : stars > 0 ? (
            <button
              className="featured-case__cta"
              disabled={isLocked || isBuying}
              type="button"
              onClick={() => onBuy?.(caseId)}
            >
              <span>{isBuying ? t('cases.invoiceLoading') : t('cases.buy')}</span>
              <span className="featured-case__price">
                <TelegramStar />
                {stars}
              </span>
            </button>
          ) : (
            <button className="featured-case__cta" disabled type="button">
              {t('cases.noCases')}
            </button>
          )}

          {owned > 0 ? (
            <span className="featured-case__stock">
              <span className="featured-case__stock-dot" aria-hidden="true" />
              {t('cases.featuredStock', { count: owned })}
            </span>
          ) : null}
        </>
      }
    />
  );
}

/** Одна и та же разметка блока для приложения и превью в админке. */
export function FeaturedCaseView({ accent, description, eyebrow, footer, image, theme, title }) {
  return (
    <article className="featured-case" style={caseThemeStyle(theme, accent)}>
      <span className="featured-case__grid" aria-hidden="true" />
      <span className="featured-case__ring featured-case__ring--wide" aria-hidden="true" />
      <span className="featured-case__ring featured-case__ring--tight" aria-hidden="true" />

      <div className="featured-case__body">
        {eyebrow ? <span className="featured-case__eyebrow">{eyebrow}</span> : null}
        <h3 className="featured-case__title">{title}</h3>
        {description ? <p className="featured-case__text">{description}</p> : null}
        {footer ? <div className="featured-case__actions">{footer}</div> : null}
      </div>

      <div className="featured-case__art">
        {image ? <img alt="" decoding="async" src={image} /> : null}
      </div>
    </article>
  );
}

export default FeaturedCase;
