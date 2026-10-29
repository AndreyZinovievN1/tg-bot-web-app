import { parseDate } from '../../utils/formatters.js';

function ActivityBars({ groupsActivity }) {
  const entries = Object.entries(groupsActivity || {})
    .map(([groupId, value]) => ({
      groupId,
      score: scoreActivity(value),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  if (entries.length === 0) {
    return null;
  }

  const maxScore = Math.max(...entries.map(entry => entry.score), 1);

  return (
    <div className="activity-bars">
      {entries.map(entry => (
        <div className="activity-bars__row" key={entry.groupId}>
          <span className="activity-bars__label" title={entry.groupId}>
            {shortGroupId(entry.groupId)}
          </span>
          <div className="activity-bars__track">
            <span style={{ width: `${Math.round((entry.score / maxScore) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function scoreActivity(value) {
  const date = parseDate(value);

  if (date) {
    const hoursAgo = Math.max(0, (Date.now() - date.getTime()) / 3600000);
    return Math.max(1, Math.round(100 / (hoursAgo + 1)));
  }

  const number = Number(value);

  if (!Number.isNaN(number) && number > 0) {
    return number;
  }

  return 1;
}

function shortGroupId(groupId) {
  const text = String(groupId);

  if (text.length <= 10) {
    return text;
  }

  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

export default ActivityBars;
