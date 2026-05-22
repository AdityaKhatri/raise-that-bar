import { useEffect, useRef, useState } from 'react';
import { useActiveSession } from '../../context/ActiveSessionContext';
import { usePlanDay } from '../../hooks/usePlanDay';
import { useQuickStats } from '../../hooks/useSessions';
import { getWorkout } from '../../db/workouts';
import { getSessionsByDate } from '../../db/sessions';
import { getAllExercises } from '../../db/exercises';
import { Modal } from '../../components/Modal/Modal';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { CategoryIcon, CATEGORY_COLOR, CATEGORY_LABEL } from '../../components/CategoryIcon/CategoryIcon';
import { LogoMark, LogoFull } from '../../components/Logo/Logo';
import { today, formatDisplayDate, formatDuration } from '../../lib/date';
import { uid } from '../../lib/ids';
import type { Session, SessionGroup, SessionBlock, SessionSet, Workout, Exercise } from '../../types';
import './Today.css';

const TODAY = today();

const GROUP_CLASS: Record<string, string> = {
  warmup: 'g-warmup',
  mobility: 'g-mobility',
  activation: 'g-activation',
  main: 'g-main',
  accessory: 'g-accessory',
  cardio: 'g-cardio',
  cooldown: 'g-cooldown',
};

function templateToSessionGroups(workout: Workout): SessionGroup[] {
  return workout.groups.map(g => ({
    id: g.id,
    name: g.name,
    groupType: g.groupType,
    blocks: g.blocks.map(b => {
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
        exerciseName: b.exerciseId,
        skipped: false,
        skipReason: '',
        sets,
      };
    }),
  }));
}

// ─── Idle Today View ──────────────────────────────────────────────────────────

