import { useCallback, useEffect, useState } from 'react';
import { getAllSessions, getCurrentStreak, getRecentSessions } from '../db/sessions';
import type { Session } from '../types';

export type SessionFilter = 'all' | 'planned' | 'unplanned';

export function useSessions(filter: SessionFilter = 'all') {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await getAllSessions();
    const filtered = filter === 'all' ? all
      : filter === 'planned' ? all.filter(s => !s.unplanned)
      : all.filter(s => s.unplanned);
    setSessions(filtered);
    setLoading(false);
  }, [filter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { sessions, loading, reload: load };
}

export function useQuickStats() {
  const [streak, setStreak] = useState(0);
  const [thisWeek, setThisWeek] = useState(0);
  const [allTime, setAllTime] = useState(0);

  useEffect(() => {
    getCurrentStreak().then(setStreak);
    getRecentSessions(7).then(s => setThisWeek(s.filter(x => x.finishedAt).length));
    getAllSessions().then(s => setAllTime(s.filter(x => x.finishedAt).length));
  }, []);

  return { streak, thisWeek, allTime };
}
