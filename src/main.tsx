import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}

// Apply saved theme before first render (avoids flash)
import { applyTheme, listenForSystemThemeChange } from './lib/theme';
applyTheme();
listenForSystemThemeChange(() => applyTheme());

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

