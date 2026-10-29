import { useMemo, useState } from 'react';
import { FaStar } from 'react-icons/fa';
import { FiCheck, FiPackage, FiRefreshCw, FiSearch, FiX } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import {
  filterGiftCatalog,
  giftAnimationKey,
  giftBackdrop,
  giftBaseTitle,
  giftHasBackdrop,
  giftIdText,
  giftIsHosted,
  giftIsLimitedSeries,
  giftIsSoldOut,
  giftIsUnique,
  giftOnSale,
  giftOwnedCount,
  giftStars,
  giftTitle,
  giftUniqueNum,
  ownedGiftCounts,
  sortGiftCatalog,
} from '../../utils/giftCatalog.js';
import { formatNumber } from '../../utils/formatters.js';
import GiftArt from '../cases/GiftArt.jsx';
import GiftBackdrop from '../cases/GiftBackdrop.jsx';
import GiftDetailSheet from './GiftDetailSheet.jsx';

/**
 * Режим каталога, выбранный в прошлый раз.
 *
 * Пикер раскрывается заново под каждой строкой наполнения, а подарки владелец
 * обычно выбирает подряд: без этой памяти режим сбрасывался бы на «все подарки»
 * после каждого выбора.
 */
let lastMode = 'all';

/**
 * Вкладка каталога, выбранная в прошлый раз: «все» или «лимитированные».
 *
 * Память та же, что у режима: подарки выбирают подряд, а под каждой строкой
 * наполнения пикер раскрывается заново.
 */
let lastSeries = 'all';

/**
 * Пикер подарка Telegram для строки наполнения кейса.
 *
 * Панель раскрывается под строкой приза и не уводит владельца на другой экран:
 * сверху переключатель каталога, ниже поиск по названию и id, сетка каталога
 * крупными карточками — ровно по два подарка в ряд, чтобы подарок узнавался по
 * картинке и на телефоне, — и ручной ввод id на случай, когда юзербот молчит и
 * каталог пуст.
 *
 * Переключатель меняет не фильтр, а источник списка:
 *   - «все подарки» — каталог Telegram (`payments.getStarGifts`);
 *   - «есть на аккаунте» — подарки, которые юзербот уже получил или разместил на
 *     профиле (`payments.getSavedStarGifts` с `exclude_hosted=false`, см.
 *     `loadSavedGifts` в `server/giftsApi.js`).
 *     В этом режиме владелец выбирает из того, что лежит на руках: у обычного
 *     подарка видно число штук (`count`), а каталог помечает такие карточки
 *     значком «×N».
 *
 * У каталога под источником есть вторая пара вкладок (`giftIsLimitedSeries`):
 * «Все» — подарки в свободной продаже, «Лимитированные» — серии с ограниченным
 * выпуском, включая распроданные (такой подарок мог уже лежать на аккаунте, а в
 * истории покупок у игрока он остаётся лимитированным). Без этой вкладки
 * лимитированные серии стояли бы в общем списке вперемешку и путались с обычными.
 *
 * Уникальные (коллекционные) подарки приходят в режиме аккаунта отдельными
 * карточками: у каждого свой номер (`#35 651`), своя модель и своя подложка —
 * цвета и узор из Telegram, — и схлопывать их в «×N» нельзя: это разные
 * экземпляры, а не повторы. Такой
 * подарок нельзя выдать из бота: его передаёт владелец с аккаунта, поэтому выбор
 * уникального подарка сохраняет в строке наполнения ещё и `giftKind`/`giftSlug`/
 * `giftMsgId` (см. `pickGift` в `CaseContentEditor.jsx`), а выдача идёт через
 * юзербот (`grantAccountGiftReward` в `server/index.js`).
 *
 * Выбор отдаётся наружу самим подарком (`onPick(item)`), а не одним id: строке
 * наполнения нужен и id (для картинки), и данные для передачи.
 *
 * Клик по карточке не выбирает подарок сразу, а открывает его карточку
 * (`GiftDetailSheet`): подарков в каталоге полторы сотни, и перед выбором важно
 * увидеть номер экземпляра, редкость атрибутов и владельца — как в профиле
 * подарка в Telegram. Выбор подтверждается кнопкой в карточке, она и отдаёт
 * `onPick(item)`.
 *
 * Карточка показывает саму анимацию подарка (`GiftArt` в ленивом режиме): файл
 * качается только для подарков, попавших в видимую область, и снимается, когда
 * карточка уезжает. Каталог — это полторы сотни подарков, и полторы сотни живых
 * плееров (плюс столько же походов в Telegram через юзербот) телефон бы не
 * потянул. Пока файл едет, виден знак подарка.
 *
 * Каталог кешируется на сервере пять минут (`GIFTS_CACHE_MS`), поэтому рядом есть
 * кнопка «обновить»: она перезапрашивает админский список с `?refresh=1` — и
 * каталог, и подарки аккаунта. Своё состояние панель держит сама, а выбор отдаёт
 * наружу одним id — строка наполнения хранит ровно то, что понимает сервер
 * (`giftId`). Id — строка цифр (`giftIdText` в `src/utils/giftCatalog.js`): у
 * подарков он девятнадцатизначный, и число теряло бы последние цифры, а вместе с
 * ними и анимацию.
 */
