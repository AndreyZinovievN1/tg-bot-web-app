/**
 * Тема блока «Кейс дня» на экране кейсов.
 *
 * Тема хранится в БД у кейса (`mini_app_cases.theme`) как
 * `{ mode: 'solid' | 'gradient', from, to, angle }`, где `from`/`to` — либо
 * токен палитры (см. `src/theme/colors.js`), либо свой цвет `#rrggbb`.
 *
 * Токен держим токеном, а не готовым цветом: тогда при смене палитры
 * (`cyberpunk` → `cosmic`) блок перекрашивается сам. Свой цвет владельца
 * остаётся как задан. Здесь же собираются CSS-переменные для блока
 * (`--spot-a`, `--spot-b`, `--spot-angle`, `--spot-rgb`, `--spot-rgb-b`), из
 * которых CSS рисует заливку. Дубликат правил на сервере — `normalizeCaseTheme`
 * в `server/casesApi.js`.
 *
 * `caseBackgrounds` — библиотека готовых фонов: владелец ставит любой из них
 * любому кейсу в один тап, поэтому блоки разных кейсов выглядят по-разному.
 */

/** Токены палитры, из которых можно собрать тему (совпадает с сервером). */
export const caseThemeTokens = ['accent', 'accent-2', 'pink', 'ice', 'green', 'amber', 'gold', 'indigo', 'danger', 'success'];

/** Фон по умолчанию для каждого акцента карточки — «в цвет кейса». */
export const caseAccentThemes = {
  amber: { from: 'amber', to: 'gold' },
  cyan: { from: 'ice', to: 'indigo' },
  violet: { from: 'accent', to: 'indigo' },
  pink: { from: 'pink', to: 'accent-2' },
  green: { from: 'green', to: 'ice' },
};

export const defaultCaseTheme = { mode: 'gradient', from: 'pink', to: 'accent-2', angle: 135 };

/**
 * Библиотека готовых фонов блока — пары токенов палитры. Владелец ставит любой
 * фон любому кейсу; по умолчанию каждый кейс получает фон своего цвета.
 * Подписи — `admin.cases.backgrounds.<id>`.
 */
export const caseBackgrounds = [
  { id: 'nebula', from: 'pink', to: 'accent-2' },
  { id: 'cosmos', from: 'accent', to: 'indigo' },
  { id: 'gold', from: 'amber', to: 'gold' },
  { id: 'ice', from: 'ice', to: 'indigo' },
  { id: 'emerald', from: 'green', to: 'ice' },
  { id: 'orchid', from: 'pink', to: 'accent' },
  { id: 'ocean', from: 'indigo', to: 'accent' },
  { id: 'sunrise', from: 'amber', to: 'danger' },
  { id: 'mint', from: 'green', to: 'success' },
  { id: 'flame', from: 'danger', to: 'amber' },
];

/**
 * Библиотека однотонных фонов: один токен палитры без градиента. Такая плитка
 * переключает кейс в режим `solid` — блок красится ровным цветом. Подписи —
 * `admin.cases.backgroundsSolid.<id>`.
 */
export const caseSolidBackgrounds = [
  { id: 'violet', color: 'accent' },
  { id: 'magenta', color: 'accent-2' },
  { id: 'fuchsia', color: 'pink' },
  { id: 'teal', color: 'ice' },
  { id: 'neon', color: 'green' },
  { id: 'malachite', color: 'success' },
  { id: 'amber', color: 'amber' },
  { id: 'brass', color: 'gold' },
  { id: 'coral', color: 'danger' },
  { id: 'indigo', color: 'indigo' },
];

const hexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isThemeToken(ref) {
  return caseThemeTokens.includes(String(ref || ''));
}

/** Токен или собственный `#rrggbb` — всё, что умеет блок. */
export function isThemeColor(ref) {
  const value = String(ref || '').trim();

  return isThemeToken(value) || hexColorPattern.test(value);
}

