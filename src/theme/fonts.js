/**
 * ЕДИНОЕ МЕСТО СО ВСЕМИ ШРИФТАМИ ПРИЛОЖЕНИЯ.
 *
 * Устроено так же, как цвета (`src/theme/colors.js`): набор пресетов живёт здесь,
 * а при старте (`applyThemeFonts()` в `src/main.jsx`) раскладывается в CSS-переменные:
 *
 * * `--font-display` — заголовки, крупные цифры, имена (характер приложения);
 * * `--font-body`    — весь интерфейсный текст и инпуты;
 * * `--font-mono`    — код, листинги, «матричные» подписи;
 * * `--font-serif`   — акцентные «премиум»-заголовки (например, на экране VIP).
 *
 * Чтобы поменять шрифты — правишь (или добавляешь) пресет ниже.
 * Чтобы вернуть прежние системные шрифты без пересборки — открой мини-апп
 * с `?type=system` в адресе, а чтобы зафиксировать откат — `defaultTypography = 'system'`.
 */

/** Системный стек: сюда приложение откатывается, если веб-шрифт не загрузился. */
const uiFallback = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const monoFallback = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";
const serifFallback = "Georgia, 'Times New Roman', serif";

export const fontPresets = {
  /**
   * «Техно» (пресет по умолчанию): сильный геометричный дисплей Unbounded,
   * спокойный UI-гротеск Manrope и техно-моно JetBrains Mono.
   * Все три шрифта есть в Google Fonts и поддерживают кириллицу (ru/uk).
   */
  tech: {
    label: 'Техно',
    display: `'Unbounded', 'Manrope', ${uiFallback}`,
    body: `'Manrope', ${uiFallback}`,
    mono: `'JetBrains Mono', 'Manrope', ${monoFallback}`,
    serif: `'Playfair Display', ${serifFallback}`,
    displayWeight: 700,
    displayTracking: '-0.02em',
    labelTracking: '0.08em',
    numberFeatures: "'tnum' 1, 'ss01' 1",
    url: 'https://fonts.googleapis.com/css2?family=Unbounded:wght@300..900&family=Manrope:wght@400..800&family=JetBrains+Mono:wght@400..700&family=Playfair+Display:wght@500..700&display=swap',
  },

  /** «Онест»: современный мягкий гротеск и на заголовках, и в тексте. */
  onest: {
    label: 'Онест',
    display: `'Onest', ${uiFallback}`,
    body: `'Onest', ${uiFallback}`,
    mono: `'JetBrains Mono', ${monoFallback}`,
    serif: `'Playfair Display', ${serifFallback}`,
    displayWeight: 800,
    displayTracking: '-0.015em',
    labelTracking: '0.06em',
    numberFeatures: "'tnum' 1",
    url: 'https://fonts.googleapis.com/css2?family=Onest:wght@400..800&family=JetBrains+Mono:wght@400..700&family=Playfair+Display:wght@500..700&display=swap',
  },

  /** Полный откат: ничего не скачивается, только системные шрифты Telegram/ОС. */
  system: {
    label: 'Системный',
    display: uiFallback,
    body: uiFallback,
    mono: monoFallback,
    serif: serifFallback,
    displayWeight: 800,
    displayTracking: '-0.01em',
    labelTracking: '0.06em',
    numberFeatures: "'tnum' 1",
    url: '',
  },
};

/** ← Вот здесь переключается типографика: 'tech' | 'onest' | 'system'. */
export const defaultTypography = 'tech';

export const activeTypography = resolveTypographyName();

export const typography = fontPresets[activeTypography] || fontPresets.tech;

/** Пресет можно сравнить без пересборки: `?type=system` в адресе мини-аппа. */
function resolveTypographyName() {
  if (typeof window === 'undefined') {
    return defaultTypography;
  }

  const requested = new URLSearchParams(window.location.search).get('type');

  return requested && fontPresets[requested] ? requested : defaultTypography;
}

/**
 * Опциональные локальные шрифты: если у пресета заполнено `faces`,
 * файлы берутся из `public/fonts/*` и Google Fonts не нужен вовсе
 * (офлайн-режим, свой шрифт, никаких внешних запросов).
 *
 * Пример пресета:
 * faces: [
 *   { family: 'SpaceUI', src: '/fonts/space-ui-600.woff2', weight: '600' },
 *   { family: 'SpaceUI', src: '/fonts/space-ui-600-cy.woff2', weight: '600', unicodeRange: 'U+0400-04FF' },
 * ]
 */
export function fontFaceCss(preset = typography) {
  return (preset.faces || []).map(face => [
    '@font-face {',
    `  font-family: '${face.family}';`,
    `  font-style: ${face.style || 'normal'};`,
    `  font-weight: ${face.weight || '400'};`,
    `  font-display: swap;`,
    face.unicodeRange ? `  unicode-range: ${face.unicodeRange};` : '',
    `  src: url('${face.src}') format('${face.format || 'woff2'}');`,
    '}',
  ].filter(Boolean).join('\n')).join('\n\n');
}

/**
 * Подключает шрифты активного пресета: один `<link>` на Google Fonts
 * и/или `<style>` с локальными `@font-face`. Идемпотентно,
 * для пресета `system` не грузит ничего.
 */
function loadTypographyFonts() {
  if (typeof document === 'undefined') {
    return;
  }

  if (typography.url && !document.querySelector('link[data-app-fonts]')) {
    ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].forEach(origin => {
      const preconnect = document.createElement('link');

      preconnect.rel = 'preconnect';
      preconnect.href = origin;
      preconnect.crossOrigin = 'anonymous';
      preconnect.dataset.appFontsPreconnect = origin;
      document.head.append(preconnect);
    });

    const link = document.createElement('link');

    link.rel = 'stylesheet';
    link.href = typography.url;
    link.dataset.appFonts = activeTypography;
    document.head.append(link);
  }

  const faces = fontFaceCss(typography);

  if (faces && !document.querySelector('style[data-app-fonts-local]')) {
    const style = document.createElement('style');

    style.dataset.appFontsLocal = activeTypography;
    style.textContent = faces;
    document.head.append(style);
  }
}

/**
 * Раскладывает пресет в CSS-переменные и подключает шрифты.
 * Вызывается до первого рендера — рядом с `applyThemeColors()`.
 */
export function applyThemeFonts() {
  if (typeof document === 'undefined') {
    return;
  }

  loadTypographyFonts();

  const root = document.documentElement;

  root.style.setProperty('--font-display', typography.display);
  root.style.setProperty('--font-body', typography.body);
  root.style.setProperty('--font-mono', typography.mono);
  root.style.setProperty('--font-serif', typography.serif || serifFallback);
  root.style.setProperty('--font-display-weight', String(typography.displayWeight));
  root.style.setProperty('--tracking-display', typography.displayTracking);
  root.style.setProperty('--tracking-label', typography.labelTracking);
  root.style.setProperty('--font-number-features', typography.numberFeatures);
  root.dataset.typography = activeTypography;
}
