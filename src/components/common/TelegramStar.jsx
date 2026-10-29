import { useId } from 'react';

/**
 * Звезда Telegram для цен в звёздах.
 *
 * Рисуем её сами, а не берём иконку из набора: у Telegram звезда особая —
 * пухлые лучи, золотой градиент и звёздный вырез в центре. Поэтому в SVG две
 * фигуры: тёмная звезда-подложка (её видно сквозь вырез) и золотая звезда с
 * отверстием (`fillRule="evenodd"`), поверх — мягкий блик сверху слева.
 *
 * Размер задаётся шрифтом: `width`/`height` в `em`, поэтому в CSS достаточно
 * `font-size`. Идентификаторы градиентов уникальны на каждый экземпляр
 * (`useId`), чтобы на странице со множеством звезд не было конфликтов.
 */
function TelegramStar({ className = '', title = '' }) {
  const gradientId = useId().replace(/:/g, '');
  const goldId = `${gradientId}-gold`;
  const holeId = `${gradientId}-hole`;
  const shineId = `${gradientId}-shine`;
  // Внешний контур: пять лучей с чередованием радиусов (остриё → впадина).
  const outerStar =
    'M12 1.4 L14.88 8.44 L22.46 9 L16.66 13.91 L18.47 21.3 L12 17.3 '
    + 'L5.53 21.3 L7.34 13.91 L1.54 9 L9.12 8.44 Z';
  // Вырез: маленькая звезда того же рисунка.
  const innerStar =
    'M12 7.9 L13.26 11.16 L16.76 11.36 L14.05 13.56 L14.94 16.95 L12 15.05 '
    + 'L9.06 16.95 L9.95 13.56 L7.24 11.36 L10.74 11.16 Z';
  const cutout = `${outerStar} ${innerStar}`;
  const classes = ['tg-star', className].filter(Boolean).join(' ');

  return (
    <svg
      aria-hidden={title ? undefined : 'true'}
      className={classes}
      focusable="false"
      height="1em"
      role={title ? 'img' : undefined}
      viewBox="0 0 24 24"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}

      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={goldId} x1="5" x2="19" y1="2" y2="23">
          <stop offset="0" stopColor="#FFECA8" />
          <stop offset="0.42" stopColor="#FFC53A" />
          <stop offset="1" stopColor="#EE9200" />
        </linearGradient>

        <linearGradient gradientUnits="userSpaceOnUse" id={holeId} x1="12" x2="12" y1="8" y2="17">
          <stop offset="0" stopColor="#FFD978" />
          <stop offset="1" stopColor="#DE9600" />
        </linearGradient>

        <radialGradient cx="8.6" cy="5.4" gradientUnits="userSpaceOnUse" id={shineId} r="14">
          <stop offset="0" stopColor="#FFF9DE" stopOpacity="0.92" />
          <stop offset="0.45" stopColor="#FFF9DE" stopOpacity="0.18" />
          <stop offset="1" stopColor="#FFF9DE" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Грань в центре: чуть более тёмное золото, чтобы лучи читались объёмно. */}
      <path
        d={innerStar}
        fill={`url(#${holeId})`}
        transform="translate(12 12.9) scale(1.12) translate(-12 -12.9)"
      />

      <path
        d={cutout}
        fill={`url(#${goldId})`}
        fillRule="evenodd"
        stroke={`url(#${goldId})`}
        strokeLinejoin="round"
        strokeWidth="1.7"
      />

      <path d={cutout} fill={`url(#${shineId})`} fillRule="evenodd" pointerEvents="none" />
    </svg>
  );
}

export default TelegramStar;
