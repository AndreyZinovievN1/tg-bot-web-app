import { useMemo, useState } from 'react';
import { FiSearch, FiAward, FiSmile, FiStar, FiLogIn, FiGrid, FiMessageCircle, FiImage, FiFlag, FiPlay, FiGlobe, FiMeh, FiLayers, FiBox, FiHeart, FiCheck, FiClock, FiChevronDown } from 'react-icons/fi';
import { ImCoinDollar } from 'react-icons/im';
import { IoPlanet } from 'react-icons/io5';
import { useTranslation } from '../i18n/I18nContext.js';
import { themeColor } from '../theme/colors.js';
import { categoryIcon, categoryLabel, compareCategories, itemName, isEquippable, categoryText, getChartSkinUrl, previewText } from '../utils/shop.js';
import { formatNumber } from '../utils/formatters.js';

/* ---------- иконки категорий ---------- */
const iconMap = {
  award: FiAward, smile: FiSmile, diamond: FiStar, 'log-in': FiLogIn,
  grid: FiGrid, 'message-circle': FiMessageCircle, image: FiImage,
  flag: FiFlag, play: FiPlay, globe: FiGlobe, meh: FiMeh, layers: FiLayers,
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

/* ---------- превью товара: скин графика, эмодзи, текст или цветная кнопка ---------- */
function ItemPreview({ item }) {
  const skinUrl = getChartSkinUrl(item);
  const text = previewText(item);

  return (
    <div className="market-card__preview">
      <span className="market-card__tag" aria-hidden="true"><CatIcon category={item.category} /></span>

      {skinUrl ? (
        <img alt="" decoding="async" loading="lazy" src={skinUrl} />
      ) : item.category === 'buttons' ? (
        <span
          className="market-card__preview-btn"
          style={{ background: resolveButtonColor(item.text_m) }}
        >
          START
        </span>
      ) : item.category === 'emojis' || item.category === 'premium_emojis' ? (
        <span className="market-card__preview-emoji">{text}</span>
      ) : (
        <span className="market-card__preview-letter">{text}</span>
      )}
    </div>
  );
}

/* ---------- плита товара ---------- */
function ShopCard({ busy, item, onEquip, onFavorite, onPurchase }) {
  const { t } = useTranslation();
  const canEquip = item.is_owned && isEquippable(item.category);
  const price = item.price ?? 0;
  const disabled = busy || item.is_active || (!item.is_owned && !onPurchase);

  const actionLabel = item.is_active
    ? t('shop.active')
    : item.is_owned
      ? t('shop.equip')
      : <span className="market-card__price"><IoPlanet /> {formatNumber(price)}</span>;

  const handleAction = () => {
    if (item.is_active) return;
    if (canEquip) onEquip(item);
    else if (onPurchase) onPurchase(item);
  };

  const cardClass = [
    'market-card',
    item.is_favorite && 'is-fav',
    item.is_owned && 'is-owned',
    item.is_active && 'is-active',
  ].filter(Boolean).join(' ');

  const actionClass = [
    'ops-claim',
    'market-card__action',
    item.is_active && 'is-active',
    canEquip && 'is-equip',
  ].filter(Boolean).join(' ');

  return (
    <article className={cardClass}>
      <span className="market-card__scan" aria-hidden="true" />

      <button
        className={`market-card__fav ${item.is_favorite ? 'is-filled' : ''}`}
        aria-label={item.is_favorite ? t('shop.favoriteRemoveFull') : t('shop.favoriteAddFull')}
        type="button"
        onClick={() => onFavorite(item)}
      >
        <FiHeart />
      </button>

      <ItemPreview item={item} />

      <div className="market-card__body">
        {item.category !== 'buttons' && (
          <>
            <h3 className="market-card__name">{itemName(item)}</h3>
            <span className="market-card__cat">{categoryText(item.category)}</span>
          </>
        )}

        <div className="market-card__foot">
          {item.is_owned && (
            <span className="market-card__owned"><FiCheck size={11} /> {t('shop.owned')}</span>
          )}

          <button
            className={actionClass}
            disabled={disabled}
            type="button"
            onClick={handleAction}
          >
            <span className="ops-claim__sheen" aria-hidden="true" />
            {busy ? '…' : actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ---------- главный экран ---------- */
const SORT_OPTIONS = [
  { value: 'default', labelKey: 'shop.sortDefault' },
  { value: 'price-desc', labelKey: 'shop.sortPriceDesc' },
  { value: 'price-asc', labelKey: 'shop.sortPriceAsc' },
];

/**
 * Маркет в оформлении «терминала снабжения»: тот же техно-каркас, что у миссий
 * и кейсов (`ops-hero` со счётчиком баланса, `ops-panel` с угловыми скобками),
 * но в ледяной гамме витрины — моно-подписи, плиты товаров со сканирующей
 * линией и цена в звёздах. Логика покупки, избранного и экипировки прежняя.
 */
function ShopScreen({ busyItemId, data, onEquip, onFavorite, onPurchase }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [sortOpen, setSortOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(48);

  const categories = useMemo(() => [...data.categories].sort(compareCategories), [data.categories]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.shopItems.filter(item => {
      // скрыть скин графика с флагом СССР из магазина (не удаляя из конфига)
      if (item.category?.startsWith('chart_skin_')) {
        const rawKey = String(item.text_f || item.text_m || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_');
        if (rawKey === 'ussr') return false;
      }
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return itemName(item).toLowerCase().includes(q);
    });

    if (sortBy === 'price-asc') {
      return [...filtered].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    }
    if (sortBy === 'price-desc') {
      return [...filtered].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    }
    return filtered;
  }, [category, data.shopItems, query, sortBy]);

  const visible = items.slice(0, visibleCount);

  const changeCategory = (cat) => { setCategory(cat); setVisibleCount(48); };
  const changeQuery = (e) => { setQuery(e.target.value); setVisibleCount(48); };
  const changeSort = (sort) => { setSortBy(sort); setVisibleCount(48); setSortOpen(false); };

  const activeSortLabel = t(SORT_OPTIONS.find(o => o.value === sortBy)?.labelKey || 'shop.sortDefault');

  // Сколько товаров уже в коллекции и сколько звёзд на счету — это шапка витрины.
  const ownedCount = data.shopItems.filter(i => i.is_owned).length;
  const totalCount = data.shopItems.length;
  const balance = Number(data.user?.starcoins || 0);

  return (
    <section className="screen shop-screen">
      {/* ===== шапка-терминал: раздел и баланс звёзд ===== */}
      <header className="ops-hero market-hero">
        <span className="ops-hero__grid" aria-hidden="true" />
        <span className="ops-hero__beam" aria-hidden="true" />

        <div className="ops-hero__main">
          <span className="ops-hero__eyebrow">{t('shop.heroEyebrow')}</span>
          <h1>{t('shop.heroTitle')}</h1>
          <p>{t('shop.heroSub')}</p>
        </div>

        <div className="ops-hero__reset market-hero__balance">
          <span>{t('shop.balance')}</span>
          <strong className="market-hero__stars"><IoPlanet /> {formatNumber(balance)}</strong>
        </div>
      </header>

      {/* ===== поиск, сортировка и категории ===== */}
      <section className="ops-panel market-panel">
        <div className="ops-panel__head">
          <span className="ops-panel__label">{t('shop.filterLabel')}</span>
          <span className="ops-panel__count market-panel__note">
            <FiClock />
            {t('shop.dailyUpdate')}
          </span>
        </div>

        <div className="market-tools">
          <div className="market-tools__row">
            <label className="market-search">
              <FiSearch />
              <input
                placeholder={t('shop.searchPlaceholder')}
                value={query}
                onChange={changeQuery}
              />
            </label>

            <div className="market-sort">
              <button
                className={`market-sort__trigger ${sortOpen ? 'is-open' : ''}`}
                type="button"
                onClick={() => setSortOpen(o => !o)}
              >
                <span>{activeSortLabel}</span>
                <FiChevronDown />
              </button>

              {sortOpen && (
                <div className="market-sort__menu">
                  {SORT_OPTIONS.map(opt => (
                    <button
                      className={`market-sort__option ${sortBy === opt.value ? 'is-active' : ''}`}
                      key={opt.value}
                      type="button"
                      onClick={() => changeSort(opt.value)}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="market-cats">
            <button
              className={`market-cat ${category === 'all' ? 'is-active' : ''}`}
              type="button"
              onClick={() => changeCategory('all')}
            >
              {t('shop.all')}
            </button>

            {categories.map(cat => (
              <button
                className={`market-cat ${category === cat ? 'is-active' : ''}`}
                key={cat}
                type="button"
                onClick={() => changeCategory(cat)}
              >
                <CatIcon category={cat} />
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ===== каталог товаров ===== */}
      <section className="ops-panel market-panel">
        <div className="ops-panel__head">
          <span className="ops-panel__label">{t('shop.catalogLabel')}</span>
          <span className="ops-panel__count market-panel__note">
            <FiLayers />
            {t('shop.ownedCounter', { owned: ownedCount, total: totalCount })}
          </span>
        </div>

        {items.length > 0 ? (
          <div className="market-catalog">
            <div className="market-grid">
              {visible.map(item => (
                <ShopCard
                  key={item.id}
                  busy={busyItemId === item.id}
                  item={item}
                  onEquip={onEquip}
                  onFavorite={onFavorite}
                  onPurchase={onPurchase}
                />
              ))}
            </div>

            {items.length > visibleCount && (
              <button
                className="ops-claim market-more"
                type="button"
                onClick={() => setVisibleCount(c => c + 48)}
              >
                <span className="ops-claim__sheen" aria-hidden="true" />
                {t('shop.showMore', { count: Math.min(48, items.length - visibleCount) })}
              </button>
            )}
          </div>
        ) : (
          <div className="market-empty">
            <FiBox size={30} />
            <p>{t('shop.empty')}</p>
          </div>
        )}
      </section>
    </section>
  );
}

export default ShopScreen;
