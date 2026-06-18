import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal/Modal';
import { CategoryIcon, CATEGORY_COLOR } from '../../components/CategoryIcon/CategoryIcon';
import { uid } from '../../lib/ids';
import type { Exercise, CategoryType, EquipmentType, DefaultUnit } from '../../types';

interface AddExerciseModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (exercise: Exercise) => Promise<void>;
  initial?: Exercise | null;
}

const CATEGORIES: { value: CategoryType; label: string }[] = [
  { value: 'muscle',      label: 'Strength' },
  { value: 'warmup',      label: 'Warm-up' },
  { value: 'stretching',  label: 'Stretch' },
  { value: 'cardio',      label: 'Cardio' },
  { value: 'cooldown',    label: 'Cool-down' },
  { value: 'yoga',        label: 'Yoga' },
  { value: 'meditation',  label: 'Meditation' },
  { value: 'breathing',   label: 'Breathing' },
];

const EQUIPMENT: { value: EquipmentType; label: string }[] = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'barbell',    label: 'Barbell' },
  { value: 'dumbbell',   label: 'Dumbbell' },
  { value: 'cable',      label: 'Cable' },
  { value: 'machine',    label: 'Machine' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band',       label: 'Band' },
  { value: 'other',      label: 'Other' },
];

const UNITS: { value: DefaultUnit; label: string }[] = [
  { value: null,  label: '—' },
  { value: 'kg',  label: 'kg' },
  { value: 'lb',  label: 'lb' },
  { value: 'sec', label: 'sec' },
  { value: 'min', label: 'min' },
];

export function AddExerciseModal({ open, onClose, onSave, initial }: AddExerciseModalProps) {
  const [name, setName]                     = useState('');
  const [muscleGroup, setMuscleGroup]       = useState('');
  const [secondaryMuscles, setSecondary]    = useState('');
  const [equipment, setEquipment]           = useState<EquipmentType>('bodyweight');
  const [category, setCategory]             = useState<CategoryType>('muscle');
  const [videoUrl, setVideoUrl]             = useState('');
  const [defaultUnit, setDefaultUnit]       = useState<DefaultUnit>(null);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');

  // Reset form whenever modal opens or initial changes
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(initial?.name ?? '');
      setMuscleGroup(initial?.muscleGroup ?? '');
      setSecondary(initial?.secondaryMuscles.join(', ') ?? '');
      setEquipment(initial?.equipment ?? 'bodyweight');
      setCategory(initial?.category ?? 'muscle');
      setVideoUrl(initial?.videoUrl ?? '');
      setDefaultUnit(initial?.defaultUnit ?? null);
      setError('');
    }
  }, [open, initial]);

  async function handleSave() {
    if (!name.trim())        { setError('Name is required.');         return; }
    if (!muscleGroup.trim()) { setError('Muscle group is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const exercise: Exercise = {
        id: initial?.id ?? uid('ex_custom'),
        name: name.trim(),
        muscleGroup: muscleGroup.trim().toLowerCase(),
        secondaryMuscles: secondaryMuscles
          ? secondaryMuscles.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
          : [],
        equipment,
        category,
        videoUrl: videoUrl.trim() || null,
        defaultUnit,
        source: 'custom',
        archived: initial?.archived ?? false,
        updatedAt: Date.now(),
      };
      await onSave(exercise);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Exercise' : 'New Exercise'} size="md">
      <div className="ex-form">

        {/* Error banner */}
        {error && (
          <div className="ex-form__error">{error}</div>
        )}

        {/* Name */}
        <div className="ex-form__field">
          <label className="ex-form__label">Name *</label>
          <input
            className="ex-form__input"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="e.g. Romanian Deadlift"
            autoFocus
          />
        </div>

        {/* Category chips */}
        <div className="ex-form__field">
          <label className="ex-form__label">Category</label>
          <div className="ex-form__chips">
            {CATEGORIES.map(c => {
              const color = CATEGORY_COLOR[c.value];
              const active = category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  className={`ex-form__chip${active ? ' active' : ''}`}
                  style={active ? { borderColor: color, color, background: `${color}18` } : {}}
                  onClick={() => setCategory(c.value)}
                >
                  <CategoryIcon category={c.value} size={12} color={active ? color : 'var(--fg-mute)'} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Muscle group */}
        <div className="ex-form__field">
          <label className="ex-form__label">Muscle Group *</label>
          <input
            className="ex-form__input"
            value={muscleGroup}
            onChange={e => { setMuscleGroup(e.target.value); setError(''); }}
            placeholder="e.g. back"
          />
        </div>

        {/* Secondary muscles */}
        <div className="ex-form__field">
          <label className="ex-form__label">Secondary Muscles</label>
          <input
            className="ex-form__input"
            value={secondaryMuscles}
            onChange={e => setSecondary(e.target.value)}
            placeholder="biceps, shoulders (comma-separated)"
          />
        </div>

        {/* Equipment + Default unit — side by side */}
        <div className="ex-form__row">
          <div className="ex-form__field" style={{ flex: 1 }}>
            <label className="ex-form__label">Equipment</label>
            <select className="ex-form__select" value={equipment} onChange={e => setEquipment(e.target.value as EquipmentType)}>
              {EQUIPMENT.map(eq => <option key={eq.value} value={eq.value}>{eq.label}</option>)}
            </select>
          </div>
          <div className="ex-form__field" style={{ flex: 1 }}>
            <label className="ex-form__label">Default Unit</label>
            <select className="ex-form__select" value={defaultUnit ?? ''} onChange={e => setDefaultUnit((e.target.value as DefaultUnit) || null)}>
              {UNITS.map(u => <option key={u.label} value={u.value ?? ''}>{u.label}</option>)}
            </select>
          </div>
        </div>

        {/* YouTube URL */}
        <div className="ex-form__field">
          <label className="ex-form__label">YouTube URL</label>
          <input
            className="ex-form__input"
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="https://youtu.be/…"
            type="url"
            inputMode="url"
          />
        </div>

        {/* Actions */}
        <div className="ex-form__actions">
          <button className="btn outline" onClick={onClose} type="button">Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={saving} type="button">
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Exercise'}
          </button>
        </div>

      </div>
    </Modal>
  );
}
