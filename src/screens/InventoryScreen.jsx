import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FiArrowLeft,
  FiAward,
  FiBox,
  FiCheck,
  FiFlag,
  FiGlobe,
  FiGrid,
  FiHeart,
  FiImage,
  FiLayers,
  FiLogIn,
  FiMeh,
  FiMessageCircle,
  FiPackage,
  FiPlay,
  FiSearch,
  FiSmile,
  FiStar,
  FiX,
  FiZap,
} from 'react-icons/fi';
import { TbBackpack } from 'react-icons/tb';
import { useTranslation } from '../i18n/I18nContext.js';
import { themeColor } from '../theme/colors.js';
import {
  categoryIcon,
  categoryLabel,
  categoryText,
  compareCategories,
  getChartSkinUrl,
  isEquippable,
  itemName,
  previewText,
} from '../utils/shop.js';

/**
 * СКЛАД — игровой инвентарь.
 *
 * Экран собран из трёх частей, поэтому ничего не «клеится»:
 *  1. шапка-герой со счётчиками коллекции;
 *  2. панель управления: вкладки «Все / Избранное», поиск и чипы категорий со счётчиками;
 *  3. сетка квадратных слотов (как в игровом инвентаре): превью и подписи живут
 *     в отдельных строках фиксированной высоты, поэтому слоты всегда одной высоты.
 *
 * Действия над предметом вынесены в отдельную шторку (`InventorySheet`):
 * внутри слота «Надеть» и «В избранное» не помещаются и наползают друг на друга.
 */

/* ---------- иконки категорий ---------- */
const iconMap = {
  award: FiAward,
  smile: FiSmile,
  diamond: FiStar,
  'log-in': FiLogIn,
  grid: FiGrid,
  'message-circle': FiMessageCircle,
  image: FiImage,
  flag: FiFlag,
  play: FiPlay,
  globe: FiGlobe,
  meh: FiMeh,
  layers: FiLayers,
  box: FiBox,
};

function CatIcon({ category }) {
  const key = categoryIcon(category);
  const Icon = iconMap[key] || FiBox;
  return <Icon />;
}

/* ---------- цвет кнопки по эмодзи (цвета — из палитры) ---------- */
const buttonColorMap = {
  '🟥': themeColor('danger'),
  '🟩': themeColor('success'),
  '🟦': themeColor('indigo'),
};

function resolveButtonColor(colorName) {
  if (!colorName) return themeColor('indigo');
  return buttonColorMap[colorName] || themeColor('indigo');
}

/* ---------- превью предмета ---------- */
function ItemArt({ item }) {
  const skinUrl = getChartSkinUrl(item);

  if (skinUrl) {
    return <img alt="" className="inv-art__img" decoding="async" loading="lazy" src={skinUrl} />;
  }

  if (item.category === 'buttons') {
    return (
      <span className="inv-art__btn" style={{ background: resolveButtonColor(item.text_m) }}>
        START
      </span>
    );
  }

  const name = itemName(item).trim();
  const isEmoji = item.category === 'emojis' || item.category === 'premium_emojis';

  // Обычные эмодзи подписаны самим символом — показываем его крупно.
  if (isEmoji && [...name].length <= 4) {
    return <span className="inv-art__emoji">{name}</span>;
  }

  // Premium-эмодзи подписаны telegram-id, поэтому вместо буквы — акцентная иконка.
  if (isEmoji) {
    return (
      <span className="inv-art__stack">
        <FiStar />
        <small>#{item.id}</small>
      </span>
    );
  }

  return (
    <span className="inv-art__stack">
      <CatIcon category={item.category} />
      <strong>{previewText(item)}</strong>
    </span>
  );
}

/** Статус предмета одной строкой: активен, можно надеть или только в коллекции. */
function itemStatus(t, item) {
  if (item.is_active) return t('inventory.statusActive');
  if (isEquippable(item.category)) return t('inventory.statusEquip');
  return t('inventory.statusOwned');
}

