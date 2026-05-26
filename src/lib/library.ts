import { parseLibraryCsv } from './csv';
import { mergeExerciseLibrary } from '../db/exercises';
import { getMeta } from '../db/meta';

export async function syncLibraryFromGitHub(): Promise<{ inserted: number; updated: number }> {
  const url = `${import.meta.env.BASE_URL}library.csv`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseLibraryCsv(text);
  if (rows.length === 0) throw new Error('CSV appears empty or invalid');
  return mergeExerciseLibrary(rows);
}

/** Returns the timestamp of the last library sync, or null if never synced. */
export async function getLibraryLastSynced(): Promise<number | null> {
  const v = await getMeta<number>('library_imported_at');
  return v ?? null;
}
