import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSyncMeta, setSyncMeta, setOnboardingDone } from '../db/meta';
import { exportToBackup, mergeFromBackup } from '../lib/sync';
import {
  requestToken,
  getUserInfo,
  findBackupFile,
  downloadBackup,
  uploadBackup,
  isIosPwa,
  initiateOAuthRedirect,
  consumeOAuthRedirectToken,
} from '../lib/gapi';
import type { SyncMeta } from '../db/meta';
import type { OAuthIntent } from '../lib/gapi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncState {
  account: { email: string; name: string } | null;
  syncing: boolean;
  lastSync: number | null;
  error: string | null;
}

interface SyncContextValue extends SyncState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  restoreFromDrive: () => Promise<void>;
  clearError: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const SyncContext = createContext<SyncContextValue | null>(null);

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// In-memory token cache (not persisted — tokens expire in 1h)
let cachedToken: string | null = null;

async function getToken(silent: boolean): Promise<string> {
  if (cachedToken) return cachedToken;
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not configured');
  const token = await requestToken(CLIENT_ID, SCOPE, silent);
  cachedToken = token;
  setTimeout(() => { cachedToken = null; }, 55 * 60 * 1000);
  return token;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncState>({
    account: null,
    syncing: false,
    lastSync: null,
    error: null,
  });

  useEffect(() => {
    cachedToken = null;

    // Check for OAuth redirect return (iOS PWA flow) before loading DB state.
    // consumeOAuthRedirectToken() is synchronous — reads URL hash + localStorage
    // and immediately cleans them up so a reload won't reprocess.
    const redirectResult = consumeOAuthRedirectToken();

    getSyncMeta().then(async meta => {
      if (meta && !redirectResult) {
        // Normal load — restore persisted account
        setState(s => ({
          ...s,
          account: { email: meta.email, name: meta.name },
          lastSync: meta.lastSync,
        }));
      }

      if (redirectResult) {
        // Returning from iOS PWA OAuth redirect — complete the flow
        await completeAfterRedirect(redirectResult.token, redirectResult.intent);
      }
    });
  }, []);

  // Handles the post-redirect auth completion for both 'connect' and 'restore'.
  async function completeAfterRedirect(token: string, intent: OAuthIntent) {
    try {
      setState(s => ({ ...s, syncing: true, error: null }));
      cachedToken = token;

      const userInfo = await getUserInfo(token);
      const now = Date.now();

      if (intent === 'restore') {
        const fileId = await findBackupFile(token);
        if (fileId) {
          const backupData = await downloadBackup(token, fileId);
          await mergeFromBackup(backupData as Parameters<typeof mergeFromBackup>[0]);
        }
        // Upload whatever we have (merged or fresh) and mark onboarding done
        const backup = await exportToBackup();
        const existingId = await findBackupFile(token);
        await uploadBackup(token, backup, existingId);
        await setSyncMeta({ email: userInfo.email, name: userInfo.name, lastSync: now });
        await setOnboardingDone();
        // Reload so App.tsx re-reads onboarding_done from DB and shows main app
        window.location.reload();
      } else {
        // connect — just link the account and upload current data
        const backup = await exportToBackup();
        const existingId = await findBackupFile(token);
        await uploadBackup(token, backup, existingId);
        await setSyncMeta({ email: userInfo.email, name: userInfo.name, lastSync: now });
        setState(s => ({
          ...s,
          account: { email: userInfo.email, name: userInfo.name },
          syncing: false,
          lastSync: now,
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, syncing: false, error: `Auth failed: ${msg}` }));
    }
  }

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  const connect = useCallback(async () => {
    if (!CLIENT_ID) {
      setState(s => ({ ...s, error: 'Google Drive sync is not configured.' }));
      return;
    }
    // iOS PWA: popup won't work — use full-page redirect instead
    if (isIosPwa()) {
      initiateOAuthRedirect(CLIENT_ID, SCOPE, 'connect');
      return; // page navigates away
    }
    try {
      setState(s => ({ ...s, syncing: true, error: null }));
      cachedToken = null;
      const token = await getToken(false);
      const userInfo = await getUserInfo(token);
      const meta: SyncMeta = { email: userInfo.email, name: userInfo.name, lastSync: null };
      await setSyncMeta(meta);
      setState(s => ({ ...s, account: { email: userInfo.email, name: userInfo.name }, syncing: false }));
      await syncNowInternal(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, syncing: false, error: `Connect failed: ${msg}` }));
    }
  }, []);

  async function syncNowInternal(token?: string) {
    try {
      setState(s => ({ ...s, syncing: true, error: null }));
      const t = token ?? await getToken(true);
      const backup = await exportToBackup();
      const existingFileId = await findBackupFile(t);
      await uploadBackup(t, backup, existingFileId);
      const now = Date.now();
      setState(s => {
        const updatedMeta: SyncMeta | null = s.account
          ? { email: s.account.email, name: s.account.name, lastSync: now }
          : null;
        if (updatedMeta) setSyncMeta(updatedMeta);
        return { ...s, syncing: false, lastSync: now };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, syncing: false, error: `Sync failed: ${msg}` }));
    }
  }

  const syncNow = useCallback(async () => {
    await syncNowInternal();
  }, []);

  const disconnect = useCallback(async () => {
    cachedToken = null;
    await setSyncMeta(null);
    setState(s => ({ ...s, account: null, lastSync: null, error: null }));
  }, []);

  const restoreFromDrive = useCallback(async () => {
    if (!CLIENT_ID) {
      setState(s => ({ ...s, error: 'Google Drive sync is not configured.' }));
      throw new Error('Drive sync not configured');
    }
    // iOS PWA: popup won't work — use full-page redirect instead
    if (isIosPwa()) {
      initiateOAuthRedirect(CLIENT_ID, SCOPE, 'restore');
      return; // page navigates away
    }
    try {
      setState(s => ({ ...s, syncing: true, error: null }));
      cachedToken = null;
      const token = await getToken(false);
      const userInfo = await getUserInfo(token);

      const fileId = await findBackupFile(token);
      if (!fileId) {
        const meta: SyncMeta = { email: userInfo.email, name: userInfo.name, lastSync: null };
        await setSyncMeta(meta);
        setState(s => ({ ...s, account: { email: userInfo.email, name: userInfo.name }, syncing: false }));
        return;
      }

      const backupData = await downloadBackup(token, fileId);
      await mergeFromBackup(backupData as Parameters<typeof mergeFromBackup>[0]);
      const now = Date.now();
      const meta: SyncMeta = { email: userInfo.email, name: userInfo.name, lastSync: now };
      await setSyncMeta(meta);
      setState(s => ({
        ...s,
        account: { email: userInfo.email, name: userInfo.name },
        syncing: false,
        lastSync: now,
        error: null,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(s => ({ ...s, syncing: false, error: `Restore failed: ${msg}` }));
      throw err;
    }
  }, []);

  return (
    <SyncContext.Provider value={{
      ...state,
      connect,
      disconnect,
      syncNow,
      restoreFromDrive,
      clearError,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider');
  return ctx;
}
