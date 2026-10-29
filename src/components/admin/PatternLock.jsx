import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext.js';

/** Точки сетки 3×3: 0 — левый верх, 8 — правый низ. */
const DOTS = Array.from({ length: 9 }, (_, index) => index);
/** Центры точек в процентах от стороны поля (три равные колонки и строки). */
const DOT_CENTERS = [16.67, 50, 83.33];
/** Радиус попадания в точку в процентах стороны поля: соседние точки не перекрываются. */
const HIT_RADIUS = 16;
const MIN_DOTS = 4;
/** Сколько линия остаётся на экране после того, как палец отпустили. */
const TRAIL_HOLD_MS = 420;

const dotCenter = index => ({ x: DOT_CENTERS[index % 3], y: DOT_CENTERS[Math.floor(index / 3)] });

/**
 * Графический пароль как на экране блокировки телефона: поле 3×3, линия между
 * пройденными точками, подсветка активных точек. Ввод читается pointer events,
 * поэтому одинаково работает мышью, пальцем и стилусом в Telegram WebApp.
 *
 * `status` управляет анимацией: `error` — тряска красной линией, `success` —
 * линия и точки подсвечиваются зелёным. `onChange` сообщает длину текущей
 * фигуры (для подсказки «точек: N»), `onComplete` вызывается, когда набрано
 * минимум `minDots` точек.
 */
function PatternLock({ disabled, status = 'idle', minDots = MIN_DOTS, onComplete, onChange }) {
  const { t } = useTranslation();
  const boardRef = useRef(null);
  const pathRef = useRef([]);
  const drawingRef = useRef(false);
  const holdTimerRef = useRef(0);
  const [path, setPath] = useState([]);
  const [cursor, setCursor] = useState(null);

  useEffect(() => () => window.clearTimeout(holdTimerRef.current), []);

  const commit = nextPath => {
    pathRef.current = nextPath;
    setPath(nextPath);
    onChange?.(nextPath);
  };

  /** Координаты пальца/курсора в процентах от стороны поля. */
  const pointOf = event => {
    const rect = boardRef.current?.getBoundingClientRect();

    if (!rect || !rect.width || !rect.height) {
      return null;
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  };

  /** Ближайшая точка под пальцем или null, если палец между точками. */
  const dotAt = point => {
    if (!point) {
      return null;
    }

    let found = null;
    let nearest = HIT_RADIUS;

    DOTS.forEach(dot => {
      const center = dotCenter(dot);
      const distance = Math.hypot(center.x - point.x, center.y - point.y);

      if (distance <= nearest) {
        found = dot;
        nearest = distance;
      }
    });

    return found;
  };

  const handleDown = event => {
    if (disabled) {
      return;
    }

    const point = pointOf(event);
    const dot = dotAt(point);

    if (dot === null) {
      return;
    }

    event.preventDefault();
    window.clearTimeout(holdTimerRef.current);
    drawingRef.current = true;
    setCursor(point);
    boardRef.current?.setPointerCapture?.(event.pointerId);
    commit([dot]);
  };

  const handleMove = event => {
    if (disabled || !drawingRef.current) {
      return;
    }

    event.preventDefault();
    const point = pointOf(event);

    setCursor(point);

    const dot = dotAt(point);

    if (dot === null || pathRef.current.includes(dot)) {
      return;
    }

    commit([...pathRef.current, dot]);
  };

  const handleUp = () => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    setCursor(null);

    const drawn = pathRef.current;

    if (drawn.length >= minDots) {
      onComplete?.(drawn);
    }

    if (drawn.length > 0) {
      holdTimerRef.current = window.setTimeout(() => commit([]), TRAIL_HOLD_MS);
    }
  };

  const points = path.map(dotCenter);
  const trail = points.map(point => `${point.x},${point.y}`).join(' ');
  const last = points.length > 0 ? points[points.length - 1] : null;

  return (
    <div
      ref={boardRef}
      aria-label={t('admin.patternField')}
      className={`pattern-lock is-${status}`}
      role="group"
      onPointerCancel={handleUp}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
    >
      <span className="pattern-lock__halo" aria-hidden="true" />

      <svg aria-hidden="true" className="pattern-lock__trail" preserveAspectRatio="none" viewBox="0 0 100 100">
        {points.length > 1 && (
          <polyline className="pattern-lock__line" points={trail} vectorEffect="non-scaling-stroke" />
        )}
        {last && cursor && (
          <polyline
            className="pattern-lock__line is-live"
            points={`${last.x},${last.y} ${cursor.x},${cursor.y}`}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {DOTS.map(dot => (
        <span className={`pattern-lock__cell${path.includes(dot) ? ' is-picked' : ''}`} key={dot}>
          <button
            aria-label={t('admin.dotAria', { index: dot + 1 })}
            className="pattern-lock__dot"
            data-dot={dot}
            disabled={disabled}
            type="button"
          />
        </span>
      ))}
    </div>
  );
}

export default PatternLock;
