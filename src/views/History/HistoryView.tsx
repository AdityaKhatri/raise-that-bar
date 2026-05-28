import { useState } from 'react';
import { Topbar } from '../../components/Topbar/Topbar';
import { useSessions, type SessionFilter } from '../../hooks/useSessions';
import { formatDisplayDate, formatDuration } from '../../lib/date';
import './History.css';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'unplanned', label: 'Unplanned' },
];

export function HistoryView() {
  const [filter, setFilter] = useState<SessionFilter>('all');
  const { sessions, loading } = useSessions(filter);

  return (
    <div className="history-view">
      <Topbar title="History" />
      <div className="history-subbar">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`filter-chip ${filter === opt.value ? 'filter-chip--active' : ''}`}
            onClick={() => setFilter(opt.value as SessionFilter)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="history-list">
        {loading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="12 8 12 12 14 14" />
              <path d="M3.05 11a9 9 0 1 0 .5-4" />
              <polyline points="3 3 3 7 7 7" />
            </svg>
            <h3>No sessions yet</h3>
            <p>Start your first workout from the Today tab.</p>
          </div>
        ) : (
          sessions.map(session => {
            const totalExercises = session.groups.reduce((acc, g) => acc + g.blocks.length, 0);
            const totalVolume = session.groups.reduce((acc, g) =>
              acc + g.blocks.reduce((ba, b) =>
                ba + b.sets.reduce((sa, s) => sa + ((s.weight ?? 0) * (s.reps ?? 0)), 0), 0), 0);

            return (
              <div key={session.id} className="session-row">
                <div className="session-row__left">
                  <div className="session-row__date">
                    {formatDisplayDate(session.date)}
                    {session.unplanned && <span className="chip" style={{ marginLeft: 6 }}>freestyle</span>}
                  </div>
                  <div className="session-row__name">{session.workoutName}</div>
                  <div className="session-row__meta">
                    {totalExercises} exercise{totalExercises !== 1 ? 's' : ''}
                    {totalVolume > 0 && ` · ${Math.round(totalVolume).toLocaleString()} kg`}
                    {session.durationMs && ` · ${formatDuration(session.durationMs)}`}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
