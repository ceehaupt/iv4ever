/**
 * Klang ohne Audiodateien: Effekte werden mit WebAudio synthetisiert, die Musik entsteht generativ
 * (ruhige Akkordflächen und eine pentatonische Melodie). Damit gibt es keine Lizenzfragen und kein Nachladen.
 * Der AudioContext startet erst nach der ersten Nutzereingabe (Browser-Vorgabe).
 */
export type Sfx = 'click' | 'move' | 'hit' | 'found' | 'turn' | 'tech' | 'victory' | 'error';

export interface SoundSettings {
  master: number;
  sfx: number;
  music: number;
  musicOn: boolean;
}

const PENTA = [0, 2, 4, 7, 9];
const ROOTS = [57, 60, 55, 62]; // A, C, G, D (MIDI)

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private musicTimer = 0;
  private bar = 0;
  private settings: SoundSettings = { master: 0.7, sfx: 0.8, music: 0.35, musicOn: true };

  /** Beim ersten Klick/Tastendruck aufrufen. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.apply(this.settings);
  }

  apply(s: SoundSettings): void {
    this.settings = { ...s };
    if (!this.ctx) return;
    this.masterGain.gain.value = s.master;
    this.sfxGain.gain.value = s.sfx;
    this.musicGain.gain.value = s.music * 0.5;
    if (s.musicOn && s.music > 0) this.startMusic();
    else this.stopMusic();
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, out: AudioNode, glide?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private noise(start: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(start);
  }

  play(name: Sfx): void {
    if (!this.ctx || this.settings.sfx <= 0 || this.settings.master <= 0) return;
    const t = this.ctx.currentTime + 0.01;
    const out = this.sfxGain;
    switch (name) {
      case 'click':
        this.tone(880, t, 0.05, 'triangle', 0.08, out);
        break;
      case 'move':
        this.tone(330, t, 0.12, 'sine', 0.1, out, 392);
        break;
      case 'hit':
        this.noise(t, 0.25, 0.35);
        this.tone(140, t, 0.25, 'square', 0.12, out, 70);
        break;
      case 'found':
        [0, 4, 7, 12].forEach((s, k) => this.tone(midi(60 + s), t + k * 0.09, 0.5, 'triangle', 0.12, out));
        break;
      case 'turn':
        this.tone(midi(67), t, 0.25, 'sine', 0.1, out);
        this.tone(midi(72), t + 0.12, 0.35, 'sine', 0.1, out);
        break;
      case 'tech':
        [0, 7, 12, 16].forEach((s, k) => this.tone(midi(64 + s), t + k * 0.07, 0.4, 'sine', 0.1, out));
        break;
      case 'victory':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, k) => this.tone(midi(60 + s), t + k * 0.12, 0.9, 'triangle', 0.12, out));
        break;
      case 'error':
        this.tone(220, t, 0.18, 'square', 0.06, out, 180);
        break;
    }
  }

  private startMusic(): void {
    if (!this.ctx || this.musicTimer) return;
    const step = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.05;
      const root = ROOTS[this.bar % ROOTS.length];
      // Akkordfläche (Grundton, Quinte, Oktave) mit langem An- und Abschwellen
      for (const s of [0, 7, 12]) this.pad(midi(root - 12 + s), t, 7.5);
      // Pentatonische Melodie, spärlich
      for (let k = 0; k < 4; k++) {
        if (Math.random() < 0.55) {
          const n = root + PENTA[Math.floor(Math.random() * PENTA.length)] + (Math.random() < 0.3 ? 12 : 0);
          this.tone(midi(n), t + k * 1.8 + Math.random() * 0.3, 1.6, 'sine', 0.05, this.musicGain);
        }
      }
      this.bar++;
    };
    step();
    this.musicTimer = window.setInterval(step, 7200);
  }

  private pad(freq: number, start: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.04, start + 2.5);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.musicGain);
    o.start(start);
    o.stop(start + dur + 0.1);
  }

  private stopMusic(): void {
    clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }
}
