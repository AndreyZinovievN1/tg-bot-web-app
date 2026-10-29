import { docsFallbackLocale, docsLimits, docsLocaleOrder, docsOnboardingKey } from '../config/docs.js';
import { richTextToPlainText } from './richText.js';

/**
 * Хелперы редактора документации: черновики блоков и статей, статистика,
 * работа с языковыми версиями и подготовка изображений.
 */

let blockCounter = 0;

/** Уникальный id блока внутри языковой версии статьи. */
export function createBlockId(type) {
  blockCounter += 1;
  return `${type}-${Date.now().toString(36)}-${blockCounter.toString(36)}`;
}

const blockDefaults = {
  heading: () => ({ text: '', level: 2, align: 'left' }),
  text: () => ({ text: '', size: 'md', align: 'left' }),
  list: () => ({ style: 'bullet', items: [''] }),
  badges: () => ({ items: [{ text: '', tone: 'accent' }] }),
  steps: () => ({ items: [{ title: '', text: '' }] }),
  stats: () => ({ items: [{ label: '', value: '', icon: '' }] }),
  image: () => ({ src: '', alt: '', caption: '', size: 'full', align: 'left', rounded: false }),
  quote: () => ({ text: '', author: '' }),
  callout: () => ({ tone: 'info', title: '', text: '' }),
  spoiler: () => ({ title: '', text: '' }),
  progress: () => ({ label: '', value: 0, max: 100, tone: 'info' }),
  link: () => ({ text: '', href: '', icon: '', tone: 'accent' }),
  code: () => ({ code: '', language: '' }),
  table: () => ({ head: ['', ''], rows: [['', '']] }),
  divider: () => ({ style: 'line' }),
};

export function isDocsBlockType(type) {
  return Boolean(blockDefaults[type]);
}

/** Новый пустой блок выбранного типа. */
export function createBlock(type) {
  const resolved = isDocsBlockType(type) ? type : 'text';
  return { id: createBlockId(resolved), type: resolved, ...blockDefaults[resolved]() };
}

function normalizeBlock(block, index) {
  const resolved = isDocsBlockType(block?.type) ? block.type : 'text';
  const source = block && typeof block === 'object' ? block : {};

  return {
    ...blockDefaults[resolved](),
    ...source,
    type: resolved,
    id: String(source.id || `${resolved}-${index}`),
  };
}

/** Приводит блоки с сервера к виду редактора: известный тип + гарантированный id. */
export function normalizeArticleBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return [];
  }

  return blocks.slice(0, docsLimits.blocks).map((block, index) => normalizeBlock(block, index));
}

export function createArticleVersion(locale) {
  return { locale, title: '', summary: '', blocks: [] };
}

export function normalizeArticleVersions(translations) {
  if (!Array.isArray(translations)) {
    return [];
  }

  return translations.map(version => ({
    locale: version.locale,
    title: version.title || '',
    summary: version.summary || '',
    blocks: normalizeArticleBlocks(version.blocks),
  }));
}

/** Плоский текст статьи — для поиска, статистики и оценки времени чтения. */
export function articlePlainText(blocks) {
  return (blocks || [])
    .map(block => {
      if (!block) {
        return '';
      }

      if (block.type === 'list') {
        return (block.items || []).map(item => richTextToPlainText(item)).join(' ');
      }

      if (block.type === 'table') {
        return [...(block.head || []), ...((block.rows || []).flat())].map(cell => richTextToPlainText(cell)).join(' ');
      }

      if (block.type === 'code') {
        return block.code || '';
      }

      if (Array.isArray(block.items)) {
        return block.items
          .map(item => (item && typeof item === 'object'
            ? [item.text, item.title, item.label, item.value].filter(Boolean).map(String).join(' ')
            : String(item || '')))
          .join(' ');
      }

      if (block.type === 'progress') {
        return [block.label, block.value, block.max].filter(value => value !== '' && value !== undefined).join(' ');
      }

      return [block.title, block.text, block.caption, block.alt, block.author, block.href].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(' ');
}

/** Примерное время чтения: 180 слов в минуту, минимум одна минута. */
export function estimateReadingMinutes(blocks) {
  const words = articlePlainText(blocks).trim().split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.round(words / 180));
}

/** Перемещение элемента списка на `offset` позиций (блоки, пункты, строки таблицы). */
export function moveInArray(list, index, offset) {
  const target = index + offset;

  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return list;
  }

  const next = [...list];

  next[index] = list[target];
  next[target] = list[index];

  return next;
}

/** Дубликат блока: копия с новым id и отдельными массивами внутри. */
export function duplicateBlock(block) {
  const copy = { ...normalizeBlock(block, 0), id: createBlockId(block.type) };

  if (Array.isArray(copy.items)) {
    // У «списка» элементы — строки, у «плашек»/«шагов»/«метрик» — объекты.
    copy.items = copy.items.map(item => (item && typeof item === 'object' ? { ...item } : item));
  }

  if (Array.isArray(copy.head)) {
    copy.head = [...copy.head];
  }

  if (Array.isArray(copy.rows)) {
    copy.rows = copy.rows.map(row => [...row]);
  }

  return copy;
}

/**
 * Короткое описание блока для свёрнутой карточки в редакторе: одной строки
 * достаточно, чтобы понять содержимое блока, не раскрывая его.
 */
