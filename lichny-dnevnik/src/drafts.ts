import { siteId } from './auth';
import type { Draft } from './model';
const key = (uid: string, date: string) => `tiho:draft:${siteId}:${uid}:${date}`;
export function readDraft(uid: string, date: string): Draft | null {
  try { const raw = localStorage.getItem(key(uid, date)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function writeDraft(uid: string, draft: Draft): boolean {
  try { localStorage.setItem(key(uid, draft.entry.date), JSON.stringify(draft)); return true; } catch { return false; }
}
export function removeDraft(uid: string, date: string) { try { localStorage.removeItem(key(uid, date)); } catch { /* storage may be unavailable */ } }
export function draftDates(uid: string): string[] {
  const prefix = `tiho:draft:${siteId}:${uid}:`;
  try { return Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length)); } catch { return []; }
}
