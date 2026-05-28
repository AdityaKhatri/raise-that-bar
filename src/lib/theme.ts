export type ThemeKey =
  | 'iron' | 'paper'
  | 'graphite' | 'clinic'
  | 'bourbon' | 'bone'
  | 'moss' | 'linen'
  | 'onyx' | 'blossom'
  | 'plum' | 'mist'
  | 'ember' | 'chalk'
  | 'cobalt' | 'frost'
  | 'cinder' | 'cream';

export interface ThemeInfo {
  key: ThemeKey;
  label: string;
  bg: string;
  surface: string;
  accent: string;
  fg: string;
}

export const THEME_PAIRS: { pairName: string; dark: ThemeInfo; light: ThemeInfo }[] = [
  {
    pairName: 'Iron × Paper',
    dark:  { key: 'iron',     label: 'Iron',     bg: '#0a0a0c', surface: '#15151a', accent: '#ff5a1f', fg: '#f5f2eb' },
    light: { key: 'paper',    label: 'Paper',    bg: '#f5f2eb', surface: '#ffffff', accent: '#c94411', fg: '#1a1714' },
  },
  {
    pairName: 'Graphite × Clinic',
    dark:  { key: 'graphite', label: 'Graphite', bg: '#0f1318', surface: '#1a1f26', accent: '#5c8aff', fg: '#e6ebf0' },
    light: { key: 'clinic',   label: 'Clinic',   bg: '#fafbfc', surface: '#ffffff', accent: '#2563eb', fg: '#0d1117' },
  },
  {
    pairName: 'Bourbon × Bone',
    dark:  { key: 'bourbon',  label: 'Bourbon',  bg: '#161210', surface: '#1f1a16', accent: '#d18847', fg: '#f0e3cf' },
    light: { key: 'bone',     label: 'Bone',     bg: '#ecdfc8', surface: '#f7eed8', accent: '#8c3a14', fg: '#2b1f10' },
  },
  {
    pairName: 'Moss × Linen',
    dark:  { key: 'moss',     label: 'Moss',     bg: '#0e1410', surface: '#18211b', accent: '#9bcc72', fg: '#e8ede5' },
    light: { key: 'linen',    label: 'Linen',    bg: '#f1ede3', surface: '#faf6ec', accent: '#3f6b2f', fg: '#1f2519' },
  },
  {
    pairName: 'Onyx × Blossom',
    dark:  { key: 'onyx',     label: 'Onyx',     bg: '#0a0a0c', surface: '#16161b', accent: '#ff3b8e', fg: '#f5f3f7' },
    light: { key: 'blossom',  label: 'Blossom',  bg: '#fafafa', surface: '#ffffff', accent: '#d11475', fg: '#110a11' },
  },
  {
    pairName: 'Plum × Mist',
    dark:  { key: 'plum',     label: 'Plum',     bg: '#150f18', surface: '#1f1622', accent: '#c08fff', fg: '#ede5f0' },
    light: { key: 'mist',     label: 'Mist',     bg: '#f5f3f7', surface: '#ffffff', accent: '#6e3aa7', fg: '#1a1320' },
  },
  {
    pairName: 'Ember × Chalk',
    dark:  { key: 'ember',    label: 'Ember',    bg: '#0e0a0a', surface: '#1a1414', accent: '#ff3a2a', fg: '#f0e8e3' },
    light: { key: 'chalk',    label: 'Chalk',    bg: '#fafaf7', surface: '#ffffff', accent: '#c41a0c', fg: '#1a1310' },
  },
  {
    pairName: 'Cobalt × Frost',
    dark:  { key: 'cobalt',   label: 'Cobalt',   bg: '#0a1018', surface: '#121a26', accent: '#22d3ee', fg: '#e6f0f7' },
    light: { key: 'frost',    label: 'Frost',    bg: '#f3f7fa', surface: '#ffffff', accent: '#0e7490', fg: '#0a1620' },
  },
  {
    pairName: 'Cinder × Cream',
    dark:  { key: 'cinder',   label: 'Cinder',   bg: '#0f0d0a', surface: '#1a1612', accent: '#e8b53b', fg: '#f0eadd' },
    light: { key: 'cream',    label: 'Cream',    bg: '#f7f1de', surface: '#fffaea', accent: '#8a6310', fg: '#1d1a0e' },
  },
];

const STORAGE_KEY = 'iron_log_theme_v2';

export function getTheme(): ThemeKey {
  return (localStorage.getItem(STORAGE_KEY) as ThemeKey) ?? 'iron';
}

export function applyTheme(key?: ThemeKey) {
  const theme = key ?? getTheme();
  const html = document.documentElement;
  // Remove any existing theme- classes and old data-theme attribute
  Array.from(html.classList)
    .filter(c => c.startsWith('theme-'))
    .forEach(c => html.classList.remove(c));
  html.removeAttribute('data-theme');
  html.classList.add(`theme-${theme}`);
  if (key !== undefined) localStorage.setItem(STORAGE_KEY, key);
}
