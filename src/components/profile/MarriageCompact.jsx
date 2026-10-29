import { useState } from 'react';
import { FiHeart } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import { formatMarriageDate, parseDate } from '../../utils/formatters.js';

function MarriageCompact({ marriage }) {
  const { t, tp } = useTranslation();
  // Время регистрации брака считаем один раз при монтировании: читать часы
  // прямо в разметке нельзя (рендер должен быть чистым), а счётчик идёт на дни.
  const [now] = useState(() => Date.now());

  if (!marriage) {
    return (
      <div className="marriage-compact marriage-compact--empty">
        <span className="marriage-compact__icon" aria-hidden="true">
          <FiHeart />
        </span>
        <p>{t('marriage.free')}</p>
      </div>
    );
  }

  const partner = marriage.partner_name || marriage.partner_username || marriage.partner_chat_id || '—';
  const marriageDate = parseDate(marriage.marriage_datetime);
  const daysTogether = marriageDate
    ? Math.max(1, Math.floor((now - marriageDate.getTime()) / 86400000))
    : 0;
  const yearProgress = marriageDate ? (daysTogether % 365) / 365 : 0;
  const yearsTogether = marriageDate ? Math.floor(daysTogether / 365) : 0;
  const size = 60;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <div className="marriage-compact">
      <div className="marriage-compact__ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            className="marriage-compact__track"
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            strokeWidth={strokeWidth}
          />
          <circle
            className="marriage-compact__progress"
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - yearProgress)}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <span className="marriage-compact__heart" aria-hidden="true">
          <FiHeart />
        </span>
      </div>
      <div className="marriage-compact__info">
        <strong>{partner}</strong>
        <span className="marriage-compact__days">
          {daysTogether ? tp('marriage.days', daysTogether) : t('marriage.inMarriage')}
        </span>
        {yearsTogether > 0 && (
          <span className="marriage-compact__years">
            {tp('marriage.yearsTogether', yearsTogether)}
          </span>
        )}
        {marriageDate ? (
          <span className="marriage-compact__since">
            {t('marriage.togetherSince')} {formatMarriageDate(marriage.marriage_datetime)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default MarriageCompact;
