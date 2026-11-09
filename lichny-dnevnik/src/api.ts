import { auth, emulator, projectId } from './firebase';
import { type Draft, type RecordEntry } from './model';
const root = emulator ? 'http://127.0.0.1:8080/v1' : 'https://firestore.googleapis.com/v1';
const database = `projects/${projectId}/databases/(default)`;
type Value = { stringValue?: string; integerValue?: string; nullValue?: null; arrayValue?: { values?: Value[] }; mapValue?: { fields: Record<string, Value> }; timestampValue?: string };
type Document = { fields: Record<string, Value>; updateTime: string };
function encode(v: unknown): Value {
  if (v === null) return { nullValue: null };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, val]) => [k, encode(val)])) } };
}
function decode(v: Value): unknown {
  if ('nullValue' in v) return null;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue?.values || []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue!.fields).map(([k, val]) => [k, decode(val)]));
  return v.stringValue || '';
}
function record(doc: Document): RecordEntry {
  return { ...Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, decode(v)])), revision: doc.updateTime } as RecordEntry;
}
export class ConflictError extends Error { constructor() { super('На другом устройстве есть более новая запись. Ваш черновик сохранён здесь.'); } }
export function errorText(e: unknown) {
  if (e instanceof ConflictError) return e.message;
  const s = e instanceof Error ? e.message : '';
  if (s.includes('PERMISSION_DENIED') || s.includes('403')) return 'Нет доступа. Проверьте аккаунт и правила доступа к базе.';
  if (s.includes('RESOURCE_EXHAUSTED') || s.includes('429')) return 'Достигнут бесплатный лимит базы. Черновик остаётся на устройстве. Повторите позже.';
  if (s.includes('401') || s.includes('UNAUTHENTICATED')) return 'Сессия истекла. Выйдите и войдите снова.';
  return 'Сервер не подтвердил операцию. Проверьте связь и повторите. Черновик остаётся на устройстве.';
}
async function request(path: string, init: RequestInit = {}, missingOk = false): Promise<any> {
  if (!navigator.onLine) throw new Error('offline');
  const user = auth.currentUser;
  if (!user) throw new Error('401');
  const token = await user.getIdToken();
  const response = await fetch(`${root}/${database}/${path}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (missingOk && response.status === 404) return null;
  const data = await response.json();
  if (!response.ok) {
    if (['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'ABORTED'].includes(data.error?.status)) throw new ConflictError();
    throw new Error(`${response.status} ${data.error?.status || ''}`);
  }
  return data;
}
const entryPath = (uid: string, date: string) => `documents/users/${encodeURIComponent(uid)}/entries/${date}`;
export async function getEntry(uid: string, date: string): Promise<RecordEntry | null> {
  const data = await request(entryPath(uid, date), {}, true); return data ? record(data) : null;
}
export async function listEntries(uid: string): Promise<RecordEntry[]> {
  const entries: RecordEntry[] = []; let page = '';
  do {
    const data = await request(`documents/users/${encodeURIComponent(uid)}/entries?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
    entries.push(...(data.documents || []).map(record)); page = data.nextPageToken || '';
  } while (page);
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
export async function saveEntry(uid: string, draft: Draft): Promise<RecordEntry> {
  const current = await getEntry(uid, draft.entry.date);
  // A retry after a lost response must not duplicate or overwrite a later change.
  if (current?.mutationId === draft.mutationId) return current;
  if ((current?.revision || null) !== draft.revision) throw new ConflictError();
  const fields = (encode({ ...draft.entry, version: draft.version + 1, mutationId: draft.mutationId }).mapValue!).fields;
  const data = await request('documents:commit', { method: 'POST', body: JSON.stringify({ writes: [{
    update: { name: `${database}/${entryPath(uid, draft.entry.date)}`, fields },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: draft.revision ? { updateTime: draft.revision } : { exists: false },
  }] }) });
  return { ...draft.entry, version: draft.version + 1, mutationId: draft.mutationId, revision: data.writeResults[0].updateTime, updatedAt: data.commitTime };
}
export async function deleteEntry(uid: string, date: string, revision: string) {
  const current = await getEntry(uid, date);
  if (!current) return;
  if (current.revision !== revision) throw new ConflictError();
  await request('documents:commit', { method: 'POST', body: JSON.stringify({ writes: [{
    delete: `${database}/${entryPath(uid, date)}`, currentDocument: { updateTime: revision },
  }] }) });
}
