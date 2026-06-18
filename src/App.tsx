import { useCallback, useEffect, useRef, useState } from 'react';
import { useActiveSession } from './context/ActiveSessionContext';
import { BottomNav } from './components/BottomNav/BottomNav';
import { TodayView } from './views/Today/TodayView';
import { PlanView } from './views/Plan/PlanView';
import { WorkoutsView } from './views/Workouts/WorkoutsView';
import { ExercisesView } from './views/Exercises/ExercisesView';
import { ProfileView } from './views/Profile/ProfileView';
import { ProgressView } from './views/Progress/ProgressView';
import { AnalyzeView } from './views/Analyze/AnalyzeView';
import { ExerciseEditorView } from './views/ExerciseEditor/ExerciseEditorView';
import { OnboardingView } from './views/Onboarding/OnboardingView';
import { ActiveSessionProvider } from './context/ActiveSessionContext';
import { SyncProvider } from './context/SyncContext';
import { getOnboardingDone, setOnboardingDone } from './db/meta';
import { syncLibraryFromGitHub, getLibraryLastSynced } from './lib/library';
import {
  decodeWorkoutPayload, previewImport,
  extractImportFragment, clearImportFragment,
} from './lib/share';
import type { SharePayload, ImportPreview } from './lib/share';
import { ImportSheet } from './components/ImportSheet/ImportSheet';
import type { ViewId } from './types';

// ─── More Sheet ───────────────────────────────────────────────────────────────

const MORE_ITEMS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'library',
    label: 'Exercises',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 10h16M4 14h10" />
      </svg>
    ),
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="3" y1="20" x2="21" y2="20" />
      </svg>
    ),
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
        <line x1="11" y1="8" x2="11" y2="14" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile & Settings',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

