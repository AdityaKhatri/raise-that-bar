import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Modal } from '../Modal/Modal';
import './ScanModal.css';

interface Props {
  onDetected: (url: string) => void;
  onClose: () => void;
}

type ScanStatus = 'requesting' | 'scanning' | 'error';

export function ScanModal({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<ScanStatus>('requesting');
  const [errorMsg, setErrorMsg] = useState('');
  const detectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
        tick();
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : 'Camera access denied');
          setStatus('error');
        }
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, canvas.width, canvas.height);

      if (result?.data && !detectedRef.current) {
        detectedRef.current = true;
        cleanup();
        onDetected(result.data);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    function cleanup() {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [onDetected]);

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

        <div className="scan-modal__viewfinder" style={{ display: status === 'scanning' ? 'block' : 'none' }}>
          <video
            ref={videoRef}
            className="scan-video"
            playsInline
            muted
            autoPlay
          />
          <div className="scan-overlay">
            <div className="scan-frame">
              <div className="scan-frame-inner" />
            </div>
          </div>
          <p className="scan-hint">Point at an IronLog QR code</p>
        </div>

        {/* Hidden canvas used for frame decoding */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </Modal>
  );
}
