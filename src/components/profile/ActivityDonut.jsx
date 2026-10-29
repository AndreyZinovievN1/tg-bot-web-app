import { useTranslation } from '../../i18n/I18nContext.js';
import { themeAlpha, themeColor } from '../../theme/colors.js';
import { parseDate } from '../../utils/formatters.js';

function ActivityDonut({ groupsActivity }) {
  const { t } = useTranslation();
  const entries = Object.entries(groupsActivity || {})
    .map(([groupId, value]) => ({
      groupId,
      name: value?.group_name || groupId,
      score: scoreActivity(value),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  if (entries.length === 0) {
    return null;
  }

  const maxScore = Math.max(...entries.map(entry => entry.score), 1);
  const totalScore = entries.reduce((sum, e) => sum + e.score, 0) || 1;
  const colors = [
    themeColor('accent'),
    themeColor('accent-2'),
    themeColor('pink'),
    themeColor('danger'),
    themeColor('amber'),
  ];

  const size = 160;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Доли и смещения дуг считаются заранее и без мутаций: копить сумму прямо
  // в разметке нельзя — смещение менялось бы уже после рендера.
  const segments = entries.map((entry, index) => ({
    entry,
    percent: entry.score / totalScore,
    offset: entries
      .slice(0, index)
      .reduce((sum, previous) => sum + previous.score / totalScore, 0),
  }));

  return (
    <div className="activity-donut">
      <div className="activity-donut__chart">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={themeAlpha('line', 0.08)}
            strokeWidth={strokeWidth}
          />
          {segments.map(({ entry, percent, offset }, index) => {
            const dashArray = circumference * percent;

            return (
              <circle
                key={entry.groupId}
                cx={center}
                cy={center}
                fill="none"
                r={radius}
                stroke={colors[index % colors.length]}
                strokeDasharray={`${dashArray} ${circumference - dashArray}`}
                strokeDashoffset={-circumference * offset}
                strokeWidth={strokeWidth}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            );
          })}
        </svg>
        <span className="activity-donut__center">
          {entries.length}
          <small>{t('profile.groupsCount')}</small>
        </span>
      </div>
      <div className="activity-donut__list">
        {entries.map((entry, index) => (
          <div className="activity-donut__item" key={entry.groupId}>
            <span
              className="activity-donut__dot"
              style={{ background: colors[index % colors.length] }}
            />
            <span className="activity-donut__label" title={entry.name}>
              {entry.name}
            </span>
            <span className="activity-donut__bar">
              <span style={{ width: `${Math.round((entry.score / maxScore) * 100)}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function scoreActivity(value) {
  if (value && typeof value === 'object') {
    const date = parseDate(value.last_activity || value);
    if (date) {
      const hoursAgo = Math.max(0, (Date.now() - date.getTime()) / 3600000);
      return Math.max(1, Math.round(100 / (hoursAgo + 1)));
    }
    const number = Number(value.score || value);
    if (!Number.isNaN(number) && number > 0) return number;
    return 1;
  }
  const date = parseDate(value);
  if (date) {
    const hoursAgo = Math.max(0, (Date.now() - date.getTime()) / 3600000);
    return Math.max(1, Math.round(100 / (hoursAgo + 1)));
  }
  const number = Number(value);
  if (!Number.isNaN(number) && number > 0) return number;
  return 1;
}

export default ActivityDonut;