export function blockSummary(block, t) {
  if (!block) {
    return '';
  }

  const plain = value => richTextToPlainText(value || '').replace(/\s+/g, ' ').trim();
  const label = key => (typeof t === 'function' ? t(key) : key);
  const joinText = (values, count = 3) => values.map(plain).filter(Boolean).slice(0, count).join(' · ');
  const list = Array.isArray(block.items) ? block.items : [];
  let summary = '';

  if (block.type === 'heading' || block.type === 'text' || block.type === 'quote') {
    summary = plain(block.text) || plain(block.author);
  } else if (block.type === 'list') {
    summary = joinText(list);
  } else if (block.type === 'badges') {
    summary = list.map(item => plain(item?.text)).filter(Boolean).slice(0, 4).join(' · ');
  } else if (block.type === 'steps') {
    summary = list.map(item => plain(item?.title) || plain(item?.text)).filter(Boolean).slice(0, 3).join(' · ');
  } else if (block.type === 'stats') {
    summary = list
      .map(item => [plain(item?.value), plain(item?.label)].filter(Boolean).join(' '))
      .filter(Boolean)
      .slice(0, 4)
      .join(' · ');
  } else if (block.type === 'image') {
    summary = plain(block.caption)
      || plain(block.alt)
      || (String(block.src || '').startsWith('data:') ? label('docs.admin.imageAttached') : String(block.src || ''));
  } else if (block.type === 'callout' || block.type === 'spoiler') {
    summary = [plain(block.title), plain(block.text)].filter(Boolean).join(' · ');
  } else if (block.type === 'progress') {
    summary = [plain(block.label), `${block.value ?? 0}/${block.max ?? 100}`].filter(Boolean).join(' · ');
  } else if (block.type === 'link') {
    summary = plain(block.text) || String(block.href || '');
  } else if (block.type === 'code') {
    summary = [block.language, String(block.code || '').split('\n')[0]].map(plain).filter(Boolean).join(' · ');
  } else if (block.type === 'table') {
    summary = joinText(Array.isArray(block.head) ? block.head : [], 4);
  }

  return summary.slice(0, 120);
}

/**
 * Собирает блоки из шаблона статьи, подставляя тексты через `t` — так основа
 * одинаково выглядит на любом языке и не тянет за собой захардкоженный текст.
 */
export function buildTemplateBlocks(template, t) {
  const specs = Array.isArray(template?.blocks) ? template.blocks : [];

  return specs.map(spec => {
    const block = createBlock(spec.type);

    if (spec.textKey) {
      block.text = t(spec.textKey);
    }

    if (spec.titleKey) {
      block.title = t(spec.titleKey);
    }

    if (spec.tone) {
      block.tone = spec.tone;
    }

    if (Array.isArray(spec.itemsKeys)) {
      block.items = block.type === 'badges'
        ? spec.itemsKeys.map(key => ({ text: t(key), tone: 'accent' }))
        : spec.itemsKeys.map(key => t(key));
    }

    return block;
  });
}

/** Языки в фиксированном порядке ru → uk → en. */
export function sortLocales(locales) {
  return [...locales].sort((left, right) => docsLocaleOrder.indexOf(left) - docsLocaleOrder.indexOf(right));
}

/** Языки, которых ещё нет у статьи (для кнопок «добавить язык»). */
export function missingLocales(locales) {
  return docsLocaleOrder.filter(code => !(locales || []).includes(code));
}

/** Языковая версия, которую стоит открыть по умолчанию. */
export function defaultArticleLocale(locales, preferred) {
  if (preferred && (locales || []).includes(preferred)) {
    return preferred;
  }

  return (locales || [])[0] || docsFallbackLocale;
}

/**
 * Приветственный блок документации на главной: показываем до первого закрытия.
 * Ошибки хранилища (приватный режим) трактуем как «не закрыт».
 */
export function isDocsOnboardingDismissed() {
  try {
    return window.localStorage.getItem(docsOnboardingKey) === '1';
  } catch {
    return false;
  }
}

/** Запоминает, что пользователь закрыл приветственный блок документации. */
export function dismissDocsOnboarding() {
  try {
    window.localStorage.setItem(docsOnboardingKey, '1');
  } catch {
    // Хранилище недоступно — блок просто покажется в следующий раз.
  }
}

/**
 * Готовит выбранный файл к вставке в блок «изображение»: уменьшает до `maxSide`
 * по длинной стороне и при необходимости пережимает в JPEG, чтобы картинка
 * вместе с разметкой помещалась в лимит payload.
 */
export function imageFileToDataUrl(file, { maxSide = 1400, quality = 0.86, limit = docsLimits.imageLength } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('docs.errors.notImage'));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(new Error('docs.errors.imageRead'));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error('docs.errors.imageDecode'));

      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');

        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);

        const keepsAlpha = file.type === 'image/png' || file.type === 'image/webp';
        const png = canvas.toDataURL('image/png');
        const dataUrl = keepsAlpha && png.length <= limit ? png : canvas.toDataURL('image/jpeg', quality);

        if (dataUrl.length > limit) {
          reject(new Error('docs.errors.imageTooBig'));
          return;
        }

        resolve(dataUrl);
      };

      image.src = String(reader.result || '');
    };

    reader.readAsDataURL(file);
  });
}
