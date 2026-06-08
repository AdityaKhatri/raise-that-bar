import { useCallback, useEffect, useRef, useState } from 'react';
import { getAllExercises, putExercise, deleteExercise, mergeExerciseLibrary } from '../../db/exercises';
import { parseLibraryCsv } from '../../lib/csv';
import { extractYouTubeId } from '../../lib/youtube';
import { uid } from '../../lib/ids';
import { CategoryIcon, CATEGORY_COLOR, CATEGORY_LABEL } from '../../components/CategoryIcon/CategoryIcon';
import { LogoMark } from '../../components/Logo/Logo';
import type { Exercise, CategoryType, EquipmentType, DefaultUnit } from '../../types';
import './ExerciseEditor.css';

const CATEGORIES: CategoryType[] = ['warmup', 'stretching', 'muscle', 'cardio', 'cooldown'];
const EQUIPMENT: EquipmentType[] = ['bodyweight', 'barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'other'];
const UNITS: { value: DefaultUnit; label: string }[] = [
  { value: null, label: '—' }, { value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' },
  { value: 'sec', label: 'sec' }, { value: 'min', label: 'min' },
];

interface Props {
  onBack: () => void;
}

type FilterKey = 'all' | 'custom' | 'library' | 'no-video' | CategoryType;

export function ExerciseEditorView({ onBack }: Props) {
  const [exercises, setExercises]   = useState<Exercise[]>([]);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<FilterKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const all = await getAllExercises();
    setExercises(all.sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // Filtered list
  const filtered = exercises.filter(ex => {
    if (search && !ex.name.toLowerCase().includes(search.toLowerCase()) &&
        !ex.muscleGroup.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'custom')   return ex.source === 'custom';
    if (filter === 'library')  return ex.source === 'library';
    if (filter === 'no-video') return !extractYouTubeId(ex.videoUrl);
    if (filter !== 'all')      return ex.category === filter;
    return true;
  });

  const currentIndex = filtered.findIndex(e => e.id === selectedId);

  function selectById(id: string) {
    setSelectedId(id);
    setSelected(new Set()); // clear bulk selection when navigating
  }

  function goNext() {
    if (currentIndex < filtered.length - 1) selectById(filtered[currentIndex + 1].id);
  }
  function goPrev() {
    if (currentIndex > 0) selectById(filtered[currentIndex - 1].id);
  }

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); goPrev(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, filtered]); // eslint-disable-line

  // ── Bulk actions ──────────────────────────────────────────────────────────

  function toggleBulkSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkSetCategory(cat: CategoryType) {
    const ids = [...selected];
    const now = Date.now();
    await Promise.all(ids.map(id => {
      const ex = exercises.find(e => e.id === id);
      if (!ex) return;
      return putExercise({ ...ex, category: cat, updatedAt: now });
    }));
    await load();
    setSelected(new Set());
    showToast(`Updated ${ids.length} exercise${ids.length !== 1 ? 's' : ''}`);
  }

  async function bulkArchive(archived: boolean) {
    const ids = [...selected];
    const now = Date.now();
    await Promise.all(ids.map(id => {
      const ex = exercises.find(e => e.id === id);
      if (!ex) return;
      return putExercise({ ...ex, archived, updatedAt: now });
    }));
    await load();
    setSelected(new Set());
    showToast(`${archived ? 'Archived' : 'Unarchived'} ${ids.length} exercise${ids.length !== 1 ? 's' : ''}`);
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────

  async function handleCsvFile(text: string) {
    setImportStatus('Importing…');
    try {
      const rows = parseLibraryCsv(text);
      if (rows.length === 0) { setImportStatus('No valid rows found.'); return; }
      const { inserted, updated } = await mergeExerciseLibrary(rows);
      await load();
      setImportStatus(`Done: ${inserted} new, ${updated} updated.`);
      setTimeout(() => setImportStatus(null), 3000);
    } catch (e) {
      setImportStatus(`Error: ${e}`);
    }
  }

  // ── New exercise ───────────────────────────────────────────────────────────

  async function createNew() {
    const ex: Exercise = {
      id: uid('ex_custom'),
      name: 'New Exercise',
      muscleGroup: 'other',
      secondaryMuscles: [],
      equipment: 'bodyweight',
      category: 'muscle',
      videoUrl: null,
      defaultUnit: null,
      source: 'custom',
      archived: false,
      updatedAt: Date.now(),
    };
    await putExercise(ex);
    await load();
    setSelectedId(ex.id);
  }

  const currentExercise = exercises.find(e => e.id === selectedId) ?? null;

  return (
    <div className="ed-root">
      {/* ── Top bar ── */}
      <div className="ed-topbar">
        <button className="ed-back" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoMark size={18} />
          <span className="ed-topbar-title">Exercise Editor</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {importStatus && <span className="ed-import-status">{importStatus}</span>}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => handleCsvFile(ev.target?.result as string); r.readAsText(f); e.target.value = ''; }} />
          <button className="btn outline btn-sm" onClick={() => fileRef.current?.click()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import CSV
          </button>
          <button className="btn primary btn-sm" onClick={createNew}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New
          </button>
        </div>
      </div>

      <div className="ed-body">
        {/* ── Left: list ── */}
        <div className="ed-list-col">
          <div className="ed-list-head">
            <input
              className="ed-search"
              type="search"
              placeholder="Search exercises…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="ed-filters">
              {(['all', 'muscle', 'warmup', 'stretching', 'cardio', 'cooldown', 'no-video', 'custom'] as FilterKey[]).map(f => (
                <button key={f} className={`ed-filter-chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'no-video' ? 'No Video' : f === 'custom' ? 'Custom' :
                    CATEGORY_LABEL[f as CategoryType] ?? f}
                </button>
              ))}
            </div>
            <div className="ed-list-count">
              {filtered.length} exercise{filtered.length !== 1 ? 's' : ''}
              {selected.size > 0 && <span style={{ color: 'var(--accent)' }}> · {selected.size} selected</span>}
            </div>
          </div>

          <div className="ed-list">
            {filtered.map((ex, i) => {
              const isActive  = ex.id === selectedId;
              const isSel     = selected.has(ex.id);
              const hasVideo  = !!extractYouTubeId(ex.videoUrl);
              const color     = CATEGORY_COLOR[ex.category] ?? 'var(--fg-mute)';
              return (
                <div
                  key={ex.id}
                  className={`ed-row${isActive ? ' active' : ''}${isSel ? ' bulk-sel' : ''}${ex.archived ? ' archived' : ''}`}
                  onClick={() => selectById(ex.id)}
                >
                  <input
                    type="checkbox"
                    className="ed-row-check"
                    checked={isSel}
                    onChange={() => {}}
                    onClick={e => toggleBulkSelect(ex.id, e)}
                  />
                  <div className="ed-row-icon" style={{ color }}>
                    <CategoryIcon category={ex.category} size={14} color={color} />
                  </div>
                  <div className="ed-row-info">
                    <div className="ed-row-name">{ex.name}</div>
                    <div className="ed-row-meta">{ex.muscleGroup} · {ex.equipment}</div>
                  </div>
                  <div className="ed-row-badges">
                    {!hasVideo && <span className="ed-badge-warn" title="No video">▶</span>}
                    {ex.archived && <span className="ed-badge-arch">arch</span>}
                    {ex.source === 'custom' && <span className="ed-badge-custom">custom</span>}
                  </div>
                  <div className="ed-row-num">{i + 1}</div>
                </div>
              );
            })}
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="ed-bulk-bar">
              <span className="ed-bulk-count">{selected.size} selected</span>
              <select
                className="ed-bulk-select"
                defaultValue=""
                onChange={e => { if (e.target.value) bulkSetCategory(e.target.value as CategoryType); e.target.value = ''; }}
              >
                <option value="" disabled>Set category…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
              <button className="btn outline btn-sm" onClick={() => bulkArchive(true)}>Archive</button>
              <button className="btn ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}
        </div>

        {/* ── Right: edit form ── */}
        <div className="ed-form-col">
          {currentExercise ? (
            <EditForm
              key={currentExercise.id}
              exercise={currentExercise}
              index={currentIndex}
              total={filtered.length}
              saving={saving}
              onSave={async (updated) => {
                setSaving(true);
                await putExercise({ ...updated, updatedAt: Date.now() });
                await load();
                setSaving(false);
                showToast('Saved');
              }}
              onDelete={async () => {
                if (currentExercise.source === 'custom') {
                  await deleteExercise(currentExercise.id);
                  showToast('Deleted');
                } else {
                  await putExercise({ ...currentExercise, archived: !currentExercise.archived, updatedAt: Date.now() });
                  showToast(currentExercise.archived ? 'Unarchived' : 'Archived');
                }
                await load();
                // Move to next, or prev if at end
                const next = filtered[currentIndex + 1] ?? filtered[currentIndex - 1];
                setSelectedId(next?.id ?? null);
              }}
              onPrev={currentIndex > 0 ? goPrev : null}
              onNext={currentIndex < filtered.length - 1 ? goNext : null}
            />
          ) : (
            <div className="ed-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M6.5 6.5h11"/><path d="M6.5 17.5h11"/>
                <path d="M3 9.5h18"/><path d="M3 14.5h18"/>
                <rect x="2" y="6.5" width="2" height="11" rx="1"/><rect x="20" y="6.5" width="2" height="11" rx="1"/>
              </svg>
              <p>Select an exercise to edit</p>
              <p style={{ fontSize: 11, color: 'var(--fg-mute)', marginTop: 6 }}>↑ ↓ arrow keys to navigate</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="ed-toast">{toast}</div>}
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

interface EditFormProps {
  exercise: Exercise;
  index: number;
  total: number;
  saving: boolean;
  onSave: (ex: Exercise) => Promise<void>;
  onDelete: () => Promise<void>;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

function EditForm({ exercise, index, total, saving, onSave, onDelete, onPrev, onNext }: EditFormProps) {
  const [name, setName]           = useState(exercise.name);
  const [muscleGroup, setMuscle]  = useState(exercise.muscleGroup);
  const [secondary, setSecondary] = useState(exercise.secondaryMuscles.join(', '));
  const [equipment, setEquipment] = useState<EquipmentType>(exercise.equipment);
  const [category, setCategory]   = useState<CategoryType>(exercise.category);
  const [videoUrl, setVideoUrl]   = useState(exercise.videoUrl ?? '');
  const [unit, setUnit]           = useState<DefaultUnit>(exercise.defaultUnit);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const videoId = extractYouTubeId(videoUrl || null);
  const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
  const isDirty = name !== exercise.name || muscleGroup !== exercise.muscleGroup ||
    secondary !== exercise.secondaryMuscles.join(', ') || equipment !== exercise.equipment ||
    category !== exercise.category || (videoUrl || null) !== exercise.videoUrl || unit !== exercise.defaultUnit;

  function buildExercise(): Exercise {
    return {
      ...exercise,
      name: name.trim() || exercise.name,
      muscleGroup: muscleGroup.trim().toLowerCase() || exercise.muscleGroup,
      secondaryMuscles: secondary ? secondary.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [],
      equipment,
      category,
      videoUrl: videoUrl.trim() || null,
      defaultUnit: unit,
    };
  }

  // Ctrl/Cmd+S to save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) onSave(buildExercise());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDirty, name, muscleGroup, secondary, equipment, category, videoUrl, unit]); // eslint-disable-line

  return (
    <div className="ed-form">
      {/* Nav header */}
      <div className="ed-form-nav">
        <button className="ed-nav-btn" onClick={onPrev ?? undefined} disabled={!onPrev}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="ed-form-pos">{index + 1} / {total}</span>
        <button className="ed-nav-btn" onClick={onNext ?? undefined} disabled={!onNext}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div style={{ flex: 1 }} />
        {exercise.source === 'custom' && <span className="ed-badge-custom">custom</span>}
        {exercise.archived && <span className="ed-badge-arch">archived</span>}
      </div>

      <div className="ed-form-scroll">
        {/* Name */}
        <div className="ed-field">
          <label className="ed-label">Name</label>
          <input className="ed-input ed-input--lg" value={name} onChange={e => setName(e.target.value)} />
        </div>

        {/* Category */}
        <div className="ed-field">
          <label className="ed-label">Category</label>
          <div className="ed-chip-row">
            {CATEGORIES.map(c => {
              const cc = CATEGORY_COLOR[c];
              const active = category === c;
              return (
                <button
                  key={c}
                  className={`ed-cat-chip${active ? ' active' : ''}`}
                  style={active ? { borderColor: cc, color: cc, background: `${cc}18` } : {}}
                  onClick={() => setCategory(c)}
                  type="button"
                >
                  <CategoryIcon category={c} size={13} color={active ? cc : 'var(--fg-mute)'} />
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Muscle + Equipment */}
        <div className="ed-row-pair">
          <div className="ed-field">
            <label className="ed-label">Muscle Group</label>
            <input className="ed-input" value={muscleGroup} onChange={e => setMuscle(e.target.value)} placeholder="e.g. back" />
          </div>
          <div className="ed-field">
            <label className="ed-label">Equipment</label>
            <select className="ed-select" value={equipment} onChange={e => setEquipment(e.target.value as EquipmentType)}>
              {EQUIPMENT.map(eq => <option key={eq} value={eq}>{eq}</option>)}
            </select>
          </div>
        </div>

        {/* Secondary + Unit */}
        <div className="ed-row-pair">
          <div className="ed-field">
            <label className="ed-label">Secondary Muscles</label>
            <input className="ed-input" value={secondary} onChange={e => setSecondary(e.target.value)} placeholder="biceps, shoulders" />
          </div>
          <div className="ed-field">
            <label className="ed-label">Default Unit</label>
            <select className="ed-select" value={unit ?? ''} onChange={e => setUnit((e.target.value as DefaultUnit) || null)}>
              {UNITS.map(u => <option key={u.label} value={u.value ?? ''}>{u.label}</option>)}
            </select>
          </div>
        </div>

        {/* YouTube */}
        <div className="ed-field">
          <label className="ed-label">
            YouTube URL
            {videoUrl && !videoId && <span className="ed-label-warn"> · Invalid URL</span>}
            {videoId && <span className="ed-label-ok"> · Valid</span>}
          </label>
          <div className="ed-video-row">
            <input
              className={`ed-input${videoUrl && !videoId ? ' ed-input--warn' : ''}`}
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://youtu.be/…"
              type="url"
            />
            {videoUrl && (
              <button className="ed-clear-btn" onClick={() => setVideoUrl('')} title="Clear URL">✕</button>
            )}
          </div>
          {thumbUrl && (
            <div className="ed-thumb-wrap">
              <img src={thumbUrl} alt="Video thumbnail" className="ed-thumb" />
              <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="ed-thumb-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Open in YouTube
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="ed-form-actions">
        {confirmDelete ? (
          <>
            <span className="ed-delete-confirm">
              {exercise.source === 'custom' ? 'Permanently delete?' : (exercise.archived ? 'Unarchive?' : 'Archive?')}
            </span>
            <button className="btn ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button
              className="btn btn-sm"
              style={{ background: exercise.source === 'custom' ? '#E53E3E' : undefined, borderColor: exercise.source === 'custom' ? '#E53E3E' : undefined, color: exercise.source === 'custom' ? '#fff' : undefined }}
              onClick={() => { setConfirmDelete(false); onDelete(); }}
            >
              {exercise.source === 'custom' ? 'Delete' : exercise.archived ? 'Unarchive' : 'Archive'}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn outline btn-sm"
              onClick={() => setConfirmDelete(true)}
            >
              {exercise.source === 'custom' ? 'Delete' : exercise.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              className="btn primary btn-sm"
              disabled={saving || !isDirty}
              onClick={() => onSave(buildExercise())}
              title="Save (Ctrl+S)"
            >
              {saving ? 'Saving…' : isDirty ? 'Save' : 'Saved ✓'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