export function TodayView() {
  const { session, startSession, resumeSession } = useActiveSession();
  const { day } = usePlanDay(TODAY);
  const { streak, thisWeek, allTime } = useQuickStats();
  // Finished sessions logged today, keyed by workoutId
  const [doneSessions, setDoneSessions] = useState<Map<string, Session>>(new Map());

  // Load finished sessions for today to detect which planned workouts are done
  useEffect(() => {
    getSessionsByDate(TODAY).then(sessions => {
      const map = new Map<string, Session>();
      for (const s of sessions) {
        if (s.finishedAt && s.workoutId) {
          map.set(s.workoutId, s);
        }
      }
      setDoneSessions(map);
    });
  }, [session]); // re-run whenever active session changes (e.g. after finishing)

  async function startFreestyle() {
    const s: Session = {
      id: uid('sess'),
      date: TODAY,
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
    const workout = await getWorkout(workoutId);
    if (!workout) return;
    const s: Session = {
      id: uid('sess'),
      date: TODAY,
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      workoutId: workout.id,
      workoutName: workout.name,
      unplanned: false,
      groups: templateToSessionGroups(workout),
      notes: '',
      updatedAt: Date.now(),
    };
    await startSession(s);
  }

  if (session) return <ActiveSessionView />;

  // Build day-of-week + date crumb
  const dateObj = new Date(TODAY + 'T00:00:00');
  const dayAbbr = dateObj.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();

  return (
    <div className="today-view">
      <div className="topbar">
        <LogoMark size={20} />
        <span className="crumb">{dayAbbr} · {TODAY}</span>
      </div>

      <div className="today-idle">
        <div className="today-hero">
          <LogoFull markSize={48} />
          <div className="today-hero-date">{formatDisplayDate(TODAY)}</div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat">
            <div className="v">{streak}</div>
            <div className="k">Streak</div>
          </div>
          <div className="stat">
            <div className="v">{thisWeek}</div>
            <div className="k">This week</div>
          </div>
          <div className="stat">
            <div className="v">{allTime}</div>
            <div className="k">All time</div>
          </div>
        </div>

        {/* Planned Workouts */}
        {day && day.workouts.length > 0 && (
          <div className="plan-section">
            <div className="plan-section-label">Planned</div>
            {day.workouts.map(pw => {
              const doneSession = doneSessions.get(pw.workoutId) ?? null;
              return (
                <PlannedWorkoutCard
                  key={pw.workoutId}
                  workoutId={pw.workoutId}
                  note={pw.note}
                  doneSession={doneSession}
                  onStart={() => startFromTemplate(pw.workoutId)}
                  onEdit={() => resumeSession(doneSession!)}
                />
              );
            })}
          </div>
        )}

        {/* Freestyle */}
        <div className="quick-start-section">
          <div className="plan-section-label" style={{ marginBottom: 8 }}>Quick Start</div>
          <button className="btn outline btn-full" style={{ justifyContent: 'center' }} onClick={startFreestyle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Start Freestyle Session
          </button>
        </div>
      </div>
    </div>
  );
}

function PlannedWorkoutCard({ workoutId, note, doneSession, onStart, onEdit }: {
  workoutId: string;
  note: string;
  doneSession: Session | null;
  onStart: () => void;
  onEdit: () => void;
}) {
  const [name, setName] = useState(workoutId);
  const [exCount, setExCount] = useState<number | null>(null);

  useEffect(() => {
    getWorkout(workoutId).then(w => {
      if (w) {
        setName(w.name);
        setExCount(w.groups.reduce((a, g) => a + g.blocks.length, 0));
      }
    });
  }, [workoutId]);

  const isDone = doneSession !== null;

  return (
    <div className={`plan-card${isDone ? ' plan-card--done' : ''}`}>
      <div style={{ flex: 1 }}>
        <div className="plan-card__name">{name}</div>
        <div className="plan-card__meta">
          {exCount !== null ? `${exCount} exercise${exCount !== 1 ? 's' : ''}` : ''}
          {note ? ` · ${note}` : ''}
          {isDone && doneSession.durationMs ? ` · ${formatDuration(doneSession.durationMs)}` : ''}
        </div>
      </div>
      {isDone ? (
        <div className="plan-card__done-actions">
          <span className="plan-card__done-badge">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Done
          </span>
          <button className="btn outline btn-sm" style={{ flex: 'none' }} onClick={onEdit}>Edit</button>
        </div>
      ) : (
        <button className="btn primary btn-sm" style={{ flex: 'none' }} onClick={onStart}>Start</button>
      )}
    </div>
  );
}

// ─── Active Session View ──────────────────────────────────────────────────────

function isTimeBased(ex: Exercise | undefined): boolean {
  return ex?.defaultUnit === 'sec' || ex?.defaultUnit === 'min';
}

function ActiveSessionView() {
  const { session, updateSession, finishSession, discardSession } = useActiveSession();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pickerGroupId, setPickerGroupId] = useState<string | null>(null);
  const [justDoneKeys, setJustDoneKeys] = useState<Set<string>>(new Set());
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());

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

  function toggleComplete(groupId: string, blockId: string, setIndex: number, current: boolean) {
    const key = `${groupId}-${blockId}-${setIndex}`;
    updateSet(groupId, blockId, setIndex, { completed: !current });
    if (!current) {
      setJustDoneKeys(prev => new Set(prev).add(key));
      setTimeout(() => {
        setJustDoneKeys(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 200);
    }
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

  return (
    <div className="today-view">
      {/* Topbar */}
      <div className="topbar">
        <LogoMark size={18} />
        <span className="crumb">
          {isEditing ? 'Session / Editing' : 'Session / In Progress'}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="icon-btn" onClick={() => setConfirmDiscard(true)} title="Discard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editing banner */}
      {isEditing && (
        <div className="session-edit-banner">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Completed session — editing
        </div>
      )}

      {/* Session header */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          {!isEditing && (
            <div className="session-timer mono">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </div>
          )}
          <div className="session-name">{s.workoutName}</div>
        </div>
      </div>

      {/* Scrollable groups */}
      <div className="session-scroll">
        {s.groups.map(group => {
          const groupClass = GROUP_CLASS[group.groupType] ?? 'g-main';
          const completedCount = group.blocks.reduce((a, b) => a + b.sets.filter(st => st.completed).length, 0);
          const totalCount = group.blocks.reduce((a, b) => a + b.sets.length, 0);
          return (
            <div key={group.id} className={`group ${groupClass}`} style={{ marginTop: 16 }}>
              <div className="group-head">
                <span className="gname">{group.name}</span>
                <span className="gmeta">{completedCount}/{totalCount} sets</span>
              </div>

              {group.blocks.map(block => {
                const ex = exerciseMap.get(block.exerciseId);
                const timeBased = isTimeBased(ex);
                return (
                <div key={block.id} className="block">
                  <div className="block-head">
                    <span className="block-name">{block.exerciseName}</span>
                  </div>

                  {/* Set header row */}
                  <div className="set-row head">
                    <span></span>
                    <span>Weight</span>
                    <span>{timeBased ? 'Time (s)' : 'Reps'}</span>
                    <span></span>
                  </div>

                  {block.sets.map((set, si) => {
                    const key = `${group.id}-${block.id}-${si}`;
                    const isDone = set.completed;
                    const isJustDone = justDoneKeys.has(key);
                    return (
                      <div
                        key={si}
                        className={`set-row${isDone ? ' done' : ''}${isJustDone ? ' just-done' : ''}`}
                      >
                        <span className="snum">{si + 1}</span>
                        <input
                          className="num-input"
                          type="number"
                          placeholder="—"
                          value={set.weight ?? ''}
                          onChange={e => updateSet(group.id, block.id, si, {
                            weight: e.target.value ? parseFloat(e.target.value) : null,
                          })}
                        />
                        {timeBased ? (
                          <input
                            className="num-input"
                            type="number"
                            placeholder="—"
                            value={set.time ?? ''}
                            onChange={e => updateSet(group.id, block.id, si, {
                              time: e.target.value ? parseInt(e.target.value) : null,
                            })}
                          />
                        ) : (
                          <input
                            className="num-input"
                            type="number"
                            placeholder="—"
                            value={set.reps ?? ''}
                            onChange={e => updateSet(group.id, block.id, si, {
                              reps: e.target.value ? parseInt(e.target.value) : null,
                            })}
                          />
                        )}
                        <button
                          className="complete-btn"
                          onClick={() => toggleComplete(group.id, block.id, si, isDone)}
                          aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                        >
                          <span className="dot" />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    className="add-block"
                    style={{ marginTop: 8 }}
                    onClick={() => addSet(group.id, block.id)}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Set
                  </button>
                </div>
                );
              })}

              <button
                className="add-block"
                style={{ marginTop: 8 }}
                onClick={() => setPickerGroupId(group.id)}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Exercise
              </button>
            </div>
          );
        })}
      </div>

      {/* Sticky action bar */}
      <div className="stickybar">
        <button className="btn ghost" onClick={() => setConfirmDiscard(true)}>
          {isEditing ? 'Cancel' : 'Discard'}
        </button>
        <button className="btn primary" onClick={() => finishSession()}>
          {isEditing ? 'Save Changes' : 'Finish Session'}
        </button>
      </div>

      {/* Discard confirm */}
      {confirmDiscard && (
        <div className="discard-overlay">
          <div className="discard-sheet">
            <h3>{isEditing ? 'Cancel editing?' : 'Discard session?'}</h3>
            <p>
              {isEditing
                ? 'Your changes will not be saved. The original session remains.'
                : 'This cannot be undone. Your progress will be lost.'}
            </p>
            <div className="discard-actions">
              <button className="btn outline btn-full" onClick={() => setConfirmDiscard(false)}>Keep going</button>
              <button
                className="btn btn-full"
                style={{ background: '#E53E3E', borderColor: '#E53E3E', color: '#fff' }}
                onClick={() => discardSession()}
              >
                {isEditing ? 'Cancel Changes' : 'Discard'}
              </button>
            </div>
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

// Suppress unused import warning for useRef
const _useRef = useRef;
void _useRef;
