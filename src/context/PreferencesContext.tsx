import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getPreferences, setPreferences } from '../db/meta';
import type { Preferences } from '../types';

const DEFAULT_PREFS: Preferences = {
  unit: 'kg',
  restTimerSound: true,
  theme: 'system',
};

interface PreferencesContextValue {
  prefs: Preferences;
  updatePrefs: (partial: Partial<Preferences>) => Promise<void>;
  loading: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPreferences().then(p => {
      setPrefs(p);
      setLoading(false);
    });
  }, []);

  const updatePrefs = useCallback(async (partial: Partial<Preferences>) => {
    const updated = { ...prefs, ...partial };
    setPrefs(updated);
    await setPreferences(updated);
  }, [prefs]);

  return (
    <PreferencesContext.Provider value={{ prefs, updatePrefs, loading }}>
      {children}
    </PreferencesContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
