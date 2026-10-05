import { KEYS, store } from './storage';

/**
 * Sound cues synthesised with the Web Audio API, so there are no audio files to
 * load or license. Browsers only allow audio after a tap, so call unlock() from one.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  muted = store.get(KEYS.muted) === '1';

  get ready() {
    return this.ctx?.state === 'running';
  }

  async unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx.state === 'running';
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    store.set(KEYS.muted, muted ? '1' : '0');
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + start;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  tick() { this.tone(880, 0, 0.06, 'square', 0.05); }
  urgent() { this.tone(1320, 0, 0.09, 'square', 0.07); }
  start() { this.tone(523, 0, 0.12, 'triangle'); this.tone(784, 0.1, 0.2, 'triangle'); }
  buzz() { this.tone(160, 0, 0.5, 'sawtooth', 0.12); this.tone(120, 0.05, 0.5, 'sawtooth', 0.1); }
  chime() { [659, 880, 1175].forEach((f, i) => this.tone(f, i * 0.09, 0.4, 'sine', 0.13)); }
  join() { this.tone(988, 0, 0.1, 'sine', 0.08); }
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.14, 0.35, 'triangle', 0.14));
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.6 + i * 0.12, 0.6, 'triangle', 0.12));
  }
}

export const sfx = new Sfx();
