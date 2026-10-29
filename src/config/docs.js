/**
 * Конфиг раздела «Документация» (Epic 2).
 *
 * Здесь только данные и ключи словаря (`docs.*`) — подписи берутся через `t()`,
 * поэтому новые языки интерфейса подхватываются автоматически.
 */
import { supportUrl } from './support.js';

/**
 * Типы блоков, из которых собирается статья. Порядок = порядок в палитре «+».
 * `primary` — то, чем пользуются чаще всего: показывается сразу, остальное
 * складывается в «Другие блоки», чтобы палитра не пугала 15 кнопками.
 */
export const docsBlockTypes = [
  { type: 'text', icon: '📝', labelKey: 'docs.block.text', hintKey: 'docs.blockHint.text', primary: true },
  { type: 'heading', icon: '🔠', labelKey: 'docs.block.heading', hintKey: 'docs.blockHint.heading', primary: true },
  { type: 'list', icon: '📋', labelKey: 'docs.block.list', hintKey: 'docs.blockHint.list', primary: true },
  { type: 'image', icon: '🖼️', labelKey: 'docs.block.image', hintKey: 'docs.blockHint.image', primary: true },
  { type: 'callout', icon: '💡', labelKey: 'docs.block.callout', hintKey: 'docs.blockHint.callout', primary: true },
  { type: 'quote', icon: '💬', labelKey: 'docs.block.quote', hintKey: 'docs.blockHint.quote', primary: true },
  { type: 'divider', icon: '➖', labelKey: 'docs.block.divider', hintKey: 'docs.blockHint.divider', primary: true },
  { type: 'badges', icon: '🏷️', labelKey: 'docs.block.badges', hintKey: 'docs.blockHint.badges' },
  { type: 'steps', icon: '🪜', labelKey: 'docs.block.steps', hintKey: 'docs.blockHint.steps' },
  { type: 'stats', icon: '📈', labelKey: 'docs.block.stats', hintKey: 'docs.blockHint.stats' },
  { type: 'spoiler', icon: '🔽', labelKey: 'docs.block.spoiler', hintKey: 'docs.blockHint.spoiler' },
  { type: 'progress', icon: '📶', labelKey: 'docs.block.progress', hintKey: 'docs.blockHint.progress' },
  { type: 'link', icon: '🔗', labelKey: 'docs.block.link', hintKey: 'docs.blockHint.link' },
  { type: 'code', icon: '💻', labelKey: 'docs.block.code', hintKey: 'docs.blockHint.code' },
  { type: 'table', icon: '📊', labelKey: 'docs.block.table', hintKey: 'docs.blockHint.table' },
];

/** Блоки палитры, разложенные на «основные» и «дополнительные». */
export const docsPrimaryBlocks = docsBlockTypes.filter(block => block.primary);
export const docsExtraBlocks = docsBlockTypes.filter(block => !block.primary);

/**
 * Готовые основы для новой статьи: админ выбирает шаблон вместо пустой страницы.
 * Тексты берутся из словаря (`docs.admin.template.*`), поэтому одна и та же
 * основа корректно работает на любом языке интерфейса.
 */
export const docsTemplates = [
  {
    id: 'guide',
    icon: '🪜',
    labelKey: 'docs.admin.template.guide',
    hintKey: 'docs.admin.template.guideHint',
    blocks: [
      { type: 'heading', textKey: 'docs.admin.template.guideTitle' },
      { type: 'text', textKey: 'docs.admin.template.guideIntro' },
      { type: 'list', itemsKeys: ['docs.admin.template.guideItem1', 'docs.admin.template.guideItem2', 'docs.admin.template.guideItem3'] },
      { type: 'callout', tone: 'tip', titleKey: 'docs.admin.template.guideTipTitle', textKey: 'docs.admin.template.guideTipText' },
    ],
  },
  {
    id: 'faq',
    icon: '❔',
    labelKey: 'docs.admin.template.faq',
    hintKey: 'docs.admin.template.faqHint',
    blocks: [
      { type: 'text', textKey: 'docs.admin.template.faqIntro' },
      { type: 'spoiler', titleKey: 'docs.admin.template.faqQ1', textKey: 'docs.admin.template.faqA1' },
      { type: 'spoiler', titleKey: 'docs.admin.template.faqQ2', textKey: 'docs.admin.template.faqA2' },
    ],
  },
];

/** Тематические оформления статьи: фон, акценты и свечение. */
export const docsThemes = [
  { id: 'nebula', labelKey: 'docs.theme.nebula' },
  { id: 'aurora', labelKey: 'docs.theme.aurora' },
  { id: 'sunset', labelKey: 'docs.theme.sunset' },
  { id: 'ocean', labelKey: 'docs.theme.ocean' },
  { id: 'candy', labelKey: 'docs.theme.candy' },
  { id: 'mint', labelKey: 'docs.theme.mint' },
  { id: 'gold', labelKey: 'docs.theme.gold' },
  { id: 'cyber', labelKey: 'docs.theme.cyber' },
  { id: 'graphite', labelKey: 'docs.theme.graphite' },
  { id: 'paper', labelKey: 'docs.theme.paper' },
];

