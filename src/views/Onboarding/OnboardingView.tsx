import { useEffect, useRef, useState } from 'react';
import { LogoFull } from '../../components/Logo/Logo';
import { useSyncContext } from '../../context/SyncContext';
import { getProfile, setProfile } from '../../db/meta';
import type { UserProfile } from '../../types';
import './Onboarding.css';

interface OnboardingViewProps {
  onDone: () => void;
}

type Step = 'sync' | 'profile';

export function OnboardingView({ onDone }: OnboardingViewProps) {
  const [step, setStep] = useState<Step>('sync');

  return (
    <div className="onboarding-root">
      {step === 'sync' && <SyncStep onStartFresh={() => setStep('profile')} onDone={onDone} />}
      {step === 'profile' && <ProfileStep onDone={onDone} />}
    </div>
  );
}

// ─── Platform detection ───────────────────────────────────────────────────────

type Platform = 'ios' | 'android' | 'other';

function getPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    !!(window.navigator as { standalone?: boolean }).standalone
  );
}

// ─── Install banner ───────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const platform = useRef(getPlatform()).current;

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => setInstalled(true);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  // Already running as PWA or just installed
  if (installed) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  }

  if (platform === 'ios') {
    return (
      <div className="ob-install">
        <div className="ob-install__label">Install IronLog</div>
        <ol className="ob-install__steps">
          <li>
            <span className="ob-install__step-icon">
              {/* iOS share icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 12H3v9h18v-9h-5" />
                <polyline points="12 3 12 15" />
                <polyline points="8 7 12 3 16 7" />
              </svg>
            </span>
            Tap the <strong>Share</strong> button in Safari
          </li>
          <li>
            <span className="ob-install__step-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </span>
            Tap <strong>Add to Home Screen</strong>
          </li>
          <li>
            <span className="ob-install__step-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            Tap <strong>Add</strong> to confirm
          </li>
        </ol>
      </div>
    );
  }

  if (platform === 'android' && deferredPrompt) {
    return (
      <div className="ob-install">
        <div className="ob-install__label">Install IronLog</div>
        <button className="btn outline btn-full" onClick={handleInstall}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a4 4 0 0 0-4 4v6H5l7 7 7-7h-3V6a4 4 0 0 0-4-4z" />
          </svg>
          Add to Home Screen
        </button>
      </div>
    );
  }

  if (platform === 'android') {
    return (
      <div className="ob-install">
        <div className="ob-install__label">Install IronLog</div>
        <p className="ob-install__note">
          Tap the browser menu <strong>⋮</strong> and select <strong>Add to Home Screen</strong>
        </p>
      </div>
    );
  }

  return null;
}

// ─── Step 1: Sync choice ──────────────────────────────────────────────────────

function SyncStep({ onStartFresh, onDone }: { onStartFresh: () => void; onDone: () => void }) {
  const { restoreFromDrive, syncing, error, clearError } = useSyncContext();
  const [restoring, setRestoring] = useState(false);
  const driveConfigured = !!(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined);

  async function handleRestore() {
    clearError();
    setRestoring(true);
    try {
      await restoreFromDrive();
      onDone();
    } catch {
      // error is shown via context state
    } finally {
      setRestoring(false);
    }
  }

  const isLoading = restoring || syncing;

  return (
    <div className="onboarding-step">
      <div className="onboarding-hero">
        <LogoFull markSize={60} />
        <p className="onboarding-tagline">Your Iron Logbook</p>
      </div>

      <div className="onboarding-cards">
        {driveConfigured && (
          <button
            className="onboarding-card"
            onClick={handleRestore}
            disabled={isLoading}
            aria-label="Restore backup from Google Drive"
          >
            <div className="onboarding-card-icon">
              <DriveIcon />
            </div>
            <div className="onboarding-card-text">
              <span className="onboarding-card-title">Restore Backup</span>
              <span className="onboarding-card-subtitle">
                Continue from where you left off on any device
              </span>
            </div>
            {isLoading && restoring && (
              <span className="onboarding-spinner" aria-label="Loading" />
            )}
          </button>
        )}

        <button
          className="onboarding-card onboarding-card--fresh"
          onClick={onStartFresh}
          disabled={isLoading}
          aria-label="Start a new logbook"
        >
          <div className="onboarding-card-icon">
            <PlusIcon />
          </div>
          <div className="onboarding-card-text">
            <span className="onboarding-card-title">Start Fresh</span>
            <span className="onboarding-card-subtitle">
              Set up a new logbook on this device
            </span>
          </div>
        </button>
      </div>

      {!driveConfigured && (
        <p className="onboarding-note">
          Drive sync is not configured — start fresh to continue.
        </p>
      )}

      {error && (
        <div className="onboarding-error">
          <span>{error}</span>
          <button className="btn ghost btn-sm" onClick={clearError}>Dismiss</button>
        </div>
      )}

      <InstallBanner />
    </div>
  );
}

// ─── Step 2: Profile setup ────────────────────────────────────────────────────

function ProfileStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [saving, setSaving] = useState(false);

  async function handleGetStarted() {
    setSaving(true);
    try {
      const existing = await getProfile();
      const updated: UserProfile = { ...existing, name: name.trim(), unit };
      await setProfile(updated);
    } finally {
      setSaving(false);
      onDone();
    }
  }

  return (
    <div className="onboarding-step">
      <div className="onboarding-hero onboarding-hero--compact">
        <LogoFull markSize={40} />
      </div>

      <div className="onboarding-profile-form">
        <div className="onboarding-form-group">
          <label className="onboarding-label" htmlFor="ob-name">Name</label>
          <input
            id="ob-name"
            className="input"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="onboarding-form-group">
          <label className="onboarding-label">Weight Unit</label>
          <div className="onboarding-unit-toggle">
            {(['kg', 'lb'] as const).map(u => (
              <button
                key={u}
                className={`onboarding-unit-btn${unit === u ? ' active' : ''}`}
                onClick={() => setUnit(u)}
                type="button"
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn primary"
          onClick={handleGetStarted}
          disabled={saving}
          style={{ width: '100%', marginTop: 8 }}
        >
          {saving ? 'Saving…' : 'Get Started'}
        </button>

        <button
          className="btn ghost"
          onClick={onDone}
          style={{ width: '100%', marginTop: 4 }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function DriveIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="M43.65 25L29.9 1.2C28.55.4 27 0 25.45 0c-1.55 0-3.1.4-4.5 1.2l-18.6 32.2h27.5z" fill="#00ac47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.75l5.9 10.15z" fill="#ea4335"/>
      <path d="M43.65 25L57.4 1.2C56 .4 54.45 0 52.9 0H34.4c-1.55 0-3.1.4-4.5 1.2z" fill="#00832d"/>
      <path d="M59.8 53H27.5L13.75 76.8c1.4.8 2.95 1.2 4.5 1.2h50.8c1.55 0 3.1-.4 4.5-1.2z" fill="#2684fc"/>
      <path d="M73.4 26.5l-9.3-16.1c-1.35-2.3-3.15-4.15-5.3-5.2L43.65 25l16.1 28H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
