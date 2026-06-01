import { useEffect, useRef, useState } from 'react';
import { useAllPlanDays } from '../../hooks/usePlanDay';
import { putPlanDay, deletePlanDay } from '../../db/plan';
import { getAllWorkouts } from '../../db/workouts';
import { getAllSessions } from '../../db/sessions';
import { getAllExercises } from '../../db/exercises';
import { Modal } from '../../components/Modal/Modal';
import { Topbar } from '../../components/Topbar/Topbar';
import { getDaysInMonth, getFirstDayOfMonth, toISODate, formatDisplayDate, formatDuration } from '../../lib/date';
import { extractYouTubeId } from '../../lib/youtube';
import type { Workout, PlanDay, Session, Exercise } from '../../types';
import './Plan.css';

const now = new Date();
const TODAY_STR = toISODate(now);

type PlanTab = 'calendar' | 'schedule';

export function PlanView() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<PlanTab>('calendar');
  const [viewingWorkout, setViewingWorkout] = useState<Workout | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const { days, reload } = useAllPlanDays();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllWorkouts().then(all => setWorkouts(all.filter(w => !w.archived)));
  }, []);

  useEffect(() => {
    getAllSessions().then(setAllSessions);
  }, []);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  function goToToday() {
    const wasAlreadyCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDate(TODAY_STR);
    if (tab === 'schedule') {
      const doScroll = () => {
        const el = listRef.current?.querySelector('[data-today="true"]') as HTMLElement | null;
        el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
      // If already on current month the DOM is ready; otherwise wait for re-render
      if (wasAlreadyCurrentMonth) doScroll();
      else setTimeout(doScroll, 60);
    }
  }

  async function addWorkoutToDay(workout: Workout) {
    if (!selectedDate) return;
    const existing = days.get(selectedDate);
    const updated: PlanDay = {
      date: selectedDate,
      workouts: [...(existing?.workouts ?? []), { workoutId: workout.id, note: '' }],
      notes: existing?.notes ?? '',
      updatedAt: Date.now(),
    };
    await putPlanDay(updated);
    await reload();
    setPickerOpen(false);
  }

  async function removeWorkoutFromDay(date: string, workoutId: string) {
    const existing = days.get(date);
    if (!existing) return;
    const remaining = existing.workouts.filter(pw => pw.workoutId !== workoutId);
    if (remaining.length === 0) {
      await deletePlanDay(date);
    } else {
      await putPlanDay({ ...existing, workouts: remaining, updatedAt: Date.now() });
    }
    await reload();
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const workoutMap = new Map(workouts.map(w => [w.id, w]));

  const sessionsByDate = new Map<string, Session[]>();
  for (const s of allSessions) {
    if (!sessionsByDate.has(s.date)) sessionsByDate.set(s.date, []);
    sessionsByDate.get(s.date)!.push(s);
  }

  // All days in the currently viewed month (shared with calendar)
  const listDates = Array.from({ length: daysInMonth }, (_, i) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(i + 1).padStart(2, '0');
    return `${year}-${m}-${d}`;
  });

  function doneWorkoutIdsForDate(date: string): Set<string> {
    const sessions = sessionsByDate.get(date) ?? [];
    const doneIds = new Set<string>();
    for (const s of sessions) {
      if (s.finishedAt && s.workoutId) doneIds.add(s.workoutId);
    }
    return doneIds;
  }

  if (viewingWorkout) {
    return (
      <PlanWorkoutDetailView
        workout={viewingWorkout}
        onBack={() => setViewingWorkout(null)}
      />
    );
  }

  return (
    <div className="plan-view">
      <Topbar
        title="Plan"
        right={
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              className={`icon-btn${tab === 'calendar' ? ' icon-btn--active' : ''}`}
              onClick={() => setTab('calendar')}
              aria-label="Calendar view"
              title="Calendar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
            <button
              className={`icon-btn${tab === 'schedule' ? ' icon-btn--active' : ''}`}
              onClick={() => setTab('schedule')}
              aria-label="Schedule view"
              title="Schedule"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        }
      />

      {/* Month navigation sub-bar — both tabs */}
      <div className="plan-monthbar">
        <button className="icon-btn" onClick={prevMonth} aria-label="Previous month">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="plan-month">{monthName}</span>
        <button className="icon-btn" onClick={nextMonth} aria-label="Next month">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button className="plan-today-btn" onClick={goToToday}>Today</button>
      </div>

      {/* ── Calendar tab ── */}
      {tab === 'calendar' && (
        <div className="plan-cal-tab">
          {/* Weekday labels — sticky so they stay visible while scrolling */}
          <div className="plan-weekdays">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="plan-weekday">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="plan-cal-wrap">
            <div className="cal-grid">
              {cells.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} className="cal-cell muted" />;
                const m = String(month + 1).padStart(2, '0');
                const d = String(day).padStart(2, '0');
                const dateStr = `${year}-${m}-${d}`;
                const planDay = days.get(dateStr);
                const isToday = dateStr === TODAY_STR;
                const isSelected = dateStr === selectedDate;
                const doneIds = doneWorkoutIdsForDate(dateStr);
                const daySessions = sessionsByDate.get(dateStr) ?? [];
                return (
                  <div
                    key={dateStr}
                    className={`cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  >
                    <span className="cal-num">{day}</span>
                    {planDay && planDay.workouts.map(pw => {
                      const w = workoutMap.get(pw.workoutId);
                      const done = doneIds.has(pw.workoutId);
                      return (
                        <div key={pw.workoutId} className={`cal-pill${done ? ' cal-pill--done' : ''}`}>
                          {w?.name ?? '·'}
                        </div>
                      );
                    })}
                    {daySessions.filter(s => s.unplanned && s.finishedAt).map(s => (
                      <div key={s.id} className="cal-pill cal-pill--unplanned">{s.workoutName}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day panel — below calendar, parent tab scrolls */}
          <div className="plan-cal-day-panel">
            {selectedDate ? (
              <div className="plan-day-panel">
                <div className="plan-day-panel__header">
                  <span className="plan-day-panel__date">{formatDisplayDate(selectedDate)}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn primary btn-sm" onClick={() => setPickerOpen(true)}>+ Add</button>
                    <button className="icon-btn" onClick={() => setSelectedDate(null)} aria-label="Close">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
                {(() => {
                  const planDay = days.get(selectedDate);
                  const doneIds = doneWorkoutIdsForDate(selectedDate);
                  const daySessions = sessionsByDate.get(selectedDate) ?? [];
                  const hasPlanned = planDay && planDay.workouts.length > 0;
                  const unplannedSessions = daySessions.filter(s => s.unplanned && s.finishedAt);
                  if (!hasPlanned && unplannedSessions.length === 0) {
                    return (
                      <p className="plan-day-empty">No workouts planned. Tap "+ Add" to schedule one.</p>
                    );
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {planDay && planDay.workouts.map(pw => {
                        const workout = workoutMap.get(pw.workoutId);
                        const isDone = doneIds.has(pw.workoutId);
                        return (
                          <div
                            key={pw.workoutId}
                            className={`plan-workout-row${isDone ? ' plan-workout-row--done' : ''}`}
                            style={{ cursor: workout ? 'pointer' : undefined }}
                            onClick={() => workout && setViewingWorkout(workout)}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="plan-workout-row__name">
                                {isDone && <span className="plan-done-check">✓ </span>}
                                {workout?.name ?? pw.workoutId}
                              </div>
                              <div className="plan-workout-row__meta">
                                {workout ? `${workout.groups.length} groups · ${workout.groups.reduce((a, g) => a + g.blocks.length, 0)} exercises` : ''}
                                {isDone ? ' · Done' : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                              <button className="icon-btn" onClick={() => removeWorkoutFromDay(selectedDate, pw.workoutId)} aria-label="Remove">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {unplannedSessions.map(s => (
                        <div key={s.id} className="plan-workout-row plan-workout-row--unplanned">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="plan-workout-row__name">{s.workoutName}</div>
                            <div className="plan-workout-row__meta">Freestyle{s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="plan-cal-hint">Tap a date to view or plan workouts</p>
            )}
          </div>
        </div>
      )}

      {/* ── Schedule tab ── */}
      {tab === 'schedule' && (
        <div className="plan-list" ref={listRef}>
          {listDates.map(dateStr => {
            const planDay = days.get(dateStr);
            const daySessions = sessionsByDate.get(dateStr) ?? [];
            const doneIds = doneWorkoutIdsForDate(dateStr);
            const isToday = dateStr === TODAY_STR;
            const isPast = dateStr < TODAY_STR;
            const hasEntries = (planDay && planDay.workouts.length > 0) ||
              daySessions.some(s => s.finishedAt);

            return (
              <div
                key={dateStr}
                className={`plan-list-day${isToday ? ' plan-list-day--today' : ''}${isPast ? ' plan-list-day--past' : ''}${!hasEntries ? ' plan-list-day--empty' : ''}`}
                data-today={isToday ? 'true' : undefined}
                data-date={dateStr}
              >
                <div className="plan-list-day__header">
                  <span className="plan-list-day__date">{formatDisplayDate(dateStr)}</span>
                  {isToday && <span className="plan-list-today-chip">Today</span>}
                  <button
                    className="plan-list-add-btn"
                    onClick={() => { setSelectedDate(dateStr); setPickerOpen(true); }}
                    aria-label="Add workout"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
                {hasEntries && (
                  <div className="plan-list-day__entries">
                    {planDay && planDay.workouts.map(pw => {
                      const workout = workoutMap.get(pw.workoutId);
                      const isDone = doneIds.has(pw.workoutId);
                      return (
                        <div
                          key={pw.workoutId}
                          className={`plan-list-entry${isDone ? ' plan-list-entry--done' : ''}`}
                          style={{ cursor: workout ? 'pointer' : undefined }}
                          onClick={() => workout && setViewingWorkout(workout)}
                        >
                          <div className={`plan-list-entry__dot${isDone ? ' done' : ''}`} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="plan-list-entry__name">{workout?.name ?? pw.workoutId}</div>
                            <div className="plan-list-entry__meta">
                              {workout ? `${workout.groups.reduce((a, g) => a + g.blocks.length, 0)} exercises` : ''}
                              {isDone ? ' · Done' : ' · Planned'}
                            </div>
                          </div>
                          {workout && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                    {daySessions
                      .filter(s => s.finishedAt && (s.unplanned || !s.workoutId || !doneIds.has(s.workoutId)))
                      .map(s => (
                        <div key={s.id} className="plan-list-entry plan-list-entry--logged">
                          <div className="plan-list-entry__dot done" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="plan-list-entry__name">{s.workoutName}</div>
                            <div className="plan-list-entry__meta">
                              {s.unplanned ? 'Freestyle' : 'Completed'}
                              {s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add Workout" size="md">
        {workouts.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <h3>No workout templates</h3>
            <p>Create templates in the Workouts tab first.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {workouts
              .filter(w => {
                if (!selectedDate) return true;
                const planDay = days.get(selectedDate);
                if (!planDay) return true;
                return !planDay.workouts.some(pw => pw.workoutId === w.id);
              })
              .map(w => (
                <button key={w.id} className="plan-picker-row" onClick={() => addWorkoutToDay(w)}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{w.name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-mute)', marginTop: 3, letterSpacing: '0.08em' }}>
                      {w.groups.length} groups · {w.groups.reduce((a, g) => a + g.blocks.length, 0)} exercises
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Plan Workout Detail View ─────────────────────────────────────────────────

const PLAN_GROUP_CLASS: Record<string, string> = {
  warmup: 'g-warmup', mobility: 'g-mobility', activation: 'g-activation',
  main: 'g-main', accessory: 'g-accessory', cardio: 'g-cardio', cooldown: 'g-cooldown',
};

function PlanWorkoutDetailView({ workout, onBack }: { workout: Workout; onBack: () => void }) {
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
          const groupClass = PLAN_GROUP_CLASS[group.groupType] ?? 'g-main';
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
                const videoId = ex?.videoUrl ? extractYouTubeId(ex.videoUrl) : null;
                return (
                  <div key={block.id} className="viewer-block-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="block-row__name">{ex?.name ?? block.exerciseId}</span>
                        {videoId && (
                          <button
                            className="video-play-btn"
                            onClick={() => setMiniVideoUrl(miniVideoUrl === ex!.videoUrl ? null : ex!.videoUrl!)}
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
