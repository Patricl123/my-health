import { useEffect, useRef, useState, type FormEvent } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, type User } from 'firebase/auth';
import { Leaf, Sun, CalendarDays, ChartNoAxesColumn, Settings2, LockKeyhole, ArrowRight, Plus, X, Check, CloudOff, Download, LogOut, Trash2, Utensils, BookOpen, ChevronLeft, ChevronRight, RefreshCw, Heart, LoaderCircle } from 'lucide-react';
import { auth, authReady, configured, emulator, ownerUid } from './firebase';
import { ConflictError, deleteEntry, errorText, getEntry, listEntries, saveEntry } from './api';
import { draftDates, readDraft, removeDraft, writeDraft } from './drafts';
import { dateLabel, emptyEntry, entryOnly, hasContent, localDate, moods, weekDates, type Draft, type Entry, type Meal, type RecordEntry } from './model';

type View = 'today' | 'history' | 'week' | 'settings';
const nav = [{ id: 'today', label: 'Сегодня', icon: Sun }, { id: 'history', label: 'История', icon: CalendarDays }, { id: 'week', label: 'Неделя', icon: ChartNoAxesColumn }, { id: 'settings', label: 'Настройки', icon: Settings2 }] as const;
const download = (name: string, value: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function Brand() { return <div className="brand"><span className="brand-icon"><Leaf size={26} strokeWidth={1.6} /></span><span><strong>Тихо</strong><small>личный дневник</small></span></div>; }
function Spinner() { return <LoaderCircle className="spin" size={19} aria-hidden="true" />; }
function Login() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await authReady;
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (result.user.uid !== ownerUid) { await signOut(auth); setError('Этот аккаунт не имеет доступа к дневнику. Войдите в аккаунт владельца.'); }
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === 'auth/too-many-requests' ? 'Слишком много попыток. Попробуйте позже.' : code === 'auth/network-request-failed' ? 'Не удалось связаться с сервером. Проверьте интернет.' : 'Не удалось войти. Проверьте почту и пароль.');
    } finally { setBusy(false); }
  }
  async function resetPassword() {
    if (!email.trim()) { setError('Сначала укажите вашу почту.'); return; }
    setBusy(true); setError('');
    try { await sendPasswordResetEmail(auth, email.trim()); setMessage('Если аккаунт существует, на почту придёт письмо для смены пароля.'); }
    catch { setError('Не удалось отправить письмо. Проверьте почту и связь, затем повторите.'); }
    finally { setBusy(false); }
  }
  return <div className="login-page"><header><Brand /><span className="privacy"><LockKeyhole size={14} /> Пространство для себя</span></header><main className="login-layout"><div className="login-intro"><span className="eyebrow">ВАШ ДЕНЬ. ВАШИ СЛОВА.</span><h1>Можно просто<br />быть собой.</h1><p>Замечайте своё настроение, записывайте мысли и сохраняйте маленькие детали дня.</p><div className="leaf-art" aria-hidden="true"><Leaf size={150} strokeWidth={0.65} /><span className="art-dot" /></div><span className="intro-caption">Без оценок. В вашем ритме.</span></div><section className="login-card"><span className="section-icon"><BookOpen /></span><h2>Ваш личный дневник</h2><p>Войдите, чтобы открыть свои записи.</p>{!configured ? <div className="notice"><strong>Осталось подключить ваш аккаунт</strong><p>Приложение готово к настройке. Откройте файл «ЗАПУСК.md» в папке проекта: там описаны бесплатный Firebase-проект и публикация сайта.</p></div> : <form onSubmit={login}><label>Электронная почта<input autoComplete="username" inputMode="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label><label>Пароль<input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ваш пароль" required /></label>{error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status" className="success-text">{message}</p>}<button className="primary full" disabled={busy} type="submit">{busy ? <Spinner /> : <>Войти в дневник <ArrowRight size={18} /></>}</button><button className="text-button full" type="button" disabled={busy} onClick={resetPassword}>Не помню пароль</button></form>}<div className="login-footnote"><LockKeyhole size={16} /><span>Записи доступны только аккаунту владельца.</span></div></section></main><footer>Тихо — место для ваших наблюдений</footer>{emulator && <div className="dev-badge">Локальная проверка · эмуляторы Firebase</div>}</div>;
}
function StressChart({ records, end, large = false }: { records: RecordEntry[]; end: string; large?: boolean }) {
  const dates = weekDates(end); const values = dates.map(d => records.find(r => r.date === d)?.stress ?? null);
  return <div className={`chart ${large ? 'large' : ''}`}><div className="chart-scale"><span>10</span><span>5</span><span>0</span></div><div className="chart-plot"><div className="chart-grid" aria-hidden="true"><i /><i /><i /></div><div className="chart-columns">{dates.map((date, i) => <div className="chart-day" key={date}><div className="bar-space">{values[i] !== null && <div className="chart-bar" style={{ height: `${Math.max(2, values[i]! * 10)}%` }}><span>{values[i]}</span></div>}</div><span className={date === localDate() ? 'is-today' : ''}>{dateLabel(date, { weekday: 'short' })}</span><small>{dateLabel(date, { day: 'numeric' })}</small></div>)}</div></div><div className="sr-only">{dates.map((d, i) => <p key={d}>{dateLabel(d)}: {values[i] === null ? 'нет отметки стресса' : `стресс ${values[i]} из 10`}</p>)}</div></div>;
}
export default function App() {
  const [user, setUser] = useState<User | null>(null); const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, u => { setUser(u?.uid === ownerUid ? u : null); setAuthLoading(false); }), []);
  if (authLoading) return <div className="initial-loading"><Brand /><Spinner /></div>;
  if (!user) return <Login />;
  return <Diary user={user} />;
}
function Diary({ user }: { user: User }) {
  const [view, setView] = useState<View>('today'); const [date, setDate] = useState(localDate());
  const [records, setRecords] = useState<RecordEntry[]>([]); const [recordError, setRecordError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null); const draftRef = useRef<Draft | null>(null);
  const [dirty, setDirty] = useState(false); const [loaded, setLoaded] = useState(false); const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [conflict, setConflict] = useState(false);
  const [storageOk, setStorageOk] = useState(true); const [online, setOnline] = useState(navigator.onLine);
  const [mealOpen, setMealOpen] = useState(false); const [mealTime, setMealTime] = useState(''); const [mealText, setMealText] = useState(''); const [mealId, setMealId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false); const [exportMessage, setExportMessage] = useState('');
  const [localDates, setLocalDates] = useState<string[]>(draftDates(user.uid));
  const [loadAttempt, setLoadAttempt] = useState(0);
  function applyDraft(next: Draft) { draftRef.current = next; setDraft(next); }
  async function refreshRecords() {
    try { const result = await listEntries(user.uid); setRecords(result); setRecordError(''); }
    catch (e) { setRecordError(errorText(e)); }
  }
  useEffect(() => { void refreshRecords(); }, [user.uid]);
  useEffect(() => {
    const on = () => { setOnline(true); void refreshRecords(); }; const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const leave = (e: BeforeUnloadEvent) => { if (dirty && !storageOk) e.preventDefault(); };
    window.addEventListener('beforeunload', leave);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('beforeunload', leave); };
  }, [user.uid, dirty, storageOk]);
  useEffect(() => {
    let active = true; setLoaded(false); setError(''); setConflict(false); setMealOpen(false); setMealText('');
    const local = readDraft(user.uid, date);
    applyDraft(local || { entry: emptyEntry(date), revision: null, version: 0, mutationId: crypto.randomUUID(), touchedAt: '' });
    setDirty(!!local); setExists(!!local?.revision); setStatus(local ? 'Черновик на устройстве' : 'Загружаем запись…');
    getEntry(user.uid, date).then(remote => {
      if (!active) return;
      setExists(!!remote); setLoaded(true);
      if (local) {
        if (remote?.mutationId === local.mutationId) {
          removeDraft(user.uid, date); applyDraft({ entry: entryOnly(remote), revision: remote.revision, version: remote.version, mutationId: crypto.randomUUID(), touchedAt: '' });
          setDirty(false); setStatus('Сохранено'); setLocalDates(draftDates(user.uid));
        } else {
          setStatus('Черновик на устройстве');
          if ((remote?.revision || null) !== local.revision) { setConflict(true); setError(new ConflictError().message); }
        }
      } else {
        applyDraft({ entry: remote ? entryOnly(remote) : emptyEntry(date), revision: remote?.revision || null, version: remote?.version || 0, mutationId: crypto.randomUUID(), touchedAt: '' });
        setStatus(remote ? 'Сохранено' : 'Пока нет записи'); setDirty(false);
      }
      setRecords(prev => [...prev.filter(r => r.date !== date), ...(remote ? [remote] : [])].sort((a, b) => b.date.localeCompare(a.date)));
    }).catch(e => {
      if (!active) return;
      if (local) { setLoaded(true); setStatus('Черновик на устройстве'); }
      else setStatus('Запись не загружена');
      setError(errorText(e));
    });
    return () => { active = false; };
  }, [date, user.uid, loadAttempt]);
  function change(patch: Partial<Entry>) {
    if (!draftRef.current) return;
    const next = { ...draftRef.current, entry: { ...draftRef.current.entry, ...patch }, mutationId: crypto.randomUUID(), touchedAt: new Date().toISOString() };
    const persisted = writeDraft(user.uid, next); applyDraft(next); setDirty(true); setStorageOk(persisted); setLocalDates(draftDates(user.uid)); setStatus(persisted ? 'Черновик на устройстве' : 'Не сохранено на устройстве');
  }
  async function save() {
    const snapshot = draftRef.current; if (!snapshot || !hasContent(snapshot.entry)) return;
    setBusy(true); setError(''); setStatus('Отправляем на сервер…');
    try {
      const result = await saveEntry(user.uid, snapshot);
      removeDraft(user.uid, date); setLocalDates(draftDates(user.uid));
      applyDraft({ entry: entryOnly(result), revision: result.revision, version: result.version, mutationId: crypto.randomUUID(), touchedAt: '' });
      setDirty(false); setExists(true); setConflict(false); setStatus('Сохранено');
      setRecords(prev => [...prev.filter(r => r.date !== date), result].sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e) { setError(errorText(e)); setConflict(e instanceof ConflictError); setStatus(storageOk ? 'Не отправлено · черновик на устройстве' : 'Не отправлено · оставьте страницу открытой'); }
    finally { setBusy(false); }
  }
  async function reloadRemote() {
    if (!window.confirm('Открыть серверную версию? Черновик будет скачан отдельным файлом, затем удалён с устройства.')) return;
    setBusy(true);
    try {
      const remote = await getEntry(user.uid, date);
      download(`tiho-draft-${date}.json`, draftRef.current);
      removeDraft(user.uid, date); setLocalDates(draftDates(user.uid));
      applyDraft({ entry: remote ? entryOnly(remote) : emptyEntry(date), revision: remote?.revision || null, version: remote?.version || 0, mutationId: crypto.randomUUID(), touchedAt: '' });
      setDirty(false); setExists(!!remote); setConflict(false); setError(''); setLoaded(true); setStatus(remote ? 'Сохранено' : 'Пока нет записи');
      void refreshRecords();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!draft?.revision || !window.confirm(`Удалить запись за ${dateLabel(date)} и её черновик? Это действие нельзя отменить.`)) return;
    setBusy(true); setError('');
    try {
      await deleteEntry(user.uid, date, draft.revision); removeDraft(user.uid, date); setLocalDates(draftDates(user.uid));
      applyDraft({ entry: emptyEntry(date), revision: null, version: 0, mutationId: crypto.randomUUID(), touchedAt: '' });
      setExists(false); setDirty(false); setConflict(false); setStatus('Запись удалена'); setRecords(prev => prev.filter(r => r.date !== date));
    } catch (e) { setError(errorText(e)); setConflict(e instanceof ConflictError); } finally { setBusy(false); }
  }
  function openDate(nextDate: string) {
    if (busy) return;
    if (dirty && !storageOk && !window.confirm('Не удалось сохранить черновик на устройстве. Перейти и потерять изменения?')) return;
    setDate(nextDate); setView(nextDate === localDate() ? 'today' : 'history'); window.scrollTo({ top: 0 });
  }
  function go(next: View) { if (busy) return; if (next === 'today') openDate(localDate()); else { setView(next); window.scrollTo({ top: 0 }); } }
  function mealStart(meal?: Meal) {
    setMealTime(meal?.time || new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    setMealText(meal?.description || ''); setMealId(meal?.id || null); setMealOpen(true);
  }
  function addMeal(e: FormEvent) {
    e.preventDefault(); if (!mealText.trim() || !draft) return;
    const meal = { id: mealId || crypto.randomUUID(), time: mealTime, description: mealText.trim() };
    change({ meals: [...draft.entry.meals.filter(m => m.id !== mealId), meal].sort((a, b) => a.time.localeCompare(b.time)) });
    setMealOpen(false); setMealText('');
  }
  async function backup() {
    setExportBusy(true); setExportMessage('');
    try {
      const all = await listEntries(user.uid);
      const drafts = draftDates(user.uid).map(d => readDraft(user.uid, d)).filter(Boolean);
      download(`tiho-backup-${localDate()}.json`, { format: 'tiho-backup', formatVersion: 1, exportedAt: new Date().toISOString(), entries: all, deviceDrafts: drafts });
      setExportMessage(`Резервная копия скачана: ${all.length} записей, ${drafts.length} черновиков с этого устройства.`);
    } catch (e) { setExportMessage(errorText(e)); } finally { setExportBusy(false); }
  }
  const e = draft?.entry || emptyEntry(date); const weekEnd = view === 'today' ? localDate() : date;
  const historyDates = [...new Set([...records.map(r => r.date), ...localDates])].sort().reverse();
  const disabled = busy || !loaded;
  return <div className="app-shell"><aside className="sidebar"><Brand /><nav aria-label="Основное меню">{nav.map(n => <button key={n.id} className={view === n.id ? 'nav-item active' : 'nav-item'} onClick={() => go(n.id)} disabled={busy}><n.icon size={21} strokeWidth={1.7} /><span>{n.label}</span>{view === n.id && <i />}</button>)}</nav><div className="sidebar-bottom"><Leaf size={34} strokeWidth={1} /><p>Немного внимания<br />к своему дню.</p><div className="private-note"><LockKeyhole size={14} /> Только для вас</div></div></aside><div className="app-body"><header className="topbar"><span className="topbar-name">Моё пространство</span><span className="mobile-brand"><Leaf size={19} /> Тихо</span><div className="topbar-right">{!online && <span className="offline-chip"><CloudOff size={15} /> Без связи</span>}<span className="privacy"><LockKeyhole size={14} /> Личный дневник</span><button className="avatar" aria-label="Открыть настройки аккаунта" onClick={() => go('settings')}>{user.email?.[0]?.toUpperCase() || 'Я'}</button></div></header><main className="content">
    {view === 'settings' ? <><div className="page-heading"><span className="eyebrow">ВАШЕ ПРОСТРАНСТВО</span><h1>Настройки</h1><p>Аккаунт и копия ваших записей.</p></div><section className="card settings-card"><div className="card-title"><LockKeyhole className="muted-icon" /><h2>Личный аккаунт</h2></div><p className="account-email">{user.email}</p><p className="muted">Доступ к записям проверяется на сервере. На другом устройстве войдите с этой же почтой и паролем.</p><button className="secondary" onClick={() => void signOut(auth)}><LogOut size={18} /> Выйти из аккаунта</button></section><section className="card settings-card"><div className="card-title"><Download className="muted-icon" /><h2>Резервная копия</h2></div><p className="muted">Скачайте все записи с сервера и черновики с этого устройства в JSON. Файл можно хранить у себя и открыть как текст.</p><button className="primary" disabled={exportBusy} onClick={backup}>{exportBusy ? <Spinner /> : <Download size={18} />} Скачать все записи</button>{exportMessage && <p role="status" className="export-message">{exportMessage}</p>}</section><section className="card settings-card"><h2>Черновики на устройстве</h2><p className="muted">Несохранённые изменения остаются в этом браузере, в том числе после выхода. Они не появятся на другом устройстве до отправки на сервер. Очистка данных браузера удалит черновики.</p><p className="muted">Если устройством пользуется кто-то ещё, скачайте нужные черновики и очистите их.</p><button className="secondary" onClick={() => { if (!window.confirm('Удалить все черновики с этого устройства? Записи на сервере останутся.')) return; draftDates(user.uid).forEach(d => removeDraft(user.uid, d)); setLocalDates([]); setExportMessage('Черновики удалены с этого устройства.'); setDate(localDate()); setView('today'); location.reload(); }}>Очистить черновики</button></section></> : view === 'week' ? <><div className="page-heading"><span className="eyebrow">НЕМНОГО ПЕРСПЕКТИВЫ</span><h1>Ваша неделя</h1><p>Только ваши отметки, без интерпретаций.</p></div><section className="card"><div className="card-title spread"><h2>Уровень стресса</h2><label className="date-small">По дату<input type="date" aria-label="Последний день недели" value={date} onChange={ev => setDate(ev.target.value || localDate())} /></label></div><p className="muted">{dateLabel(weekDates(date)[0])} — {dateLabel(date)}</p>{recordError ? <div role="alert" className="notice">График не загружен. {recordError}<button className="text-button" onClick={refreshRecords}>Повторить загрузку</button></div> : <StressChart records={records} end={date} large />}<p className="chart-caption">Шкала от 0 до 10. Дни без отметки стресса оставлены пустыми.</p></section></> : <>
      <div className="page-heading"><div className="heading-top"><span className="eyebrow">{view === 'today' ? 'ОДИН ДЕНЬ ЗА РАЗ' : 'МОЖНО ВЕРНУТЬСЯ К ЛЮБОМУ ДНЮ'}</span><span className="date-pill"><CalendarDays size={15} />{dateLabel(date, { day: 'numeric', month: 'long', weekday: 'short' })}</span></div><h1>{view === 'today' ? 'Как вы сегодня?' : 'История ваших дней'}</h1><p>{view === 'today' ? 'Остановитесь на минуту. Здесь можно записать то, что важно вам.' : 'Выберите дату, чтобы прочитать или изменить запись.'}</p></div>
      {view === 'history' && <section className="history-picker"><div className="date-controls"><button className="icon-button" aria-label="Предыдущий день" onClick={() => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() - 1); openDate(localDate(d)); }} disabled={busy}><ChevronLeft size={20} /></button><label>Дата записи<input aria-label="Дата записи" type="date" value={date} onChange={ev => ev.target.value && openDate(ev.target.value)} disabled={busy} /></label><button className="icon-button" aria-label="Следующий день" onClick={() => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + 1); openDate(localDate(d)); }} disabled={busy}><ChevronRight size={20} /></button></div>{historyDates.length > 0 && <div className="history-dates">{historyDates.slice(0, 21).map(d => <button key={d} className={date === d ? 'day-chip selected' : 'day-chip'} onClick={() => openDate(d)} disabled={busy}>{dateLabel(d)}{localDates.includes(d) && <span title="Есть черновик"> · черновик</span>}</button>)}</div>}{recordError && <p className="error-text" role="alert">История не загружена. {recordError}</p>}</section>}
      <div className="journal-layout"><div className="journal-main"><section className="card feelings-card"><div className="card-title"><span className="section-icon peach"><Heart size={20} /></span><h2>Как вы себя чувствуете?</h2><span className="optional">по желанию</span></div><fieldset disabled={disabled}><legend className="sr-only">Настроение и стресс</legend><label className="field-heading">Настроение</label><div className="mood-options">{moods.map(m => <button type="button" aria-pressed={e.mood === m.value} key={m.value} className={`mood-option ${e.mood === m.value ? 'selected' : ''}`} onClick={() => change({ mood: e.mood === m.value ? '' : m.value })}><span aria-hidden="true">{m.face}</span><small>{m.label}</small></button>)}</div><div className="stress-label"><label className="field-heading">Уровень стресса</label><span className="stress-value">{e.stress === null ? 'Не отмечен' : <><strong>{e.stress}</strong> / 10</>}</span></div><div className="stress-options" role="group" aria-label="Уровень стресса от 0 до 10">{Array.from({ length: 11 }, (_, i) => <button key={i} type="button" aria-label={`Стресс ${i} из 10`} aria-pressed={e.stress === i} className={e.stress === i ? 'selected' : ''} onClick={() => change({ stress: e.stress === i ? null : i })}>{i}</button>)}</div><div className="scale-labels"><span>Совсем нет</span><span>Очень сильный</span></div><label className="note-label">Что тревожило или помогло успокоиться?<textarea value={e.note} onChange={ev => change({ note: ev.target.value })} placeholder="Событие, разговор, прогулка…" maxLength={5000} rows={3} /></label></fieldset></section>
      <section className="card meals-card"><div className="card-title"><span className="section-icon sand"><Utensils size={20} /></span><h2>Питание</h2><span className="count-badge">{e.meals.length}</span></div><p className="card-description">Что и когда вы ели — без подсчётов и оценок.</p>{e.meals.length === 0 && !mealOpen && <div className="empty-meals"><span className="empty-line" /><p>Пока нет приёмов пищи</p></div>}<div className="meal-list">{e.meals.map(m => <div className="meal-row" key={m.id}><time>{m.time}</time><button disabled={disabled} className="meal-description" onClick={() => mealStart(m)} aria-label={`Изменить приём пищи ${m.time}: ${m.description}`}>{m.description}</button><button disabled={disabled} className="icon-button muted" aria-label={`Убрать приём пищи ${m.time}`} onClick={() => change({ meals: e.meals.filter(x => x.id !== m.id) })}><X size={17} /></button></div>)}</div>{mealOpen ? <form className="meal-form" onSubmit={addMeal}><label>Время<input type="time" value={mealTime} onChange={ev => setMealTime(ev.target.value)} required disabled={disabled} /></label><label className="meal-text">Что вы ели?<textarea value={mealText} onChange={ev => setMealText(ev.target.value)} placeholder="Например, каша и чай" maxLength={2000} rows={2} required autoFocus disabled={disabled} /></label><div className="meal-form-actions"><button className="secondary" type="submit" disabled={disabled || !mealText.trim()}><Check size={17} />{mealId ? 'Изменить' : 'Добавить'}</button><button className="text-button" type="button" onClick={() => setMealOpen(false)}>Отмена</button></div></form> : <button className="add-meal" disabled={disabled || e.meals.length >= 40} onClick={() => mealStart()}><Plus size={18} /> Добавить приём пищи</button>}{e.meals.length >= 40 && <p className="muted">До 40 приёмов пищи в день.</p>}</section>
      <section className="card diary-card"><div className="card-title"><span className="section-icon sage"><BookOpen size={20} /></span><h2>Мысли вслух</h2><span className="optional">свободная запись</span></div><p className="card-description">Здесь можно написать всё. Или всего пару слов.</p><label className="sr-only" htmlFor="diary">Обычный дневник</label><textarea id="diary" disabled={disabled} value={e.diary} onChange={ev => change({ diary: ev.target.value })} placeholder="Что хочется оставить на страницах этого дня?" maxLength={50000} rows={7} /><div className="diary-foot"><span>Не обязательно заполнять остальные поля</span><span>{e.diary.length.toLocaleString('ru-RU')} / 50 000</span></div></section>
      {error && <div className="notice error-notice" role="alert"><CloudOff size={20} /><div>{error}{conflict && <button className="text-button" disabled={busy} onClick={reloadRemote}>Скачать черновик и открыть серверную версию</button>}{!loaded && <button className="text-button" disabled={busy} onClick={() => setLoadAttempt(v => v + 1)}>Повторить загрузку записи</button>}</div></div>}{!storageOk && <div role="alert" className="notice error-notice">Не удалось записать черновик в память браузера. Оставьте страницу открытой и отправьте запись на сервер или скачайте черновик.<button className="text-button" onClick={() => download(`tiho-draft-${date}.json`, draft)}>Скачать черновик</button></div>}
      <div className="save-bar"><div className="save-status" role="status" aria-live="polite">{busy ? <Spinner /> : !online ? <CloudOff size={17} /> : status === 'Сохранено' ? <Check size={18} /> : <span className="status-dot" />}<span>{status}</span></div><button className="primary" disabled={disabled || !dirty || !hasContent(e) || conflict || mealOpen} onClick={save}>{busy ? 'Отправляем…' : error && !conflict ? <><RefreshCw size={17} /> Повторить отправку</> : <>Сохранить запись <Check size={17} /></>}</button></div>{mealOpen && <p className="muted form-hint">Сначала добавьте приём пищи или нажмите «Отмена».</p>}{exists && <button className="delete-entry" disabled={disabled} onClick={remove}><Trash2 size={16} /> Удалить запись за этот день</button>}</div>
      <aside className="journal-aside"><section className="card week-card"><div className="card-title spread"><h2>Стресс за неделю</h2><ChartNoAxesColumn size={18} className="muted-icon" /></div><p className="card-description">{dateLabel(weekDates(weekEnd)[0])} — {dateLabel(weekEnd)}</p>{recordError ? <p className="error-text">График не загружен.<button className="text-button" onClick={refreshRecords}>Повторить</button></p> : <StressChart records={records} end={weekEnd} />}<p className="chart-caption">Дни без отметок остаются пустыми.</p><button className="text-button week-link" onClick={() => go('week')}>Открыть неделю <ArrowRight size={16} /></button></section><div className="gentle-note"><span className="note-flower" aria-hidden="true">✳</span><p>Не каждый день<br />нужно описывать<br /><em>идеально.</em></p><small>Это место — для вас.<br />Пишите так, как хочется.</small></div><div className="aside-privacy"><LockKeyhole size={16} /><p>Ваши мысли остаются вашими.<br />Без ИИ и анализа записей.</p></div></aside></div>
    </>}
  </main><footer className="app-footer"><span>Тихо</span><span>Место для ваших наблюдений</span></footer></div><nav className="mobile-nav" aria-label="Мобильное меню">{nav.map(n => <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => go(n.id)} disabled={busy}><n.icon size={22} strokeWidth={1.7} /><span>{n.label}</span></button>)}</nav>{emulator && <div className="dev-badge">Локальная проверка · эмуляторы Firebase</div>}</div>;
}
