import { Fragment, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiGift, FiInfo, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import {
  caseContentLimit,
  caseContentVisuals,
  caseFallbackContentTypes,
} from '../../config/casesMeta.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { findGift } from '../../utils/casePrizes.js';
import { formatNumber } from '../../utils/formatters.js';
import { giftAnimationKey, giftIdText, giftIsUnique, giftOnSale, giftStars, giftTitle, giftUniqueNum } from '../../utils/giftCatalog.js';
import GiftArt from '../cases/GiftArt.jsx';
import GiftDetailSheet from './GiftDetailSheet.jsx';
import GiftPickerPanel from './GiftPickerPanel.jsx';

/** Номер строки для идентификатора: админка шлёт id вместе с наполнением, он должен быть разным. */
let rowCounter = 0;

/** Пустая строка наполнения: поля зависят от типа приза. */
function blankRow(type, weight, types = caseFallbackContentTypes) {
  const meta = types.find(item => item.type === type);
  const row = {
    id: `${type}_${nextRowNumber()}`,
    type,
    weight: weight === undefined || weight === '' ? 1 : weight,
  };

  if (meta?.amount) {
    row.min = 1;
    row.max = Math.min(100, Number(meta.maxAmount) || 100);
  }

  if (meta?.item) {
    row.itemId = '';
  }

  // Подарок выбирается пикером из каталога юзербота: пока подарок не выбран, строка
  // хранит пустой id — сервер её сохранит, но в слоте будет «подарок по умолчанию».
  // Id — строка цифр: девятнадцать знаков число не переживает (см. `giftIdText`).
  if (meta?.gift) {
    row.giftId = '';
    // Адрес подарка на аккаунте юзербота: заполняется только для уникального
    // подарка — такой подарок не выдают из бота, а передают владельцем
    // (`giftSlug`/`giftMsgId`, см. `pickGift` и `grantAccountGiftReward`).
    row.giftKind = '';
    row.giftSlug = '';
    row.giftMsgId = 0;
    row.giftNum = 0;
  }

  return row;
}

function nextRowNumber() {
  rowCounter += 1;

  return rowCounter;
}

/** На экране вес показываем без длинного хвоста: 3.2, а не 3.1999999. */
function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Наполнение кейса — пул призов с весами.
 *
 * Вес строки — это её «ширина» в рулетке: шанс считается от суммы весов, поэтому
 * владельцу не приходится сводить проценты к ста процентам (ровно так же считает
 * сервер, см. `caseOdds` в server/casesApi.js). Проценты показываем рядом с полем
 * веса и обновляем на каждое нажатие клавиши.
 *
 * Тип приза берётся из каталога сервера: у `coins/starcoins/vip` есть диапазон
 * количества, у скина графика — выбор предмета из маркета. Заготовки
 * (`implemented: false`, например подарок Telegram) в списке видны, но выбрать их
 * нельзя — сервер такие строки не сохранит.
 *
 * Строка `chart_skin` хранит `itemId` предмета из `shop_items` с категорией
 * `chart_skin_*`; каталог этих предметов сервер отдаёт в `catalog.gallery`
 * (там же `key` файла скина из `src/config/shop.js`).
 *
 * Строка `gift` хранит `giftId` подарка Telegram из каталога юзербота
 * (`catalog.gifts`). Подарок выбирается сеткой-пикером под самой строкой
 * (`GiftPickerPanel`): отдельного экрана каталога в админке нет, а кнопка
 * «+ Подарок» добавляет строку и сразу раскрывает пикер под ней. В пикере два
 * режима: весь каталог Telegram и только подарки, которые уже получены аккаунтом
 * юзербота (`catalog.savedGifts` — их отдаёт `loadSavedGifts` в server/giftsApi.js).
 * Каталог у сервера кешируется, поэтому в пикере есть кнопка обновления
 * (`?refresh=1` у админского списка) и поле ручного ввода id — на случай, когда
 * юзербот не отвечает.
 */
function CaseContentEditor({
  busy = false,
  catalog,
  contents = [],
  giftsStatus = null,
  onChange,
  onRefreshGifts,
}) {
  const { t } = useTranslation();
  /** Открытый пикер подарка: под какой строкой раскрыт каталог (`{ index }`). */
  const [picker, setPicker] = useState(null);
  const types = Array.isArray(catalog?.contentTypes) && catalog.contentTypes.length > 0
    ? catalog.contentTypes
    : caseFallbackContentTypes;
  const limit = Number(catalog?.contentLimit) || caseContentLimit;
  const total = contents.reduce((sum, row) => sum + Math.max(0, Number(row.weight) || 0), 0);
  const gifts = Array.isArray(catalog?.gifts) ? catalog.gifts : [];
  // Подарки, полученные аккаунтом юзербота: второй режим пикера («есть на
  // аккаунте»). Список необязательный — без юзербота он пустой, а состояние
  // (`savedStatus`) объясняет причину (см. `savedGifts` в server/casesApi.js).
  const savedGifts = Array.isArray(catalog?.savedGifts) ? catalog.savedGifts : [];
  const savedStatus = catalog?.savedStatus || null;
  const full = contents.length >= limit;

  const replace = (index, value) => onChange(
    contents.map((row, position) => (position === index ? value : row)),
  );

  const patch = (index, key, value) => replace(index, { ...contents[index], [key]: value });

  /** Смена типа строки: поля старого типа не должны утечь в новый. */
  const changeType = (index, type) => {
    setPicker(null);
    replace(index, blankRow(type, contents[index]?.weight, types));
  };

  const move = (index, step) => {
    const target = index + step;

    if (target < 0 || target >= contents.length) {
      return;
    }

    // Пикер привязан к номеру строки: после перестановки закрываем его, чтобы он не
    // остался висеть над чужим призом.
    setPicker(null);

    const next = [...contents];

    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = () => {
    if (full) {
      return;
    }

    setPicker(null);
    onChange([...contents, blankRow(types.find(item => item.implemented)?.type || 'coins', undefined, types)]);
  };

  /**
   * «+ Подарок»: строка появляется сразу, а пикер раскрывается под ней — подарок
   * добавляется в кейс одним нажатием, без отдельного экрана каталога.
   */
  const addGift = () => {
    if (full) {
      return;
    }

    onChange([...contents, blankRow('gift', undefined, types)]);
    setPicker({ index: contents.length });
  };

  const remove = index => {
    setPicker(null);
    onChange(contents.filter((_, position) => position !== index));
  };

  /**
   * Выбор в пикере: строке нужен и id подарка, и — для подарка с аккаунта — его
   * адрес на аккаунте юзербота.
   *
   * Обычный подарок каталога выдаётся как раньше: внутренний подарок профиля, а
   * `giftId` только рисует в слоте нужную картинку. Уникальный подарок выдать
   * нельзя — его вправе передать только владелец, поэтому строка запоминает
   * `giftKind='unique'`, `giftSlug` и `giftMsgId`: по ним юзербот передаёт подарок
   * получателю (`assertContentsGifts` в server/casesApi.js и
   * `grantAccountGiftReward` в server/index.js).
   */
  const pickGift = (index, item = {}) => {
    const unique = giftIsUnique(item);

    replace(index, {
      ...contents[index],
      giftId: giftIdText(item),
      giftKind: unique ? 'unique' : '',
      giftSlug: unique ? String(item.slug || '') : '',
      giftMsgId: unique ? Math.max(0, Math.trunc(Number(item.msgId) || 0)) : 0,
      giftNum: unique ? giftUniqueNum(item) : 0,
    });
    setPicker(null);
  };

  /** Убрать подарок из строки: чистим и адрес передачи — иначе он остался бы от прошлого выбора. */
  const clearGift = index => {
    setPicker(null);
    replace(index, {
      ...contents[index],
      giftId: '',
      giftKind: '',
      giftSlug: '',
      giftMsgId: 0,
    });
  };

  return (
    <section className="cases-admin-content">
      <header className="missions-group__head">
        <span className="missions-group__label">{t('admin.cases.contentTitle')}</span>
        <small>{t('admin.cases.contentHint', { limit })}</small>
      </header>

      {contents.length === 0 ? (
        <div className="docs-empty">
          <strong>{t('admin.cases.contentEmpty')}</strong>
          <small>{t('admin.cases.contentEmptyText')}</small>
        </div>
      ) : (
        <div className="cases-admin-rows">
          {contents.map((row, index) => (
            <Fragment key={row.id || `row-${index}`}>
              <ContentRow
                busy={busy}
                catalog={catalog}
                contents={contents}
                index={index}
                pickerOpen={Boolean(picker) && picker.index === index}
                row={row}
                total={total}
                types={types}
                onClearGift={() => clearGift(index)}
                onGift={() => setPicker({ index })}
                onMove={move}
                onPatch={patch}
                onRemove={remove}
                onType={changeType}
              />

              {picker && picker.index === index ? (
                <GiftPickerPanel
                  busy={busy}
                  currentId={giftIdText(row.giftId)}
                  gifts={gifts}
                  savedGifts={savedGifts}
                  savedStatus={savedStatus}
                  status={giftsStatus}
                  onClose={() => setPicker(null)}
                  onPick={item => pickGift(index, item)}
                  onRefresh={onRefreshGifts}
                />
              ) : null}
            </Fragment>
          ))}
        </div>
      )}

      <div className="cases-admin-content__foot">
        <button className="docs-add" disabled={full} type="button" onClick={add}>
          <FiPlus /> {t('admin.cases.contentAdd')}
        </button>

        {/* Подарок добавляется своей кнопкой: так владелец видит, что в кейс можно
            положить конкретный подарок Telegram, а не абстрактный «приз». */}
        <button className="docs-add" disabled={full} type="button" onClick={addGift}>
          <FiGift /> {t('admin.cases.giftAdd')}
        </button>

        <small className={total > 0 ? '' : 'is-warn'}>
          {total > 0
            ? t('admin.cases.contentTotal', { count: contents.length, weight: round(total) })
            : t('admin.cases.contentNoWeight')}
        </small>
      </div>
    </section>
  );
}

/**
 * Строка наполнения: тип приза, количество или предмет, вес и доля в процентах.
 * Доля считается от суммы весов — именно так сервер разыгрывает приз.
 */
function ContentRow({
  busy,
  catalog,
  contents,
  index,
  pickerOpen,
  row,
  total,
  types,
  onClearGift,
  onGift,
  onType,
  onMove,
  onPatch,
  onRemove,
}) {
  const { t } = useTranslation();
  /** Карточка подарка строки: тот же профиль подарка, что и в пикере, но без выбора. */
  const [giftOpen, setGiftOpen] = useState(false);
  const meta = types.find(item => item.type === row.type) || null;
  const gallery = catalog?.gallery || [];
  const gifts = Array.isArray(catalog?.gifts) ? catalog.gifts : [];
  const odds = total > 0 ? (Math.max(0, Number(row.weight) || 0) / total) * 100 : 0;
  const amountField = meta?.unit === 'days';
  // Подарок строки ищем в каталоге и в списке подарков аккаунта: оттуда и
  // название, и цена в звёздах, и картинка. Уникальный подарок есть только во
  // втором списке — в каталоге Telegram его экземпляра нет.
  // `giftId` — строка цифр: девятнадцать знаков число не переживает (см. `giftIdText`).
  const giftId = giftIdText(row.giftId);
  const savedGifts = Array.isArray(catalog?.savedGifts) ? catalog.savedGifts : [];
  const gift = row.type === 'gift'
    ? (findGift(gifts, giftId) || findGift(savedGifts, giftId))
    : null;

  return (
    <div className="cases-admin-row">
      <span className="cases-admin-row__icon" aria-hidden="true">
        {caseContentVisuals[row.type] || '✦'}
      </span>

      <div className="cases-admin-row__grid">
        <label className="missions-target__field">
          <span>{t('admin.cases.contentType')}</span>
          <select
            className="docs-input"
            value={row.type}
            onChange={event => onType(index, event.target.value)}
          >
            {types.map(item => (
              <option disabled={!item.implemented} key={item.type} value={item.type}>
                {item.implemented
                  ? t(`cases.rewards.${item.type}`)
                  : `${t(`cases.rewards.${item.type}`)} — ${t('admin.cases.contentSoon')}`}
              </option>
            ))}
          </select>
        </label>

        {meta?.amount ? (
          <>
            <label className="missions-target__field">
              <span>{t(amountField ? 'admin.cases.contentMinDays' : 'admin.cases.contentMin')}</span>
              <input
                className="docs-input"
                max={meta.maxAmount}
                min="1"
                type="number"
                value={row.min ?? 1}
                onChange={event => onPatch(index, 'min', event.target.value)}
              />
            </label>

            <label className="missions-target__field">
              <span>{t(amountField ? 'admin.cases.contentMaxDays' : 'admin.cases.contentMax')}</span>
              <input
                className="docs-input"
                max={meta.maxAmount}
                min="1"
                type="number"
                value={row.max ?? row.min ?? 1}
                onChange={event => onPatch(index, 'max', event.target.value)}
              />
            </label>
          </>
        ) : null}

        {meta?.item ? (
          <label className="missions-target__field is-wide">
            <span>{t('admin.cases.contentItem')}</span>
            <select
              className="docs-input"
              value={row.itemId || ''}
              onChange={event => onPatch(index, 'itemId', event.target.value)}
            >
              <option value="">{t('admin.cases.contentItemEmpty')}</option>
              {gallery.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        {meta?.gift ? (
          /* Подарок: чип выбранного подарка и кнопка, раскрывающая сетку каталога. */
          <div className={`cases-admin-gift ${giftId ? '' : 'is-empty'} ${pickerOpen ? 'is-open' : ''}`}>
            <GiftArt
              animated
              className="cases-admin-gift__art"
              gift={gift}
              giftId={gift ? giftAnimationKey(gift) : giftId}
            />

            <span className="cases-admin-gift__meta">
              <strong>
                {gift ? giftTitle(gift) : (giftId ? `#${giftId}` : t('admin.cases.giftEmpty'))}
              </strong>

              <small>
                {gift && giftIsUnique(gift)
                  ? t('admin.cases.giftOnAccount')
                  : gift
                    ? (giftOnSale(gift)
                      ? t('admin.cases.giftPrice', { stars: formatNumber(giftStars(gift)) })
                      : t('admin.cases.giftLimited'))
                    : (giftId ? t('admin.cases.giftUnknown') : t('admin.cases.giftHint'))}
              </small>
            </span>

            <button className="cases-admin-gift__pick" disabled={busy} type="button" onClick={onGift}>
              {giftId ? t('admin.cases.giftChange') : t('admin.cases.giftPick')}
            </button>

            {/* Значок карточки подарка: открывает профиль подарка (номер экземпляра,
                редкость атрибутов, владелец) — как в каталоге подарков Telegram.
                Пока подарок не выбран, смотреть нечего, поэтому значка нет. */}
            {gift ? (
              <button
                aria-label={t('admin.cases.giftSheetTitle')}
                className="cases-admin-gift__info"
                title={t('admin.cases.giftSheetTitle')}
                type="button"
                onClick={() => setGiftOpen(true)}
              >
                <FiInfo />
              </button>
            ) : null}

            {giftId ? (
              <button
                aria-label={t('admin.cases.giftClear')}
                className="cases-admin-row__btn is-danger"
                title={t('admin.cases.giftClear')}
                type="button"
                onClick={onClearGift}
              >
                <FiX />
              </button>
            ) : null}
          </div>
        ) : null}

        <label className="missions-target__field">
          <span>{t('admin.cases.contentWeight')}</span>
          <input
            className="docs-input"
            min="0"
            step="0.1"
            type="number"
            value={row.weight ?? 1}
            onChange={event => onPatch(index, 'weight', event.target.value)}
          />
        </label>
      </div>

      <div className="cases-admin-row__side">
        <span className="cases-admin-row__odds">{odds.toFixed(1)}%</span>

        <div className="cases-admin-row__tools">
          <button
            aria-label={t('admin.cases.contentUp')}
            className="cases-admin-row__btn"
            disabled={index === 0}
            type="button"
            onClick={() => onMove(index, -1)}
          >
            <FiChevronUp />
          </button>

          <button
            aria-label={t('admin.cases.contentDown')}
            className="cases-admin-row__btn"
            disabled={index === contents.length - 1}
            type="button"
            onClick={() => onMove(index, 1)}
          >
            <FiChevronDown />
          </button>

          <button
            aria-label={t('admin.cases.contentRemove')}
            className="cases-admin-row__btn is-danger"
            type="button"
            onClick={() => onRemove(index)}
          >
            <FiTrash2 />
          </button>
        </div>
      </div>

      {giftOpen && gift ? (
        <GiftDetailSheet busy={busy} gift={gift} selected onClose={() => setGiftOpen(false)} />
      ) : null}
    </div>
  );
}

export default CaseContentEditor;
