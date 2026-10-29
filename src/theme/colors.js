/**
 * ЕДИНОЕ МЕСТО СО ВСЕМИ ЦВЕТАМИ ПРИЛОЖЕНИЯ.
 *
 * Все цвета сайта живут здесь и раскладываются в CSS-переменные при старте
 * (`--rgb-<токен>` — каналы для полупрозрачности, `--<токен>` — готовый цвет).
 * Чтобы поменять оформление целиком — правишь числа ниже (rgb-каналы 0–255).
 *
 * Хочешь вернуть прежние цвета — переключи `defaultPalette` на 'cosmic'
 * (или открой мини-апп с `?theme=cosmic` в адресе, без пересборки).
 */
export const palettes = {
  /**
   * Киберпанк: неоновый ультрафиолет + маджента, глубокие сливово-чёрные
   * поверхности, мятный неон для наград. Голубой из «космической» палитры
   * заменён на ультрафиолет (accent) и ледяной тил (ice).
   */
  cyberpunk: {
    // ── Фон и поверхности ──────────────────────────────────────────────
    'bg-deep': [4, 3, 12], // #04030C — самый тёмный фон (страница, модалки)
    bg: [8, 6, 20], // #080614 — фон приложения
    surface: [17, 12, 33], // #110C21 — панели, шторки, карточки
    'surface-2': [26, 19, 48], // #1A1330 — вложенные карточки, чипы
    'surface-cool': [10, 12, 38], // #0A0C26 — холодная поверхность
    'surface-mint': [6, 26, 24], // #061A18 — мятная поверхность
    'surface-warm': [34, 16, 30], // #22101E — тёплая поверхность
    ink: [10, 4, 24], // #0A0418 — тёмный текст на ярких кнопках

    // ── Нейтральные оверлеи ────────────────────────────────────────────
    white: [255, 255, 255],
    black: [0, 0, 0],

    // ── Текст ──────────────────────────────────────────────────────────
    text: [243, 240, 255], // основной текст
    'text-strong': [255, 252, 255], // заголовки, активная вкладка
    'text-soft': [214, 208, 240], // мягкий текст, подписи на карточках
    muted: [152, 145, 186], // вторичный текст
    'muted-2': [126, 120, 164], // самый тихий текст, разделители

    // ── Границы ────────────────────────────────────────────────────────
    line: [139, 118, 255], // #8B76FF — светящаяся граница
    'line-muted': [104, 99, 140], // #68638C — спокойная граница

    // ── Акценты ────────────────────────────────────────────────────────
    accent: [138, 92, 246], // #8A5CF6 — основной ультрафиолет (был голубой)
    'accent-2': [255, 46, 145], // #FF2E91 — маджента: второй стоп градиентов
    pink: [214, 70, 255], // #D646FF — орхидея
    ice: [56, 232, 208], // #38E8D0 — ледяной тил
    green: [92, 255, 186], // #5CFFBA — неоновая мята (награды)
    success: [46, 208, 126], // #2ED07E — «готово», успех
    amber: [255, 178, 82], // #FFB252 — внимание, валюта
    'amber-soft': [255, 226, 160], // #FFE2A0
    gold: [214, 176, 106], // #D6B06A — премиум, легендарки
    'gold-soft': [244, 232, 208], // #F4E8D0
    danger: [255, 78, 116], // #FF4E74 — ошибки, отмена
    'danger-soft': [255, 191, 206], // #FFBFCE
    indigo: [92, 74, 226], // #5C4AE2 — глубокий индиго (инфо-блоки)
  },

  /** Прежняя «космическая» палитра — полный откат цветов одной строкой. */
  cosmic: {
    'bg-deep': [2, 3, 10],
    bg: [5, 8, 18],
    surface: [11, 16, 30],
    'surface-2': [19, 25, 40],
    'surface-cool': [5, 17, 34],
    'surface-mint': [5, 24, 17],
    'surface-warm': [34, 22, 26],
    ink: [3, 12, 22],
    white: [255, 255, 255],
    black: [0, 0, 0],
    text: [244, 248, 255],
    'text-strong': [248, 251, 255],
    'text-soft': [219, 229, 246],
    muted: [141, 152, 179],
    'muted-2': [116, 126, 152],
    line: [126, 213, 255],
    'line-muted': [97, 117, 155],
    accent: [54, 215, 255],
    'accent-2': [111, 125, 255],
    pink: [207, 93, 255],
    ice: [54, 255, 216],
    green: [103, 255, 198],
    success: [61, 220, 132],
    amber: [255, 193, 92],
    'amber-soft': [255, 230, 163],
    gold: [205, 172, 124],
    'gold-soft': [246, 234, 214],
    danger: [255, 107, 138],
    'danger-soft': [255, 197, 208],
    indigo: [42, 114, 235],
  },
};

/** ← Вот здесь переключается тема: 'cyberpunk' | 'cosmic'. */
export const defaultPalette = 'cyberpunk';

export const activePalette = resolvePaletteName();

export const palette = palettes[activePalette] || palettes.cyberpunk;

/**
 * Палитру можно сравнить без пересборки: открой мини-апп с `?theme=cosmic`
 * в адресе — вернётся прежняя «космическая» гамма.
 */
function resolvePaletteName() {
  if (typeof window === 'undefined') {
    return defaultPalette;
  }

  const requested = new URLSearchParams(window.location.search).get('theme');

  return requested && palettes[requested] ? requested : defaultPalette;
}

/** «139 92 246» — каналы токена для rgb(var(--rgb-token) / 0.2). */
export function themeRgb(name) {
  const channels = palette[name] || palette.accent;

  return channels.join(' ');
}

/** «rgb(138, 92, 246)» — готовый цвет для inline-стилей и SVG. */
export function themeColor(name) {
  const channels = palette[name] || palette.accent;

  return `rgb(${channels.join(', ')})`;
}

/** «rgba(138, 92, 246, 0.2)» — цвет с прозрачностью. */
export function themeAlpha(name, alpha) {
  const channels = palette[name] || palette.accent;

  return `rgba(${channels.join(', ')}, ${alpha})`;
}

/** «#080614» — hex для внешних API (цвет шапки Telegram и т.п.). */
export function themeHex(name) {
  const channels = palette[name] || palette.accent;

  return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Раскладывает палитру в CSS-переменные:
 * `--rgb-<токен>` (каналы) и `--<токен>` (готовый цвет), плюс производные.
 */
export function applyThemeColors() {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  Object.entries(palette).forEach(([name, channels]) => {
    root.style.setProperty(`--rgb-${name}`, channels.join(' '));
    root.style.setProperty(`--${name}`, `rgb(${channels.join(', ')})`);
  });

  // Производные значения собираются из токенов, чтобы цвета не дублировались.
  root.style.setProperty(
    '--glass',
    'linear-gradient(180deg, rgb(var(--rgb-white) / 0.075), rgb(var(--rgb-white) / 0.022)), rgb(var(--rgb-surface) / 0.58)',
  );
  root.style.setProperty('--shadow', '0 18px 52px rgb(var(--rgb-black) / 0.48)');
}

