import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/iron-log/sw.js', { scope: '/iron-log/' });
  });
}

// Apply saved theme before first render
const savedTheme = localStorage.getItem('iron_log_theme');
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}

import { ActiveSessionProvider } from './context/ActiveSessionContext';
import { PreferencesProvider } from './context/PreferencesContext';
import './styles/global.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <ActiveSessionProvider>
        <App />
      </ActiveSessionProvider>
    </PreferencesProvider>
  </StrictMode>
);
