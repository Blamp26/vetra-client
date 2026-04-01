// client/src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
// import './channel-panel.css';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { ensureNotificationPermission } from '@/services/notifications';

import { storage, STORAGE_KEYS } from '@/shared/utils/storage';

// Request notification permission on startup
ensureNotificationPermission().catch(console.error);

// Apply saved theme on startup
const savedTheme = storage.getString(STORAGE_KEYS.THEME) || 'light';
document.documentElement.classList.toggle('dark', savedTheme === 'dark');

// Remove legacy theme key from localStorage.
// Safe to call every time — if key doesn't exist, it's a no-op.
storage.remove('theme');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);