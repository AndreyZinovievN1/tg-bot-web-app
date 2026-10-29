import { TbBook, TbGift, TbShoppingBag, TbTargetArrow, TbUserCircle } from 'react-icons/tb';

/**
 * Навигация Mini App.
 * Подписи хранятся в словарях (`src/i18n/locales/*`), в конфиге — только ключи,
 * поэтому новые языки подхватываются автоматически.
 *
 * Иконки — компоненты `react-icons` (Tabler), а не «текстовые» символы:
 * так вкладки выглядят одинаково и аккуратно в любом Telegram-клиенте.
 */
export const tabs = [
  { id: 'cases', labelKey: 'nav.cases', Icon: TbGift },
  { id: 'shop', labelKey: 'nav.shop', Icon: TbShoppingBag },
  { id: 'docs', labelKey: 'nav.docs', Icon: TbBook },
  { id: 'missions', labelKey: 'nav.missions', Icon: TbTargetArrow },
  { id: 'profile', labelKey: 'nav.profile', Icon: TbUserCircle },
];

/**
 * Разделы без вкладки в нижнем меню.
 *
 * `inventory` («Склад») живёт отдельным блоком внизу профиля — так в меню
 * помещается документация, а склад остаётся в одном тапе от него.
 * `vip` — золотая карточка в профиле: подписка продаётся за звёзды Telegram,
 * поэтому в нижнем меню ей места нет.
 * `home` и `admin` — служебные состояния, они тоже не показываются в меню.
 */
export const hiddenTabs = ['home', 'inventory', 'vip', 'admin'];

export function tabLabel(t, activeTab) {
  return t(tabs.find(tab => tab.id === activeTab)?.labelKey || 'nav.home');
}

export function screenTitle(t, activeTab) {
  if (activeTab === 'admin') {
    return t('nav.admin');
  }

  if (activeTab === 'vip') {
    return t('nav.vip');
  }

  return tabLabel(t, activeTab);
}

