import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BatteryMedium, Moon, Plus, Tags, X } from 'lucide-react';
import { tagSuggestions, type Entry } from './model';

export default function DayDetails({ entry, disabled, change }: { entry: Entry; disabled: boolean; change: (patch: Partial<Entry>) => void }) {
  const [tag, setTag] = useState(''); const [tagError, setTagError] = useState('');
  const [sleepText, setSleepText] = useState(entry.sleepHours === null ? '' : String(entry.sleepHours));
  const sleep = useRef<HTMLInputElement>(null);
  useEffect(() => { setTag(''); setTagError(''); }, [entry.date]);
  useEffect(() => { if (document.activeElement !== sleep.current) setSleepText(entry.sleepHours === null ? '' : String(entry.sleepHours)); }, [entry.sleepHours, entry.date]);
  function add(value: string) {
    const clean = value.trim();
    if (!clean) return;
    if (entry.tags.some(t => t.toLocaleLowerCase('ru') === clean.toLocaleLowerCase('ru'))) { setTagError('Эта метка уже добавлена.'); return; }
    if (entry.tags.length >= 10 || clean.length > 32) { setTagError('До 10 меток, по 32 символа каждая.'); return; }
    change({ tags: [...entry.tags, clean] }); setTag(''); setTagError('');
  }
  function addTag(event: FormEvent) { event.preventDefault(); add(tag); }
  return <>
    <section className="card rest-card"><div className="card-title"><span className="section-icon sage"><Moon size={20} /></span><h2>Сон и энергия</h2><span className="optional">по желанию</span></div>
      <fieldset disabled={disabled}><legend className="sr-only">Сон и энергия</legend>
        <label className="sleep-label">Сколько часов вы спали?<span className="sleep-input"><input ref={sleep} type="number" inputMode="decimal" min="0" max="24" step="0.5" placeholder="Не отмечено" value={sleepText} onChange={event => {
          setSleepText(event.target.value);
          if (event.target.value === '') change({ sleepHours: null });
          else if (event.target.validity.valid) change({ sleepHours: Number(event.target.value) });
        }} onBlur={() => setSleepText(entry.sleepHours === null ? '' : String(entry.sleepHours))} /><span>часов</span></span></label><p className="field-help">Можно указать полчаса: например, 7,5.</p>
        <div className="stress-label energy-label"><label className="field-heading"><BatteryMedium size={17} /> Сколько сил сегодня?</label><span className="stress-value">{entry.energy === null ? 'Не отмечено' : `${entry.energy} / 10`}</span></div>
        <div className="stress-options energy-options" role="group" aria-label="Энергия от 0 до 10">{Array.from({ length: 11 }, (_, value) => <button type="button" key={value} aria-label={`Энергия ${value} из 10`} aria-pressed={entry.energy === value} className={entry.energy === value ? 'selected' : ''} onClick={() => change({ energy: entry.energy === value ? null : value })}>{value}</button>)}</div><div className="scale-labels"><span>Совсем нет сил</span><span>Много сил</span></div>
      </fieldset>
    </section>
    <section className="card tags-card"><div className="card-title"><span className="section-icon sand"><Tags size={20} /></span><h2>Метки дня</h2><span className="optional">по желанию</span></div><p className="card-description">Выберите подходящие или придумайте свои.</p>
      <div className="entry-tags" aria-label="Метки этой записи">{entry.tags.map(t => <button type="button" className="tag-chip selected" key={t} disabled={disabled} aria-label={`Убрать метку ${t}`} onClick={() => change({ tags: entry.tags.filter(x => x !== t) })}>{t}<X size={14} /></button>)}</div>
      <div className="tag-suggestions" aria-label="Быстрые метки">{tagSuggestions.filter(t => !entry.tags.some(x => x.toLocaleLowerCase('ru') === t.toLocaleLowerCase('ru'))).map(t => <button type="button" key={t} className="tag-chip" disabled={disabled || entry.tags.length >= 10} onClick={() => add(t)}><Plus size={13} />{t}</button>)}</div>
      <form className="tag-form" onSubmit={addTag}><label>Своя метка<input value={tag} disabled={disabled || entry.tags.length >= 10} maxLength={32} onChange={event => { setTag(event.target.value); setTagError(''); }} placeholder="Например, поездка" /></label><button className="secondary" type="submit" disabled={disabled || !tag.trim() || entry.tags.length >= 10} aria-label="Добавить метку"><Plus size={18} /></button></form>
      {tagError && <p role="alert" className="error-text">{tagError}</p>}<p className="field-help">{entry.tags.length} / 10 · Изменения сохраняются вместе с записью.</p>
    </section>
  </>;
}
