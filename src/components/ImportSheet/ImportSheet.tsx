import { useState } from 'react';
import type { SharePayload, ImportPreview } from '../../lib/share';
import { importWorkoutFromPayload } from '../../lib/share';
import './ImportSheet.css';

interface Props {
  payload: SharePayload;
  preview: ImportPreview;
  onDone: (workoutName: string) => void;
  onCancel: () => void;
}

export function ImportSheet({ payload, preview, onDone, onCancel }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const result = await importWorkoutFromPayload(payload);
      onDone(result.workout.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setImporting(false);
    }
  }

  const totalExercises = preview.groups.reduce((n, g) => n + g.exercises.length, 0);
  const hasSkipped = preview.skippedIds.length > 0;

  return (
    <div className="import-overlay">
      <div className="import-sheet">
        <div className="import-sheet__header">
          <div className="import-sheet__label">Import Workout</div>
          <div className="import-sheet__name">{preview.workoutName}</div>
          <div className="import-sheet__meta">
            {preview.groups.length} group{preview.groups.length !== 1 ? 's' : ''} · {totalExercises} exercise{totalExercises !== 1 ? 's' : ''}
            {hasSkipped && ` · ${preview.skippedIds.length} skipped`}
          </div>
        </div>

        <div className="import-sheet__body">
          {preview.groups.map((g, gi) => (
            <div key={gi} className="import-group">
              <div className="import-group__name">{g.name}</div>
              {g.exercises.map((ex, ei) => (
                <div key={ei} className={`import-exercise${ex.found ? '' : ' import-exercise--missing'}`}>
                  {ex.found ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="import-exercise__icon import-exercise__icon--ok">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="import-exercise__icon import-exercise__icon--skip">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                  <span className="import-exercise__name">{ex.name}</span>
                  {!ex.found && <span className="import-exercise__tag">skipped</span>}
                </div>
              ))}
            </div>
          ))}

          {hasSkipped && (
            <div className="import-skip-notice">
              <strong>{preview.skippedIds.length} exercise{preview.skippedIds.length !== 1 ? 's' : ''} not found</strong> in your library and will be skipped.
              Sync the exercise library (Library → Sync from GitHub) and import again to include them.
            </div>
          )}

          {error && (
            <div className="import-error">{error}</div>
          )}
        </div>

        <div className="import-sheet__actions">
          <button className="btn outline btn-full" onClick={onCancel} disabled={importing}>
            Cancel
          </button>
          <button className="btn primary btn-full" onClick={handleImport} disabled={importing}>
            {importing ? 'Importing…' : hasSkipped ? 'Import anyway' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
