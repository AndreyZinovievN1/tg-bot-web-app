import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiClock } from 'react-icons/fi';
import { LuBanana } from "react-icons/lu";
import { TbMoneybag } from "react-icons/tb";
import { TbRoulette } from "react-icons/tb";
import { themeAlpha, themeColor, themeRgb } from '../../theme/colors.js';
import { formatCountdown, parseDate } from '../../utils/formatters.js';

/** Ключ таймера → иконка: банан, мешок и рулетка. */
const iconMap = {
  banana: <LuBanana />,
  bag: <TbMoneybag />,
  roulette: <TbRoulette />,
};

/** Цвета таймеров — из палитры (src/theme/colors.js). */
const colorMap = {
  banana: { track: themeAlpha('accent', 0.2), progress: themeColor('accent'), label: themeColor('accent') },
  bag: { track: themeAlpha('amber', 0.2), progress: themeColor('amber'), label: themeColor('amber') },
  roulette: { track: themeAlpha('pink', 0.2), progress: themeColor('pink'), label: themeColor('pink') },
};

/**
 * Токен палитры для плитки таймера: через `--tone` рамка и подложка
 * окрашиваются тем же цветом, что и кольцо прогресса.
 */
const toneMap = {
  banana: 'accent',
  bag: 'amber',
  roulette: 'pink',
};


function CircularCountdown({ cooldown, label, icon, size = 92 }) {
  const initialTotalRef = useRef(null);
  const [, tick] = useState(0);
  const cooldownDate = parseDate(cooldown);
  const endTime = cooldownDate?.getTime() ?? 0;
  const now = Date.now();
  const isReady = !endTime || endTime <= now;
  const remainingMs = isReady ? 0 : endTime - now;
  const colors = colorMap[icon] || { track: themeAlpha('line', 0.28), progress: themeColor('indigo'), label: themeColor('indigo') };
  const tone = toneMap[icon] || 'indigo';

  useEffect(() => {
    const id = window.setInterval(() => tick(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!isReady && initialTotalRef.current === null) {
    initialTotalRef.current = remainingMs;
  }

  if (isReady) {
    initialTotalRef.current = null;
  }

  const totalMs = initialTotalRef.current || remainingMs || 1;
  const remainingRatio = isReady ? 0 : remainingMs / totalMs;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - remainingRatio);
  const center = size / 2;

  return (
    <div className={`circular-countdown ${isReady ? 'is-ready' : ''}`} style={{ '--tone': themeRgb(tone) }}>
      <div className="circular-countdown__ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            className="circular-countdown__track"
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={colors.track}
            strokeWidth={strokeWidth}
          />
          <circle
            className="circular-countdown__progress"
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={isReady ? themeColor('success') : colors.progress}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <span className="circular-countdown__time" aria-live="polite">
          {isReady ? <FiCheck /> : formatCountdown(remainingMs)}
        </span>
      </div>
      <span className="circular-countdown__label">
        <i aria-hidden="true" style={{ color: colors.label }}>{iconMap[icon] || <FiClock />}</i>
        {label}
      </span>
    </div>
  );
}

export default CircularCountdown;
