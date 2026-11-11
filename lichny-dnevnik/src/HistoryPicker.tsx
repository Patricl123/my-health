import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { dateLabel, localDate, type Entry } from './model';

const normalized = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е');
export default function HistoryPicker({ entries, drafts, date, busy, openDate, error, retry }: { entries: Entry[]; drafts: string[]; date: string; busy: boolean; openDate: (value: string) => void; error: string; retry: () => void }) {
  const [query, setQuery] = useState(''); const [tag, setTag] = useState(''); const [limit, setLimit] = useState(20);
  const tags = [...new Set(entries.flatMap(e => e.tags))].sort((a, b) => a.localeCompare(b, 'ru'));
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  const results = entries.filter(e => {
    const text = normalized([e.date, dateLabel(e.date, { day: 'numeric', month: 'long', year: 'numeric' }), e.diary, e.note, ...e.meals.map(m => m.description), ...e.tags].join(' '));
    return (!tag || e.tags.includes(tag)) && words.every(word => text.includes(word));
  }).sort((a, b) => b.date.localeCompare(a.date));
  function shift(amount: number) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + amount); openDate(localDate(d)); }
  return <section className="history-picker" aria-label="Поиск и выбор даты">
    <div className="date-controls"><button className="icon-button" aria-label="Предыдущий день" onClick={() => shift(-1)} disabled={busy}><ChevronLeft size={20} /></button><label>Дата записи<input aria-label="Дата записи" type="date" value={date} onChange={event => event.target.value && openDate(event.target.value)} disabled={busy} /></label><button className="icon-button" aria-label="Следующий день" onClick={() => shift(1)} disabled={busy}><ChevronRight size={20} /></button></div>
    <div className="history-search"><label><span><Search size={17} /> Поиск по записям</span><input type="search" value={query} maxLength={200} onChange={event => { setQuery(event.target.value); setLimit(20); }} placeholder="Слово или несколько слов" /></label><label>Фильтр по метке<select value={tag} onChange={event => { setTag(event.target.value); setLimit(20); }}><option value="">Все метки</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</select></label></div>
    {(query || tag) && <button className="text-button" onClick={() => { setQuery(''); setTag(''); setLimit(20); }}><X size={15} /> Сбросить поиск</button>}
    {error && <div className="history-error" role="alert">История не загружена полностью. Поиск доступен по уже загруженным записям и черновикам.<button className="text-button" onClick={retry}>Повторить загрузку истории</button></div>}
    <p className="search-count" aria-live="polite">{query || tag ? `Найдено дней: ${results.length}` : `Дней с записями и черновиками: ${results.length}`}</p>
    <div className="history-results">{results.slice(0, limit).map(e => <button type="button" className={`history-result ${date === e.date ? 'selected' : ''}`} key={e.date} disabled={busy} onClick={() => openDate(e.date)}><span className="history-result-date">{dateLabel(e.date, { day: 'numeric', month: 'long', year: 'numeric' })}{drafts.includes(e.date) && <small>черновик</small>}</span><span className="history-snippet">{e.diary.trim() || e.note.trim() || e.meals.map(m => m.description).join(', ') || (e.sleepHours !== null ? `Сон: ${e.sleepHours} ч` : e.energy !== null ? `Энергия: ${e.energy} / 10` : 'Отметки дня')}</span>{e.tags.length > 0 && <span className="history-result-tags">{e.tags.join(' · ')}</span>}</button>)}</div>
    {results.length === 0 && <p className="history-empty">{query || tag ? 'Совпадений нет. Попробуйте другие слова или метку.' : 'Пока нет записей. Можно выбрать любую дату и начать писать.'}</p>}
    {results.length > limit && <button className="secondary" onClick={() => setLimit(value => value + 20)}>Показать ещё</button>}
  </section>;
}
