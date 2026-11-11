import { useEffect, useRef, useState } from 'react';
import { siteId } from './auth';
import { ConflictError, errorText, getHelpers, saveHelpers, type HelpersDraft, type HelpersRecord } from './api';

export const helpersDraftKey = (uid: string) => `tiho:helpers-draft:${siteId}:${uid}`;
const fresh = (remote: HelpersRecord | null): HelpersDraft => ({ items: remote?.items || [], revision: remote?.revision || null, mutationId: crypto.randomUUID() });
function read(key: string): HelpersDraft | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function useHelpers(uid: string, refresh: number) {
  const key = helpersDraftKey(uid);
  const [draft, setDraft] = useState<HelpersDraft>(fresh(null)); const current = useRef(draft);
  const [loaded, setLoaded] = useState(false); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Загружаем список…'); const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false); const [storageOk, setStorageOk] = useState(true); const [attempt, setAttempt] = useState(0);
  function apply(value: HelpersDraft) { current.current = value; setDraft(value); }
  useEffect(() => {
    let active = true;
    const local = read(key); setLoaded(false); setError(''); setConflict(false);
    if (local) apply(local);
    getHelpers().then(remote => {
      if (!active) return;
      if (local && remote?.mutationId !== local.mutationId) {
        apply(local); setDirty(true); setStatus('Черновик списка на устройстве');
        if ((remote?.revision || null) !== local.revision) { setConflict(true); setError('На другом устройстве список уже изменён. Ваш черновик сохранён здесь.'); }
      } else {
        if (local) { try { localStorage.removeItem(key); } catch { /* Acknowledged drafts may be cleared on the next visit. */ } }
        apply(fresh(remote)); setDirty(false); setStatus(remote ? 'Сохранено' : 'Список пока пуст');
      }
      setLoaded(true);
    }).catch(e => { if (active) { setError(errorText(e)); setDirty(!!local); setLoaded(!!local); setStatus(local ? 'Черновик списка на устройстве' : 'Список не загружен'); } });
    return () => { active = false; };
  }, [key, refresh, attempt]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty && !storageOk) event.preventDefault(); };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty, storageOk]);
  function change(items: string[]) {
    const next = { ...current.current, items, mutationId: crypto.randomUUID() }; apply(next); setDirty(true);
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageOk(true); setStatus('Черновик списка на устройстве'); }
    catch { setStorageOk(false); setStatus('Черновик списка не записан на устройство'); }
  }
  async function save() {
    setBusy(true); setError(''); setStatus('Отправляем на сервер…');
    try {
      const result = await saveHelpers(current.current);
      try { localStorage.removeItem(key); } catch { /* The server has confirmed the committed list. */ }
      apply(fresh(result)); setDirty(false); setConflict(false); setStatus('Сохранено');
    } catch (e) {
      const collision = e instanceof ConflictError; setConflict(collision);
      setError(collision ? 'На другом устройстве список уже изменён. Ваш черновик сохранён здесь.' : errorText(e));
      setStatus(storageOk ? 'Не отправлено · черновик списка на устройстве' : 'Не отправлено · оставьте страницу открытой');
    } finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tiho-helpers-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openRemote() {
    if (!window.confirm('Скачать черновик списка и открыть серверную версию? Черновик останется в скачанном файле.')) return;
    setBusy(true); setError('');
    try {
      const remote = await getHelpers(); download(); localStorage.removeItem(key);
      apply(fresh(remote)); setDirty(false); setConflict(false); setLoaded(true); setStatus(remote ? 'Сохранено' : 'Список пока пуст');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return { draft, loaded, dirty, busy, status, error, conflict, storageOk, change, save, download, openRemote, retry: () => setAttempt(value => value + 1) };
}
export type HelpersControls = ReturnType<typeof useHelpers>;