/* ---------- слот инвентаря ---------- */
function InventorySlot({ busy, item, onFavorite, onOpen }) {
  const { t } = useTranslation();
  const label = itemName(item);
  const canEquip = isEquippable(item.category);

  return (
    <article className={`inv-slot${item.is_active ? ' is-active' : ''}${item.is_favorite ? ' is-fav' : ''}`}>
      <button
        aria-label={`${label}. ${itemStatus(t, item)}`}
        className="inv-slot__open"
        type="button"
        onClick={() => onOpen(item)}
      >
        <span className="inv-slot__thumb">
          <span className="inv-art">
            <ItemArt item={item} />
            {busy ? <span className="inv-slot__busy" aria-hidden="true" /> : null}
          </span>

          {item.is_active ? (
            <span className="inv-slot__state" title={t('shop.active')}>
              <FiCheck aria-hidden="true" />
            </span>
          ) : null}

          {!item.is_active && canEquip ? <span className="inv-slot__ready" aria-hidden="true" /> : null}
        </span>

        <span className="inv-slot__info">
          <span className="inv-slot__name">{label}</span>
          <span className="inv-slot__cat">
            <CatIcon category={item.category} />
            <span>{categoryLabel(item.category)}</span>
          </span>
        </span>
      </button>

      <button
        aria-label={item.is_favorite ? t('shop.favoriteRemoveFull') : t('shop.favoriteAddFull')}
        className={`inv-slot__fav${item.is_favorite ? ' is-filled' : ''}`}
        disabled={busy}
        title={item.is_favorite ? t('shop.favoriteRemoveFull') : t('shop.favoriteAddFull')}
        type="button"
        onClick={() => onFavorite(item)}
      >
        <FiHeart />
      </button>
    </article>
  );
}