export const defaultDocsTheme = 'nebula';

/** Статусы статьи: черновик виден только в админке. */
export const docsStatuses = ['draft', 'published'];

export const docsHeadingLevels = [
  { level: 2, label: 'H2' },
  { level: 3, label: 'H3' },
];

/** Выравнивание: иконки рисует AlignPicker (react-icons), здесь только ids. */
export const docsAlignOptions = [
  { id: 'left', labelKey: 'docs.align.left' },
  { id: 'center', labelKey: 'docs.align.center' },
  { id: 'right', labelKey: 'docs.align.right' },
];

export const docsTextSizes = [
  { id: 'md', labelKey: 'docs.textSize.md' },
  { id: 'lg', labelKey: 'docs.textSize.lg' },
];

export const docsListStyles = [
  { id: 'bullet', icon: '🔹', labelKey: 'docs.listStyle.bullet' },
  { id: 'number', icon: '1.', labelKey: 'docs.listStyle.number' },
  { id: 'check', icon: '✅', labelKey: 'docs.listStyle.check' },
];

export const docsImageSizes = [
  { id: 'full', labelKey: 'docs.imageSize.full' },
  { id: 'md', labelKey: 'docs.imageSize.md' },
  { id: 'sm', labelKey: 'docs.imageSize.sm' },
];

export const docsCalloutTones = [
  { id: 'info', icon: 'ℹ️', labelKey: 'docs.tone.info' },
  { id: 'tip', icon: '💡', labelKey: 'docs.tone.tip' },
  { id: 'success', icon: '✅', labelKey: 'docs.tone.success' },
  { id: 'warn', icon: '⚠️', labelKey: 'docs.tone.warn' },
];

export const docsDividerStyles = [
  { id: 'line', labelKey: 'docs.dividerStyle.line' },
  { id: 'glow', labelKey: 'docs.dividerStyle.glow' },
  { id: 'stars', labelKey: 'docs.dividerStyle.stars' },
];

/**
 * Акцентные тона для блоков «плашки» и «кнопка-ссылка».
 * Отличаются от тонов врезки: тут важнее цвет самого чипа, а не текста.
 */
export const docsAccentTones = [
  { id: 'accent', icon: '🟣', labelKey: 'docs.accentTone.accent' },
  { id: 'accent-2', icon: '🩷', labelKey: 'docs.accentTone.accentTwo' },
  { id: 'success', icon: '✅', labelKey: 'docs.accentTone.success' },
  { id: 'warn', icon: '⚠️', labelKey: 'docs.accentTone.warn' },
];

/** Быстрый выбор иконки статьи. */
export const docsIcons = [
  '📘', '🚀', '🎁', '🛍', '🎯', '🧭', '💎', '🛠', '🔒', '📣', '💡', '✨',
  '🏷', '🪜', '📈', '🔗', '🧩', '🗺', '🎓', '⚡', '🛡', '📦', '🕹', '🏆',
];

/** Порядок языковых версий статьи. */
export const docsLocaleOrder = ['ru', 'uk', 'en'];

export const docsFallbackLocale = 'ru';

/**
 * Разделы справки: к какому экрану относится статья.
 *
 * Кнопка «?» на экране открывает документацию с фильтром по этому разделу,
 * а в редакторе админки раздел выбирается вручную. Порядок = порядок чипов.
 */
export const docsTopics = [
  { id: 'common', icon: '❓', labelKey: 'docs.topic.common' },
  { id: 'home', icon: '🏠', labelKey: 'docs.topic.home' },
  { id: 'cases', icon: '🎁', labelKey: 'docs.topic.cases' },
  { id: 'shop', icon: '🛍️', labelKey: 'docs.topic.shop' },
  { id: 'inventory', icon: '🎒', labelKey: 'docs.topic.inventory' },
  { id: 'missions', icon: '🎯', labelKey: 'docs.topic.missions' },
  { id: 'profile', icon: '👤', labelKey: 'docs.topic.profile' },
];

export const defaultDocsTopic = 'common';

export const docsTopicIds = docsTopics.map(topic => topic.id);

/** Мета раздела справки по id — с откатом на «Общее». */
export function docsTopicMeta(id) {
  return docsTopics.find(topic => topic.id === id) || docsTopics[0];
}

/**
 * Ссылка «написать в поддержку» в блоке помощи.
 * Значение общее для всего приложения (см. `supportUrl` в `src/config/support.js`),
 * здесь — имя под раздел справки: если ссылки нет, показываем подсказку без кнопки.
 */
export const docsSupportUrl = supportUrl;

/** Ключ localStorage: пользователь закрыл приветственный блок документации на главной. */
export const docsOnboardingKey = 'space.docs.onboarding';

/** Ограничения, синхронные с сервером (server/docsApi.js). */
export const docsLimits = {
  blocks: 300,
  listItems: 40,
  tableColumns: 8,
  tableRows: 40,
  imageLength: 1400000,
};
