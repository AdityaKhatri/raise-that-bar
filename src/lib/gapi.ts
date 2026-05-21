/**
 * Google Identity Services (GIS) wrapper.
 * No external packages — uses dynamic script loading and fetch().
 */

// ─── GIS Type declarations ────────────────────────────────────────────────────

interface TokenClientConfig {
  client_id: string;
  scope: string;
  prompt: '' | 'none';
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type: string }) => void;
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: Partial<TokenClientConfig>) => void;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GisAccounts {
  oauth2: {
    initTokenClient(config: TokenClientConfig): TokenClient;
  };
}

interface GisApi {
  accounts: GisAccounts;
}

declare global {
  interface Window {
    google?: GisApi;
  }
}

// ─── iOS PWA detection ────────────────────────────────────────────────────────

/**
 * Returns true when running as an installed PWA on iOS (standalone mode).
 * In this mode, window.open() spawns a separate Safari process and the
 * OAuth postMessage callback never reaches the PWA — sign-in silently breaks.
 */
export function isIosPwa(): boolean {
  return (
    // @ts-expect-error navigator.standalone is iOS-only
    typeof navigator.standalone === 'boolean' && navigator.standalone === true
  );
}

// ─── OAuth redirect flow (iOS PWA) ───────────────────────────────────────────
//
// GIS uses window.open() (popup) which is broken in iOS PWA standalone mode.
// Instead, we do a full-page redirect to Google OAuth. On return, Google
// redirects back to the app URL with #access_token=... in the hash.
// iOS 16.4+ reopens the installed PWA URL in the same PWA context.

const OAUTH_STATE_KEY  = 'iron_log_oauth_state';
const OAUTH_INTENT_KEY = 'iron_log_oauth_intent';

export type OAuthIntent = 'connect' | 'restore';

export function initiateOAuthRedirect(
  clientId: string,
  scopes: string,
  intent: OAuthIntent,
): void {
  // CSRF state token
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  localStorage.setItem(OAUTH_STATE_KEY, state);
  localStorage.setItem(OAUTH_INTENT_KEY, intent);

  // Use BASE_URL (set by Vite) so the URI is always consistent regardless of
  // current pathname — PWA standalone mode can differ from browser pathname.
  const redirectUri = `${window.location.origin}${import.meta.env.BASE_URL}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: scopes,
    state,
    include_granted_scopes: 'true',
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Call once on app mount. Checks if the current URL contains an OAuth redirect
 * result. If so, validates the CSRF state, cleans the URL, and returns the
 * token + original intent. Returns null if this is not a post-redirect load.
 */
export function consumeOAuthRedirectToken(): { token: string; intent: OAuthIntent } | null {
  const hash = window.location.hash.slice(1);
  if (!hash || !hash.includes('access_token')) return null;

  const params    = new URLSearchParams(hash);
  const token     = params.get('access_token');
  const retState  = params.get('state');
  const savedState  = localStorage.getItem(OAUTH_STATE_KEY);
  const intent    = localStorage.getItem(OAUTH_INTENT_KEY) as OAuthIntent | null;

  // Clean up regardless so we don't re-process on reload
  history.replaceState(null, '', window.location.pathname);
  localStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(OAUTH_INTENT_KEY);

  if (!token || retState !== savedState) return null;
  return { token, intent: intent ?? 'connect' };
}

// ─── Script loading ───────────────────────────────────────────────────────────

let gisLoadPromise: Promise<void> | null = null;

export async function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;

  if (!gisLoadPromise) {
    gisLoadPromise = new Promise<void>((resolve, reject) => {
      // Already injected but not yet loaded?
      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('GIS script failed to load')));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('GIS script failed to load'));
      document.head.appendChild(script);
    });
  }

  return gisLoadPromise;
}

// ─── Token acquisition ────────────────────────────────────────────────────────

export async function requestToken(
  clientId: string,
  scopes: string,
  silent: boolean,
): Promise<string> {
  await loadGis();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes,
      prompt: silent ? 'none' : '',
      callback: (response: TokenResponse) => {
        if (response.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error(response.error ?? 'Token request failed'));
        }
      },
      error_callback: (error: { type: string }) => {
        reject(new Error(error.type));
      },
    });

    client.requestAccessToken();
  });
}

// ─── User info ────────────────────────────────────────────────────────────────

export async function getUserInfo(token: string): Promise<{ email: string; name: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`getUserInfo failed: ${res.status}`);
  }

  const data = await res.json() as { email: string; name: string };
  return { email: data.email, name: data.name };
}

// ─── Drive appDataFolder helpers ──────────────────────────────────────────────

const BACKUP_FILE_NAME = 'iron-log-backup.json';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export async function findBackupFile(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name)',
    q: `name = '${BACKUP_FILE_NAME}'`,
  });

  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`findBackupFile failed: ${res.status}`);
  }

  const data = await res.json() as { files: Array<{ id: string; name: string }> };
  return data.files.length > 0 ? data.files[0].id : null;
}

export async function downloadBackup(token: string, fileId: string): Promise<unknown> {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`downloadBackup failed: ${res.status}`);
  }

  return res.json();
}

export async function uploadBackup(
  token: string,
  data: unknown,
  existingFileId: string | null,
): Promise<string> {
  const body = JSON.stringify(data);
  const blob = new Blob([body], { type: 'application/json' });

  if (existingFileId) {
    // Update existing file
    const res = await fetch(`${DRIVE_UPLOAD_URL}/${existingFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: blob,
    });

    if (!res.ok) {
      throw new Error(`uploadBackup (update) failed: ${res.status}`);
    }

    const result = await res.json() as { id: string };
    return result.id;
  } else {
    // Create new file in appDataFolder
    // Use multipart upload to set metadata + content in one request
    const metadata = {
      name: BACKUP_FILE_NAME,
      parents: ['appDataFolder'],
    };

    const boundary = 'iron_log_boundary';
    const multipart = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      body,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipart,
    });

    if (!res.ok) {
      throw new Error(`uploadBackup (create) failed: ${res.status}`);
    }

    const result = await res.json() as { id: string };
    return result.id;
  }
}
