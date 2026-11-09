import { useRef, useState, type ChangeEvent } from 'react';
import { FileUp, LoaderCircle } from 'lucide-react';
import { errorText, previewBackup, restoreBackup, type RestorePreview } from './api';
export default function RestorePanel({ onRestored }: { onRestored: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null); const [mode, setMode] = useState('merge');
  const backup = useRef<unknown>(null); const operation = useRef(crypto.randomUUID());
  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; setError(''); setMessage(''); setPreview(null); backup.current = null;
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) { setError('Копия должна быть не больше 32 МБ.'); return; }
    setBusy(true);
    try {
      let value: unknown;
      try { value = JSON.parse(await file.text()); } catch { throw new Error('Не удалось прочитать JSON. Выберите файл резервной копии.'); }
      const checked = await previewBackup(value); backup.current = value; operation.current = crypto.randomUUID(); setPreview(checked);
    } catch (e) { setError(e instanceof Error ? e.message : errorText(e)); } finally { setBusy(false); }
  }
  async function restore() {
    if (!preview) return;
    if (!window.confirm(mode === 'replace' ? `Заменить ВСЮ историю (${preview.current} записей) копией из ${preview.total} записей? Сервер сохранит страховочную копию. Локальные черновики останутся на устройстве.` : `Добавить ${preview.new} записей? Существующие дни останутся без изменений.`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await restoreBackup(backup.current, mode, preview.generation, operation.current);
      setMessage(`Восстановлено: ${result.restored}. Пропущено существующих дней: ${result.skipped}. Сервер подтвердил восстановление.`);
      setPreview(null); backup.current = null; onRestored();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <section className="card settings-card restore-card"><div className="card-title"><FileUp className="muted-icon" /><h2>Восстановить из копии</h2></div><p className="muted">Выберите JSON, скачанный в «Тихо». Сначала сайт проверит весь файл. Пароль и личный вход останутся прежними.</p><label className="backup-file">Файл резервной копии<input type="file" accept=".json,application/json" onChange={choose} disabled={busy} /></label>{preview && <div className="restore-preview"><p>В копии: <strong>{preview.total}</strong> записей. Новых дней: {preview.new}, совпадающих дат: {preview.existing}.</p><label>Как восстановить<select value={mode} disabled={busy} onChange={e => { setMode(e.target.value); operation.current = crypto.randomUUID(); }}><option value="merge">Дополнить: существующие дни сохранить</option><option value="replace">Заменить всю историю содержимым копии</option></select></label>{preview.hasOldDrafts && <p className="muted">В старой копии есть локальные черновики. Они останутся в JSON; автоматически восстанавливаются только сохранённые записи.</p>}<button className="primary" disabled={busy} onClick={restore}>{busy ? <LoaderCircle size={18} className="spin" /> : <FileUp size={18} />} Восстановить записи</button></div>}{busy && !preview && <p role="status" className="muted">Проверяем файл на сервере…</p>}{error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status" className="export-message">{message}</p>}</section>;
}