function MoreSheet({ onClose, onNavigate }: { onClose: () => void; onNavigate: (v: ViewId) => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      {/* backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      {/* sheet */}
      <div
        style={{
          position: 'relative',
          background: 'var(--surface)',
          borderRadius: '12px 12px 0 0',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--line-2)' }} />
        </div>

        {MORE_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 16,
              padding: '14px 20px', background: 'none', border: 'none',
              borderBottom: '1px solid var(--line-1)', color: 'var(--fg)',
              fontFamily: 'var(--mono)', fontSize: 14, letterSpacing: '0.04em',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ color: 'var(--fg-mute)' }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

// ─── Conditional Nav ─────────────────────────────────────────────────────────

function ConditionalNav({ current, onChange, onMore }: { current: ViewId; onChange: (v: ViewId) => void; onMore: () => void }) {
  const { session, paused } = useActiveSession();
  if (session && !paused) return null;
  return <BottomNav current={current} onChange={onChange} onMore={onMore} />;
}

// ─── Splash screen ────────────────────────────────────────────────────────────

// ─── SW update detection ──────────────────────────────────────────────────────

function useUpdatePrompt() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const refreshing = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Reload once the new SW takes the controller slot (after SKIP_WAITING)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing.current) { refreshing.current = true; window.location.reload(); }
    });

    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return;
      // New SW already waiting (e.g. user had tab open during deploy)
      if (reg.waiting) { setWaitingSW(reg.waiting); return; }
      // New SW installs while app is open
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingSW(sw);
          }
        });
      });
      // Trigger an update check each time the app opens
      reg.update().catch(() => {/* offline, ignore */});
    });
  }, []);

  const applyUpdate = useCallback(() => {
    waitingSW?.postMessage({ type: 'SKIP_WAITING' });
  }, [waitingSW]);

  return { updateAvailable: !!waitingSW, applyUpdate };
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const { updateAvailable, applyUpdate } = useUpdatePrompt();
  const [onboardingDone, setOnboardingDoneState] = useState<boolean | null>(null);
  const [view, setView] = useState<ViewId>('today');
  const [moreOpen, setMoreOpen] = useState(false);
  const [importState, setImportState] = useState<{
    payload: SharePayload;
    preview: ImportPreview;
  } | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  useEffect(() => {
    getOnboardingDone().then(done => {
      setOnboardingDoneState(done);
      const splash = document.getElementById('splash');
      if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 350);
      }
    });
  }, []);

  // Detect #import= fragment and prepare the confirmation sheet.
  // On iOS, shared links always open in Safari rather than the installed PWA.
  // To bridge this: when the link opens in browser mode, persist the payload in
  // localStorage so the PWA picks it up on next launch from the home screen.
  useEffect(() => {
    const PENDING_KEY = 'rtb_pending_import';
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      !!(window.navigator as { standalone?: boolean }).standalone;

    const encoded = extractImportFragment();

    if (encoded) {
      clearImportFragment();
      // Save to localStorage so the PWA can pick it up even if this is the browser
      localStorage.setItem(PENDING_KEY, encoded);
      decodeWorkoutPayload(encoded)
        .then(payload => previewImport(payload).then(preview => setImportState({ payload, preview })))
        .catch(() => {/* invalid link — silently ignore */});
      return;
    }

    // Running as installed PWA — check for a payload saved from a browser session
    if (isStandalone) {
      const pending = localStorage.getItem(PENDING_KEY);
      if (pending) {
        localStorage.removeItem(PENDING_KEY);
        decodeWorkoutPayload(pending)
          .then(payload => previewImport(payload).then(preview => setImportState({ payload, preview })))
          .catch(() => {});
      }
    }
  }, []);

  // Auto-sync library from GitHub on every app launch.
  // On first launch (never synced): runs immediately so exercises/videos are available.
  // On subsequent launches: runs silently in the background so video URLs stay fresh.
  useEffect(() => {
    if (!onboardingDone) return;
    getLibraryLastSynced().then(lastSynced => {
      // Always sync: first-time or to pick up video/exercise updates from GitHub
      syncLibraryFromGitHub().catch(() => {
        // Network unavailable — not an error, user is offline
      });
      void lastSynced; // used only to decide priority; sync always runs
    });
  }, [onboardingDone]);

  async function handleOnboardingDone() {
    await setOnboardingDone();
    setOnboardingDoneState(true);
  }

  if (onboardingDone === null) {
    return null;
  }

  if (!onboardingDone) {
    return (
      <SyncProvider>
        <OnboardingView onDone={handleOnboardingDone} />
      </SyncProvider>
    );
  }

  // Editor is an overlay — keep the previous view so the nav tab stays correct.
  // More-group views highlight the More tab.
  const navView: ViewId = view === 'editor' ? 'library' : view;

  return (
    <SyncProvider>
      <ActiveSessionProvider>
        <main style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {view === 'today'    && <TodayView />}
          {view === 'plan'     && <PlanView />}
          {view === 'workouts' && <WorkoutsView />}
          {view === 'library'  && <ExercisesView onOpenEditor={() => setView('editor')} />}
          {view === 'profile'  && <ProfileView />}
          {view === 'progress' && <ProgressView onBack={() => setView('today')} />}
          {view === 'analyze'  && <AnalyzeView onBack={() => setView('today')} />}
          {view === 'editor'   && <ExerciseEditorView onBack={() => setView('library')} />}
        </main>
        <ConditionalNav current={navView} onChange={setView} onMore={() => setMoreOpen(true)} />

        {/* More sheet */}
        {moreOpen && (
          <MoreSheet
            onClose={() => setMoreOpen(false)}
            onNavigate={v => { setMoreOpen(false); setView(v); }}
          />
        )}

        {/* Update available banner */}
        {updateAvailable && (
          <div style={{
            position: 'fixed',
            top: 'env(safe-area-inset-top, 0px)',
            left: 0, right: 0,
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line-2)',
            color: 'var(--fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            letterSpacing: '0.04em',
            zIndex: 500,
          }}>
            <span>Update available</span>
            <button
              onClick={applyUpdate}
              style={{
                background: 'var(--accent)',
                color: '#0a0a0c',
                border: 'none',
                borderRadius: 4,
                padding: '5px 12px',
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              RELOAD
            </button>
          </div>
        )}

        {/* Import confirmation sheet */}
        {importState && (
          <ImportSheet
            payload={importState.payload}
            preview={importState.preview}
            onDone={name => {
              setImportState(null);
              setImportSuccess(name);
              setView('workouts');
              setTimeout(() => setImportSuccess(null), 4000);
            }}
            onCancel={() => setImportState(null)}
          />
        )}

        {/* Import success toast */}
        {importSuccess && (
          <div style={{
            position: 'fixed',
            bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
            left: 16, right: 16,
            background: 'var(--grp-cardio)',
            color: '#fff',
            borderRadius: 4,
            padding: '10px 14px',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.06em',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            "{importSuccess}" added to Workouts
          </div>
        )}
      </ActiveSessionProvider>
    </SyncProvider>
  );
}

export default App;