/* ---------- шторка предмета ---------- */
function InventorySheet({ busy, item, onClose, onEquip, onFavorite }) {
  const { t } = useTranslation();
  const canEquip = isEquippable(item.category);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // После действия шторка закрывается — так видно всплывающее подтверждение.
  const handleEquip = () => {
    onClose();
    onEquip(item);
  };

  const handleFavorite = () => {
    onClose();
    onFavorite(item);
  };

  return createPortal(
    <div className="inv-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={itemName(item)}
        aria-modal="true"
        className={`inv-sheet${item.is_active ? ' is-active' : ''}`}
        role="dialog"
        onClick={event => event.stopPropagation()}
      >
        <span className="inv-sheet__glow" aria-hidden="true" />
        <span className="sheet-handle" />

        <button
          aria-label={t('inventory.close')}
          className="inv-sheet__close"
          title={t('inventory.close')}
          type="button"
          onClick={onClose}
        >
          <FiX />
        </button>

        <div className="inv-sheet__art">
          <span className="inv-art">
            <ItemArt item={item} />
            {busy ? <span className="inv-slot__busy" aria-hidden="true" /> : null}
          </span>
        </div>

        <div className="inv-sheet__head">
          <h2>{itemName(item)}</h2>
          <p>{categoryText(item.category)}</p>
        </div>

        <div className="inv-sheet__meta">
          <span className="inv-sheet__chip">
            <CatIcon category={item.category} />
            {categoryLabel(item.category)}
          </span>

          <span className={`inv-sheet__chip${item.is_active ? ' is-active' : ''}`}>
            {item.is_active ? <FiCheck /> : <FiZap />}
            {itemStatus(t, item)}
          </span>

          {item.is_favorite ? (
            <span className="inv-sheet__chip is-fav">
              <FiHeart />
              {t('inventory.favorites')}
            </span>
          ) : null}
        </div>

        <p className="inv-sheet__hint">{t('inventory.sheetHint')}</p>

        <div className="inv-sheet__actions">
          <button
            className={`inv-btn inv-btn--ghost${item.is_favorite ? ' is-on' : ''}`}
            disabled={busy}
            type="button"
            onClick={handleFavorite}
          >
            <FiHeart />
            {item.is_favorite ? t('shop.favoriteRemove') : t('shop.favoriteAdd')}
          </button>

          <button
            className="inv-btn inv-btn--primary"
            disabled={busy || item.is_active || !canEquip}
            type="button"
            onClick={handleEquip}
          >
            {item.is_active ? <FiCheck /> : <FiZap />}
            {item.is_active ? t('shop.active') : t('shop.equip')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Пустое состояние: иконка, заголовок и пояснение — по центру панели. */
function InventoryEmpty({ icon, text, title }) {
  return (
    <div className="inv-empty">
      <span className="inv-empty__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

/* ---------- главный экран ---------- */
/** Сколько слотов показываем сразу и сколько добавляет кнопка «Показать ещё». */
const SLOT_PAGE = 24;

function InventoryScreen({ busyItemId, data, onBack, onEquip, onFavorite }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(SLOT_PAGE);
  const [selectedId, setSelectedId] = useState(null);

  const inventory = useMemo(() => data.inventory || [], [data.inventory]);
  const favorites = useMemo(() => inventory.filter(item => item.is_favorite), [inventory]);
  const activeCount = inventory.filter(item => item.is_active).length;

  /** Категории только те, что реально лежат на складе, плюс счётчик предметов. */
  const categories = useMemo(() => {
    const counts = new Map();

    inventory.forEach(item => {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    });

    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((left, right) => compareCategories(left.id, right.id));
  }, [inventory]);

  const filtered = useMemo(() => {
    const source = tab === 'favorites' ? favorites : inventory;
    const search = query.trim().toLowerCase();

    return source.filter(item => {
      if (category !== 'all' && item.category !== category) return false;
      if (!search) return true;
      return itemName(item).toLowerCase().includes(search);
    });
  }, [category, favorites, inventory, query, tab]);

  const visible = filtered.slice(0, visibleCount);
  // Предмет берём из актуальных данных: после «Надеть» шторка показывает свежий статус.
  const selected = useMemo(() => inventory.find(item => item.id === selectedId) || null, [inventory, selectedId]);

  const changeTab = nextTab => {
    setTab(nextTab);
    setVisibleCount(SLOT_PAGE);
  };

  const changeCategory = nextCategory => {
    setCategory(nextCategory);
    setVisibleCount(SLOT_PAGE);
  };

  const changeQuery = event => {
    setQuery(event.target.value);
    setVisibleCount(SLOT_PAGE);
  };

  const clearQuery = () => {
    setQuery('');
    setVisibleCount(SLOT_PAGE);
  };

  const emptyState = () => {
    if (inventory.length === 0) {
      return (
        <InventoryEmpty
          icon={<TbBackpack />}
          text={t('inventory.emptyAllText')}
          title={t('inventory.emptyAllTitle')}
        />
      );
    }

    if (tab === 'favorites' && favorites.length === 0) {
      return (
        <InventoryEmpty
          icon={<FiHeart />}
          text={t('inventory.emptyFavText')}
          title={t('inventory.emptyFavTitle')}
        />
      );
    }

    return (
      <InventoryEmpty
        icon={<FiSearch />}
        text={t('inventory.emptyText')}
        title={t('inventory.emptyTitle')}
      />
    );
  };

  return (
    <section className="screen inventory-screen">
      {/* Склад открывается блоком внизу профиля — возврат ведёт обратно в профиль. */}
      {onBack ? (
        <button className="screen-back" type="button" onClick={onBack}>
          <FiArrowLeft /> {t('nav.back')}
        </button>
      ) : null}

      {/* ===== шапка: что это за раздел и сколько всего лежит ===== */}
      <header className="inv-hero">
        <span className="inv-hero__glow" aria-hidden="true" />

        <div className="inv-hero__head">
          <span className="inv-hero__icon" aria-hidden="true">
            <TbBackpack />
          </span>

          <div className="inv-hero__titles">
            <h2>{t('inventory.heroTitle')}</h2>
            <p>{t('inventory.heroSub')}</p>
          </div>
        </div>

        <div className="inv-hero__stats">
          <div className="inv-stat">
            <span className="inv-stat__icon" aria-hidden="true"><FiPackage /></span>
            <b>{inventory.length}</b>
            <small>{t('inventory.statItems')}</small>
          </div>

          <div className="inv-stat">
            <span className="inv-stat__icon inv-stat__icon--active" aria-hidden="true"><FiZap /></span>
            <b>{activeCount}</b>
            <small>{t('inventory.statActive')}</small>
          </div>

          <div className="inv-stat">
            <span className="inv-stat__icon inv-stat__icon--fav" aria-hidden="true"><FiHeart /></span>
            <b>{favorites.length}</b>
            <small>{t('inventory.statFavorites')}</small>
          </div>
        </div>
      </header>

      {/* ===== панель управления: вкладки, поиск и категории ===== */}
      <div className="inv-toolbar">
        <div className="inv-tabs" role="tablist">
          <button
            aria-selected={tab === 'all'}
            className={`inv-tab${tab === 'all' ? ' is-active' : ''}`}
            role="tab"
            type="button"
            onClick={() => changeTab('all')}
          >
            <FiLayers />
            <span>{t('inventory.allItems')}</span>
            <em>{inventory.length}</em>
          </button>

          <button
            aria-selected={tab === 'favorites'}
            className={`inv-tab${tab === 'favorites' ? ' is-active' : ''}`}
            role="tab"
            type="button"
            onClick={() => changeTab('favorites')}
          >
            <FiHeart />
            <span>{t('inventory.favorites')}</span>
            <em>{favorites.length}</em>
          </button>
        </div>

        <label className="inv-search">
          <FiSearch aria-hidden="true" />
          <input
            placeholder={t('shop.searchPlaceholder')}
            type="search"
            value={query}
            onChange={changeQuery}
          />
          {query ? (
            <button aria-label={t('inventory.close')} type="button" onClick={clearQuery}>
              <FiX />
            </button>
          ) : null}
        </label>

        {categories.length > 1 ? (
          <div className="inv-cats-wrap">
            <span className="inv-cats__title">{t('inventory.categoriesTitle')}</span>

            <div className="inv-cats">
              <button
                className={`inv-cat${category === 'all' ? ' is-active' : ''}`}
                type="button"
                onClick={() => changeCategory('all')}
              >
                <FiGrid aria-hidden="true" />
                <span>{t('shop.all')}</span>
                <em>{inventory.length}</em>
              </button>

              {categories.map(entry => (
                <button
                  key={entry.id}
                  className={`inv-cat${category === entry.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => changeCategory(entry.id)}
                >
                  <CatIcon category={entry.id} />
                  <span>{categoryLabel(entry.id)}</span>
                  <em>{entry.count}</em>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ===== сетка слотов: как в игровом инвентаре ===== */}
      {visible.length > 0 ? (
        <div className="inv-grid">
          {visible.map(item => (
            <InventorySlot
              key={item.id}
              busy={busyItemId === item.id}
              item={item}
              onFavorite={onFavorite}
              onOpen={current => setSelectedId(current.id)}
            />
          ))}
        </div>
      ) : (
        emptyState()
      )}

      {filtered.length > visibleCount ? (
        <button className="inv-more" type="button" onClick={() => setVisibleCount(count => count + SLOT_PAGE)}>
          {t('shop.showMore', { count: Math.min(SLOT_PAGE, filtered.length - visibleCount) })}
        </button>
      ) : null}

      {selected ? (
        <InventorySheet
          busy={busyItemId === selected.id}
          item={selected}
          onClose={() => setSelectedId(null)}
          onEquip={onEquip}
          onFavorite={onFavorite}
        />
      ) : null}
    </section>
  );
}

export default InventoryScreen;



