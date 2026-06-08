import type { CategoryType } from '../../types';

interface CategoryIconProps {
  category: CategoryType | string;
  size?: number;
  color?: string;
}

export function CategoryIcon({ category, size = 16, color = 'currentColor' }: CategoryIconProps) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (category) {
    case 'warmup':
      // Flame
      return (
        <svg {...props}>
          <path d="M8.5 14.5A4.5 4.5 0 0 0 17 14c0-4-3-5.5-3-5.5s.5 3-2 4c0-2-2-4-2-4S8.5 10.5 8.5 14.5Z" />
          <path d="M12 21c-3.3 0-6-2.7-6-6 0-4 3-7 3-7s0 1.5 1.5 2.5C11 9 12 7 12 7c1.5 2 4 4 4 8 0 3.3-2.7 6-6 6Z" />
        </svg>
      );

    case 'stretching':
      // Person stretching / flexibility
      return (
        <svg {...props}>
          <circle cx="12" cy="4" r="1.5" />
          <path d="M4 8h16" />
          <path d="M7 8l1 6-4 6" />
          <path d="M17 8l-1 6 4 6" />
          <path d="M10 14l2 4 2-4" />
        </svg>
      );

    case 'muscle':
      // Dumbbell
      return (
        <svg {...props}>
          <path d="M6 5v14" strokeWidth={2.5} />
          <path d="M18 5v14" strokeWidth={2.5} />
          <path d="M6 9h12" strokeWidth={3} />
          <rect x="3" y="6" width="3" height="12" rx="1" />
          <rect x="18" y="6" width="3" height="12" rx="1" />
        </svg>
      );

    case 'cardio':
      // Heart pulse
      return (
        <svg {...props}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          <polyline points="3 12 6 12 8 9 10 15 12 11 14 13 16 12 21 12" strokeWidth={1.5} />
        </svg>
      );

    case 'cooldown':
      // Snowflake
      return (
        <svg {...props}>
          <line x1="12" y1="2" x2="12" y2="22" />
          <path d="m17 7-5 5-5-5" />
          <path d="m17 17-5-5-5 5" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="m7 7-5 5 5 5" />
          <path d="m17 7 5 5-5 5" />
        </svg>
      );

    default:
      // Generic activity circle
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 8 12 12 14 14" />
        </svg>
      );
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export const CATEGORY_COLOR: Record<string, string> = {
  warmup:     '#d4a13c',
  stretching: '#5fb8a8',
  muscle:     '#ff5a1f',
  cardio:     '#6aa86a',
  cooldown:   '#4a8fd6',
};

// eslint-disable-next-line react-refresh/only-export-components
export const CATEGORY_LABEL: Record<string, string> = {
  warmup:     'Warm-up',
  stretching: 'Stretch',
  muscle:     'Strength',
  cardio:     'Cardio',
  cooldown:   'Cool-down',
};
