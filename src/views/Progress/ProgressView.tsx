import { useEffect, useState } from 'react';
import { Topbar } from '../../components/Topbar/Topbar';
import { getAllSessions } from '../../db/sessions';
import { getAllBodyweight } from '../../db/bodyweight';
import { getAllNutritionLogs } from '../../db/nutritionLog';
import { getAllExercises } from '../../db/exercises';
import type { Session, Bodyweight, NutritionLog, Exercise } from '../../types';
import './Progress.css';

interface Props {
  onBack: () => void;
}

// ─── Epley 1RM estimate ───────────────────────────────────────────────────────

function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

function LineChart({ points, color }: {
  points: { label: string; value: number }[];
  color: string;
}) {
  if (points.length === 0) {
    return (
      <div className="prog-empty-chart">
        <span>No data</span>
      </div>
    );
  }

  const W = 300, H = 100;
  const PAD = { top: 10, right: 8, bottom: 22, left: 34 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const vals = points.map(p => p.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD.left + (points.length === 1 ? iW / 2 : (i / (points.length - 1)) * iW);
  const toY = (v: number) => PAD.top + iH - ((v - minV) / range) * iH;

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(' ');
  const fill = `${d} L${toX(points.length - 1).toFixed(1)},${(PAD.top + iH).toFixed(1)} L${toX(0).toFixed(1)},${(PAD.top + iH).toFixed(1)} Z`;

  // Show up to 4 x-axis labels
  const n = points.length;
  const labelIdx = n <= 4
    ? points.map((_, i) => i)
    : [0, Math.round(n / 3), Math.round(2 * n / 3), n - 1];

  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v % 1 === 0 ? String(v) : v.toFixed(1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="prog-chart-svg">
      {/* grid */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left + iW} y2={PAD.top} className="prog-grid-line" />
      <line x1={PAD.left} y1={PAD.top + iH} x2={PAD.left + iW} y2={PAD.top + iH} className="prog-grid-line" />
      {/* y labels */}
      <text x={PAD.left - 4} y={PAD.top + 4} className="prog-axis-label" textAnchor="end">{fmt(maxV)}</text>
      <text x={PAD.left - 4} y={PAD.top + iH + 1} className="prog-axis-label" textAnchor="end">{fmt(minV)}</text>
      {/* area */}
      <path d={fill} fill={color} opacity="0.12" />
      {/* line */}
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {/* dots */}
      {points.map((_, i) => (
        <circle key={i} cx={toX(i)} cy={toY(_.value)} r="2.5" fill={color} />
      ))}
      {/* x labels */}
      {labelIdx.map(i => (
        <text key={i} x={toX(i)} y={H - 3} className="prog-axis-label" textAnchor="middle">
          {points[i].label}
        </text>
      ))}
    </svg>
  );
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────

function BarChart({ bars, color, goalLine }: {
  bars: { label: string; value: number }[];
  color: string;
  goalLine?: number;
}) {
  if (bars.length === 0) {
    return <div className="prog-empty-chart"><span>No data</span></div>;
  }

  const W = 300, H = 100;
  const PAD = { top: 10, right: 8, bottom: 22, left: 34 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const maxV = Math.max(...bars.map(b => b.value), goalLine ?? 0) || 1;
  const barW = (iW / bars.length) * 0.65;
  const gap = iW / bars.length;

  const toX = (i: number) => PAD.left + i * gap + gap / 2;
  const toH = (v: number) => (v / maxV) * iH;
  const fmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);

  // Show up to 5 x-axis labels
  const n = bars.length;
  const labelIdx = n <= 5 ? bars.map((_, i) => i) : [0, Math.round(n / 4), Math.round(n / 2), Math.round(3 * n / 4), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="prog-chart-svg">
      <line x1={PAD.left} y1={PAD.top + iH} x2={PAD.left + iW} y2={PAD.top + iH} className="prog-grid-line" />
      <text x={PAD.left - 4} y={PAD.top + 4} className="prog-axis-label" textAnchor="end">{fmt(maxV)}</text>
      {goalLine != null && (
        <line
          x1={PAD.left} y1={PAD.top + iH - toH(goalLine)}
          x2={PAD.left + iW} y2={PAD.top + iH - toH(goalLine)}
          stroke="var(--accent)" strokeWidth="1" strokeDasharray="4,3" opacity="0.7"
        />
      )}
      {bars.map((b, i) => (
        <rect
          key={i}
          x={toX(i) - barW / 2}
          y={PAD.top + iH - toH(b.value)}
          width={barW}
          height={toH(b.value)}
          fill={color}
          rx="1.5"
        />
      ))}
      {labelIdx.map(i => (
        <text key={i} x={toX(i)} y={H - 3} className="prog-axis-label" textAnchor="middle">
          {bars[i].label}
        </text>
      ))}
    </svg>
  );
}

// ─── Tab: Training ────────────────────────────────────────────────────────────

interface ExercisePoint {
  date: string;
  label: string;
  topWeight: number;
  est1RM: number;
  volume: number;
}

function formatDurationShort(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TrainingTab({ sessions, exercises }: { sessions: Session[]; exercises: Exercise[] }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const finished = sessions.filter(s => s.finishedAt);

  // ── Overview metrics ─────────────────────────────────────────────────────
  const totalSessions = finished.length;
  const totalVolume = finished.reduce((sum, s) => {
    for (const g of s.groups) for (const b of g.blocks) for (const st of b.sets)
      if (st.completed && st.weight && st.reps) sum += st.weight * st.reps;
    return sum;
  }, 0);
  const totalDuration = finished.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
  const totalKcal = finished.reduce((sum, s) => sum + (s.estimatedKcal ?? 0), 0);

  // Weekly consistency — last 12 weeks
  const now = new Date();
  const weekBars: { label: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const startISO = weekStart.toISOString().slice(0, 10);
    const endISO = weekEnd.toISOString().slice(0, 10);
    const count = finished.filter(s => s.date >= startISO && s.date < endISO).length;
    const label = i === 0 ? 'Now' : `${weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' }).replace(' ', '')}`;
    weekBars.push({ label, value: count });
  }

  // Find exercises that appear in at least one finished session
  const exerciseMap = new Map(exercises.map(e => [e.id, e]));
  const usedIds = new Set<string>();
  finished.forEach(s =>
    s.groups.forEach(g => g.blocks.forEach(b => usedIds.add(b.exerciseId)))
  );
  const usedExercises = [...usedIds]
    .map(id => exerciseMap.get(id))
    .filter(Boolean) as Exercise[];

  const filtered = usedExercises
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedName = selectedId ? exerciseMap.get(selectedId)?.name ?? selectedId : '';

  // Compute per-session points for selected exercise
  const points: ExercisePoint[] = [];
  if (selectedId) {
    const relevant = sessions
      .filter(s => s.finishedAt && s.groups.some(g => g.blocks.some(b => b.exerciseId === selectedId)))
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const s of relevant) {
      const allSets = s.groups.flatMap(g =>
        g.blocks.filter(b => b.exerciseId === selectedId).flatMap(b =>
          b.sets.filter(st => st.completed && st.weight != null && st.weight > 0)
        )
      );
      if (allSets.length === 0) continue;

      const topWeight = Math.max(...allSets.map(st => st.weight!));
      const est1RM = Math.max(...allSets
        .filter(st => st.reps != null && st.reps > 0)
        .map(st => epley(st.weight!, st.reps!))
      );
      const volume = allSets.reduce((sum, st) => sum + (st.weight! * (st.reps ?? 1)), 0);
      const label = s.date.slice(5).replace('-', '/');
      points.push({ date: s.date, label, topWeight, est1RM: isFinite(est1RM) ? est1RM : topWeight, volume });
    }
  }

  return (
    <div className="prog-tab-content">
      {/* Overview stats */}
      <div className="prog-section">
        <div className="prog-bw-stats">
          <div className="prog-bw-stat">
            <span className="prog-bw-stat-val">{totalSessions}</span>
            <span className="prog-bw-stat-label">Sessions</span>
          </div>
          <div className="prog-bw-stat">
            <span className="prog-bw-stat-val">{totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume}</span>
            <span className="prog-bw-stat-label">Total vol (kg)</span>
          </div>
          <div className="prog-bw-stat">
            <span className="prog-bw-stat-val">{formatDurationShort(totalDuration)}</span>
            <span className="prog-bw-stat-label">Total time</span>
          </div>
          {totalKcal > 0 && (
            <div className="prog-bw-stat">
              <span className="prog-bw-stat-val">{totalKcal >= 1000 ? `${(totalKcal / 1000).toFixed(1)}k` : Math.round(totalKcal)}</span>
              <span className="prog-bw-stat-label">Kcal burned</span>
            </div>
          )}
        </div>
      </div>

      {/* Weekly consistency */}
      <div className="prog-section">
        <div className="prog-chart-label">Weekly sessions — last 12 weeks</div>
        <BarChart bars={weekBars} color="var(--accent)" />
      </div>

      {/* Exercise search */}
      <div className="prog-section">
        <div className="prog-section-label">Exercise</div>
        <div style={{ position: 'relative' }}>
          <input
            className="prog-search"
            placeholder="Search exercises…"
            value={search || selectedName}
            onChange={e => { setSearch(e.target.value); setSelectedId(null); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          />
          {showDropdown && filtered.length > 0 && (
            <div className="prog-dropdown">
              {filtered.slice(0, 12).map(e => (
                <button key={e.id} className="prog-dropdown-row" onMouseDown={() => {
                  setSelectedId(e.id); setSearch(''); setShowDropdown(false);
                }}>
                  {e.name}
                  <span className="prog-dropdown-meta">{e.muscleGroup}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedId && points.length === 0 && (
        <div className="prog-empty"><span>No logged sets for this exercise yet.</span></div>
      )}

      {points.length > 0 && (
        <>
          <div className="prog-section">
            <div className="prog-chart-label">Top Set Weight (kg)</div>
            <LineChart points={points.map(p => ({ label: p.label, value: p.topWeight }))} color="var(--accent)" />
          </div>
          <div className="prog-section">
            <div className="prog-chart-label">Estimated 1RM — Epley (kg)</div>
            <LineChart points={points.map(p => ({ label: p.label, value: Math.round(p.est1RM) }))} color="#7c6af5" />
          </div>
          <div className="prog-section">
            <div className="prog-chart-label">Volume (kg × reps)</div>
            <LineChart points={points.map(p => ({ label: p.label, value: Math.round(p.volume) }))} color="var(--grp-cardio)" />
          </div>
        </>
      )}

      {!selectedId && (
        <div className="prog-empty"><span>Select an exercise to see your training history.</span></div>
      )}
    </div>
  );
}

// ─── Tab: Records (PRs) ───────────────────────────────────────────────────────

interface PREntry {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  est1RM: number;
  date: string;
}

function RecordsTab({ sessions, exercises }: { sessions: Session[]; exercises: Exercise[] }) {
  const exerciseMap = new Map(exercises.map(e => [e.id, e]));

  // Per exercise: best set by estimated 1RM
  const bestByExercise = new Map<string, PREntry>();

  for (const s of sessions) {
    if (!s.finishedAt) continue;
    for (const g of s.groups) {
      for (const b of g.blocks) {
        for (const st of b.sets) {
          if (!st.completed || st.weight == null || st.weight <= 0 || st.reps == null || st.reps <= 0) continue;
          const e1rm = epley(st.weight, st.reps);
          const existing = bestByExercise.get(b.exerciseId);
          if (!existing || e1rm > existing.est1RM) {
            bestByExercise.set(b.exerciseId, {
              exerciseId: b.exerciseId,
              exerciseName: exerciseMap.get(b.exerciseId)?.name ?? b.exerciseName,
              weight: st.weight,
              reps: st.reps,
              est1RM: e1rm,
              date: s.date,
            });
          }
        }
      }
    }
  }

  const prs = [...bestByExercise.values()].sort((a, b) => b.est1RM - a.est1RM);

  if (prs.length === 0) {
    return (
      <div className="prog-tab-content">
        <div className="prog-empty"><span>Log some workouts to see your personal records.</span></div>
      </div>
    );
  }

  return (
    <div className="prog-tab-content">
      <div className="prog-section">
        <div className="prog-section-label">Best lifts by estimated 1RM</div>
        {prs.map((pr, i) => (
          <div key={pr.exerciseId} className="prog-pr-row">
            <div className="prog-pr-rank">{i + 1}</div>
            <div className="prog-pr-info">
              <div className="prog-pr-name">{pr.exerciseName}</div>
              <div className="prog-pr-meta">{pr.date} · {pr.weight} kg × {pr.reps} reps</div>
            </div>
            <div className="prog-pr-e1rm">
              <span className="prog-pr-e1rm-val">{Math.round(pr.est1RM)}</span>
              <span className="prog-pr-e1rm-unit">kg e1RM</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Bodyweight ──────────────────────────────────────────────────────────

function BodyTab({ bodyweightEntries }: { bodyweightEntries: Bodyweight[] }) {
  const entries = [...bodyweightEntries].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);

  if (entries.length === 0) {
    return (
      <div className="prog-tab-content">
        <div className="prog-empty"><span>No bodyweight entries yet. Log your weight from the Today tab.</span></div>
      </div>
    );
  }

  const latest = entries[entries.length - 1];
  const unit = latest.unit;
  const points = entries.map(e => ({ label: e.date.slice(5).replace('-', '/'), value: e.weight }));

  // 7-day moving average (or all-time if fewer)
  const avg7 = entries.slice(-7).reduce((s, e) => s + e.weight, 0) / Math.min(7, entries.length);

  // Trend: compare last 7 days avg to prev 7 days avg
  let trend: string | null = null;
  if (entries.length >= 14) {
    const prev7avg = entries.slice(-14, -7).reduce((s, e) => s + e.weight, 0) / 7;
    const diff = avg7 - prev7avg;
    trend = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} ${unit} vs prior week`;
  }

  return (
    <div className="prog-tab-content">
      <div className="prog-section">
        <div className="prog-bw-stats">
          <div className="prog-bw-stat">
            <span className="prog-bw-stat-val">{latest.weight} {unit}</span>
            <span className="prog-bw-stat-label">Current</span>
          </div>
          <div className="prog-bw-stat">
            <span className="prog-bw-stat-val">{avg7.toFixed(1)} {unit}</span>
            <span className="prog-bw-stat-label">7-day avg</span>
          </div>
          {trend && (
            <div className="prog-bw-stat">
              <span className="prog-bw-stat-val" style={{ fontSize: 13 }}>{trend}</span>
              <span className="prog-bw-stat-label">Trend</span>
            </div>
          )}
        </div>
      </div>
      <div className="prog-section">
        <div className="prog-chart-label">Weight over time ({unit})</div>
        <LineChart points={points} color="var(--accent)" />
      </div>
    </div>
  );
}

// ─── Tab: Nutrition ───────────────────────────────────────────────────────────

function NutritionTab({ logs }: { logs: NutritionLog[] }) {
  const today = new Date();
  const days: { date: string; label: string; kcal: number; protein: number; carbs: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2);
    const dayLogs = logs.filter(l => l.date === iso);
    const kcal = dayLogs.reduce((s, l) => s + l.kcal, 0);
    const protein = dayLogs.reduce((s, l) => s + (l.protein ?? 0), 0);
    const carbs = dayLogs.reduce((s, l) => s + (l.carbs ?? 0), 0);
    days.push({ date: iso, label, kcal, protein, carbs });
  }

  const daysWithKcal = days.filter(d => d.kcal > 0);
  const daysWithProtein = days.filter(d => d.protein > 0);
  const daysWithCarbs = days.filter(d => d.carbs > 0);
  const avgKcal = daysWithKcal.length > 0
    ? Math.round(daysWithKcal.reduce((s, d) => s + d.kcal, 0) / daysWithKcal.length)
    : 0;
  const avgProtein = daysWithProtein.length > 0
    ? Math.round(daysWithProtein.reduce((s, d) => s + d.protein, 0) / daysWithProtein.length)
    : 0;
  const avgCarbs = daysWithCarbs.length > 0
    ? Math.round(daysWithCarbs.reduce((s, d) => s + d.carbs, 0) / daysWithCarbs.length)
    : 0;
  const hasProtein = daysWithProtein.length > 0;
  const hasCarbs = daysWithCarbs.length > 0;

  const proteinPoints = daysWithProtein.map(d => ({ label: d.label, value: d.protein }));
  const carbsPoints = daysWithCarbs.map(d => ({ label: d.label, value: d.carbs }));

  if (logs.length === 0) {
    return (
      <div className="prog-tab-content">
        <div className="prog-empty"><span>No nutrition logs yet. Log meals from the Today tab.</span></div>
      </div>
    );
  }

  return (
    <div className="prog-tab-content">
      <div className="prog-section">
        <div className="prog-bw-stats">
          <div className="prog-bw-stat">
            <span className="prog-bw-stat-val">{avgKcal}</span>
            <span className="prog-bw-stat-label">Avg kcal/day</span>
          </div>
          {hasProtein && (
            <div className="prog-bw-stat">
              <span className="prog-bw-stat-val">{avgProtein}g</span>
              <span className="prog-bw-stat-label">Avg protein/day</span>
            </div>
          )}
          {hasCarbs && (
            <div className="prog-bw-stat">
              <span className="prog-bw-stat-val">{avgCarbs}g</span>
              <span className="prog-bw-stat-label">Avg carbs/day</span>
            </div>
          )}
          <div className="prog-bw-stat">
            <span className="prog-bw-stat-val">{daysWithKcal.length}</span>
            <span className="prog-bw-stat-label">Days logged</span>
          </div>
        </div>
      </div>
      <div className="prog-section">
        <div className="prog-chart-label">Daily calories — last 14 days</div>
        <BarChart
          bars={days.map(d => ({ label: d.label, value: d.kcal }))}
          color="var(--grp-main)"
        />
      </div>
      {hasProtein && (
        <div className="prog-section">
          <div className="prog-chart-label">Daily protein (g) — logged days</div>
          <LineChart points={proteinPoints} color="#7c6af5" />
        </div>
      )}
      {hasCarbs && (
        <div className="prog-section">
          <div className="prog-chart-label">Daily carbs (g) — logged days</div>
          <LineChart points={carbsPoints} color="#e6994a" />
        </div>
      )}
    </div>
  );
}

// ─── Progress View ────────────────────────────────────────────────────────────

type Tab = 'training' | 'records' | 'body' | 'nutrition';

const TABS: { id: Tab; label: string }[] = [
  { id: 'training', label: 'Training' },
  { id: 'records', label: 'Records' },
  { id: 'body', label: 'Body' },
  { id: 'nutrition', label: 'Nutrition' },
];

export function ProgressView({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('training');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [bodyweight, setBodyweight] = useState<Bodyweight[]>([]);
  const [nutritionLogs, setNutritionLogs] = useState<NutritionLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAllSessions(),
      getAllExercises(),
      getAllBodyweight(),
      getAllNutritionLogs(),
    ]).then(([s, e, b, n]) => {
      setSessions(s);
      setExercises(e);
      setBodyweight(b);
      setNutritionLogs(n);
      setLoading(false);
    });
  }, []);

  return (
    <div className="progress-view">
      <Topbar title="Progress" onBack={onBack} />

      {/* Tab bar */}
      <div className="prog-tabbar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`prog-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="progress-content">
        {loading ? (
          <div className="prog-empty"><span>Loading…</span></div>
        ) : tab === 'training' ? (
          <TrainingTab sessions={sessions} exercises={exercises} />
        ) : tab === 'records' ? (
          <RecordsTab sessions={sessions} exercises={exercises} />
        ) : tab === 'body' ? (
          <BodyTab bodyweightEntries={bodyweight} />
        ) : (
          <NutritionTab logs={nutritionLogs} />
        )}
      </div>
    </div>
  );
}
