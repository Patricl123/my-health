import { useState } from 'react';
import { ArrowRight, Check, CloudRain, Footprints, Heart, Leaf, LoaderCircle, Music2, Pause, Play, Timer, Volume2, Waves, X } from 'lucide-react';
import { soundNames, type Sound } from './ambience';
import { clockLabel, type AmbienceControls } from './useAmbience';

const sounds: { id: Sound; icon: typeof CloudRain; detail: string }[] = [
  { id: 'rain', icon: CloudRain, detail: 'Ровный шелест капель' },
  { id: 'waves', icon: Waves, detail: 'Медленный ритм прибоя' },
  { id: 'music', icon: Music2, detail: 'Мягкие переливы без слов' },
];
const grounding = [
  { title: 'Почувствуйте опору', text: 'Устройтесь удобнее. Заметьте, как стопы касаются пола или спина — спинки стула. Можно немного пошевелить пальцами.' },
  { title: 'Посмотрите вокруг', text: 'Найдите глазами три предмета. Неспешно отметьте их цвет, форму или какую-нибудь маленькую деталь.' },
  { title: 'Прислушайтесь', text: 'Заметьте два звука вокруг. Не нужно искать особенные — подойдут шум улицы, дождь или тихий гул комнаты.' },
  { title: 'Один маленький шаг', text: 'Спросите себя: «Что сейчас сделает ближайшие десять минут чуть легче?» Выберите что-то небольшое и посильное.' },
];

