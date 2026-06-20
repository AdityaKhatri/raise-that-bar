import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getActiveSession, setActiveSession } from '../db/meta';
import { putSession } from '../db/sessions';
import { estimateWithBodyweight } from '../lib/calorieEstimator';
import type { Session } from '../types';

interface ActiveSessionContextValue {
  session: Session | null;
  paused: boolean;
  loading: boolean;
  startSession: (session: Session) => Promise<void>;
  resumeSession: (session: Session) => Promise<void>;
  updateSession: (session: Session) => Promise<void>;
  finishSession: () => Promise<Session | null>;
  discardSession: () => Promise<void>;
  pauseSession: () => void;
  unpauseSession: () => void;
}

const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null);

export function ActiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActiveSession().then(s => {
      setSession(s);
      setLoading(false);
    });
  }, []);

  const startSession = useCallback(async (s: Session) => {
    setSession(s);
    await setActiveSession(s);
  }, []);

  // Re-open an already-finished session for editing.
  // The session retains its original finishedAt so finishSession knows not to overwrite timing.
  const resumeSession = useCallback(async (s: Session) => {
    setSession(s);
    await setActiveSession(s);
  }, []);

  const updateSession = useCallback(async (s: Session) => {
    const updated = { ...s, updatedAt: Date.now() };
    setSession(updated);
    await setActiveSession(updated);
  }, []);

  const finishSession = useCallback(async (): Promise<Session | null> => {
    if (!session) return null;
    const now = Date.now();
    const wasAlreadyFinished = session.finishedAt !== null;
    const finished: Session = {
      ...session,
      finishedAt: wasAlreadyFinished ? session.finishedAt : now,
      durationMs: wasAlreadyFinished ? session.durationMs : now - session.startedAt,
      updatedAt: now,
    };

    const withKcal: Session = {
      ...finished,
      estimatedKcal: await estimateWithBodyweight(finished),
    };

    await putSession(withKcal);
    await setActiveSession(null);
    setSession(null);
    return withKcal;
  }, [session]);

  const discardSession = useCallback(async () => {
    setPaused(false);
    setSession(null);
    await setActiveSession(null);
  }, []);

  const pauseSession = useCallback(() => setPaused(true), []);
  const unpauseSession = useCallback(() => setPaused(false), []);

  return (
    <ActiveSessionContext.Provider value={{
      session,
      paused,
      loading,
      startSession,
      resumeSession,
      updateSession,
      finishSession,
      discardSession,
      pauseSession,
      unpauseSession,
    }}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActiveSession(): ActiveSessionContextValue {
  const ctx = useContext(ActiveSessionContext);
  if (!ctx) throw new Error('useActiveSession must be used within ActiveSessionProvider');
  return ctx;
}
