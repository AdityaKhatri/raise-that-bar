import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Modal } from '../Modal/Modal';
import './ScanModal.css';

interface Props {
  onDetected: (url: string) => void;
  onClose: () => void;
}

type Status = 'requesting' | 'live' | 'scanning' | 'error';

export function ScanModal({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>('requesting');
  const [errorMsg, setErrorMsg] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setStatus('live');
      })
      .catch(e => {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : 'Camera access denied');
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  function captureAndScan() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return;

    setStatus('scanning');
    setNotFound(false);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, canvas.width, canvas.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (result?.data) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      onDetected(result.data);
    } else {
      setNotFound(true);
      setStatus('live');
    }
  }

  const showViewfinder = status === 'live' || status === 'scanning';

  return (
    <Modal open onClose={onClose} title="Scan QR Code" size="md">
      <div className="scan-modal">
        {status === 'requesting' && (
          <div className="scan-modal__state">
            <div className="scan-spinner" />
            <p>Requesting camera…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="scan-modal__state scan-modal__state--error">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>{errorMsg || 'Camera unavailable'}</p>
          </div>
        )}

        <div className="scan-modal__viewfinder" style={{ display: showViewfinder ? 'block' : 'none' }}>
          <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
          <div className="scan-overlay">
            <div className="scan-frame">
              <div className="scan-frame-inner" />
            </div>
          </div>
          <p className={`scan-hint${notFound ? ' scan-hint--error' : ''}`}>
            {notFound ? 'No QR code found — try again' : 'Position the QR code in the frame'}
          </p>
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {showViewfinder && (
          <button
            className="btn primary btn-full"
            onClick={captureAndScan}
            disabled={status === 'scanning'}
          >
            {status === 'scanning' ? 'Scanning…' : 'Scan'}
          </button>
        )}
      </div>
    </Modal>
  );
}
