import { useState } from 'react';
import { Topbar } from '../../components/Topbar/Topbar';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { FilterChips } from '../../components/FilterChips/FilterChips';
import { ExerciseCard } from './ExerciseCard';
import { ExerciseDetailModal } from './ExerciseDetailModal';
import { AddExerciseModal } from './AddExerciseModal';
import { CsvImportButton } from './CsvImportButton';
import { LibrarySyncButton } from './LibrarySyncButton';
import { useExercises } from '../../hooks/useExercises';
import type { Exercise, CategoryType, EquipmentType } from '../../types';
import './Exercises.css';

const CATEGORY_OPTIONS = [
  { value: 'muscle', label: 'Strength' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'stretching', label: 'Stretching' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'cooldown', label: 'Cool-down' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'meditation', label: 'Meditation' },
  { value: 'breathing', label: 'Breathing' },
];

const EQUIPMENT_OPTIONS = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machine' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Band' },
];

export function ExercisesView({ onOpenEditor }: { onOpenEditor?: () => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryType | ''>('');
  const [equipment, setEquipment] = useState<EquipmentType | ''>('');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { exercises, loading, saveExercise, reload } = useExercises({
    search, category, equipment, showArchived,
  });

  async function handleArchive(ex: Exercise) {
    await saveExercise({ ...ex, archived: !ex.archived });
  }

  return (
    <div className="exercises-view">
      <div className="exercises-header">
        <Topbar
          title="Library"
          right={
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="icon-btn" onClick={() => setAddOpen(true)} aria-label="Add exercise" title="Add exercise">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {onOpenEditor && (
                <button className="icon-btn" onClick={onOpenEditor} aria-label="Bulk editor" title="Bulk editor">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
              <div style={{ position: 'relative' }}>
                <button className="icon-btn" onClick={() => setMenuOpen(m => !m)} aria-label="Menu">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="5" r="1" fill="currentColor" />
                    <circle cx="12" cy="12" r="1" fill="currentColor" />
                    <circle cx="12" cy="19" r="1" fill="currentColor" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="ex-menu-dropdown">
                    <LibrarySyncButton onSynced={() => { reload(); }} />
                    <div className="divider" style={{ margin: '6px 0' }} />
                    <CsvImportButton onImported={() => { reload(); setMenuOpen(false); }} />
                    <div className="divider" style={{ margin: '6px 0' }} />
                    <button
                      className="btn ghost btn-sm btn-full"
                      style={{ justifyContent: 'flex-start', flex: 'none', width: '100%' }}
                      onClick={() => { setShowArchived(s => !s); setMenuOpen(false); }}
                    >
                      {showArchived ? 'Hide Archived' : 'Show Archived'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          }
        />

        <div className="exercises-search-row">
          <SearchBar value={search} onChange={setSearch} placeholder="Search exercises…" />
        </div>

        <div className="exercises-filters">
          <FilterChips options={CATEGORY_OPTIONS} value={category} onChange={v => setCategory(v as CategoryType | '')} />
          <FilterChips options={EQUIPMENT_OPTIONS} value={equipment} onChange={v => setEquipment(v as EquipmentType | '')} />
        </div>
      </div>

      <div className="exercises-list">
        {loading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : exercises.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <h3>No exercises found</h3>
            <p>Try adjusting your search or filters, or sync the built-in library.</p>
            <LibrarySyncButton onSynced={reload} />
            <CsvImportButton onImported={reload} />
          </div>
        ) : (
          <>
            <div className="exercise-count">{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</div>
            {exercises.map(ex => (
              <ExerciseCard key={ex.id} exercise={ex} onClick={setSelected} />
            ))}
          </>
        )}
      </div>

      <ExerciseDetailModal
        exercise={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onEdit={ex => { setEditing(ex); setSelected(null); }}
        onArchive={handleArchive}
      />

      <AddExerciseModal
        open={addOpen || !!editing}
        onClose={() => { setAddOpen(false); setEditing(null); }}
        onSave={saveExercise}
        initial={editing}
      />
    </div>
  );
}
