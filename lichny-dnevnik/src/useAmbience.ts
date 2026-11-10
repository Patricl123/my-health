import { useEffect, useRef, useState } from 'react';
import { Ambience, type Sound } from './ambience';

export function useAmbience() {
  const engine = useRef<Ambience | null>(null);
  const [kind, setKind] = useState<Sound>('rain');
  const [volume, setVolume] = useState(30); const [minutes, setMinutes] = useState(10);
  const [playing, setPlaying] = useState(false); const [busy, setBusy] = useState(false);
  const [deadline, setDeadline] = useState(0); const [remaining, setRemaining] = useState(0); const [error, setError] = useState('');
  function stop() { engine.current?.stop(); setPlaying(false); setDeadline(0); setRemaining(0); }
  async function play(sound = kind) {
    setBusy(true); setError(''); setPlaying(false);
    const player = engine.current ||= new Ambience();
    try {
      const started = await player.play(sound, volume, minutes, () => { setPlaying(false); setDeadline(0); setRemaining(0); });
      if (started) { setPlaying(true); setDeadline(player.endsAt); setRemaining(minutes * 60); }
    } catch { setError('Браузер не смог включить звук. Нажмите «Включить звук» ещё раз или попробуйте другой браузер.'); }
    finally { setBusy(false); }
  }
  function choose(sound: Sound) { setKind(sound); if (playing) void play(sound); }
  function changeVolume(value: number) { setVolume(value); engine.current?.setVolume(value); }
  function changeTimer(value: number) {
    setMinutes(value);
    if (playing) { setDeadline(engine.current?.setTimer(value) || 0); setRemaining(value * 60); }
  }
  useEffect(() => () => { engine.current?.stop(); }, []);
  useEffect(() => {
    if (!playing || !deadline) return;
    function tick() {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setRemaining(left);
      if (!left) stop();
    }
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [playing, deadline]);
  return { kind, volume, minutes, playing, busy, remaining, error, play, stop, choose, changeVolume, changeTimer };
}
export type AmbienceControls = ReturnType<typeof useAmbience>;
export const clockLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
