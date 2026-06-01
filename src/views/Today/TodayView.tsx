import { useEffect, useRef, useState } from 'react';
import { useActiveSession } from '../../context/ActiveSessionContext';
import { usePlanDay } from '../../hooks/usePlanDay';
import { LogoMark } from '../../components/Logo/Logo';
import { getAllSessions } from '../../db/sessions';
import { getWorkout } from '../../db/workouts';
import { getSessionsByDate } from '../../db/sessions';
import { getAllExercises } from '../../db/exercises';
import { getNutritionLogsByDate, addNutritionLog, deleteNutritionLog, updateNutritionLog } from '../../db/nutritionLog';
import { getAllBodyweight } from '../../db/bodyweight';
import { getActiveGoalForDate } from '../../db/calorieGoalLog';
import { Modal } from '../../components/Modal/Modal';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { Topbar } from '../../components/Topbar/Topbar';
import { CategoryIcon, CATEGORY_COLOR, CATEGORY_LABEL } from '../../components/CategoryIcon/CategoryIcon';
import { today, toISODate, formatDisplayDate, formatDuration } from '../../lib/date';
import { extractYouTubeId } from '../../lib/youtube';
import { uid } from '../../lib/ids';
import type { Session, SessionGroup, SessionBlock, SessionSet, Workout, Exercise, NutritionLog, CalorieGoalLog } from '../../types';
import './Today.css';

const TODAY = today();

const QUOTES = [
  "The only bad workout is the one that didn't happen.",
  "Push yourself, because no one else is going to do it for you.",
  "Your body can stand almost anything. It's your mind you have to convince.",
  "Strength doesn't come from what you can do — it comes from overcoming what you thought you couldn't.",
  "The pain you feel today will be the strength you feel tomorrow.",
  "Success isn't always about greatness. It's about consistency.",
  "You don't have to be great to start, but you have to start to be great.",
  "No matter how slow you go, you are still lapping everyone on the couch.",
  "Discipline is choosing between what you want now and what you want most.",
  "Champions keep playing until they get it right.",
  "Every rep counts. Every session adds up.",
  "Show up. Do the work. Trust the process.",
];

function getDailyQuote(): string {
  const seed = new Date().toDateString();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return QUOTES[Math.abs(hash) % QUOTES.length];
}