/** Тема по акценту карточки: используется, если у кейса темы ещё нет. */
export function themeForAccent(accent) {
  const preset = caseAccentThemes[accent] || caseAccentThemes.cyan;

  return { mode: 'gradient', from: preset.from, to: preset.to, angle: 135 };
}

/** Приводит тему к безопасному виду: незнакомые цвета → тема по акценту. */
export function normalizeCaseTheme(theme, accent = 'cyan') {
  const source = theme && typeof theme === 'object' ? theme : {};
  const fallback = themeForAccent(accent);
  const angle = Number(source.angle);
  const mode = source.mode === 'solid' ? 'solid' : 'gradient';

  return {
    mode,
    from: isThemeColor(source.from) ? String(source.from) : fallback.from,
    to: isThemeColor(source.to) ? String(source.to) : fallback.to,
    angle: Number.isFinite(angle) ? Math.max(0, Math.min(360, Math.round(angle))) : fallback.angle,
  };
}

/** Две темы совпадают? Нужно, чтобы понять — владелец трогал цвета или нет. */
export function sameCaseTheme(left, right) {
  const a = normalizeCaseTheme(left);
  const b = normalizeCaseTheme(right);

  return a.mode === b.mode && a.from === b.from && a.to === b.to && a.angle === b.angle;
}

/**
 * Код готовой плитки-градиента, если тема ровно с ней совпадает, иначе пустая
 * строка. Нужен, чтобы подсветить выбранную плитку и показать её название.
 */
export function caseGradientBackgroundId(theme) {
  const resolved = normalizeCaseTheme(theme);

  if (resolved.mode !== 'gradient') {
    return '';
  }

  const match = caseBackgrounds.find(item => item.from === resolved.from && item.to === resolved.to);

  return match ? match.id : '';
}

/** Код готовой однотонной плитки, если тема совпадает с ней, иначе пустая строка. */
export function caseSolidBackgroundId(theme) {
  const resolved = normalizeCaseTheme(theme);

  if (resolved.mode !== 'solid') {
    return '';
  }

  const match = caseSolidBackgrounds.find(item => item.color === resolved.from);

  return match ? match.id : '';
}

/** «var(--amber)» для токена или готовый `#rrggbb` — цвет для CSS. */
export function themeColorRef(ref) {
  return isThemeToken(ref) ? `var(--${ref})` : String(ref || '');
}

/** «var(--rgb-amber)» или «255 178 82» — каналы для `rgb(var(--spot-rgb) / .3)`. */
export function themeRgbRef(ref) {
  return isThemeToken(ref) ? `var(--rgb-${ref})` : hexToRgbChannels(ref);
}

/** «#ffb252» → «255 178 82». Пусто — если цвет не hex. */
export function hexToRgbChannels(hex) {
  let value = String(hex || '').replace('#', '').trim();

  if (value.length === 3) {
    value = value.split('').map(char => char + char).join('');
  }

  if (!/^[0-9a-f]{6}$/i.test(value)) {
    return '';
  }

  const number = Number.parseInt(value, 16);

  return `${(number >> 16) & 255} ${(number >> 8) & 255} ${number & 255}`;
}

/**
 * CSS-переменные блока: заливка (одинаковая или градиент), её каналы и тон
 * кнопки «Открыть» (`--card-tone`/`--card-rgb` читает `.ops-claim`).
 */
export function caseThemeStyle(theme, accent) {
  const resolved = normalizeCaseTheme(theme, accent);
  const second = resolved.mode === 'solid' ? resolved.from : resolved.to;

  return {
    '--spot-a': themeColorRef(resolved.from),
    '--spot-b': themeColorRef(second),
    '--spot-angle': `${resolved.angle}deg`,
    '--spot-rgb': themeRgbRef(resolved.from),
    '--spot-rgb-b': themeRgbRef(second),
    '--card-tone': themeColorRef(resolved.from),
    '--card-rgb': themeRgbRef(resolved.from),
  };
}

export default caseThemeStyle;
