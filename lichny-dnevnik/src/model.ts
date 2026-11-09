export type Mood = '' | 'great' | 'good' | 'neutral' | 'sad' | 'hard';
export const moods: { value: Mood; label: string; face: string }[] = [
  { value: 'great', label: 'Радостно', face: '☀' },
  { value: 'good', label: 'Спокойно', face: '☺' },
  { value: 'neutral', label: 'Ровно', face: '◡' },
  { value: 'sad', label: 'Грустно', face: '☁' },
  { value: 'hard', label: 'Тяжело', face: '☂' },
];
export type Meal = { id: string; time: string; description: string };
export type Entry = { date: string; stress: number | null; mood: Mood; note: string; diary: string; meals: Meal[] };
export type RecordEntry = Entry & { version: number; revision: string; mutationId: string; updatedAt: string };
export type Draft = { entry: Entry; revision: string | null; version: number; mutationId: string; touchedAt: string };
export const emptyEntry = (date: string): Entry => ({ date, stress: null, mood: '', note: '', diary: '', meals: [] });
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function weekDates(end: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${end}T12:00:00`); d.setDate(d.getDate() - 6 + i); return localDate(d);
  });
}
export const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', options);
export const hasContent = (e: Entry) => e.stress !== null || !!(e.mood || e.note.trim() || e.diary.trim() || e.meals.length);
export const entryOnly = (e: Entry): Entry => ({ date: e.date, stress: e.stress, mood: e.mood, note: e.note, diary: e.diary, meals: e.meals });
