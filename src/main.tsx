// client/src/main.tsx
//
// УДАЛЕНО: ThemeInitializer — светлая тема применяется статически через CSS,
//          никакой JS-инициализации не требуется.
// УДАЛЕНО: импорты useEffect, useAppStore (больше не нужны здесь).
// ДОБАВЛЕНО: localStorage.removeItem('theme') — чистит устаревший ключ
//            у пользователей, которые уже запускали старую версию приложения.

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

// Применяем сохранённую тему при старте
const savedTheme = storage.getString(STORAGE_KEYS.THEME) || 'light';
document.documentElement.classList.toggle('dark', savedTheme === 'dark');

// Удаляем устаревший ключ темы из localStorage.
// Безопасно вызывать при каждом старте — если ключа нет, это no-op.
storage.remove('theme');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);