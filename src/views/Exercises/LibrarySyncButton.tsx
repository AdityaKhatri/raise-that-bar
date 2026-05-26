import { useState } from 'react';
import { syncLibraryFromGitHub } from '../../lib/library';

interface Props {
  onSynced: () => void;
}

export function LibrarySyncButton({ onSynced }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  async function handleSync() {
    setStatus('loading');
    setMsg('');
    try {
      const { inserted, updated } = await syncLibraryFromGitHub();
      setMsg(`${inserted} new · ${updated} updated`);
      setStatus('ok');
      onSynced();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setStatus('err');
    }
  }

  return (
    <div>
      <button
        className="btn ghost btn-sm btn-full"
        style={{ justifyContent: 'flex-start', flex: 'none', width: '100%' }}
        onClick={handleSync}
        disabled={status === 'loading'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
        </svg>
        {status === 'loading' ? 'Syncing…' : 'Sync Library from GitHub'}
      </button>
      {msg && (
        <div style={{
          fontSize: 11,
          fontFamily: 'var(--mono)',
          padding: '3px 8px',
          color: status === 'err' ? '#fc8181' : 'var(--grp-cardio)',
        }}>
          {msg}
        </div>
      )}
    </div>
  );
}
