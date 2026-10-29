import {
  TbBackpack,
  TbBook,
  TbCrown,
  TbGift,
  TbHelpCircle,
  TbShoppingBag,
  TbTargetArrow,
  TbUserCircle,
} from 'react-icons/tb';

/**
 * Справка для всплывающего окна «?».
 *
 * Тексты живут в словарях (`help.sections.<id>.title/.text/.tips.N`),
 * здесь — только оформление: иконка, акцент и раздел документации,
 * который открывается кнопкой «Полная документация».
 */
export const helpSections = {
  common: { textKey: 'help.sections.common', icon: TbHelpCircle, tone: 'accent', topic: 'common' },
  cases: { textKey: 'help.sections.cases', icon: TbGift, tone: 'accent', topic: 'cases' },
  shop: { textKey: 'help.sections.shop', icon: TbShoppingBag, tone: 'accent-2', topic: 'shop' },
  docs: { textKey: 'help.sections.docs', icon: TbBook, tone: 'accent', topic: 'common' },
  inventory: { textKey: 'help.sections.inventory', icon: TbBackpack, tone: 'amber', topic: 'inventory' },
  missions: { textKey: 'help.sections.missions', icon: TbTargetArrow, tone: 'green', topic: 'missions' },
  profile: { textKey: 'help.sections.profile', icon: TbUserCircle, tone: 'pink', topic: 'profile' },
  vip: { textKey: 'help.sections.vip', icon: TbCrown, tone: 'amber', topic: 'shop' },
};

/** Сколько пунктов-подсказок показывает окно (столько же в словарях). */
export const helpTipsCount = 3;

/** Мета раздела с откатом на «Общее» — для служебных экранов вроде админки. */
export function helpSectionMeta(id) {
  return helpSections[id] || helpSections.common;
}