export default function CalmPage({ audio, onWrite }: { audio: AmbienceControls; onWrite: () => void }) {
  const [step, setStep] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  return <>
    <div className="page-heading"><span className="eyebrow">МОЖНО НЕНАДОЛГО ОСТАНОВИТЬСЯ</span><h1>Небольшая пауза</h1><p>Выберите звук или один простой способ позаботиться о себе.</p></div>
    <div className="calm-layout"><div><section className={`card sound-card sound-${audio.kind}`} aria-labelledby="sound-heading">
      <div className={`sound-landscape ${audio.playing ? 'is-playing' : ''}`} aria-hidden="true"><span className="landscape-circle" /><span className="landscape-hill hill-back" /><span className="landscape-hill hill-front" /><div className="rain-strokes">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${i * 9}%`, animationDelay: `${i * -0.23}s` }} />)}</div><span className="landscape-caption">Несколько минут в своём ритме</span></div>
      <div className="card-title"><span className="section-icon sage"><Volume2 size={20} /></span><h2 id="sound-heading">Звуки для паузы</h2></div><p className="card-description">Можно слушать, пока вы пишете в дневнике.</p>
      <div className="sound-choices" role="group" aria-label="Выбрать звук">{sounds.map(s => <button type="button" key={s.id} disabled={audio.busy} className={`sound-choice ${audio.kind === s.id ? 'selected' : ''}`} aria-pressed={audio.kind === s.id} onClick={() => audio.choose(s.id)}><s.icon size={25} strokeWidth={1.5} /><strong>{soundNames[s.id]}</strong><small>{s.detail}</small></button>)}</div>
      <div className="sound-controls"><button className="primary sound-play" disabled={audio.busy} onClick={() => audio.playing ? audio.stop() : void audio.play()}>{audio.busy ? <LoaderCircle size={19} className="spin" /> : audio.playing ? <Pause size={18} /> : <Play size={18} />}{audio.busy ? 'Подготавливаем…' : audio.playing ? 'Выключить звук' : 'Включить звук'}</button><span className="sound-state" role="status">{audio.playing ? `${soundNames[audio.kind]} · осталось ${clockLabel(audio.remaining)}` : 'Звук выключен'}</span></div>
      <label className="volume-label">Громкость <span>{audio.volume}%</span><input aria-label="Громкость звука" type="range" min="0" max="100" step="1" value={audio.volume} disabled={audio.busy} onChange={e => audio.changeVolume(Number(e.target.value))} /></label>
      <div className="sound-timer"><span><Timer size={17} /> Выключить через</span><div role="group" aria-label="Таймер звука">{[5, 10, 20].map(value => <button type="button" key={value} disabled={audio.busy} className={audio.minutes === value ? 'selected' : ''} aria-pressed={audio.minutes === value} onClick={() => audio.changeTimer(value)}>{value} мин</button>)}</div></div>
      {audio.error && <p role="alert" className="error-text">{audio.error}</p>}<p className="sound-footnote">Фон создаётся на устройстве и работает без интернета после первого открытия. При новом открытии сайта звук сам не включается.</p>
    </section>
    <section className="card grounding-card"><div className="card-title"><span className="section-icon sand"><Footprints size={20} /></span><h2>Вернуться к тому, что вокруг</h2></div>
      {step === null ? <><p className="muted">Когда мыслей слишком много, можно на минуту переключить внимание на опору, предметы и звуки рядом. Проходите шаги в удобном темпе.</p><button className="secondary" onClick={() => { setStep(0); setFinished(false); }}>Попробовать четыре шага <ArrowRight size={17} /></button></> : <div className="grounding-exercise" aria-live="polite"><div className="grounding-progress"><span>{finished ? 'Пауза завершена' : `Шаг ${step + 1} из ${grounding.length}`}</span><button className="icon-button" aria-label="Закончить упражнение" onClick={() => { setStep(null); setFinished(false); }}><X size={18} /></button></div><h3>{finished ? 'Пусть дальше будет чуть бережнее' : grounding[step].title}</h3><p>{finished ? 'Не нужно сразу решать всё. Можно остаться с тихим звуком или записать пару мыслей.' : grounding[step].text}</p><div className="grounding-actions">{finished ? <button className="secondary" onClick={onWrite}>Перейти к дневнику <ArrowRight size={17} /></button> : <button className="primary" onClick={() => step < grounding.length - 1 ? setStep(step + 1) : setFinished(true)}>{step === grounding.length - 1 ? <>Завершить <Check size={17} /></> : <>Дальше <ArrowRight size={17} /></>}</button>}{step > 0 && !finished && <button className="text-button" onClick={() => setStep(step - 1)}>Назад</button>}</div></div>}
      <p className="gentle-choice">Если этот способ не подходит, его можно пропустить.</p>
    </section></div>
    <aside className="calm-aside"><section className="card breathing-card"><span className="breathing-symbol" aria-hidden="true"><Leaf size={34} strokeWidth={1.2} /></span><h2>Без спешки</h2><p>Устройтесь удобно. Несколько раз мягко вдохните и выдохните в своём ритме, без усилия и задержек дыхания.</p><p className="muted">Не нужно стараться дышать глубже. Если неприятно, вернитесь к обычному дыханию или выберите другой способ.</p></section><section className="card heavy-day-card"><div className="card-title"><Heart size={21} className="muted-icon" /><h2>Если день был тяжёлым</h2></div><ul><li>Выберите одно небольшое дело вместо попытки закончить всё.</li><li>Разрешите себе отложить то, что может подождать.</li><li>Если есть силы и желание — немного пройдитесь или свяжитесь с близким человеком.</li></ul><button className="text-button" onClick={onWrite}>Оставить мысли в дневнике <ArrowRight size={16} /></button></section></aside></div>
    <div className="calm-sources"><p>Не обязательно почувствовать себя спокойнее сразу. Можно просто сделать паузу.</p><small>Способы самопомощи: <a href="https://www.who.int/publications/i/item/9789240003927" target="_blank" rel="noreferrer">руководство ВОЗ</a>, <a href="https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/" target="_blank" rel="noreferrer">дыхание без усилия — NHS</a>, <a href="https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/stress/" target="_blank" rel="noreferrer">небольшие шаги — NHS</a>.</small></div>
  </>;
}
