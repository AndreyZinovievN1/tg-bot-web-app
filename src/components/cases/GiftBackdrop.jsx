import { giftBackdrop, giftHasBackdrop, giftPatternUrl } from '../../utils/giftCatalog.js';

/**
 * Подложка подарка Telegram — фон под картинкой подарка.
 *
 * Telegram рисует подарок так: центр подложки (`center_color`) с переходом к краям
 * (`edge_color`) и поверх — стикер-узор (`starGiftAttributePattern`), наложенный
 * повторяющимся рисунком цветом подложки (`pattern_color`). Здесь то же самое:
 * градиент центром наружу и плитка узора, покрашенная цветом подложки через маску
 * CSS (узор — картинка, см. `giftPatternUrl`).
 *
 * Уникальные подарки Telegram описывает цветами подложки с узором, у подарков
 * каталога есть только цвета фона (`starGift.background`) — поэтому подложка здесь
 * общая: и сетка пикера, и карточка подарка рисуют подарок обеих пород одним кодом,
 * а узор просто не появляется, если Telegram его не прислал (`giftHasBackdrop`).
 *
 * Компонент отдаёт только слои и ничего не знает о содержимом карточки: картинка
 * подарка и подписи лежат выше по `z-index` (см. `.cases-admin-gift-card__art` и
 * `.gift-sheet__hero` в `src/styles.css`) — иначе абсолютный слой подложки закрыл бы
 * их, потому что позиционированный элемент рисуется позже статичных соседей.
 */
function GiftBackdrop({ className = 'gift-backdrop', gift = null }) {
  if (!giftHasBackdrop(gift)) {
    return null;
  }

  const backdrop = giftBackdrop(gift);
  const pattern = giftPatternUrl(gift);
  const style = {
    '--gift-center': backdrop.center || backdrop.edge || 'transparent',
    '--gift-edge': backdrop.edge || backdrop.center || 'transparent',
  };

  // Цвет узора задаём только когда он есть: пустое значение переменной CSS
  // сбрасывает свойство, и плитка осталась бы прозрачной.
  if (backdrop.pattern) {
    style['--gift-pattern'] = backdrop.pattern;
  }

  if (pattern) {
    style['--gift-pattern-image'] = `url("${pattern}")`;
  }

  return (
    <span aria-hidden="true" className={className} style={style}>
      {pattern ? <span className="gift-backdrop__pattern" /> : null}
    </span>
  );
}

export default GiftBackdrop;

