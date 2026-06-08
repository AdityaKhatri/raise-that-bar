import { useEffect, useState } from 'react';
import './Toast.css';

export type ToastKind = 'ok' | 'err' | 'info';

interface ToastProps {
  message: string;
  kind?: ToastKind;
  duration?: number;
  onDone: () => void;
}

export function Toast({ message, kind = 'info', duration = 2800, onDone }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hide = setTimeout(() => setVisible(false), duration);
    const remove = setTimeout(onDone, duration + 300);
    return () => { clearTimeout(hide); clearTimeout(remove); };
  }, [duration, onDone]);

  return (
    <div className={`toast toast--${kind} ${visible ? 'toast--in' : 'toast--out'}`}>
      {message}
    </div>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface ToastEntry { id: number; message: string; kind: ToastKind }

let _nextId = 0;

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  function show(message: string, kind: ToastKind = 'info') {
    const id = _nextId++;
    setToasts(t => [...t, { id, message, kind }]);
  }

  function dismiss(id: number) {
    setToasts(t => t.filter(x => x.id !== id));
  }

  return { toasts, show, dismiss };
}

// ─── Container ────────────────────────────────────────────────────────────────

export function ToastContainer({ toasts, onDismiss }: {
  toasts: ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <Toast key={t.id} message={t.message} kind={t.kind} onDone={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}
