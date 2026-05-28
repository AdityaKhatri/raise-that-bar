import type { ReactNode } from 'react';
import { LogoMark } from '../Logo/Logo';

interface TopbarProps {
  title: string;
  right?: ReactNode;
  /** When provided, renders a back chevron instead of the logo mark. */
  onBack?: () => void;
}

export function Topbar({ title, right, onBack }: TopbarProps) {
  return (
    <div className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      ) : (
        <LogoMark size={20} />
      )}
      <span className="crumb">{title}</span>
      {right}
    </div>
  );
}