function getGreeting(name: string): string {
  const h = new Date().getHours();
  const timeGreet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${timeGreet}, ${name.split(' ')[0]}` : timeGreet;
}

const GROUP_CLASS: Record<string, string> = {
  warmup: 'g-warmup',
  mobility: 'g-mobility',
  activation: 'g-activation',
  main: 'g-main',
  accessory: 'g-accessory',
  cardio: 'g-cardio',
  cooldown: 'g-cooldown',
};

function templateToSessionGroups(workout: Workout, exerciseMap: Map<string, Exercise>): SessionGroup[] {
  return workout.groups.map(g => ({
    id: g.id,
    name: g.name,
    groupType: g.groupType,
    blocks: g.blocks.map(b => {
      const ex = exerciseMap.get(b.exerciseId);
      const setCount = b.targetSets ?? 3;
      const sets: SessionSet[] = Array.from({ length: setCount }, () => ({
        completed: false,
        weight: b.targetWeight ?? null,
        reps: b.targetReps ? parseInt(b.targetReps) || null : null,
        time: b.targetTime ?? null,
        distance: null,
        rpe: null,
        notes: '',
      }));
      return {
        id: b.id,
        exerciseId: b.exerciseId,
        exerciseName: ex?.name ?? b.exerciseId,
        skipped: false,
        skipReason: '',
        sets,
      };
    }),
  }));
}

// ─── Idle Today View ──────────────────────────────────────────────────────────

export function TodayView() {
  const { session, paused, startSession, resumeSession, unpauseSession } = useActiveSession();
  const [selectedNutritionDate, setSelectedNutritionDate] = useState(TODAY);
  const { day } = usePlanDay(selectedNutritionDate);
  // All finished sessions for the selected date, keyed by session id
  const [doneSessions, setDoneSessions] = useState<Map<string, Session>>(new Map());
  const [viewingWorkout, setViewingWorkout] = useState<Workout | null>(null);
  const [viewingSession, setViewingSession] = useState<Session | null>(null);
  const [profileName, setProfileName] = useState('');
  const [nutritionLogs, setNutritionLogs] = useState<NutritionLog[]>([]);
  const [calorieGoal, setCalorieGoal] = useState<CalorieGoalLog | null>(null);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [editingLog, setEditingLog] = useState<NutritionLog | null>(null);
  const [proteinGoalG, setProteinGoalG] = useState<number | null>(null);
  const [weekSessionDates, setWeekSessionDates] = useState<Set<string>>(new Set());

  // Load finished sessions for the selected date
  useEffect(() => {
    getSessionsByDate(selectedNutritionDate).then(sessions => {
      setDoneSessions(new Map(
        sessions.filter(s => s.finishedAt).map(s => [s.id, s])
      ));
    });
  }, [selectedNutritionDate, session]); // re-run on date change or when active session finishes

  useEffect(() => {
    import('../../db/meta').then(m => m.getProfile()).then(p => { if (p.name) setProfileName(p.name); });
    getAllSessions().then(sessions => {
      setWeekSessionDates(new Set(sessions.filter(s => s.finishedAt).map(s => s.date)));
    });
    getAllBodyweight().then(bws => {
      const latest = bws.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      if (latest) setProteinGoalG(Math.round(latest.weight * 2));
    });
  }, []);

  useEffect(() => {
    Promise.all([
      getNutritionLogsByDate(selectedNutritionDate),
      getActiveGoalForDate(selectedNutritionDate),
    ]).then(([logs, goal]) => {
      setNutritionLogs(logs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      setCalorieGoal(goal);
    });
  }, [selectedNutritionDate]);

  async function startFreestyle() {
    const s: Session = {
      id: uid('sess'),
      date: selectedNutritionDate,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      workoutId: null,
      workoutName: 'Freestyle',
      unplanned: true,
      groups: [{ id: uid('g'), name: 'Main', groupType: 'main', blocks: [] }],
      notes: '',
      updatedAt: Date.now(),
    };
    await startSession(s);
  }

  async function startFromTemplate(workoutId: string) {
    const [workout, exercises] = await Promise.all([getWorkout(workoutId), getAllExercises()]);
    if (!workout) return;
    const exerciseMap = new Map(exercises.map(e => [e.id, e]));
    const s: Session = {
      id: uid('sess'),
      date: selectedNutritionDate,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      workoutId: workout.id,
      workoutName: workout.name,
      unplanned: false,
      groups: templateToSessionGroups(workout, exerciseMap),
      notes: '',
      updatedAt: Date.now(),
    };
    await startSession(s);
  }

  if (session && !paused) return <ActiveSessionView />;

  if (viewingSession) {
    return (
      <SessionDetailPage
        session={viewingSession}
        onBack={() => setViewingSession(null)}
        onEdit={() => { setViewingSession(null); resumeSession(viewingSession); }}
      />
    );
  }

  if (viewingWorkout) {
    return (
      <WorkoutDetailPage
        workout={viewingWorkout}
        onBack={() => setViewingWorkout(null)}
        onStart={() => { setViewingWorkout(null); startFromTemplate(viewingWorkout.id); }}
      />
    );
  }

  return (
    <div className="today-view">

      {paused && session && (
        <div className="session-resume-banner">
          <div className="session-resume-banner__info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>{session.workoutName} in progress</span>
          </div>
          <button className="btn primary btn-sm" onClick={unpauseSession}>Resume</button>
        </div>
      )}

      <div className="today-idle">
        <div className="today-hero">
          <div className="today-hero-top">
            <LogoMark size={28} />
            <div className="today-greeting">{getGreeting(profileName)}</div>
          </div>
          <div className="today-quote">"{getDailyQuote()}"</div>
        </div>

        {/* Weekly ring + date nav */}
        <WeekRing sessionDates={weekSessionDates} />
        <DateNav date={selectedNutritionDate} onChange={setSelectedNutritionDate} />

        {/* Workouts / Movement */}
        {(() => {
          const allSessions = Array.from(doneSessions.values());
          const plannedWorkoutIds = new Set(day?.workouts.map(pw => pw.workoutId) ?? []);
          const unplannedSessions = allSessions.filter(
            s => !s.workoutId || !plannedWorkoutIds.has(s.workoutId)
          );
          const hasPlanned = day && day.workouts.length > 0;
          const hasAnything = hasPlanned || unplannedSessions.length > 0;

          return (
            <div className="plan-section">
              <div className="plan-section-header">
                <span className="plan-section-label" style={{ marginBottom: 0 }}>Workouts</span>
                <button className="btn outline btn-sm" onClick={startFreestyle}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Freestyle
                </button>
              </div>

              {hasPlanned && day!.workouts.map(pw => {
                const doneSession = allSessions.find(s => s.workoutId === pw.workoutId) ?? null;
                return (
                  <PlannedWorkoutCard
                    key={pw.workoutId}
                    workoutId={pw.workoutId}
                    note={pw.note}
                    doneSession={doneSession}
                    onEdit={() => resumeSession(doneSession!)}
                    onView={w => setViewingWorkout(w)}
                    onViewSession={s => setViewingSession(s)}
                  />
                );
              })}

              {unplannedSessions.map(s => (
                <button
                  key={s.id}
                  className="plan-card plan-card--done"
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => setViewingSession(s)}
                >
                  <div style={{ flex: 1 }}>
                    <div className="plan-card__name">{s.workoutName}</div>
                    <div className="plan-card__meta">
                      {s.groups.reduce((a, g) => a + g.blocks.length, 0)} exercises
                      {s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ''}
                    </div>
                  </div>
                  <span className="plan-card__done-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Done
                  </span>
                </button>
              ))}

              {!hasAnything && (
                <div className="plan-empty">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="plan-empty__icon">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Nothing planned for this day</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Nutrition */}
        <NutritionSection
          logs={nutritionLogs}
          goal={calorieGoal}
          proteinGoalG={proteinGoalG}
          onAdd={() => setShowAddMeal(true)}
          onEdit={log => setEditingLog(log)}
          onDelete={async (id) => {
            await deleteNutritionLog(id);
            setNutritionLogs(prev => prev.filter(l => l.id !== id));
          }}
        />
      </div>

      {showAddMeal && (
        <AddMealSheet
          onClose={() => setShowAddMeal(false)}
          onSave={async (entry) => {
            const log = await addNutritionLog({ ...entry, protein: entry.protein ?? undefined, date: selectedNutritionDate });
            setNutritionLogs(prev => [...prev, log].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
            setShowAddMeal(false);
          }}
        />
      )}

      {editingLog && (
        <AddMealSheet
          initialLog={editingLog}
          onClose={() => setEditingLog(null)}
          onSave={async (entry) => {
            const updated: NutritionLog = { ...editingLog, ...entry, protein: entry.protein ?? undefined };
            await updateNutritionLog(updated);
            setNutritionLogs(prev =>
              prev.map(l => l.id === updated.id ? updated : l)
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            );
            setEditingLog(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Week Ring ────────────────────────────────────────────────────────────────

const DAY_LETTER: Record<number, string> = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' };

function WeekRing({ sessionDates }: { sessionDates: Set<string> }) {
  const today = new Date(TODAY + 'T00:00:00');
  const daysSinceSat = today.getDay() === 6 ? 0 : today.getDay() + 1;

  // Active streak — consecutive workout days backwards from today (or yesterday)
  const streakDates = new Set<string>();
  const streakCur = new Date(today);
  if (!sessionDates.has(TODAY)) streakCur.setDate(streakCur.getDate() - 1);
  while (true) {
    const iso = toISODate(streakCur);
    if (sessionDates.has(iso)) { streakDates.add(iso); streakCur.setDate(streakCur.getDate() - 1); }
    else break;
  }
  const streakCount = streakDates.size;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - daysSinceSat + i);
    const iso = toISODate(d);
    return {
      iso,
      letter: DAY_LETTER[d.getDay()],
      isToday: iso === TODAY,
      isFuture: d > today,
      hasWorkout: sessionDates.has(iso),
      isStreak: streakDates.has(iso),
    };
  });

  return (
    <div className="week-ring">
      <div className="week-ring__header">
        <span className="week-ring__title">This Week</span>
        {streakCount > 0 && (
          <div className="week-streak">
            <svg width="11" height="14" viewBox="0 0 11 14" fill="var(--accent)">
              <path d="M6.5 0S2 4 2 7.5a4.5 4.5 0 009 0C11 4 6.5 0 6.5 0zM6.5 11a2.5 2.5 0 01-2.5-2.5c0-1.5 1.2-3 2.5-4.2 1.3 1.2 2.5 2.7 2.5 4.2A2.5 2.5 0 016.5 11z"/>
            </svg>
            <span className="week-streak__count">{streakCount}D</span>
          </div>
        )}
      </div>

      <div className="week-ring__days">
        {days.flatMap((day, i) => {
          const connector = i > 0
            ? <div key={`c${i}`} className={`week-conn${days[i - 1].isStreak && day.isStreak ? ' week-conn--on' : ''}`} />
            : null;

          const sq = (
            <div key={day.iso} className="week-day">
              <div className={[
                'week-sq',
                day.hasWorkout ? 'week-sq--done' : '',
                day.isToday && !day.hasWorkout ? 'week-sq--today' : '',
                day.isFuture ? 'week-sq--future' : '',
              ].filter(Boolean).join(' ')}>
                {day.hasWorkout
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  : !day.isFuture ? <div className="week-sq__dot" /> : null
                }
              </div>
              <span className={`week-day__lbl${day.isToday ? ' week-day__lbl--today' : ''}`}>{day.letter}</span>
            </div>
          );

          return connector ? [connector, sq] : [sq];
        })}
      </div>
    </div>
  );
}

// ─── Date Nav ────────────────────────────────────────────────────────────────

function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const isToday = date === TODAY;

  function shift(delta: number) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const next = toISODate(d);
    if (next <= TODAY) onChange(next);
  }

  const label = isToday ? 'Today' : formatDisplayDate(date);

  return (
    <div className="date-nav">
      <button className="icon-btn date-nav__arrow" onClick={() => shift(-1)} aria-label="Previous day">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="date-nav__label">{label}</span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {!isToday && (
          <button className="btn outline btn-sm" onClick={() => onChange(TODAY)} style={{ fontSize: 10, padding: '2px 8px' }}>
            Today
          </button>
        )}
        <button className="icon-btn date-nav__arrow" onClick={() => shift(1)} disabled={isToday} aria-label="Next day">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Nutrition Section ────────────────────────────────────────────────────────

function NutritionSection({ logs, goal, proteinGoalG, onAdd, onEdit, onDelete }: {
  logs: NutritionLog[];
  goal: CalorieGoalLog | null;
  proteinGoalG: number | null;
  onAdd: () => void;
  onEdit: (log: NutritionLog) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const totalKcal = logs.reduce((sum, l) => sum + l.kcal, 0);
  const totalProtein = logs.reduce((sum, l) => sum + (l.protein ?? 0), 0);
  const goalKcal = goal?.targetCalories ?? null;
  const kcalProgress = goalKcal ? Math.min(totalKcal / goalKcal, 1) : 0;
const kcalOver = goalKcal && totalKcal > goalKcal;
  const proteinOver = proteinGoalG && totalProtein > proteinGoalG;
  const hasProteinData = logs.some(l => l.protein != null);

  return (
    <div className="nutrition-section">
      <div className="nutrition-header">
        <span className="plan-section-label" style={{ marginBottom: 0 }}>Nutrition</span>
        <button className="btn outline btn-sm" onClick={onAdd} style={{ marginLeft: 'auto' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Meal
        </button>
      </div>

      {/* Stats row */}
      <div className="nutrition-stats">
        <div className="nutrition-stat">
          <span className={`nutrition-stat__val${kcalOver ? ' --over' : ''}`}>{totalKcal.toLocaleString()}</span>
          <span className="nutrition-stat__label">{goalKcal ? `/ ${goalKcal.toLocaleString()} kcal` : 'kcal'}</span>
        </div>
        {hasProteinData && (
          <span className={`nutrition-protein-pill${proteinOver ? ' --over' : ''}`}>{totalProtein}g protein</span>
        )}
      </div>

      {/* Progress bars */}
      {goalKcal && (
        <div className="nutrition-bar">
          <div className={`nutrition-bar__fill${kcalOver ? ' nutrition-bar__fill--over' : ''}`}
            style={{ width: `${kcalProgress * 100}%` }} />
        </div>
      )}

      {/* Meal list */}
      {logs.length > 0 && (
        <div className="nutrition-log-list">
          {logs.map(log => (
            <div
              key={log.id}
              className="nutrition-log-row"
              onClick={() => { setConfirmDeleteId(null); onEdit(log); }}
              style={{ cursor: 'pointer' }}
            >
              <div className="nutrition-log-row__info">
                <span className="nutrition-log-row__name">{log.name}</span>
                {log.notes && <span className="nutrition-log-row__notes">{log.notes}</span>}
              </div>
              <div className="nutrition-log-row__right">
                <span className="nutrition-log-row__kcal">{log.kcal.toLocaleString()} kcal</span>
                {log.protein != null && (
                  <span className="nutrition-log-row__protein">{log.protein}g</span>
                )}
              </div>
              {confirmDeleteId === log.id ? (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#E53E3E', borderColor: '#E53E3E', color: '#fff', padding: '3px 10px' }}
                    onClick={() => { onDelete(log.id); setConfirmDeleteId(null); }}
                  >
                    Remove
                  </button>
                  <button
                    className="btn outline btn-sm"
                    style={{ padding: '3px 10px' }}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="icon-btn"
                  style={{ width: 24, height: 24, flexShrink: 0 }}
                  onClick={e => { e.stopPropagation(); setConfirmDeleteId(log.id); }}
                  aria-label="Delete"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Meal Sheet ───────────────────────────────────────────────────────────

const MEAL_CHIPS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const AI_PROMPT = (desc: string) =>
  `You are a nutrition estimator. The user will describe food they ate.
Return ONLY valid JSON — no markdown, no explanation, nothing else — in this exact format:
{"title":"brief meal name","total_cal":number,"total_protein":number,"status":"success"}
Use status "failure" only if the description is completely too vague to estimate even roughly (e.g. just "food" or "stuff").
For anything with recognisable food items, always return "success" with your best estimate.

Food description: ${desc}`;

type AiState = 'idle' | 'loading' | 'success' | 'error';

function AddMealSheet({ onClose, onSave, initialLog }: {
  onClose: () => void;
  onSave: (entry: { name: string; kcal: number; protein: number | null; notes: string }) => void;
  initialLog?: NutritionLog;
}) {
  const [description, setDescription] = useState('');
  const [name, setName] = useState(initialLog?.name ?? '');
  const [kcal, setKcal] = useState(initialLog?.kcal ? String(initialLog.kcal) : '');
  const [protein, setProtein] = useState<number | null>(initialLog?.protein ?? null);
  const [notes, setNotes] = useState(initialLog?.notes ?? '');
  const [aiState, setAiState] = useState<AiState>('idle');
  const [aiError, setAiError] = useState('');

  const canCalculate = description.trim().length > 3;
  const canSave = name.trim() && Number(kcal) > 0;

  async function calculateFromAI() {
    setAiState('loading');
    setAiError('');
    try {
      const raw = await window.puter.ai.chat(AI_PROMPT(description.trim()));
      const text = typeof raw === 'string'
        ? raw
        : raw?.message?.content?.[0]?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in response');
      const json = JSON.parse(match[0]) as {
        title?: string; total_cal?: number; total_protein?: number; status?: string;
      };
      if (json.status === 'failure') {
        setAiState('error');
        setAiError('Too vague to estimate — describe the food in more detail.');
        return;
      }
      setName(json.title ?? description.trim());
      setKcal(String(Math.round(json.total_cal ?? 0)));
      setProtein(json.total_protein != null ? Math.round(json.total_protein) : null);
      setAiState('success');
    } catch {
      setAiState('error');
      setAiError('Could not reach AI. Enter calories manually.');
    }
  }

  return (
    <div className="meal-sheet-overlay" onClick={onClose}>
      <div className="meal-sheet" onClick={e => e.stopPropagation()}>
        <div className="meal-sheet__header">
          <span className="meal-sheet__title">{initialLog ? 'Edit Meal' : 'Add Meal'}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Quick chips */}
        <div className="meal-chips">
          {MEAL_CHIPS.map(chip => (
            <button
              key={chip}
              className={`meal-chip${name === chip ? ' active' : ''}`}
              onClick={() => setName(name === chip ? '' : chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* AI description input */}
        <div className="meal-field">
          <textarea
            className="input"
            placeholder="Describe what you ate… e.g. 2 scrambled eggs, toast with butter, black coffee"
            rows={3}
            value={description}
            onChange={e => { setDescription(e.target.value); setAiState('idle'); }}
            style={{ resize: 'none', fontFamily: 'var(--body)', fontSize: 14 }}
            autoFocus
          />
        </div>

        {/* Calculate from AI button */}
        <button
          className={`meal-ai-btn${aiState === 'loading' ? ' loading' : ''}`}
          disabled={!canCalculate || aiState === 'loading'}
          onClick={calculateFromAI}
        >
          {aiState === 'loading' ? (
            <>
              <span className="meal-ai-spinner" />
              Estimating…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4z"/>
                <line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/>
              </svg>
              Calculate from AI
            </>
          )}
        </button>

        {/* AI error */}
        {aiState === 'error' && (
          <div className="meal-ai-error">{aiError}</div>
        )}

        {/* Filled fields — name, kcal, protein */}
        <div className="meal-field">
          <input
            className="input"
            type="text"
            placeholder="Meal name…"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div className="meal-field meal-kcal-row">
          <input
            className="input meal-kcal-input"
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={kcal}
            onChange={e => setKcal(e.target.value)}
          />
          <span className="meal-kcal-unit">kcal</span>
          <input
            className="input meal-kcal-input"
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={protein ?? ''}
            onChange={e => setProtein(e.target.value ? Math.round(Number(e.target.value)) : null)}
            style={{ maxWidth: 64 }}
          />
          <span className="meal-kcal-unit">g prot</span>
        </div>

        {/* Notes */}
        <div className="meal-field">
          <input
            className="input"
            type="text"
            placeholder="Notes (optional)…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div className="meal-sheet__actions">
          <button className="btn outline btn-full" onClick={onClose}>Cancel</button>
          <button
            className="btn primary btn-full"
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), kcal: Math.round(Number(kcal)), protein, notes })}
          >
            {initialLog ? 'Save Changes' : 'Add Meal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlannedWorkoutCard({ workoutId, note, doneSession, onEdit, onView, onViewSession }: {
  workoutId: string;
  note: string;
  doneSession: Session | null;
  onEdit: () => void;
  onView: (w: Workout) => void;
  onViewSession: (s: Session) => void;
}) {
  const [workout, setWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    getWorkout(workoutId).then(w => { if (w) setWorkout(w); });
  }, [workoutId]);

  const isDone = doneSession !== null;
  const name = workout?.name ?? workoutId;
  const exCount = workout ? workout.groups.reduce((a, g) => a + g.blocks.length, 0) : null;

  function handleCardClick() {
    if (isDone) onViewSession(doneSession);
    else if (workout) onView(workout);
  }

  return (
    <div
      className={`plan-card${isDone ? ' plan-card--done' : ''}`}
      style={{ cursor: 'pointer' }}
      onClick={handleCardClick}
    >
      <div style={{ flex: 1 }}>
        <div className="plan-card__name">{name}</div>
        <div className="plan-card__meta">
          {exCount !== null ? `${exCount} exercise${exCount !== 1 ? 's' : ''}` : ''}
          {note ? ` · ${note}` : ''}
          {isDone && doneSession.durationMs ? ` · ${formatDuration(doneSession.durationMs)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        {isDone ? (
          <>
            <span className="plan-card__done-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Done
            </span>
            <button className="btn outline btn-sm" onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          </>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Active Session View ──────────────────────────────────────────────────────

function isTimeBased(ex: Exercise | undefined): boolean {
  if (!ex) return false;
  if (ex.defaultUnit === 'sec' || ex.defaultUnit === 'min') return true;
  if (ex.category === 'cardio' || ex.category === 'stretching') return true;
  return false;
}

function formatTime(secs: number): string {
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${secs}s`;
}

function prescriptionLabel(block: SessionBlock, ex?: Exercise): string {
  const n = block.sets.length;
  const first = block.sets[0];
  if (!first) return `${n} set${n !== 1 ? 's' : ''}`;
  if (isTimeBased(ex)) {
    const t = first.time != null ? formatTime(first.time) : '?';
    return `${n} × ${t}`;
  }
  const reps = first.reps != null ? first.reps : '?';
  const weight = first.weight != null ? ` @ ${first.weight}kg` : '';
  return `${n} × ${reps}${weight}`;
}

function ActiveSessionView() {
  const { session, updateSession, finishSession, discardSession, pauseSession } = useActiveSession();
  const [confirmExit, setConfirmExit] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pickerGroupId, setPickerGroupId] = useState<string | null>(null);
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
  const [showAllSetsFor, setShowAllSetsFor] = useState<string | null>(null);
  const [miniVideoUrl, setMiniVideoUrl] = useState<string | null>(null);

  const isEditing = session?.finishedAt !== null && session?.finishedAt !== undefined;

  useEffect(() => {
    getAllExercises().then(all => {
      setExerciseMap(new Map(all.map(e => [e.id, e])));
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    const start = session.startedAt;
    setElapsed(Date.now() - start);
    const interval = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(interval);
  }, [session?.startedAt]);

  if (!session) return null;
  const s = session;

  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);

  // Overall progress
  const totalSets = s.groups.reduce((a, g) => a + g.blocks.reduce((b, bl) => b + bl.sets.length, 0), 0);
  const doneSets = s.groups.reduce((a, g) => a + g.blocks.reduce((b, bl) => b + bl.sets.filter(st => st.completed).length, 0), 0);
  const progress = totalSets > 0 ? doneSets / totalSets : 0;

  function updateSet(groupId: string, blockId: string, setIndex: number, patch: Partial<SessionSet>) {
    const groups = s.groups.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        blocks: g.blocks.map(b => {
          if (b.id !== blockId) return b;
          const sets = b.sets.map((set, i) => i === setIndex ? { ...set, ...patch } : set);
          return { ...b, sets };
        }),
      };
    });
    updateSession({ ...s, groups });
  }

  function addSet(groupId: string, blockId: string) {
    const groups = s.groups.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        blocks: g.blocks.map(b => {
          if (b.id !== blockId) return b;
          const lastSet = b.sets[b.sets.length - 1];
          const timeBased = isTimeBased(exerciseMap.get(b.exerciseId));
          const newSet: SessionSet = {
            completed: false,
            weight: lastSet?.weight ?? null,
            reps: timeBased ? null : (lastSet?.reps ?? null),
            time: timeBased ? (lastSet?.time ?? null) : null,
            distance: null, rpe: null, notes: '',
          };
          return { ...b, sets: [...b.sets, newSet] };
        }),
      };
    });
    updateSession({ ...s, groups });
  }

  function addExerciseToGroup(groupId: string, exercise: Exercise) {
    const block: SessionBlock = {
      id: uid('b'),
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      skipped: false,
      skipReason: '',
      sets: [{ completed: false, weight: null, reps: null, time: null, distance: null, rpe: null, notes: '' }],
    };
    const groups = s.groups.map(g =>
      g.id === groupId ? { ...g, blocks: [...g.blocks, block] } : g
    );
    updateSession({ ...s, groups });
  }

  function logSet(groupId: string, block: SessionBlock) {
    const si = block.sets.findIndex(st => !st.completed);
    if (si < 0) return;
    const logged = block.sets[si];
    const nextIdx = si + 1;
    const groups = s.groups.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        blocks: g.blocks.map(b => {
          if (b.id !== block.id) return b;
          const sets = b.sets.map((set, i) => {
            if (i === si) return { ...set, completed: true };
            // Pre-fill the immediately next set with the just-logged values
            if (i === nextIdx) return { ...set, weight: logged.weight, reps: logged.reps, time: logged.time };
            return set;
          });
          return { ...b, sets };
        }),
      };
    });
    updateSession({ ...s, groups });
    if (si === block.sets.length - 1) setExpandedBlock(null);
  }

  return (
    <div className="today-view">
      <Topbar title={isEditing ? 'Session / Editing' : 'Session / In Progress'} />

      {/* Editing banner */}
      {isEditing && (
        <div className="session-edit-banner">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Completed session — editing
        </div>
      )}

      {/* Session header + progress bar */}
      <div className="session-header">
        <div className="session-header__left">
          {!isEditing && (
            <div className="session-timer mono">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </div>
          )}
          <div className="session-name">{s.workoutName}</div>
        </div>
        <div className="session-header__right">
          <span className="session-progress-label">{doneSets}/{totalSets}</span>
        </div>
      </div>
      <div className="session-progress">
        <div className="session-progress__bar" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Scrollable groups — Browse → Focus */}
      <div className="session-scroll">
        {s.groups.map(group => {
          const groupClass = GROUP_CLASS[group.groupType] ?? 'g-main';
          const completedCount = group.blocks.reduce((a, b) => a + b.sets.filter(st => st.completed).length, 0);
          const totalCount = group.blocks.reduce((a, b) => a + b.sets.length, 0);

          return (
            <div key={group.id} className={`group ${groupClass}`}>
              <div className="group-head">
                <span className="gname">{group.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="gmeta">{completedCount}/{totalCount}</span>
                  <button
                    className="icon-btn"
                    style={{ width: 22, height: 22, borderRadius: 3 }}
                    onClick={() => setPickerGroupId(group.id)}
                    title="Add Exercise"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>

              {group.blocks.map(block => {
                const ex = exerciseMap.get(block.exerciseId);
                const timeBased = isTimeBased(ex);
                const blockKey = `${group.id}:${block.id}`;
                const isOpen = expandedBlock === blockKey;
                const pendingIdx = block.sets.findIndex(st => !st.completed);
                const allDone = pendingIdx === -1;

                return (
                  <div key={block.id} className={`browse-block${isOpen ? ' browse-block--open' : ''}${allDone ? ' browse-block--done' : ''}`}>
                    {/* Compact row */}
                    <div className="browse-row">
                      <button
                        className="browse-row__tap"
                        onClick={() => setExpandedBlock(isOpen ? null : blockKey)}
                      >
                        <div className="browse-row__left">
                          <div className="browse-row__name-row">
                            <span className="browse-row__name">{block.exerciseName}</span>
                            {ex?.videoUrl && (
                              <button
                                className="video-play-btn"
                                onClick={e => {
                                  e.stopPropagation();
                                  setMiniVideoUrl(miniVideoUrl === ex.videoUrl ? null : ex.videoUrl!);
                                }}
                                aria-label="Play video"
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="5,3 19,12 5,21" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <span className="browse-row__prescription">{prescriptionLabel(block, ex)}</span>
                        </div>
                      </button>
                      <div className="browse-row__dots" onClick={() => setExpandedBlock(isOpen ? null : blockKey)} style={{ cursor: 'pointer' }}>
                        {block.sets.map((set, i) => (
                          <span
                            key={i}
                            className={`sdot${set.completed ? ' sdot--done' : i === pendingIdx ? ' sdot--next' : ''}`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Focus panel — next pending set */}
                    {isOpen && !allDone && (() => {
                      const si = pendingIdx;
                      const set = block.sets[si];
                      return (
                        <div className="focus-panel">
                          <div className="focus-panel__header">
                            <span className="focus-panel__setnum">SET {si + 1} / {block.sets.length}</span>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                              <button
                                className="focus-panel__add-set"
                                onClick={() => {
                                  const allKey = blockKey + ':all';
                                  setShowAllSetsFor(showAllSetsFor === allKey ? null : allKey);
                                }}
                              >{showAllSetsFor === blockKey + ':all' ? 'Focus' : 'All sets'}</button>
                              <button
                                className="focus-panel__add-set"
                                onClick={() => addSet(group.id, block.id)}
                              >+ set</button>
                              <button
                                className="focus-panel__skip"
                                onClick={() => {
                                  updateSet(group.id, block.id, si, { completed: true });
                                  if (si === block.sets.length - 1) setExpandedBlock(null);
                                }}
                              >Skip</button>
                            </div>
                          </div>

                          {showAllSetsFor === blockKey + ':all' ? (
                            /* All-sets edit view */
                            <div className="all-sets-list">
                              {block.sets.map((setItem, sii) => (
                                <div key={sii} className={`all-set-row${setItem.completed ? ' all-set-row--done' : sii === si ? ' all-set-row--current' : ''}`}>
                                  <span className="all-set-num">{sii + 1}</span>
                                  <input
                                    className="all-set-input"
                                    type="number"
                                    inputMode="decimal"
                                    placeholder="wt"
                                    value={setItem.weight ?? ''}
                                    onChange={e => updateSet(group.id, block.id, sii, { weight: e.target.value ? parseFloat(e.target.value) : null })}
                                  />
                                  <input
                                    className="all-set-input"
                                    type="number"
                                    inputMode="numeric"
                                    placeholder={timeBased ? 'sec' : 'reps'}
                                    value={timeBased ? (setItem.time ?? '') : (setItem.reps ?? '')}
                                    onChange={e => {
                                      const v = e.target.value ? parseInt(e.target.value) : null;
                                      timeBased
                                        ? updateSet(group.id, block.id, sii, { time: v })
                                        : updateSet(group.id, block.id, sii, { reps: v });
                                    }}
                                  />
                                  <button
                                    className={`all-set-toggle${setItem.completed ? ' done' : ''}`}
                                    onClick={() => updateSet(group.id, block.id, sii, { completed: !setItem.completed })}
                                  >
                                    <span className="dot" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <>
                              <div className="focus-inputs">
                                {/* Weight — only for weighted exercises */}
                                {!timeBased && (ex?.defaultUnit === 'kg' || ex?.defaultUnit === 'lb') && (
                                  <div className="focus-field">
                                    <div className="focus-field__label">Weight ({ex.defaultUnit})</div>
                                    <div className="focus-field__row">
                                      <button className="nudge-btn" onClick={() => updateSet(group.id, block.id, si, { weight: Math.max(0, (set.weight ?? 0) - 2.5) })}>−2.5</button>
                                      <input
                                        className="focus-input"
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="—"
                                        value={set.weight ?? ''}
                                        onChange={e => updateSet(group.id, block.id, si, { weight: e.target.value ? parseFloat(e.target.value) : null })}
                                      />
                                      <button className="nudge-btn" onClick={() => updateSet(group.id, block.id, si, { weight: (set.weight ?? 0) + 2.5 })}>+2.5</button>
                                    </div>
                                  </div>
                                )}

                                {/* Reps — for non-time-based */}
                                {!timeBased && (
                                  <div className="focus-field">
                                    <div className="focus-field__label">Reps</div>
                                    <div className="focus-field__row">
                                      <button className="nudge-btn" onClick={() => updateSet(group.id, block.id, si, { reps: Math.max(1, (set.reps ?? 0) - 1) })}>−1</button>
                                      <input
                                        className="focus-input"
                                        type="number"
                                        inputMode="numeric"
                                        placeholder="—"
                                        value={set.reps ?? ''}
                                        onChange={e => updateSet(group.id, block.id, si, { reps: e.target.value ? parseInt(e.target.value) : null })}
                                      />
                                      <button className="nudge-btn" onClick={() => updateSet(group.id, block.id, si, { reps: (set.reps ?? 0) + 1 })}>+1</button>
                                    </div>
                                  </div>
                                )}

                                {/* Time — only for time-based */}
                                {timeBased && (
                                  <div className="focus-field">
                                    <div className="focus-field__label">Time (s)</div>
                                    <div className="focus-field__row">
                                      <button className="nudge-btn" onClick={() => updateSet(group.id, block.id, si, { time: Math.max(1, (set.time ?? 0) - 5) })}>−5</button>
                                      <input
                                        className="focus-input"
                                        type="number"
                                        inputMode="numeric"
                                        placeholder="—"
                                        value={set.time ?? ''}
                                        onChange={e => updateSet(group.id, block.id, si, { time: e.target.value ? parseInt(e.target.value) : null })}
                                      />
                                      <button className="nudge-btn" onClick={() => updateSet(group.id, block.id, si, { time: (set.time ?? 0) + 5 })}>+5</button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <button
                                className="btn primary btn-full"
                                onClick={() => logSet(group.id, block)}
                              >
                                Log Set {si + 1}
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* All done state */}
                    {isOpen && allDone && (
                      <div className="focus-done">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        All sets logged
                        <button
                          className="focus-panel__add-set"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => addSet(group.id, block.id)}
                        >+ extra set</button>
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          );
        })}

        {/* Action buttons — at end of scroll, not sticky */}
        <div className="session-actions">
          <button className="btn primary btn-full" onClick={() => finishSession()}>
            {isEditing ? 'Save Changes' : 'Finish Session'}
          </button>
          <button className="btn ghost btn-full" onClick={() => setConfirmExit(true)}>
            {isEditing ? 'Cancel' : 'Exit'}
          </button>
        </div>
      </div>

      {/* Mini video player */}
      {miniVideoUrl && (() => {
        const videoId = extractYouTubeId(miniVideoUrl);
        if (!videoId) return null;
        return (
          <div className="mini-player">
            <div className="mini-player__video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              />
            </div>
            <button
              className="mini-player__close"
              onClick={() => setMiniVideoUrl(null)}
              aria-label="Close video"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })()}

      {/* Exit sheet */}
      {confirmExit && (
        <div className="discard-overlay">
          <div className="discard-sheet">
            {isEditing ? (
              <>
                <h3>Cancel editing?</h3>
                <p>Your changes will not be saved. The original session remains.</p>
                <div className="discard-actions">
                  <button className="btn outline btn-full" onClick={() => setConfirmExit(false)}>Keep editing</button>
                  <button
                    className="btn btn-full"
                    style={{ background: '#E53E3E', borderColor: '#E53E3E', color: '#fff' }}
                    onClick={() => discardSession()}
                  >Cancel Changes</button>
                </div>
              </>
            ) : (
              <>
                <h3>Exit session?</h3>
                <p>Your progress is saved. Come back anytime to continue.</p>
                <div className="discard-actions">
                  <button className="btn outline btn-full" onClick={() => setConfirmExit(false)}>Keep going</button>
                  <button className="btn primary btn-full" onClick={() => { setConfirmExit(false); pauseSession(); }}>
                    Save &amp; Exit
                  </button>
                  <button
                    className="btn btn-full"
                    style={{ background: '#E53E3E', borderColor: '#E53E3E', color: '#fff' }}
                    onClick={() => discardSession()}
                  >Discard Session</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SessionExercisePicker
        open={pickerGroupId !== null}
        onClose={() => setPickerGroupId(null)}
        onPick={ex => {
          if (pickerGroupId) addExerciseToGroup(pickerGroupId, ex);
          setPickerGroupId(null);
        }}
      />
    </div>
  );
}

function SessionExercisePicker({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  onPick: (ex: Exercise) => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) getAllExercises().then(all => setExercises(all.filter(e => !e.archived)));
  }, [open]);

  const filtered = exercises
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.muscleGroup.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal open={open} onClose={onClose} title="Add Exercise" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search…" />
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <p>No exercises found. Import the library from the Library tab.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '50vh', overflowY: 'auto' }}>
            {filtered.map(ex => {
              const iconColor = CATEGORY_COLOR[ex.category] ?? 'var(--fg-mute)';
              return (
                <button
                  key={ex.id}
                  className="lib-row"
                  onClick={() => onPick(ex)}
                  style={{ width: '100%', background: 'transparent', border: 0, color: 'var(--fg)', textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', borderRadius: 4, flexShrink: 0, color: iconColor }}>
                      <CategoryIcon category={ex.category} size={14} color={iconColor} />
                    </div>
                    <div>
                      <div className="lib-name">{ex.name}</div>
                      <div className="lib-tags">
                        <span className="chip" style={{ color: iconColor, borderColor: `${iconColor}55` }}>{CATEGORY_LABEL[ex.category] ?? ex.category}</span>
                        <span className="chip">{ex.muscleGroup}</span>
                      </div>
                    </div>
                  </div>
                  <span className="lib-arrow">+</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Session Detail Page (read-only, full screen) ────────────────────────────

function SessionDetailPage({ session, onBack, onEdit }: {
  session: Session;
  onBack: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="workout-editor">
      <Topbar
        title={session.workoutName}
        onBack={onBack}
        right={
          <button className="btn outline btn-sm" onClick={onEdit}>Edit</button>
        }
      />

      {/* Session meta row */}
      <div className="sess-detail-meta">
        {session.durationMs != null && (
          <span>{formatDuration(session.durationMs)}</span>
        )}
        {session.notes?.trim() && (
          <span className="sess-detail-notes">{session.notes}</span>
        )}
      </div>

      <div className="workout-editor__body">
        {session.groups.map(group => {
          const groupClass = GROUP_CLASS[group.groupType] ?? 'g-main';
          const completedSets = group.blocks.reduce((a, b) => a + b.sets.filter(st => st.completed).length, 0);
          const totalSets = group.blocks.reduce((a, b) => a + b.sets.length, 0);

          return (
            <div key={group.id} className={`group ${groupClass} group-editor`}>
              <div className="group-head group-editor__header">
                <span className="gname">{group.name}</span>
                <span className="gmeta" style={{ marginLeft: 'auto' }}>{completedSets}/{totalSets} sets</span>
              </div>

              {group.blocks.map(block => {
                const completedCount = block.skipped ? 0 : block.sets.filter(st => st.completed).length;
                const totalCount = block.sets.length;
                const allDone = completedCount === totalCount;
                const noneDone = completedCount === 0;

                return (
                  <div key={block.id} className="sess-detail-block">
                    <div className="sess-detail-block__header">
                      <span className="sess-detail-name">{block.exerciseName}</span>
                      <span className={`sess-set-fraction${allDone ? ' sess-set-fraction--all' : noneDone ? ' sess-set-fraction--none' : ''}`}>
                        {completedCount}/{totalCount}
                      </span>
                    </div>

                    {!block.skipped && (
                      <div className="sess-detail-sets">
                        {block.sets.map((set, i) => (
                          <div key={i} className={`sess-detail-set${set.completed ? ' sess-detail-set--done' : ' sess-detail-set--skip'}`}>
                            <span className="sess-detail-set__num">{i + 1}</span>
                            {set.completed ? (
                              <span className="sess-detail-set__vals">
                                {set.weight != null && <>{set.weight}kg</>}
                                {set.weight != null && (set.reps != null || set.time != null) && <> × </>}
                                {set.reps != null && <>{set.reps} reps</>}
                                {set.time != null && <>{set.time}s</>}
                                {set.weight == null && set.reps == null && set.time == null && '—'}
                              </span>
                            ) : (
                              <span className="sess-detail-set__vals sess-detail-set__vals--skip">skipped</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {block.skipped && (
                      <div className="sess-detail-skipped">
                        {block.skipReason ? `Skipped — ${block.skipReason}` : 'Skipped'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Workout Detail Page (read-only, full screen) ────────────────────────────

const WORKOUT_GROUP_CLASS: Record<string, string> = {
  warmup: 'g-warmup', mobility: 'g-mobility', activation: 'g-activation',
  main: 'g-main', accessory: 'g-accessory', cardio: 'g-cardio', cooldown: 'g-cooldown',
};

function WorkoutDetailPage({ workout, onBack, onStart }: {
  workout: Workout;
  onBack: () => void;
  onStart?: () => void;
}) {
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());
  const [miniVideoUrl, setMiniVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    getAllExercises().then(all => setExerciseMap(new Map(all.map(e => [e.id, e]))));
  }, []);

  return (
    <div className="workout-editor">
      <Topbar title={workout.name} onBack={onBack} />

      <div className="workout-editor__body">
        {workout.notes && (
          <div style={{ padding: '0 20px 16px', color: 'var(--fg-dim)', fontSize: 14, lineHeight: 1.55 }}>
            {workout.notes}
          </div>
        )}
        {workout.groups.map(group => {
          const groupClass = WORKOUT_GROUP_CLASS[group.groupType] ?? 'g-main';
          return (
            <div key={group.id} className={`group ${groupClass} group-editor`}>
              <div className="group-head group-editor__header">
                <span className="gname">{group.name}</span>
                <span className="gmeta" style={{ marginLeft: 'auto' }}>
                  {group.blocks.length} exercise{group.blocks.length !== 1 ? 's' : ''}
                </span>
              </div>
              {group.blocks.length === 0 && (
                <div style={{ color: 'var(--fg-mute)', fontFamily: 'var(--mono)', fontSize: 11, padding: '6px 0 8px', letterSpacing: '0.08em' }}>
                  No exercises
                </div>
              )}
              {group.blocks.map(block => {
                const ex = exerciseMap.get(block.exerciseId);
                return (
                  <div key={block.id} className="viewer-block-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="block-row__name">{ex?.name ?? block.exerciseId}</span>
                        {ex?.videoUrl && (
                          <button
                            className="video-play-btn"
                            onClick={() => setMiniVideoUrl(miniVideoUrl === ex.videoUrl ? null : ex.videoUrl!)}
                            aria-label="Play video"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5,3 19,12 5,21" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="viewer-block-row__targets">
                      {block.targetSets != null && <span className="viewer-target">{block.targetSets} sets</span>}
                      {block.targetReps != null && <span className="viewer-target">{block.targetReps} reps</span>}
                      {block.targetWeight != null && <span className="viewer-target">{block.targetWeight} kg</span>}
                      {block.targetTime != null && <span className="viewer-target">{block.targetTime}s</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {onStart && (
        <div className="workout-editor__footer">
          <button className="btn primary btn-full" onClick={onStart}>
            Start Workout
          </button>
        </div>
      )}

      {miniVideoUrl && (() => {
        const videoId = extractYouTubeId(miniVideoUrl);
        if (!videoId) return null;
        return (
          <div className="mini-player">
            <div className="mini-player__video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              />
            </div>
            <button className="mini-player__close" onClick={() => setMiniVideoUrl(null)} aria-label="Close video">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })()}
    </div>
  );
}

// Suppress unused import warning for useRef
const _useRef = useRef;
void _useRef;
