export type Sound = 'rain' | 'waves' | 'music';
export const soundNames: Record<Sound, string> = { rain: 'Мягкий дождь', waves: 'Морские волны', music: 'Тихие ноты' };

/** Own synthetic ambience. No audio files, network requests, microphones or third-party players. */
export class Ambience {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;
  private deadline = 0;
  private buffers = new Map<string, AudioBuffer>();

  private noise(context: AudioContext, kind: 'rain' | 'waves') {
    const key = `${kind}:${context.sampleRate}`;
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const buffer = context.createBuffer(2, context.sampleRate * 8, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = Math.random() * 2 - 1;
        smooth = kind === 'rain' ? smooth * 0.97 + white * 0.03 : (smooth + white * 0.018) / 1.018;
        samples[i] = kind === 'rain' ? white * 0.45 + smooth * 1.8 : smooth * 3.5;
      }
      // Crossfade the loop boundary without a pop.
      const fade = Math.floor(context.sampleRate * 0.06);
      for (let i = 0; i < fade; i++) {
        const mix = i / fade;
        samples[i] = samples[samples.length - fade + i] * (1 - mix) + samples[i] * mix;
      }
    }
    this.buffers.set(key, buffer);
    return buffer;
  }

  private async music(sampleRate: number) {
    const key = `music:${sampleRate}`;
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const offline = new OfflineAudioContext(2, sampleRate * 32, sampleRate);
    const notes = [261.63, 329.63, 392.0, 293.66, 440.0, 329.63, 261.63];
    notes.forEach((frequency, i) => {
      for (const [harmonic, amplitude] of [[1, 0.2], [2, 0.025]]) {
        const oscillator = offline.createOscillator();
        const envelope = offline.createGain();
        const panner = offline.createStereoPanner();
        const start = i * 4;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency * harmonic;
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(amplitude, start + 0.7);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + 7);
        envelope.gain.linearRampToValueAtTime(0, start + 7.8);
        panner.pan.value = i % 2 ? 0.25 : -0.25;
        oscillator.connect(envelope).connect(panner).connect(offline.destination);
        oscillator.start(start); oscillator.stop(start + 7.9);
      }
    });
    const buffer = await offline.startRendering();
    this.buffers.set(key, buffer);
    return buffer;
  }

  async play(kind: Sound, volume: number, minutes: number, onEnded: () => void) {
    this.stop();
    const generation = this.generation;
    // Create/resume directly in the user's click handler for mobile browser audio policies.
    const context = new AudioContext();
    this.context = context;
    try {
      const resumed = context.resume();
      const buffer = kind === 'music' ? await this.music(context.sampleRate) : this.noise(context, kind);
      await resumed;
      if (generation !== this.generation || context.state === 'closed') return false;
      if (context.state !== 'running') throw new Error('audio-suspended');
      const master = context.createGain();
      master.gain.setValueAtTime(0, context.currentTime);
      master.gain.linearRampToValueAtTime(this.level(volume), context.currentTime + 0.4);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = kind === 'rain' ? 4800 : kind === 'waves' ? 1800 : 3800;
      const source = context.createBufferSource();
      source.buffer = buffer; source.loop = true;
      source.connect(filter).connect(master).connect(context.destination);
      if (kind === 'waves') {
        const swell = context.createGain();
        const lfo = context.createOscillator(); const amount = context.createGain();
        // Gentle changes in loudness, entirely inside the audio engine.
        filter.disconnect(); filter.connect(swell).connect(master);
        swell.gain.value = 0.65; amount.gain.value = 0.3;
        lfo.frequency.value = 0.105; lfo.connect(amount).connect(swell.gain); lfo.start();
      }
      this.master = master; this.source = source;
      source.onended = () => { if (generation === this.generation) { this.stop(); onEnded(); } };
      source.start(); this.setTimer(minutes);
      return true;
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }

  private level(volume: number) { return Math.max(0, Math.min(100, volume)) / 100 * 0.35; }
  setVolume(volume: number) {
    if (this.context && this.master) {
      const time = this.context.currentTime;
      const current = this.master.gain.value;
      // A user's volume change supersedes the still scheduled startup fade.
      this.master.gain.cancelScheduledValues(time);
      this.master.gain.setValueAtTime(current, time);
      this.master.gain.setTargetAtTime(this.level(volume), time, 0.05);
    }
  }
  setTimer(minutes: number) {
    if (!this.context || !this.source) return 0;
    this.deadline = Date.now() + minutes * 60_000;
    this.source.stop(this.context.currentTime + minutes * 60);
    return this.deadline;
  }
  get endsAt() { return this.deadline; }
  stop() {
    this.generation++;
    if (this.source) { this.source.onended = null; try { this.source.stop(); } catch {} }
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
    this.source = null; this.master = null; this.context = null; this.deadline = 0;
  }
}
