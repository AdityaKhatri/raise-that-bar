import { useCallback, useEffect, useState } from 'react';
import { getAllExercises, putExercise } from '../db/exercises';
import type { Exercise, ExerciseFilters } from '../types';

function applyFilters(exercises: Exercise[], filters?: ExerciseFilters): Exercise[] {
  let result = exercises;

  if (!filters?.showArchived) {
    result = result.filter(e => !e.archived);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.muscleGroup.toLowerCase().includes(q)
    );
  }
  if (filters?.category) {
    result = result.filter(e => e.category === filters.category);
  }
  if (filters?.muscleGroup) {
    result = result.filter(e => e.muscleGroup === filters.muscleGroup);
  }
  if (filters?.equipment) {
    result = result.filter(e => e.equipment === filters.equipment);
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function useExercises(filters?: ExerciseFilters) {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await getAllExercises();
      setAllExercises(all);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const saveExercise = useCallback(async (ex: Exercise) => {
    const updated = { ...ex, updatedAt: Date.now() };
    await putExercise(updated);
    setAllExercises(prev => {
      const idx = prev.findIndex(e => e.id === ex.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);

  const filtered = applyFilters(allExercises, filters);

  return { exercises: filtered, allExercises, loading, error, saveExercise, reload };
}
