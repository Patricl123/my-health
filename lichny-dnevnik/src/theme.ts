import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const storageKey = 'tiho:theme';
export function readTheme(): Theme {
  try { const value = localStorage.getItem(storageKey); return value === 'dark' || value === 'light' ? value : 'system'; } catch { return 'system'; }
}
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17221d' : '#f7f8f4');
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [error, setError] = useState('');
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme); update();
    const sync = (event: StorageEvent) => { if (event.key === storageKey) setTheme(readTheme()); };
    media.addEventListener('change', update); window.addEventListener('storage', sync);
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', sync); };
  }, [theme]);
  function choose(value: Theme) {
    setTheme(value); setError('');
    try { localStorage.setItem(storageKey, value); } catch { setError('Тема применена. Браузер не разрешил запомнить её после закрытия.'); }
  }
  return { theme, choose, error };
}
