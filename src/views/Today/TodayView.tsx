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
import { extractYouTubeId } from '../../lib/youtube';
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
  const { session, updateSession, finishSession, discardSession } = useActiveSession();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
    updateSet(groupId, block.id, si, { completed: true });
    if (si === block.sets.length - 1) setExpandedBlock(null);
  }

  return (
    <div className="today-view">
      {/* Topbar */}
      <div className="topbar">
        <LogoMark size={18} />
        <span className="crumb">
          {isEditing ? 'Session / Editing' : 'Session / In Progress'}
        </span>
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
            <div key={group.id} className={`group ${groupClass}`} style={{ marginTop: 16 }}>
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
                                {/* Weight */}
                                <div className="focus-field">
                                  <div className="focus-field__label">Weight</div>
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

                                {/* Reps or Time */}
                                <div className="focus-field">
                                  <div className="focus-field__label">{timeBased ? 'Time (s)' : 'Reps'}</div>
                                  <div className="focus-field__row">
                                    <button className="nudge-btn" onClick={() => timeBased
                                      ? updateSet(group.id, block.id, si, { time: Math.max(1, (set.time ?? 0) - 5) })
                                      : updateSet(group.id, block.id, si, { reps: Math.max(1, (set.reps ?? 0) - 1) })
                                    }>{timeBased ? '−5' : '−1'}</button>
                                    <input
                                      className="focus-input"
                                      type="number"
                                      inputMode="numeric"
                                      placeholder="—"
                                      value={timeBased ? (set.time ?? '') : (set.reps ?? '')}
                                      onChange={e => {
                                        const v = e.target.value ? parseInt(e.target.value) : null;
                                        timeBased
                                          ? updateSet(group.id, block.id, si, { time: v })
                                          : updateSet(group.id, block.id, si, { reps: v });
                                      }}
                                    />
                                    <button className="nudge-btn" onClick={() => timeBased
                                      ? updateSet(group.id, block.id, si, { time: (set.time ?? 0) + 5 })
                                      : updateSet(group.id, block.id, si, { reps: (set.reps ?? 0) + 1 })
                                    }>{timeBased ? '+5' : '+1'}</button>
                                  </div>
                                </div>
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
