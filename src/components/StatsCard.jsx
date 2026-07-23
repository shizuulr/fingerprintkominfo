export default function StatsCard({ icon, label, value, color = 'primary' }) {
  return (
    <div className={`stats-card stats-card--${color}`}>
      <div className="stats-card__icon">{icon}</div>
      <div className="stats-card__info">
        <span className="stats-card__value">{value}</span>
      </div>
      <span className="stats-card__label">{label}</span>
    </div>
  );
}

