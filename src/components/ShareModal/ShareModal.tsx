import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from '../Modal/Modal';
import { buildSharePayload, encodeWorkoutPayload, buildShareUrl } from '../../lib/share';
import type { Workout } from '../../types';
import './ShareModal.css';

// QR version 40 fits ~2953 bytes of binary. We cap at 2800 to be safe.
const QR_BYTE_LIMIT = 2800;

interface Props {
  workout: Workout;
  onClose: () => void;
}

export function ShareModal({ workout, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [tooLong, setTooLong] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'building' | 'ready' | 'error'>('building');
  const [errorMsg, setErrorMsg] = useState('');

  // Effect 1: build the URL
  useEffect(() => {
    let cancelled = false;
    async function build() {
      try {
        const payload = await buildSharePayload(workout);
        const encoded = await encodeWorkoutPayload(payload);
        const shareUrl = buildShareUrl(encoded);
        if (cancelled) return;
        const byteLen = new TextEncoder().encode(shareUrl).length;
        if (byteLen > QR_BYTE_LIMIT) setTooLong(true);
        setUrl(shareUrl);
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : 'Failed to build share link');
          setStatus('error');
        }
      }
    }
    build();
    return () => { cancelled = true; };
  }, [workout]);

  // Effect 2: render QR after canvas is in the DOM (status === 'ready')
  useEffect(() => {
    if (!url || tooLong || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 280,
      margin: 2,
      color: {
        dark: '#f5f2eb',
        light: '#15151a',
      },
    }).catch((e: unknown) => {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to render QR');
      setStatus('error');
    });
  }, [url, tooLong]);

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleNativeShare() {
    if (!url) return;
    try {
      await navigator.share({ title: workout.name, url });
    } catch {
      // User cancelled or not supported — fall back to copy
      handleCopy();
    }
  }

  async function handleDownload() {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${workout.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-qr.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

  const canNativeShare = typeof navigator.share === 'function';

  return (
    <Modal open onClose={onClose} title={`Share "${workout.name}"`} size="md">
      <div className="share-modal">
        {status === 'building' && (
          <div className="share-modal__loading">
            <div className="share-spinner" />
            Building link…
          </div>
        )}

        {status === 'error' && (
          <div className="share-modal__error">{errorMsg}</div>
        )}

        {status === 'ready' && (
          <>
            {/* QR or too-long notice */}
            {tooLong ? (
              <div className="share-modal__toolong">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p>This workout is too large for a QR code. Use the copy link button below.</p>
              </div>
            ) : (
              <div className="share-modal__qr">
                <canvas ref={canvasRef} className="share-qr-canvas" />
                <p className="share-modal__scan-hint">Scan to import into IronLog</p>
              </div>
            )}

            {/* Actions */}
            <div className="share-modal__actions">
              {canNativeShare ? (
                <button className="btn primary btn-full" onClick={handleNativeShare}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  Share
                </button>
              ) : null}

              <button className="btn outline btn-full" onClick={handleCopy}>
                {copied ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy Link
                  </>
                )}
              </button>

              {!tooLong && (
                <button className="btn ghost btn-full" onClick={handleDownload}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download QR
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
