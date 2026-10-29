import GiftLottie from './GiftLottie.jsx';
import { giftAnimationKey } from '../../utils/giftCatalog.js';

/**
 * Знак подарка Telegram: Lottie-анимация, картинка из каталога или эмодзи-заглушка.
 *
 * Анимация — самое понятное изображение подарка, но это отдельный запрос к серверу
 * и живой плеер в DOM. Поэтому её включают только там, где она уместна: слот кейса
 * и выпадение (`animated`) ждут кадр сразу, а сетка каталога (`animated lazy`) —
 * по мере прокрутки, чтобы полторы сотни карточек не тянули полторы сотни анимаций
 * из Telegram (см. `GiftLottie`).
 *
 * `giftId` — строка цифр (см. `giftIdText` в `src/utils/giftCatalog.js`): в числе
 * девятнадцать знаков не сохраняются, а по этому id сервер ищет анимацию. Для
 * уникального подарка ключ другой — `unique-<id>` (`giftAnimationKey`): его
 * картинка это модель из атрибутов, и лежит она в своей ручке сервера.
 *
 * Пока кадр едет, знак показывает заглушку: в ленивом режиме — картинку из
 * каталога или эмодзи, в остальных случаях — спиннер. Если каталог недоступен,
 * `gift` пустой — остаётся эмодзи: знак не должен ломаться из-за выключенного
 * юзербота (см. `GiftLottie`, он тоже падает в `fallback`).
 */
function GiftArt({ animated = false, className = 'gift-art', gift = null, giftId = '', icon = '🎁', lazy = false }) {
  // Явный `giftId` приходит уже готовым ключом анимации (так его передают слоты
  // кейса), иначе ключ собирается по самому подарку.
  const id = String(giftId || '').trim() || giftAnimationKey(gift);
  const image = gift?.image
    ? <img alt="" className="gift-art__img" decoding="async" loading="lazy" src={gift.image} />
    : null;
  const placeholder = image || <span aria-hidden="true" className="gift-art__icon">{icon}</span>;

  // В ленивом режиме заглушка не гаснет, пока кадр едет (`keepFallback`): в сетке
  // каталога пустые рамки и спиннеры читаются хуже, чем знак подарка.
  return (
    <span className={className}>
      {animated && id
        ? <GiftLottie fallback={placeholder} giftId={id} keepFallback={lazy} lazy={lazy} />
        : placeholder}
    </span>
  );
}

export default GiftArt;
