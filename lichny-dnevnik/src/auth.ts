export type User = { uid: string; email: string };
type Session = { user: User | null; csrf: string | null; siteId: string; setupRequired: boolean };
export class APIError extends Error { constructor(public status: number, message: string) { super(message); } }
export class ConflictError extends APIError { constructor(message = 'На другом устройстве есть более новая запись. Ваш черновик сохранён здесь.') { super(409, message); } }
const hintKey = `tiho:session-hint:${location.origin}`;
const listeners = new Set<(user: User | null) => void>();
export let siteId = 'not-connected';
export let setupRequired = false;
export let sessionError = '';
let user: User | null = null;
let csrf: string | null = null;
let loading: Promise<void> | null = null;
function publish(session: Session) {
  user = session.user; csrf = session.csrf; siteId = session.siteId; setupRequired = session.setupRequired; sessionError = '';
  try { if (user) localStorage.setItem(hintKey, JSON.stringify({ user, siteId })); else localStorage.removeItem(hintKey); } catch {}
  listeners.forEach(l => l(user));
}
export async function refreshSession() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Сервер временно недоступен.');
      publish(await response.json());
    } catch {
      csrf = null;
      // Only a UI hint for local drafts; all server operations still require a valid cookie.
      if (!navigator.onLine) {
        try { const hint = JSON.parse(localStorage.getItem(hintKey) || 'null'); user = hint?.user || null; siteId = hint?.siteId || siteId; } catch { user = null; }
      } else user = null;
      sessionError = 'Не удалось связаться с сервером. Проверьте интернет и повторите вход.';
      listeners.forEach(l => l(user));
    }
  })().finally(() => { loading = null; });
  return loading;
}
export const auth = { get currentUser() { return user; } };
export function onAuthStateChanged(_auth: typeof auth, listener: (u: User | null) => void) {
  listeners.add(listener); void refreshSession();
  return () => { listeners.delete(listener); };
}
export async function requestJson(path: string, init: RequestInit = {}) {
  if (!navigator.onLine) throw new APIError(0, 'Нет связи с сервером.');
  const unsafe = !!init.method && init.method !== 'GET';
  const needsSession = unsafe && !['/api/login', '/api/setup'].includes(path);
  if (needsSession && !csrf) await refreshSession();
  const response = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(needsSession && csrf ? { 'X-CSRF-Token': csrf } : {}), ...init.headers } });
  const value = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') publish({ user: null, csrf: null, siteId, setupRequired });
    if (response.status === 409) throw new ConflictError(value.error);
    throw new APIError(response.status, value.error || 'Операция не выполнена.');
  }
  return value;
}
export async function login(email: string, password: string, setupToken?: string) {
  publish(await requestJson(setupToken === undefined ? '/api/login' : '/api/setup', { method: 'POST', body: JSON.stringify({ email, password, setupToken }) }));
}
export async function signOut(_auth: typeof auth) {
  await requestJson('/api/logout', { method: 'POST', body: '{}' });
  publish({ user: null, csrf: null, siteId, setupRequired: false });
}
