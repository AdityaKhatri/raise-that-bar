import { useEffect, useState } from 'react';
import { getAllExercises } from '../../db/exercises';
import { putWorkout } from '../../db/workouts';
import {
  buildSinglePrompt, buildPlanPrompt,
  parseAIResponse, resolveAIWorkouts, buildWorkoutsFromAI,
} from '../../lib/aiImport';
import type { AIResolveResult, } from '../../lib/aiImport';
import type { Exercise } from '../../types';
import './AIImportSheet.css';

interface Props {
  onDone: (names: string[]) => void;
  onCancel: () => void;
}

type Mode = 'single' | 'plan';
type Step = 'setup' | 'prompt' | 'paste' | 'preview';

const PLAN_DAYS = [3, 4, 5, 6] as const;

export function AIImportSheet({ onDone, onCancel }: Props) {
  const [step, setStep] = useState<Step>('setup');
  const [mode, setMode] = useState<Mode>('single');
  const [days, setDays] = useState<number>(4);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<AIResolveResult[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const [importing, setImporting] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    getAllExercises().then(setExercises);
  }, []);

  const prompt = exercises.length === 0
    ? 'Loading exercise library…'
    : mode === 'single'
      ? buildSinglePrompt(exercises)
      : buildPlanPrompt(days, exercises);

  const stepLabels: { key: Step; label: string }[] = [
    { key: 'setup', label: '1 Setup' },
    { key: 'prompt', label: '2 Get prompt' },
    { key: 'paste', label: '3 Paste response' },
    { key: 'preview', label: '4 Preview' },
  ];

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleParse() {
    setParseError(null);
    try {
      const parsed = parseAIResponse(pasted);
      const results = resolveAIWorkouts(parsed, exercises);
      setPreviews(results);
      setExpandedIdx(0);
      setStep('preview');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not parse the AI response');
    }
  }

  async function handleImport() {
    if (!previews.length) return;
    setImporting(true);
    try {
      const workouts = buildWorkoutsFromAI(previews);
      for (const w of workouts) await putWorkout(w);
      onDone(workouts.map(w => w.name));
    } finally {
      setImporting(false);
    }
  }

  const totalMissing = previews.reduce((s, p) => s + p.missingCount, 0);
  const allEmpty = previews.every(p => p.groups.every(g => g.exercises.every(e => !e.exercise)));

  return (
    <div className="ai-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="ai-sheet">

        {/* ── Header ── */}
        <div className="ai-sheet__header">
          <div className="ai-sheet__label">Import from AI</div>
          <div className="ai-sheet__steps">
            {stepLabels.map((s, i) => (
              <span key={s.key}>
                {i > 0 && <span className="ai-step-sep">›</span>}
                <span className={`ai-step ${step === s.key ? 'ai-step--active' : ''}`}>{s.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Step 1: Setup ── */}
        {step === 'setup' && (
          <div className="ai-sheet__body">
            <p className="ai-sheet__desc">
              What do you want to create?
            </p>

            <div className="ai-mode-cards">
              <button
                className={`ai-mode-card ${mode === 'single' ? 'ai-mode-card--active' : ''}`}
                onClick={() => setMode('single')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="16" rx="2"/>
                  <line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/>
                </svg>
                <span className="ai-mode-card__title">Single Workout</span>
                <span className="ai-mode-card__desc">One session designed around a specific goal or muscle group</span>
              </button>

              <button
                className={`ai-mode-card ${mode === 'plan' ? 'ai-mode-card--active' : ''}`}
                onClick={() => setMode('plan')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="16" rx="2"/>
                  <line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="17" y2="13"/>
                  <line x1="7" y1="17" x2="12" y2="17"/>
                </svg>
                <span className="ai-mode-card__title">Week Plan</span>
                <span className="ai-mode-card__desc">A full weekly split with multiple balanced sessions</span>
              </button>
            </div>

            {mode === 'plan' && (
              <div className="ai-days-picker">
                <span className="ai-days-label">Days per week</span>
                <div className="ai-days-options">
                  {PLAN_DAYS.map(d => (
                    <button
                      key={d}
                      className={`ai-day-btn ${days === d ? 'ai-day-btn--active' : ''}`}
                      onClick={() => setDays(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="ai-sheet__actions">
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button className="btn primary" onClick={() => setStep('prompt')}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Copy prompt ── */}
        {step === 'prompt' && (
          <div className="ai-sheet__body">
            <p className="ai-sheet__desc">
              {mode === 'single'
                ? 'Copy this prompt into ChatGPT or Claude. The AI will ask about your goals, browse the exercise library, and design a workout. When ready, it outputs JSON — paste that in the next step.'
                : `Copy this prompt into ChatGPT or Claude. The AI will ask about your training split and design a balanced ${days}-day plan. When ready, it outputs all ${days} workouts as JSON.`}
            </p>
            <div className="ai-prompt-box">
              <pre className="ai-prompt-text">{prompt}</pre>
            </div>
            <div className="ai-sheet__actions">
              <button className="btn" onClick={() => setStep('setup')}>← Back</button>
              <button className="btn primary" onClick={copyPrompt} disabled={exercises.length === 0}>
                {copied ? '✓ Copied!' : 'Copy Prompt'}
              </button>
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setStep('paste')}>Next →</button>
            </div>
          </div>
        )}

        {/* ── Step 3: Paste ── */}
        {step === 'paste' && (
          <div className="ai-sheet__body">
            <p className="ai-sheet__desc">
              Paste the AI's full response below — the app extracts the JSON automatically.
            </p>
            <textarea
              className="ai-textarea"
              placeholder={'Paste the AI response here…\n\nThe app looks for a ```json ... ``` block or bare JSON.'}
              value={pasted}
              onChange={e => { setPasted(e.target.value); setParseError(null); }}
              rows={10}
            />
            {parseError && <div className="ai-error">{parseError}</div>}
            <div className="ai-sheet__actions">
              <button className="btn" onClick={() => setStep('prompt')}>← Back</button>
              <button className="btn primary" onClick={handleParse} disabled={!pasted.trim()}>
                Parse & Preview
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === 'preview' && previews.length > 0 && (
          <div className="ai-sheet__body">
            {previews.length > 1 && (
              <div className="ai-plan-summary">
                <span className="ai-plan-badge">{previews.length}-day plan</span>
                {totalMissing > 0 && (
                  <span className="ai-plan-missing">{totalMissing} exercise{totalMissing !== 1 ? 's' : ''} not found</span>
                )}
              </div>
            )}

            {totalMissing > 0 && (
              <div className="ai-skip-notice">
                <strong>{totalMissing} exercise{totalMissing !== 1 ? 's' : ''} not found</strong> in your library and will be skipped.
                Import the exercise library in the Library tab if exercises are missing.
              </div>
            )}

            <div className="ai-preview-workouts">
              {previews.map((p, wi) => (
                <div key={wi} className="ai-preview-workout">
                  <button
                    className="ai-preview-workout__header"
                    onClick={() => setExpandedIdx(expandedIdx === wi ? null : wi)}
                  >
                    <span className="ai-preview-name">{p.workoutName}</span>
                    <span className="ai-preview-workout__meta">
                      {p.groups.reduce((s, g) => s + g.exercises.filter(e => e.exercise).length, 0)} exercises
                      {p.missingCount > 0 && ` · ${p.missingCount} skipped`}
                    </span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="var(--fg-mute)" strokeWidth="2"
                      style={{ transform: expandedIdx === wi ? 'rotate(90deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }}
                    >
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>

                  {expandedIdx === wi && (
                    <div className="ai-preview-groups">
                      {p.workoutNotes && <div className="ai-preview-notes">{p.workoutNotes}</div>}
                      {p.groups.map((g, gi) => (
                        <div key={gi} className="ai-preview-group">
                          <div className="ai-preview-group__name">{g.name}</div>
                          {g.exercises.map((ex, ei) => (
                            <div key={ei} className={`ai-preview-ex ${!ex.exercise ? 'ai-preview-ex--missing' : ''}`}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                className={ex.exercise ? 'ai-ex-icon--ok' : 'ai-ex-icon--skip'}>
                                {ex.exercise
                                  ? <polyline points="20 6 9 17 4 12"/>
                                  : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                              </svg>
                              <span className="ai-preview-ex__name">{ex.aiName}</span>
                              <span className="ai-preview-ex__meta">
                                {ex.sets}×{ex.reps ?? `${ex.time}s`}
                                {ex.rest ? ` · ${ex.rest}s rest` : ''}
                              </span>
                              {!ex.exercise && <span className="ai-preview-ex__tag">not found</span>}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="ai-sheet__actions">
              <button className="btn" onClick={() => setStep('paste')}>← Back</button>
              <button className="btn primary" onClick={handleImport} disabled={importing || allEmpty}>
                {importing
                  ? 'Importing…'
                  : previews.length > 1
                    ? `Import ${previews.length} Workouts`
                    : 'Import Workout'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
