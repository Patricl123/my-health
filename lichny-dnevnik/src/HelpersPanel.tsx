import { useRef } from 'react';
import { Check, HeartHandshake, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import type { HelpersControls } from './useHelpers';

export default function HelpersPanel({ controls: h }: { controls: HelpersControls }) {
  const list = useRef<HTMLUListElement>(null);
  const disabled = h.busy || !h.loaded;
  return <section className="card helpers-card" aria-labelledby="helpers-heading"><div className="card-title"><span className="section-icon peach"><HeartHandshake size={20} /></span><h2 id="helpers-heading">Что мне помогает</h2></div>
    <p className="card-description">Ваш личный список того, что делает день легче.</p>
    {!h.draft.items.length && <p className="helpers-empty">Добавьте своё: прогулку, душ, любимую песню или разговор с близким.</p>}
    <ul className="helpers-list" ref={list}>{h.draft.items.map((item, index) => <li key={index}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><input aria-label={`Способ поддержки ${index + 1}`} maxLength={200} value={item} disabled={disabled} placeholder="Что помогает именно вам?" onChange={event => h.change(h.draft.items.map((value, i) => i === index ? event.target.value : value))} /><button type="button" className="icon-button" aria-label={`Убрать способ поддержки ${index + 1}`} disabled={disabled} onClick={() => h.change(h.draft.items.filter((_, i) => i !== index))}><Trash2 size={17} /></button></li>)}</ul>
    <button type="button" className="add-meal" disabled={disabled || h.draft.items.length >= 30} onClick={() => { h.change([...h.draft.items, '']); requestAnimationFrame(() => list.current?.querySelector('li:last-child input')?.scrollIntoView({ block: 'nearest' })); requestAnimationFrame(() => (list.current?.querySelector('li:last-child input') as HTMLInputElement | null)?.focus({ preventScroll: true })); }}><Plus size={18} /> Добавить в список</button>
    {h.draft.items.some(item => !item.trim()) && <p className="field-help">Заполните пустой пункт или уберите его перед сохранением.</p>}
    <div className="helpers-save"><span className="helpers-status" role="status">{h.busy ? <LoaderCircle size={16} className="spin" /> : h.status === 'Сохранено' ? <Check size={17} /> : null}{h.status}</span><button className="primary" disabled={disabled || !h.dirty || h.conflict || h.draft.items.some(item => !item.trim())} onClick={() => void h.save()}>{h.busy ? 'Отправляем…' : h.error && !h.conflict ? 'Повторить отправку списка' : 'Сохранить список'}</button></div>
    {h.error && <div role="alert" className="error-text">{h.error}{h.conflict ? <button className="text-button" disabled={h.busy} onClick={() => void h.openRemote()}>Скачать черновик списка и открыть серверную версию</button> : !h.loaded && <button className="text-button" onClick={h.retry}>Повторить загрузку списка</button>}</div>}
    {!h.storageOk && h.dirty && <div role="alert" className="notice">Браузер не сохранил черновик списка. Оставьте сайт открытым до отправки.<button className="text-button" onClick={h.download}>Скачать черновик списка</button></div>}
    <p className="field-help">После сохранения список доступен с других устройств и входит в резервную копию.</p>
  </section>;
}
