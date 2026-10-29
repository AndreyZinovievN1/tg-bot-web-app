import { localeDateTimeFormat, localeNumberFormat, t, tp } from '../i18n/index.js';

export function formatNumber(value) {
  return localeNumberFormat().format(Number(value || 0));
}

export function formatCompactNumber(value) {
  const number = Number(value || 0);

  if (number < 10000) {
    return formatNumber(number);
  }

  return localeNumberFormat({
    maximumFractionDigits: number >= 1000000 ? 1 : 0,
    notation: 'compact',
  }).format(number);
}

/**
 * Деньги для оплаты картой: `4,99 €` / `$4.99`.
 *
 * Tribute отдаёт цены подписки в основных единицах валюты (4.99, а не 499),
 * поэтому сумму не переводим. Неизвестная валюта — просто число с кодом,
 * чтобы тариф не исчез из-за ошибки Intl.
 */
export function formatMoney(value, currency) {
  const amount = Number(value || 0);
  const code = String(currency || 'USD').toUpperCase();

  try {
    return localeNumberFormat({
      style: 'currency',
      currency: code,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${formatNumber(amount)} ${code}`;
  }
}

export function formatDate(value) {
  const date = parseDate(value);

  if (!date) {
    return value ? String(value) : '-';
  }

  return localeDateTimeFormat({
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatMarriageDate(value) {
  const date = parseDate(value);

  if (!date) {
    return value ? String(value) : t('time.dateNotSet');
  }

  return formatWithoutYearSuffix(localeDateTimeFormat({
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }), date);
}

/**
 * «5 мар. 2024» — дата без времени.
 * Нужна для коротких подписей вроде «В Space с {date}» в профиле.
 */
export function formatDateOnly(value) {
  const date = parseDate(value);

  if (!date) {
    return value ? String(value) : '-';
  }

  return formatWithoutYearSuffix(localeDateTimeFormat({
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }), date);
}

/**
 * Форматирует дату и убирает суффикс года («г.» / «р.»), который Intl
 * добавляет в ru/uk. Правятся только литералы между частями даты, поэтому
 * сокращения месяцев вроде «мар.» не ломаются: месяц приходит отдельной
 * частью, а прежняя реализация (replace по всей строке) превращала «мар.» в «ма».
 */
function formatWithoutYearSuffix(formatter, date) {
  return formatter
    .formatToParts(date)
    .map(part => (part.type === 'literal' ? part.value.replaceAll(/\s?[гgр]\./gi, '') : part.value))
    .join('');
}

export function formatActivity(value) {
  const date = parseDate(value);

  if (!date) {
    return t('activity.offline');
  }

  const diff = Date.now() - date.getTime();

  if (diff < 15 * 60 * 1000) {
    return t('activity.online');
  }

  if (diff < 24 * 60 * 60 * 1000) {
    return t('activity.wasAgo', { time: formatRelativePast(date) });
  }

  return t('activity.wasOn', { date: formatDate(date) });
}

/** Онлайн-статус без текста — для классов и аватаров. */
export function isOnline(value) {
  const date = parseDate(value);

  return Boolean(date) && Date.now() - date.getTime() < 15 * 60 * 1000;
}

export function cooldownText(cooldown, lastActivity) {
  const cooldownDate = parseDate(cooldown);
  const activityDate = parseDate(lastActivity);

  if (!cooldownDate && !activityDate) {
    return t('cooldown.noData');
  }

  if (cooldownDate && cooldownDate.getTime() > Date.now()) {
    const left = formatDuration(cooldownDate.getTime() - Date.now());
    return activityDate
      ? t('cooldown.nextInWithActivity', { left, time: formatRelativePast(activityDate) })
      : t('cooldown.nextIn', { left });
  }

  if (cooldownDate && cooldownDate.getTime() <= Date.now()) {
    return activityDate
      ? t('cooldown.doneWithActivity', { time: formatRelativePast(activityDate) })
      : t('cooldown.ready');
  }

  return activityDate
    ? t('cooldown.lastActivity', { time: formatRelativePast(activityDate) })
    : t('cooldown.ready');
}

export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days) {
    parts.push(tp('time.daysShort', days));
  }

  if (hours) {
    parts.push(tp('time.hoursShort', hours));
  }

  if (minutes || parts.length === 0) {
    parts.push(tp('time.minutesShort', minutes));
  }

  return parts.join(' ');
}

export function formatRelativePast(value) {
  const date = value instanceof Date ? value : parseDate(value);

  if (!date) {
    return value ? String(value) : '-';
  }

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return t('time.justNow');
  }

  if (minutes < 60) {
    return tp('time.minutesAgo', minutes);
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return tp('time.hoursAgo', hours);
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return tp('time.daysAgo', days);
  }

  return formatDate(date);
}

export function parseDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Бот отдаёт время и как ISO (`2026-09-20T15:04:05.123456+03:00`), и как
  // `2026-09-20 15:04:05 +0300` — второй вариант JS Date не понимает,
  // поэтому пробел перед смещением убираем.
  const normalized = String(value)
    .trim()
    .replace(' ', 'T')
    .replace(/\.(\d{3})\d+/, '.$1')
    .replace(/\s+([+-]\d{2}:?\d{2})$/, '$1');
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}
