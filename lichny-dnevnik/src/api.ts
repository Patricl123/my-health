import { APIError, ConflictError, requestJson } from './auth';
import type { Draft, RecordEntry } from './model';
export { ConflictError };
export function errorText(error: unknown) {
  if (error instanceof APIError && error.status !== 0) return error.message;
  return 'Сервер не подтвердил операцию. Проверьте связь и повторите. Черновик остаётся на устройстве.';
}
export async function getEntry(_uid: string, date: string): Promise<RecordEntry | null> { return (await requestJson(`/api/entries/${date}`)).entry; }
export async function listEntries(_uid: string): Promise<RecordEntry[]> { return (await requestJson('/api/entries')).entries; }
export async function saveEntry(_uid: string, draft: Draft): Promise<RecordEntry> {
  const current = await getEntry(_uid, draft.entry.date);
  if (current?.mutationId === draft.mutationId) return current;
  if ((current?.revision || null) !== draft.revision) throw new ConflictError();
  return (await requestJson(`/api/entries/${draft.entry.date}`, { method: 'PUT', body: JSON.stringify({ entry: draft.entry, revision: draft.revision, mutationId: draft.mutationId }) })).entry;
}
export async function deleteEntry(_uid: string, date: string, revision: string) {
  await requestJson(`/api/entries/${date}`, { method: 'DELETE', body: JSON.stringify({ revision }) });
}
export const getBackup = () => requestJson('/api/backup');
export type RestorePreview = { total: number; existing: number; new: number; current: number; generation: number; hasOldDrafts: boolean };
export const previewBackup = (backup: unknown): Promise<RestorePreview> => requestJson('/api/restore/preview', { method: 'POST', body: JSON.stringify({ backup }) });
export const restoreBackup = (backup: unknown, mode: string, generation: number, operationId: string) => requestJson('/api/restore', {
  method: 'POST', body: JSON.stringify({ backup, mode, expectedGeneration: generation, operationId }),
});
