import { useEffect, useRef, useState } from 'react';
import { useActiveSession } from '../../context/ActiveSessionContext';
import { usePlanDay } from '../../hooks/usePlanDay';
import { LogoMark } from '../../components/Logo/Logo';
import { getAllSessions, deleteSession, putSession } from '../../db/sessions';
import { getWorkout, getAllWorkouts, putWorkout } from '../../db/workouts';
import { WorkoutEditor } from '../Workouts/WorkoutsView';
import { AIImportSheet } from '../../components/AIImportSheet/AIImportSheet';
import { getSessionsByDate } from '../../db/sessions';
import { getAllExercises } from '../../db/exercises';
import { getNutritionLogsByDate, addNutritionLog, deleteNutritionLog, updateNutritionLog } from '../../db/nutritionLog';
import { getAllBodyweight } from '../../db/bodyweight';
import { getActiveGoalForDate } from '../../db/calorieGoalLog';
import { Modal } from '../../components/Modal/Modal';
import { BottomSheet } from '../../components/BottomSheet/BottomSheet';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { Topbar } from '../../components/Topbar/Topbar';
import { CategoryIcon, CATEGORY_COLOR, CATEGORY_LABEL } from '../../components/CategoryIcon/CategoryIcon';
import { FilterChips } from '../../components/FilterChips/FilterChips';
import { today, toISODate, formatDisplayDate, formatDuration } from '../../lib/date';
import { extractYouTubeId } from '../../lib/youtube';
import { uid } from '../../lib/ids';
import { estimateWithBodyweight } from '../../lib/calorieEstimator';
import { MUSCLE_GROUP_MAP, MUSCLE_REGIONS, type MuscleRegion } from '../Analyze/bodyModel';
import { normaliseScores, type MuscleStats } from '../Analyze/analyzeEngine';
import { BodySvg } from '../Analyze/BodySvg';
import type { Session, SessionGroup, SessionBlock, SessionSet, Workout, Exercise, NutritionLog, CalorieGoalLog, MealCategory } from '../../types';
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
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [finishedSummary, setFinishedSummary] = useState<Session | null>(null);

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

  if (session && !paused) return <ActiveSessionView onFinish={s => setFinishedSummary(s)} />;

  if (finishedSummary) {
    return <SessionSummaryScreen session={finishedSummary} onDismiss={() => setFinishedSummary(null)} />;
  }

  if (viewingSession) {
    return (
      <SessionDetailPage
        session={viewingSession}
        onBack={() => setViewingSession(null)}
        onEdit={() => { setViewingSession(null); resumeSession(viewingSession); }}
        onDelete={async () => {
          await deleteSession(viewingSession.id);
          setDoneSessions(prev => { const m = new Map(prev); m.delete(viewingSession.id); return m; });
          setViewingSession(null);
        }}
        onUpdate={(updated) => {
          setViewingSession(updated);
          setDoneSessions(prev => { const m = new Map(prev); m.set(updated.id, updated); return m; });
        }}
      />
    );
  }

  if (viewingWorkout) {
    return (
      <WorkoutDetailPage
        workout={viewingWorkout}
        onBack={() => setViewingWorkout(null)}
        onStart={paused && session ? undefined : () => { setViewingWorkout(null); startFromTemplate(viewingWorkout.id); }}
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
        <WeekRing sessionDates={weekSessionDates} selectedDate={selectedNutritionDate} onSelect={setSelectedNutritionDate} />
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

          const pausedSession = paused && session ? session : null;

          return (
            <div className="plan-section">
              <div className="plan-section-header">
                <span className="plan-section-label" style={{ marginBottom: 0 }}>Workouts</span>
                {!pausedSession && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn outline btn-sm" onClick={() => setShowWorkoutPicker(true)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Workout
                    </button>
                    <button className="btn outline btn-sm" onClick={startFreestyle}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Freestyle
                    </button>
                  </div>
                )}
              </div>

              {hasPlanned && day!.workouts.map(pw => {
                const doneSession = allSessions.find(s => s.workoutId === pw.workoutId) ?? null;
                return (
                  <PlannedWorkoutCard
                    key={pw.workoutId}
                    workoutId={pw.workoutId}
                    note={pw.note}
                    doneSession={doneSession}
                    pausedSession={pausedSession}
                    onEdit={() => resumeSession(doneSession!)}
                    onResume={unpauseSession}
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
                      {effectiveSessionDuration(s) ? ` · ${formatDuration(effectiveSessionDuration(s)!)}` : ''}
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
          burnedKcal={Array.from(doneSessions.values()).reduce((sum, s) => sum + (s.estimatedKcal ?? 0), 0)}
          onAdd={() => setShowAddMeal(true)}
          onEdit={log => setEditingLog(log)}
          onDelete={async (id) => {
            await deleteNutritionLog(id);
            setNutritionLogs(prev => prev.filter(l => l.id !== id));
          }}
        />
      </div>

      <WorkoutPickerModal
        open={showWorkoutPicker}
        onClose={() => setShowWorkoutPicker(false)}
        onPick={workoutId => { setShowWorkoutPicker(false); startFromTemplate(workoutId); }}
      />

      {showAddMeal && (
        <AddMealSheet
          onClose={() => setShowAddMeal(false)}
          onSave={async (entry) => {
            const log = await addNutritionLog({ ...entry, protein: entry.protein ?? undefined, carbs: entry.carbs ?? undefined, time: entry.time || undefined, date: selectedNutritionDate });
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
            const updated: NutritionLog = { ...editingLog, ...entry, protein: entry.protein ?? undefined, carbs: entry.carbs ?? undefined, time: entry.time || undefined };
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
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatWeekRange(startIso: string, endIso: string): string {
  const [, sm, sd] = startIso.split('-').map(Number);
  const [, em, ed] = endIso.split('-').map(Number);
  if (sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}`;
  return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}`;
}

function WeekRing({ sessionDates, selectedDate, onSelect }: {
  sessionDates: Set<string>;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const todayDate = new Date(TODAY + 'T00:00:00');
  const selDate = new Date(selectedDate + 'T00:00:00');

  // Week anchors to whichever Saturday is on or before selectedDate
  const daysSinceSat = selDate.getDay() === 6 ? 0 : selDate.getDay() + 1;

  // Streak — always computed backwards from TODAY, regardless of which week is shown
  const streakDates = new Set<string>();
  const streakCur = new Date(todayDate);
  if (!sessionDates.has(TODAY)) streakCur.setDate(streakCur.getDate() - 1);
  while (true) {
    const iso = toISODate(streakCur);
    if (sessionDates.has(iso)) { streakDates.add(iso); streakCur.setDate(streakCur.getDate() - 1); }
    else break;
  }
  const streakCount = streakDates.size;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selDate);
    d.setDate(selDate.getDate() - daysSinceSat + i);
    const iso = toISODate(d);
    return {
      iso,
      letter: DAY_LETTER[d.getDay()],
      isToday: iso === TODAY,
      isSelected: iso === selectedDate,
      isFuture: d > todayDate,
      hasWorkout: sessionDates.has(iso),
      isStreak: streakDates.has(iso),
    };
  });

  const isCurrentWeek = days.some(d => d.isToday);
  const weekLabel = isCurrentWeek ? 'This Week' : formatWeekRange(days[0].iso, days[6].iso);

  return (
    <div className="week-ring">
      <div className="week-ring__header">
        <span className="week-ring__title">{weekLabel}</span>
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
            <div
              key={day.iso}
              className="week-day"
              onClick={() => !day.isFuture && onSelect(day.iso)}
              style={!day.isFuture ? { cursor: 'pointer' } : undefined}
            >
              <div className={[
                'week-sq',
                day.hasWorkout ? 'week-sq--done' : '',
                day.isToday && !day.hasWorkout ? 'week-sq--today' : '',
                day.isFuture ? 'week-sq--future' : '',
                day.isSelected ? 'week-sq--selected' : '',
              ].filter(Boolean).join(' ')}>
                {day.hasWorkout
                  ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  : !day.isFuture ? <div className="week-sq__dot" /> : null
                }
              </div>
              <span className={[
                'week-day__lbl',
                day.isToday ? 'week-day__lbl--today' : '',
                day.isSelected && !day.isToday ? 'week-day__lbl--selected' : '',
              ].filter(Boolean).join(' ')}>{day.letter}</span>
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

const CATEGORY_DISPLAY: Record<MealCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  misc: 'Misc',
};

function NutritionSection({ logs, goal, proteinGoalG, burnedKcal, onAdd, onEdit, onDelete }: {
  logs: NutritionLog[];
  goal: CalorieGoalLog | null;
  proteinGoalG: number | null;
  burnedKcal: number;
  onAdd: () => void;
  onEdit: (log: NutritionLog) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const totalKcal = logs.reduce((sum, l) => sum + l.kcal, 0);
  const totalProtein = logs.reduce((sum, l) => sum + (l.protein ?? 0), 0);
  const totalCarbs = logs.reduce((sum, l) => sum + (l.carbs ?? 0), 0);
  const goalKcal = goal?.targetCalories ?? null;
  const kcalProgress = goalKcal ? Math.min(totalKcal / goalKcal, 1) : 0;
  const kcalOver = goalKcal && totalKcal > goalKcal;
  const proteinOver = proteinGoalG && totalProtein > proteinGoalG;
  const hasProteinData = logs.some(l => l.protein != null);
  const hasCarbsData = logs.some(l => l.carbs != null);

  const grouped = new Map<MealCategory, NutritionLog[]>();
  for (const log of logs) {
    const cat = log.category ?? 'misc';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(log);
  }
  const categoryOrder: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack', 'misc'];
  const sortedCategories = categoryOrder.filter(c => grouped.has(c));

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

      {/* Stats */}
      <div className="nutrition-stats">
        <div className="nutrition-stat">
          <span className={`nutrition-stat__val${kcalOver ? ' --over' : ''}`}>{totalKcal.toLocaleString()}</span>
          <span className="nutrition-stat__label">{goalKcal ? `/ ${goalKcal.toLocaleString()} kcal` : 'kcal'}</span>
        </div>
        {(hasProteinData || hasCarbsData || burnedKcal > 0) && (
          <div className="nutrition-pills-group">
            {hasProteinData && (
              <span className={`nutrition-protein-pill${proteinOver ? ' --over' : ''}`}>{totalProtein}g prot</span>
            )}
            {hasCarbsData && (
              <span className="nutrition-carbs-pill">{totalCarbs}g carb</span>
            )}
            {burnedKcal > 0 && (
              <span className="nutrition-burned-pill">{`−${burnedKcal}`} burned</span>
            )}
          </div>
        )}
      </div>

      {/* Progress bars */}
      {goalKcal && (
        <div className="nutrition-bar">
          <div className={`nutrition-bar__fill${kcalOver ? ' nutrition-bar__fill--over' : ''}`}
            style={{ width: `${kcalProgress * 100}%` }} />
        </div>
      )}

      {/* Meal list grouped by category */}
      {sortedCategories.map(cat => (
        <div key={cat} className="nutrition-category-group">
          <span className="nutrition-category-label">{CATEGORY_DISPLAY[cat]}</span>
          <div className="nutrition-log-list">
            {grouped.get(cat)!.map(log => (
              <div
                key={log.id}
                className="nutrition-log-row"
                onClick={() => { setConfirmDeleteId(null); onEdit(log); }}
                style={{ cursor: 'pointer' }}
              >
                <div className="nutrition-log-row__info">
                  <span className="nutrition-log-row__name">
                    {log.time && <span className="nutrition-log-row__time">{log.time}</span>}
                    {log.name}
                  </span>
                  {log.notes && <span className="nutrition-log-row__notes">{log.notes}</span>}
                </div>
                <div className="nutrition-log-row__right">
                  <span className="nutrition-log-row__kcal">{log.kcal.toLocaleString()} kcal</span>
                  <div className="nutrition-log-row__macros">
                    {log.protein != null && (
                      <span className="nutrition-log-row__protein">{log.protein}g P</span>
                    )}
                    {log.carbs != null && (
                      <span className="nutrition-log-row__carbs">{log.carbs}g C</span>
                    )}
                  </div>
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
        </div>
      ))}
    </div>
  );
}

// ─── Add Meal Sheet ───────────────────────────────────────────────────────────

const MEAL_CATEGORIES = [
  { value: 'breakfast' as const, label: 'Breakfast' },
  { value: 'lunch' as const, label: 'Lunch' },
  { value: 'dinner' as const, label: 'Dinner' },
  { value: 'snack' as const, label: 'Snack' },
];

const GEMINI_PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL as string;

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: string | { message?: string };
  };
  if (!res.ok) {
    const err = data.error;
    throw new Error(typeof err === 'string' ? err : err?.message ?? 'AI unavailable — try again or enter manually.');
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from AI.');
  return text.replace(/```json|```/g, '').trim();
}

const AI_PROMPT = (desc: string) =>
  `You are a nutrition estimator. The user will describe food they ate.
Return ONLY valid JSON — no markdown, no explanation, nothing else — in this exact format:
{"title":"brief meal name","total_cal":number,"total_protein":number,"total_carbs":number,"status":"success"}
Use status "failure" only if the description is completely too vague to estimate even roughly (e.g. just "food" or "stuff").
For anything with recognisable food items, always return "success" with your best estimate.

Food description: ${desc}`;

type AiState = 'idle' | 'loading' | 'success' | 'error';

function AddMealSheet({ onClose, onSave, initialLog }: {
  onClose: () => void;
  onSave: (entry: { name: string; category: MealCategory; kcal: number; protein: number | null; carbs: number | null; time: string; notes: string; aiDescription: string }) => void;
  initialLog?: NutritionLog;
}) {
  const [description, setDescription] = useState(initialLog?.aiDescription ?? '');
  const [name, setName] = useState(initialLog?.name ?? '');
  const [category, setCategory] = useState<MealCategory>(initialLog?.category ?? 'misc');
  const [kcal, setKcal] = useState(initialLog?.kcal ? String(initialLog.kcal) : '');
  const [protein, setProtein] = useState<number | null>(initialLog?.protein ?? null);
  const [carbs, setCarbs] = useState<number | null>(initialLog?.carbs ?? null);
  const [time, setTime] = useState(() => {
    if (initialLog?.time) return initialLog.time;
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [notes, setNotes] = useState(initialLog?.notes ?? '');
  const [aiState, setAiState] = useState<AiState>('idle');
  const [aiError, setAiError] = useState('');

  const canCalculate = description.trim().length > 3;
  const canSave = name.trim() && Number(kcal) > 0;

  async function calculateFromAI() {
    setAiState('loading');
    setAiError('');
    try {
      const text = await callGemini(AI_PROMPT(description.trim()));
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in response.');
      const json = JSON.parse(match[0]) as {
        title?: string; total_cal?: number; total_protein?: number; total_carbs?: number; status?: string;
      };
      if (json.status === 'failure') {
        setAiState('error');
        setAiError('Too vague to estimate — describe the food in more detail.');
        return;
      }
      setName(json.title ?? description.trim());
      setKcal(String(Math.round(json.total_cal ?? 0)));
      setProtein(json.total_protein != null ? Math.round(json.total_protein) : null);
      setCarbs(json.total_carbs != null ? Math.round(json.total_carbs) : null);
      setAiState('success');
    } catch (e) {
      setAiState('error');
      setAiError(e instanceof Error ? e.message : 'AI unavailable — try again or enter manually.');
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

        {/* Category chips */}
        <div className="meal-chips">
          {MEAL_CATEGORIES.map(cat => (
            <button
              key={cat.value}
              className={`meal-chip${category === cat.value ? ' active' : ''}`}
              onClick={() => setCategory(category === cat.value ? 'misc' : cat.value)}
            >
              {cat.label}
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
            placeholder="–"
            value={protein ?? ''}
            onChange={e => setProtein(e.target.value ? Math.round(Number(e.target.value)) : null)}
            style={{ maxWidth: 56 }}
          />
          <span className="meal-kcal-unit">g prot</span>
          <input
            className="input meal-kcal-input"
            type="number"
            inputMode="numeric"
            placeholder="–"
            value={carbs ?? ''}
            onChange={e => setCarbs(e.target.value ? Math.round(Number(e.target.value)) : null)}
            style={{ maxWidth: 56 }}
          />
          <span className="meal-kcal-unit">g carb</span>
        </div>

        {/* Time + Notes */}
        <div className="meal-field meal-kcal-row">
          <input
            className="input"
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            style={{ maxWidth: 110 }}
          />
          <input
            className="input"
            type="text"
            placeholder="Notes (optional)…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>

        <div className="meal-sheet__actions">
          <button className="btn outline btn-full" onClick={onClose}>Cancel</button>
          <button
            className="btn primary btn-full"
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), category, kcal: Math.round(Number(kcal)), protein, carbs, time: time || '', notes, aiDescription: description.trim() })}
          >
            {initialLog ? 'Save Changes' : 'Add Meal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlannedWorkoutCard({ workoutId, note, doneSession, pausedSession, onEdit, onResume, onView, onViewSession }: {
  workoutId: string;
  note: string;
  doneSession: Session | null;
  pausedSession: Session | null;
  onEdit: () => void;
  onResume: () => void;
  onView: (w: Workout) => void;
  onViewSession: (s: Session) => void;
}) {
  const [workout, setWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    getWorkout(workoutId).then(w => { if (w) setWorkout(w); });
  }, [workoutId]);

  const isDone = doneSession !== null;
  const isPausedMatch = pausedSession !== null && pausedSession.workoutId === workoutId;
  const name = workout?.name ?? workoutId;
  const exCount = workout ? workout.groups.reduce((a, g) => a + g.blocks.length, 0) : null;

  function handleCardClick() {
    if (isDone) onViewSession(doneSession);
    else if (isPausedMatch) onResume();
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
          {isDone && doneSession && effectiveSessionDuration(doneSession) ? ` · ${formatDuration(effectiveSessionDuration(doneSession)!)}` : ''}
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
        ) : isPausedMatch ? (
          <button className="btn primary btn-sm" onClick={e => { e.stopPropagation(); onResume(); }}>Resume</button>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </div>
    </div>
  );
}

function effectiveSessionDuration(session: Session): number | null {
  const sessionMs = session.durationMs ?? 0;
  let timedSetsTotalSec = 0;
  for (const g of session.groups) {
    for (const b of g.blocks) {
      for (const s of b.sets) {
        if (s.completed && s.time != null) timedSetsTotalSec += s.time;
      }
    }
  }
  const timedMs = timedSetsTotalSec * 1000;
  const result = Math.max(sessionMs, timedMs);
  return result > 0 ? result : null;
}

// ─── Active Session View ──────────────────────────────────────────────────────

function isTimeBased(ex: Exercise | undefined): boolean {
  if (!ex) return false;
  if (ex.defaultUnit === 'sec' || ex.defaultUnit === 'min') return true;
  if (ex.category === 'cardio' || ex.category === 'stretching' || ex.category === 'yoga' || ex.category === 'meditation' || ex.category === 'breathing') return true;
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

function formatTimerDisplay(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

type PrevBest = { weight: number | null; reps: number | null; time: number | null };

function ActiveSessionView({ onFinish }: { onFinish: (session: Session) => void }) {
  const { session, updateSession, finishSession, discardSession, pauseSession } = useActiveSession();
  const [confirmExit, setConfirmExit] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pickerGroupId, setPickerGroupId] = useState<string | null>(null);
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
  const [showAllSetsFor, setShowAllSetsFor] = useState<string | null>(null);
  const [miniVideoUrl, setMiniVideoUrl] = useState<string | null>(null);
  const [prevBestMap, setPrevBestMap] = useState<Map<string, PrevBest>>(new Map());
  // Per-set timer: key is `${groupId}:${blockId}:${setIndex}`
  const [timerKey, setTimerKey] = useState<string | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [timerSecs, setTimerSecs] = useState(0);

  const isEditing = session?.finishedAt !== null && session?.finishedAt !== undefined;

  useEffect(() => {
    getAllExercises().then(all => {
      setExerciseMap(new Map(all.map(e => [e.id, e])));
    });
  }, []);

  const sessionId = session?.id ?? null;

  // Load previous best per exercise from finished sessions
  useEffect(() => {
    if (!sessionId) return;
    getAllSessions().then(sessions => {
      // getAllSessions returns most-recent-first; skip the current session
      const finished = sessions.filter(s => s.finishedAt && s.id !== sessionId);
      const map = new Map<string, PrevBest>();
      for (const sess of finished) {
        // Collect all completed sets per exercise in this session
        const exSets = new Map<string, SessionSet[]>();
        for (const group of sess.groups) {
          for (const block of group.blocks) {
            const done = block.sets.filter(st => st.completed);
            if (done.length === 0) continue;
            const existing = exSets.get(block.exerciseId) ?? [];
            exSets.set(block.exerciseId, [...existing, ...done]);
          }
        }
        for (const [exId, sets] of exSets) {
          if (map.has(exId)) continue; // already captured from a more recent session
          const best = sets.reduce((a, b) => {
            if ((b.weight ?? 0) > (a.weight ?? 0)) return b;
            if ((b.weight ?? 0) === (a.weight ?? 0) && (b.reps ?? 0) > (a.reps ?? 0)) return b;
            return a;
          });
          map.set(exId, { weight: best.weight, reps: best.reps, time: best.time });
        }
      }
      setPrevBestMap(map);
    });
  }, [sessionId]);

  const sessionStartedAt = session?.startedAt ?? null;
  useEffect(() => {
    if (!sessionStartedAt) return;
    const interval = setInterval(() => setElapsed(Date.now() - sessionStartedAt), 1000);
    return () => clearInterval(interval);
  }, [sessionStartedAt]);

  useEffect(() => {
    if (!timerKey || !timerStartedAt) return;
    const interval = setInterval(() => {
      setTimerSecs(Math.floor((Date.now() - timerStartedAt) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [timerKey, timerStartedAt]);

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

    // If a timer was running for this set, stop it and use its value
    const thisTimerKey = `${groupId}:${block.id}:${si}`;
    let effectiveTime = block.sets[si].time;
    if (timerKey === thisTimerKey && timerSecs > 0) {
      effectiveTime = timerSecs;
      setTimerKey(null);
      setTimerStartedAt(null);
      setTimerSecs(0);
    }

    const logged = { ...block.sets[si], time: effectiveTime };
    const nextIdx = si + 1;
    const groups = s.groups.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        blocks: g.blocks.map(b => {
          if (b.id !== block.id) return b;
          const sets = b.sets.map((set, i) => {
            if (i === si) return { ...set, completed: true, time: effectiveTime };
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
          {!isEditing && (
            <button
              className="icon-btn session-pause-btn"
              onClick={() => pauseSession()}
              aria-label="Pause session"
              title="Pause & exit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="4" width="4" height="16" rx="1" />
                <rect x="15" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          )}
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
                          {(() => {
                            const prev = prevBestMap.get(block.exerciseId);
                            if (!prev) return null;
                            const label = timeBased
                              ? (prev.time != null ? formatTime(prev.time) : '')
                              : [prev.weight != null ? `${prev.weight}kg` : null, prev.reps != null ? `${prev.reps} reps` : null]
                                  .filter(Boolean).join(' × ');
                            if (!label) return null;
                            return <span className="browse-row__prev">Prev: {label}</span>;
                          })()}
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
                                      if (timeBased) updateSet(group.id, block.id, sii, { time: v });
                                      else updateSet(group.id, block.id, sii, { reps: v });
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

                                {/* Time — timer + manual input for time-based */}
                                {timeBased && (() => {
                                  const thisTimerKey = `${group.id}:${block.id}:${si}`;
                                  const isRunning = timerKey === thisTimerKey;
                                  return (
                                    <div className="focus-field">
                                      <div className="focus-field__label">Time</div>

                                      {isRunning ? (
                                        /* ── Live timer ── */
                                        <div className="timer-live">
                                          <span className="timer-live__dot" />
                                          <span className="timer-live__display">{formatTimerDisplay(timerSecs)}</span>
                                          <button
                                            className="timer-live__stop"
                                            onClick={() => {
                                              updateSet(group.id, block.id, si, { time: timerSecs });
                                              setTimerKey(null);
                                              setTimerStartedAt(null);
                                              setTimerSecs(0);
                                            }}
                                          >
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                              <rect x="4" y="4" width="16" height="16" rx="2" />
                                            </svg>
                                            Stop
                                          </button>
                                        </div>
                                      ) : (
                                        /* ── Manual input + start button ── */
                                        <>
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
                                          <button
                                            className="focus-timer-start"
                                            onClick={() => {
                                              setTimerKey(thisTimerKey);
                                              setTimerStartedAt(Date.now());
                                              setTimerSecs(0);
                                            }}
                                          >
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                              <polygon points="5,3 19,12 5,21" />
                                            </svg>
                                            Start Timer
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
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

                    {/* All done — editable sets list */}
                    {isOpen && allDone && (
                      <div className="focus-panel">
                        <div className="focus-panel__header">
                          <span className="focus-panel__setnum" style={{ color: 'var(--accent)' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: 5 }}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            All done
                          </span>
                          <button className="focus-panel__add-set" onClick={() => addSet(group.id, block.id)}>+ extra set</button>
                        </div>
                        <div className="all-sets-list">
                          {block.sets.map((setItem, sii) => (
                            <div key={sii} className={`all-set-row${setItem.completed ? ' all-set-row--done' : ''}`}>
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
                                  if (timeBased) updateSet(group.id, block.id, sii, { time: v });
                                  else updateSet(group.id, block.id, sii, { reps: v });
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
          <button className="btn primary btn-full" onClick={async () => {
            const finished = await finishSession();
            if (finished && !isEditing) onFinish(finished);
          }}>
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
            <button className="sheet-close-btn" onClick={() => setConfirmExit(false)} aria-label="Close">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
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

const PICKER_CATEGORY_OPTIONS = [
  { value: 'muscle', label: 'Strength' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'stretching', label: 'Stretching' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'cooldown', label: 'Cool-down' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'meditation', label: 'Meditation' },
  { value: 'breathing', label: 'Breathing' },
];

const PICKER_EQUIPMENT_OPTIONS = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Band' },
];

function SessionExercisePicker({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  onPick: (ex: Exercise) => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [equipment, setEquipment] = useState('');

  useEffect(() => {
    if (open) getAllExercises().then(all => setExercises(all.filter(e => !e.archived)));
  }, [open]);

  const filtered = exercises
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.muscleGroup.toLowerCase().includes(search.toLowerCase()))
    .filter(e => !category || e.category === category)
    .filter(e => !equipment || e.equipment === equipment)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal open={open} onClose={onClose} title="Add Exercise" size="full">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search…" />
        <FilterChips options={PICKER_CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        <FilterChips options={PICKER_EQUIPMENT_OPTIONS} value={equipment} onChange={setEquipment} />
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <p>No exercises found. Import the library from the Library tab.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
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

// ─── Workout Picker Modal ────────────────────────────────────────────────────

function WorkoutPickerModal({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  onPick: (workoutId: string) => void;
}) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [search, setSearch] = useState('');
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false);
  const [aiImporting, setAiImporting] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    if (open) getAllWorkouts().then(all => setWorkouts(all.filter(w => !w.archived)));
  }, [open]);

  const filtered = workouts
    .filter(w => !search || w.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  async function createNewWorkout() {
    const w: Workout = {
      id: uid('w'),
      name: 'New Workout',
      notes: '',
      groups: [{
        id: uid('g'),
        name: 'Main',
        groupType: 'main',
        blocks: [],
      }],
      archived: false,
      updatedAt: Date.now(),
    };
    await putWorkout(w);
    setWorkouts(prev => [...prev, w]);
    setEditingWorkout(w);
  }

  async function saveEditingWorkout(w: Workout) {
    const updated = { ...w, updatedAt: Date.now() };
    await putWorkout(updated);
    setWorkouts(prev => prev.map(x => x.id === updated.id ? updated : x));
    setEditingWorkout(updated);
  }

  if (editingWorkout) {
    return (
      <WorkoutEditor
        workout={editingWorkout}
        onSave={saveEditingWorkout}
        onBack={() => setEditingWorkout(null)}
        onDiscard={() => setEditingWorkout(null)}
      />
    );
  }

  return (
    <>
      <Modal
        open={open && !createChoiceOpen && !aiImporting}
        onClose={() => { onClose(); setSearch(''); }}
        title="Start Workout"
        size="full"
        headerRight={
          <button className="btn outline btn-sm" onClick={() => setCreateChoiceOpen(true)}>
            + New
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search workouts…" />
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <p>{search ? `No workouts match "${search}"` : 'No workout templates yet. Tap "+ New" to create one.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map(w => (
                <button
                  key={w.id}
                  className="exercise-picker-row"
                  onClick={() => { onPick(w.id); setSearch(''); }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, textAlign: 'left' }}>{w.name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-mute)', marginTop: 3, textAlign: 'left', letterSpacing: '0.08em' }}>
                      {w.groups.length} group{w.groups.length !== 1 ? 's' : ''} · {w.groups.reduce((a, g) => a + g.blocks.length, 0)} exercises
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <BottomSheet open={createChoiceOpen} onClose={() => setCreateChoiceOpen(false)} title="New Workout">
            <button
              onClick={() => { setCreateChoiceOpen(false); createNewWorkout(); }}
              className="bottom-sheet-action"
              style={{ borderBottom: '1px solid var(--line-1)' }}
            >
              <span style={{ color: 'var(--fg-mute)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="12" y1="9" x2="12" y2="17" /><line x1="8" y1="13" x2="16" y2="13" />
                </svg>
              </span>
              Build manually
            </button>
            <button
              onClick={() => { setCreateChoiceOpen(false); setAiImporting(true); }}
              className="bottom-sheet-action"
            >
              <span style={{ color: 'var(--fg-mute)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4z"/>
                  <line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/>
                </svg>
              </span>
              Import with AI
            </button>
            <div style={{ height: 8 }} />
      </BottomSheet>

      {aiImporting && (
        <AIImportSheet
          onDone={() => {
            setAiImporting(false);
            getAllWorkouts().then(all => setWorkouts(all.filter(w => !w.archived)));
          }}
          onCancel={() => setAiImporting(false)}
        />
      )}
    </>
  );
}

// ─── Session Summary Screen (shown after finishing) ─────────────────────────

function computeSessionMuscles(session: Session, exercises: Map<string, Exercise>): MuscleStats[] {
  const scores = new Map<MuscleRegion, number>();
  for (const r of MUSCLE_REGIONS) scores.set(r, 0);

  for (const group of session.groups) {
    for (const block of group.blocks) {
      if (block.skipped) continue;
      const ex = exercises.get(block.exerciseId);
      if (!ex) continue;
      const completedSets = block.sets.filter(s => s.completed).length;
      if (completedSets === 0) continue;

      const primaryRegions = MUSCLE_GROUP_MAP[ex.muscleGroup] ?? [];
      const pw = primaryRegions.length > 0 ? completedSets / primaryRegions.length : 0;
      for (const r of primaryRegions) scores.set(r, (scores.get(r) ?? 0) + pw);

      for (const sec of ex.secondaryMuscles) {
        const secRegions = MUSCLE_GROUP_MAP[sec] ?? [];
        const sw = secRegions.length > 0 ? (completedSets * 0.5) / secRegions.length : 0;
        for (const r of secRegions) scores.set(r, (scores.get(r) ?? 0) + sw);
      }
    }
  }

  return MUSCLE_REGIONS.map(r => ({
    region: r,
    label: r,
    score: Math.round((scores.get(r) ?? 0) * 10) / 10,
    totalSets: Math.round((scores.get(r) ?? 0) * 10) / 10,
    lastTrained: null,
  })).filter(m => m.score > 0).sort((a, b) => b.score - a.score);
}

const REGION_DISPLAY: Record<string, string> = {
  'chest': 'Chest', 'upper-back': 'Upper Back', 'lower-back': 'Lower Back',
  'shoulders': 'Shoulders', 'biceps': 'Biceps', 'triceps': 'Triceps',
  'forearms': 'Forearms', 'core': 'Core', 'glutes': 'Glutes',
  'quads': 'Quads', 'hamstrings': 'Hamstrings', 'calves': 'Calves',
  'neck': 'Neck', 'hip-flexors': 'Hip Flexors',
};

function SessionSummaryScreen({ session, onDismiss }: { session: Session; onDismiss: () => void }) {
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());

  useEffect(() => {
    getAllExercises().then(all => setExerciseMap(new Map(all.map(e => [e.id, e]))));
  }, []);

  const muscles = computeSessionMuscles(session, exerciseMap);
  const heatmapScores = normaliseScores(
    MUSCLE_REGIONS.map(r => {
      const found = muscles.find(m => m.region === r);
      return found ?? { region: r, label: r, score: 0, totalSets: 0, lastTrained: null };
    })
  );
  const topMuscles = muscles.slice(0, 5);

  const totalSets = session.groups.reduce((a, g) => a + g.blocks.reduce((b, bl) => b + bl.sets.filter(s => s.completed).length, 0), 0);
  const totalExercises = new Set(session.groups.flatMap(g => g.blocks.filter(b => !b.skipped && b.sets.some(s => s.completed)).map(b => b.exerciseId))).size;

  return (
    <div className="summary-screen">
      <div className="summary-screen__content">
        <div className="summary-header">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <h2 className="summary-title">{session.workoutName}</h2>
          <span className="summary-subtitle">Workout Complete</span>
        </div>

        <div className="summary-stats">
          {effectiveSessionDuration(session) != null && (
            <div className="summary-stat">
              <span className="summary-stat__val">{formatDuration(effectiveSessionDuration(session)!)}</span>
              <span className="summary-stat__label">Duration</span>
            </div>
          )}
          {session.estimatedKcal != null && (
            <div className="summary-stat">
              <span className="summary-stat__val">~{session.estimatedKcal}</span>
              <span className="summary-stat__label">kcal Burned</span>
            </div>
          )}
          <div className="summary-stat">
            <span className="summary-stat__val">{totalExercises}</span>
            <span className="summary-stat__label">Exercises</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat__val">{totalSets}</span>
            <span className="summary-stat__label">Sets</span>
          </div>
        </div>

        {muscles.length > 0 && (
          <div className="summary-body-section">
            <span className="summary-section-label">Muscles Targeted</span>
            <BodySvg scores={heatmapScores} onTapMuscle={() => {}} />
            <div className="summary-muscle-chips">
              {topMuscles.map(m => (
                <span key={m.region} className="summary-muscle-chip">
                  {REGION_DISPLAY[m.region] ?? m.region}
                </span>
              ))}
            </div>
          </div>
        )}

        <button className="btn primary btn-full summary-done-btn" onClick={onDismiss}>Done</button>
      </div>
    </div>
  );
}

// ─── Session Detail Page (read-only, full screen) ────────────────────────────

function SessionDetailPage({ session, onBack, onEdit, onDelete, onUpdate }: {
  session: Session;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (session: Session) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());
  const [kcalModalOpen, setKcalModalOpen] = useState(false);
  const [kcalInput, setKcalInput] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    getAllExercises().then(all => setExerciseMap(new Map(all.map(e => [e.id, e]))));
  }, []);

  const muscles = computeSessionMuscles(session, exerciseMap);
  const heatmapScores = normaliseScores(
    MUSCLE_REGIONS.map(r => {
      const found = muscles.find(m => m.region === r);
      return found ?? { region: r, label: r, score: 0, totalSets: 0, lastTrained: null };
    })
  );
  const topMuscles = muscles.slice(0, 5);
  const totalSets = session.groups.reduce((a, g) => a + g.blocks.reduce((b, bl) => b + bl.sets.filter(s => s.completed).length, 0), 0);
  const totalExercises = new Set(session.groups.flatMap(g => g.blocks.filter(b => !b.skipped && b.sets.some(s => s.completed)).map(b => b.exerciseId))).size;

  async function saveKcal() {
    const val = Math.round(Number(kcalInput));
    if (isNaN(val) || val < 0) { setKcalModalOpen(false); return; }
    const updated: Session = { ...session, estimatedKcal: val || null, updatedAt: Date.now() };
    await putSession(updated);
    onUpdate(updated);
    setKcalModalOpen(false);
  }

  async function regenerateKcal() {
    setRegenerating(true);
    const kcal = await estimateWithBodyweight(session);
    const updated: Session = { ...session, estimatedKcal: kcal, updatedAt: Date.now() };
    await putSession(updated);
    onUpdate(updated);
    setKcalInput(String(kcal ?? ''));
    setRegenerating(false);
  }

  return (
    <div className="workout-editor">
      <Topbar
        title={session.workoutName}
        onBack={onBack}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn outline btn-sm" onClick={onEdit}>Edit</button>
            <button className="btn outline btn-sm" style={{ color: '#E53E3E', borderColor: '#E53E3E' }} onClick={() => setConfirmDelete(true)}>Delete</button>
          </div>
        }
      />

      {confirmDelete && (
        <div className="sess-delete-confirm">
          <span>Delete this session? This can't be undone.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ background: '#E53E3E', borderColor: '#E53E3E', color: '#fff' }} onClick={onDelete}>Delete</button>
            <button className="btn outline btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="workout-editor__body">
        {/* Stats grid */}
        <div className="summary-stats sess-detail-stats">
          {effectiveSessionDuration(session) != null && (
            <div className="summary-stat">
              <span className="summary-stat__val">{formatDuration(effectiveSessionDuration(session)!)}</span>
              <span className="summary-stat__label">Duration</span>
            </div>
          )}
          <div className="summary-stat" style={{ cursor: 'pointer' }} onClick={() => { setKcalInput(String(session.estimatedKcal ?? '')); setKcalModalOpen(true); }}>
            <span className="summary-stat__val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {session.estimatedKcal != null ? `~${session.estimatedKcal}` : '—'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </span>
            <span className="summary-stat__label">kcal Burned</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat__val">{totalExercises}</span>
            <span className="summary-stat__label">Exercises</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat__val">{totalSets}</span>
            <span className="summary-stat__label">Sets</span>
          </div>
        </div>

        {/* Muscle heatmap */}
        {muscles.length > 0 && (
          <div className="summary-body-section">
            <span className="summary-section-label">Muscles Targeted</span>
            <BodySvg scores={heatmapScores} onTapMuscle={() => {}} />
            <div className="summary-muscle-chips">
              {topMuscles.map(m => (
                <span key={m.region} className="summary-muscle-chip">
                  {REGION_DISPLAY[m.region] ?? m.region}
                </span>
              ))}
            </div>
          </div>
        )}

        {session.notes?.trim() && (
          <div className="sess-detail-meta">
            <span className="sess-detail-notes">{session.notes}</span>
          </div>
        )}

        {/* Groups / blocks / sets */}
        {session.groups.map(group => {
          const groupClass = GROUP_CLASS[group.groupType] ?? 'g-main';
          const completedSets = group.blocks.reduce((a, b) => a + b.sets.filter(st => st.completed).length, 0);
          const totalGroupSets = group.blocks.reduce((a, b) => a + b.sets.length, 0);

          return (
            <div key={group.id} className={`group ${groupClass} group-editor`}>
              <div className="group-head group-editor__header">
                <span className="gname">{group.name}</span>
                <span className="gmeta" style={{ marginLeft: 'auto' }}>{completedSets}/{totalGroupSets} sets</span>
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

      <BottomSheet open={kcalModalOpen} onClose={() => setKcalModalOpen(false)} title="Calories Burned">
        <div className="bottom-sheet-body">
            <div className="kcal-edit-sheet__manual">
              <input
                type="number"
                className="ed-input"
                value={kcalInput}
                onChange={e => setKcalInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveKcal(); }}
                placeholder="Enter kcal"
                autoFocus
                style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700 }}
              />
              <button className="btn primary" onClick={saveKcal}>Save</button>
            </div>
            <div className="kcal-edit-sheet__divider">
              <span>or</span>
            </div>
            <button className="btn outline btn-full" onClick={regenerateKcal} disabled={regenerating}>
              {regenerating ? 'Calculating…' : 'Recalculate from Workout'}
            </button>
        </div>
      </BottomSheet>
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