function GiftPickerPanel({
  busy = false,
  currentId = '',
  gifts = [],
  savedGifts = [],
  savedStatus = null,
  status = null,
  onClose,
  onPick,
  onRefresh,
}) {
  const { t } = useTranslation();

  // Подарок, открытый в карточке: клик по карточке каталога не выбирает подарок
  // сразу, а показывает его профиль (номер экземпляра, редкость атрибутов,
  // владелец) — выбор подтверждается уже в карточке.
  const [preview, setPreview] = useState(null);
  const [query, setQuery] = useState('');
  const [manualId, setManualId] = useState(() => giftIdText(currentId));
  const [mode, setMode] = useState(lastMode);
  const [series, setSeries] = useState(lastSeries);
  const owned = mode === 'saved';
  const limited = !owned && series === 'limited';
  // В режиме аккаунта список уже схлопнут по подарку, а число штук лежит в `count`
  // (см. `aggregateSavedGifts` в `server/giftsApi.js`).
  const source = owned ? savedGifts : gifts;
  const sourceStatus = owned ? savedStatus : status;
  // Сортировку и поиск держим в памяти: каталог меняется только по кнопке «обновить».
  const sorted = useMemo(() => sortGiftCatalog(source), [source]);
  // Каталог разложен по вкладкам: «все» — подарки в свободной продаже,
  // «лимитированные» — серии с ограниченным выпуском. В режиме аккаунта вкладки не
  // рисуются: там список экземпляров, а не серий каталога.
  const forSale = useMemo(() => sorted.filter(item => !giftIsLimitedSeries(item)), [sorted]);
  const limitedSeries = useMemo(() => sorted.filter(giftIsLimitedSeries), [sorted]);
  const shown = owned ? sorted : (limited ? limitedSeries : forSale);
  const visible = useMemo(() => filterGiftCatalog(shown, query), [shown, query]);
  // Каталог про подарки аккаунта не знает, а помечать карточки нужно: считаем карту
  // один раз на список, а не в каждой карточке.
  const ownedCounts = useMemo(() => ownedGiftCounts(savedGifts), [savedGifts]);
  const selectedId = giftIdText(currentId);
  const manual = giftIdText(manualId);
  const unavailable = Boolean(sourceStatus) && sourceStatus.ok === false;
  // Список подарков аккаунта приехал не полностью: юзербот не отдал подарки,
  // размещённые на профиле, или он старой версии и уникальных в списке нет.
  // Что именно потерялось, знает сервер (`mode` в `savedStatus`, см.
  // `savedGiftRequests` в `server/giftsApi.js`) — пикер честно об этом пишет.
  const savedGapKey = owned && sourceStatus?.ok !== false
    ? ({
      owned: 'admin.cases.giftSavedNoHosted',
      plain: 'admin.cases.giftSavedLegacy',
    })[sourceStatus?.mode] || ''
    : '';
  // Пустой список объясняем по месту: в режиме аккаунта это «юзербот ещё не
  // получал подарков», во вкладке «Лимитированные» — «таких серий в каталоге нет»,
  // в остальных случаях — «ничего не нашлось по поиску».
  const [emptyTitleKey, emptyTextKey] = owned
    ? ['admin.cases.giftSavedNothing', 'admin.cases.giftSavedNothingText']
    : (limited && limitedSeries.length === 0
      ? ['admin.cases.giftLimitedNothing', 'admin.cases.giftLimitedNothingText']
      : ['admin.cases.giftNothing', 'admin.cases.giftNothingText']);

  const switchMode = next => {
    lastMode = next;
    setMode(next);
  };

  const switchSeries = next => {
    lastSeries = next;
    setSeries(next);
  };

  return (
    <section className="cases-admin-gift-picker">
      <header className="cases-admin-gift-picker__head">
        <span className="missions-group__label">{t('admin.cases.giftPickTitle')}</span>

        <span className="cases-admin-gift-picker__tools">
          <button
            aria-label={t('admin.cases.giftRefresh')}
            className="cases-admin-row__btn"
            disabled={busy || !onRefresh}
            title={t('admin.cases.giftRefresh')}
            type="button"
            onClick={onRefresh}
          >
            <FiRefreshCw />
          </button>

          <button
            aria-label={t('admin.cases.giftClose')}
            className="cases-admin-row__btn"
            title={t('admin.cases.giftClose')}
            type="button"
            onClick={onClose}
          >
            <FiX />
          </button>
        </span>
      </header>

      {/* Переключатель источника: весь каталог Telegram или только то, что уже
          получено аккаунтом юзербота. Числа рядом — размер каждого списка. */}
      <div
        aria-label={t('admin.cases.giftModeTitle')}
        className="cases-admin-gift-picker__modes"
        role="group"
      >
        <button
          aria-pressed={!owned}
          className={`cases-admin-gift-picker__mode ${owned ? '' : 'is-active'}`}
          type="button"
          onClick={() => switchMode('all')}
        >
          <span>{t('admin.cases.giftModeAll')}</span>
          <span className="cases-admin-gift-picker__mode-count">{gifts.length}</span>
        </button>

        <button
          aria-pressed={owned}
          className={`cases-admin-gift-picker__mode ${owned ? 'is-active' : ''}`}
          type="button"
          onClick={() => switchMode('saved')}
        >
          <span>{t('admin.cases.giftModeSaved')}</span>
          <span className="cases-admin-gift-picker__mode-count">{savedGifts.length}</span>
        </button>
      </div>

      {/* Вкладки каталога: лимитированные серии отдельно от подарков в свободной
          продаже. Числа рядом — размер каждой вкладки, чтобы не открывать её ради
          «сколько там». В режиме аккаунта вкладок нет: там экземпляры подарков. */}
      {owned ? null : (
        <div
          aria-label={t('admin.cases.giftSeriesTitle')}
          className="cases-admin-gift-picker__modes is-series"
          role="group"
        >
          <button
            aria-pressed={!limited}
            className={`cases-admin-gift-picker__mode ${limited ? '' : 'is-active'}`}
            type="button"
            onClick={() => switchSeries('all')}
          >
            <span>{t('admin.cases.giftSeriesAll')}</span>
            <span className="cases-admin-gift-picker__mode-count">{forSale.length}</span>
          </button>

          <button
            aria-pressed={limited}
            className={`cases-admin-gift-picker__mode ${limited ? 'is-active' : ''}`}
            type="button"
            onClick={() => switchSeries('limited')}
          >
            <span>{t('admin.cases.giftSeriesLimited')}</span>
            <span className="cases-admin-gift-picker__mode-count">{limitedSeries.length}</span>
          </button>
        </div>
      )}

      <small className={`cases-admin-gift-picker__note ${unavailable ? 'is-warn' : ''}`}>
        {unavailable
          ? (owned
            ? t('admin.cases.giftSavedUnavailable', { error: sourceStatus?.error || '' })
            : t('admin.cases.giftUnavailable', { error: sourceStatus?.error || '' }))
          : (owned
            ? t('admin.cases.giftSavedCount', { count: savedGifts.length })
            : (limited
              ? t('admin.cases.giftLimitedCount', { count: limitedSeries.length })
              : t('admin.cases.giftCount', { count: gifts.length })))}
      </small>

      {/* Список неполный — говорим, чего в нём нет: иначе владелец решит, что
          подарков на аккаунте ровно столько и есть. */}
      {savedGapKey ? (
        <small className="cases-admin-gift-picker__note is-warn">{t(savedGapKey)}</small>
      ) : null}

      <label className="cases-admin-gift-picker__search">
        <FiSearch aria-hidden="true" />
        <input
          className="docs-input"
          placeholder={t('admin.cases.giftSearch')}
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </label>

      {visible.length === 0 ? (
        <div className="docs-empty">
          <strong>{t(emptyTitleKey)}</strong>
          <small>{t(emptyTextKey)}</small>
        </div>
      ) : (
        <div className="cases-admin-gift-picker__grid">
          {visible.map((item, index) => {
            const id = giftIdText(item);
            const key = giftAnimationKey(item);
            const unique = giftIsUnique(item);
            const num = giftUniqueNum(item);
            const backdrop = giftBackdrop(item);
            // Есть чем нарисовать подложку подарка (центр, края или узор): тогда
            // карточка получает её вместо поверхности приложения, а подписи — цвет
            // из Telegram (см. `GiftBackdrop` и `giftHasBackdrop`).
            const painted = giftHasBackdrop(item);
            const selected = id === selectedId;
            const onSale = giftOnSale(item);
            const hosted = giftIsHosted(item);
            // В режиме аккаунта число штук пришло вместе с подарком (`count`), в
            // режиме каталога его даёт карта подарков аккаунта. У уникальных числа
            // нет: каждый экземпляр — своя карточка с номером, а не «×N».
            const ownedCount = unique
              ? 0
              : (owned ? giftOwnedCount(item) : (ownedCounts.get(id) || 0));

            return (
              <button
                aria-pressed={selected}
                className={`cases-admin-gift-card ${selected ? 'is-selected' : ''} ${unique ? 'is-unique' : ''} ${painted ? 'has-backdrop' : ''}`}
                key={key || `gift-${index}`}
                style={backdrop.text ? { '--gift-text': backdrop.text } : undefined}
                type="button"
                onClick={() => setPreview(item)}
              >
                {/* Подложка подарка — первым слоем: фон из Telegram (центр, края и
                    узор), поверх него картинка подарка и подписи. У уникального
                    подарка это его собственные цвета и узор, у подарка каталога —
                    цвета фона из каталога (см. `GiftBackdrop`). */}
                <GiftBackdrop className="cases-admin-gift-card__backdrop" gift={item} />

                <GiftArt animated lazy className="cases-admin-gift-card__art" gift={item} giftId={key} />

                {/* Номер экземпляра — единственное, чем два уникальных подарка
                    одного вида отличаются друг от друга. В Telegram номер лежит
                    лентой в углу картинки, поэтому и здесь он под углом (рисуется
                    до галочки выбора, чтобы та осталась поверх ленты). */}
                {unique && num > 0 ? (
                  <span className="cases-admin-gift-card__num">#{formatNumber(num)}</span>
                ) : null}

                {selected ? (
                  <span aria-hidden="true" className="cases-admin-gift-card__check"><FiCheck /></span>
                ) : null}

                {/* Подарок выставлен на профиль аккаунта: владелец — кошелёк TON,
                    поэтому передать его с аккаунта нельзя (см. `giftIsHosted`).
                    Слева сверху свободно: «×N» у уникальных не бывает. */}
                {hosted ? (
                  <span
                    className="cases-admin-gift-card__hosted"
                    title={t('admin.cases.giftHostedTitle')}
                  >
                    {t('admin.cases.giftHosted')}
                  </span>
                ) : null}

                {/* «Есть на аккаунте юзербота»: видно и в каталоге — владельцу важно
                    знать, что подарок уже на руках, а не только в продаже. */}
                {ownedCount > 0 ? (
                  <span
                    className="cases-admin-gift-card__owned"
                    title={t('admin.cases.giftOwnedTitle', { count: ownedCount })}
                  >
                    <FiPackage aria-hidden="true" />
                    {ownedCount > 1 ? `×${ownedCount}` : null}
                  </span>
                ) : null}

                <strong className="cases-admin-gift-card__title">
                  {unique ? giftBaseTitle(item) : giftTitle(item)}
                </strong>

                {/* Цена — только у того, что Telegram продаёт прямо сейчас.
                    Распроданная серия остаётся в каталоге с ценой, поэтому её
                    подписываем отдельно: купить подарок нельзя, и владелец должен
                    видеть это до выбора. */}
                <span className={`cases-admin-gift-card__price ${unique || onSale ? '' : 'is-limited'}`}>
                  {unique ? (
                    t('admin.cases.giftOnAccount')
                  ) : onSale ? (
                    <>
                      <FaStar aria-hidden="true" />
                      {formatNumber(giftStars(item))}
                    </>
                  ) : (
                    t(giftIsSoldOut(item) ? 'admin.cases.giftSoldOut' : 'admin.cases.giftLimited')
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="cases-admin-gift-picker__manual">
        <label className="missions-target__field">
          <span>{t('admin.cases.giftId')}</span>
          {/* `type="number"` не годится: у подарков id девятнадцатизначный, и
              числовое поле показывало бы его округлённым. */}
          <input
            className="docs-input"
            inputMode="numeric"
            maxLength={20}
            placeholder={t('admin.cases.giftIdPlaceholder')}
            type="text"
            value={manualId}
            onChange={event => setManualId(event.target.value.replace(/\D+/g, '').slice(0, 20))}
          />
        </label>

        <button
          className="btn btn-ghost btn-small"
          disabled={!manual || manual === selectedId}
          type="button"
          onClick={() => onPick({ id: manual })}
        >
          {t('admin.cases.giftIdApply')}
        </button>
      </div>

      <small className="cases-admin-gift-picker__hint">{t('admin.cases.giftIdHint')}</small>

      {/* Карточка подарка: открывается поверх пикера, а выбор подтверждается уже
          в ней — «Выбрать подарок» (см. `GiftDetailSheet`). */}
      {preview ? (
        <GiftDetailSheet
          busy={busy}
          gift={preview}
          selected={giftIdText(preview) === selectedId}
          onClose={() => setPreview(null)}
          onPick={item => {
            onPick(item);
            setPreview(null);
          }}
        />
      ) : null}
    </section>
  );
}

export default GiftPickerPanel;
