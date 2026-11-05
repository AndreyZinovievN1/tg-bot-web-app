import { useId, useState } from 'react';
import TelegramStar from '../common/TelegramStar.jsx';
import { useTranslation } from '../../i18n/I18nContext.js';
import { prizeAmountText, prizeChanceText, prizeVisual } from '../../utils/casePrizes.js';
import { formatNumber } from '../../utils/formatters.js';
import { giftAnimationKey } from '../../utils/giftCatalog.js';
import GiftArt from './GiftArt.jsx';

/**
 * Слот приза на экране детали кейса: плитка в сетке.
 *
 * Слот показывает знак приза, название, количество и шанс. У подарка Telegram знак —
 * анимация из каталога юзербота, сверху висит цена в звёздах, снизу — шанс.
 * Название подарка сохраняется в доступной подписи изображения. Если каталог
 * недоступен, `GiftLottie` вернёт заглушку — слот не ломается без юзербота.
 */
function CasePrizeSlot({ gift = null, prize }) {
  const { t, tp } = useTranslation();
  const [showChance, setShowChance] = useState(false);
  const chanceId = useId();
  const visual = prizeVisual(prize.type);
  // Id подарка — строка цифр: пустая строка значит «без конкретного подарка».
  const isGift = prize.type === 'gift' && Boolean(prize.giftId);
  // Ключ анимации: у уникального подарка он свой (`unique-<id>`) — картинка такого
  // подарка лежит в атрибутах и отдаётся отдельной ручкой сервера.
  const animationKey = giftAnimationKey({ id: prize.giftId, kind: prize.giftKind });
  const amount = prizeAmountText(prize, tp);
  const giftTitle = String(gift?.title || '').trim();
  const showTitle = !isGift || (giftTitle && !/^gift\s+\d+$/i.test(giftTitle));
  const icon = <span className="loot-slot__icon" aria-hidden="true">{visual.icon}</span>;

  return (
    <article className={`loot-slot loot-slot--${visual.tone} ${isGift ? 'loot-slot--gift' : ''}`}>
      <button className="loot-slot__info" type="button" aria-label={t('cases.chanceInfo')}
        aria-expanded={showChance} aria-controls={chanceId} onClick={() => setShowChance(value => !value)}
        onKeyDown={event => { if (event.key === 'Escape') setShowChance(false); }}>ⓘ</button>
      <span className="loot-slot__art">
        {isGift ? (
          <GiftArt animated interactive label={gift?.title || t(visual.labelKey)} className="gift-art loot-slot__gift" gift={gift} giftId={animationKey} />
        ) : icon}

        {isGift && gift?.stars > 0 ? (
          <span className="loot-slot__price">
            <TelegramStar />
            {formatNumber(gift.stars)}
          </span>
        ) : null}
      </span>

      {showTitle ? (
        <strong className="loot-slot__title">{gift?.title || t(visual.labelKey)}</strong>
      ) : null}
      {!isGift || amount ? (
        <span className="loot-slot__amount">{amount || '\u00A0'}</span>
      ) : null}

      <span id={chanceId} hidden={!showChance} className="loot-slot__chance loot-slot__chance--popover">
        {t('cases.chance', { value: prizeChanceText(prize.chance) })}
      </span>
    </article>
  );
}

export default CasePrizeSlot;
