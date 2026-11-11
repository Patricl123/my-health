import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './extras.css';
import './themes.css';
import { applyTheme, readTheme } from './theme';
applyTheme(readTheme());
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
