import { useCallback, useEffect, useState } from 'react';
import { getPlanDay, putPlanDay, getAllPlanDays, deletePlanDay } from '../db/plan';
import type { PlanDay } from '../types';

export function usePlanDay(date: string) {
  const [day, setDay] = useState<PlanDay | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlanDay(date).then(d => {
      setDay(d ?? null);
      setLoading(false);
    });
  }, [date]);

  const saveDay = useCallback(async (updated: PlanDay) => {
    const d = { ...updated, updatedAt: Date.now() };
    await putPlanDay(d);
    setDay(d);
  }, []);

  const removeDay = useCallback(async () => {
    await deletePlanDay(date);
    setDay(null);
  }, [date]);

  return { day, loading, saveDay, removeDay };
}

export function useAllPlanDays() {
  const [days, setDays] = useState<Map<string, PlanDay>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const all = await getAllPlanDays();
    setDays(new Map(all.map(d => [d.date, d])));
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { days, loading, reload: load };
}
