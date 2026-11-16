/**
 * Sound: real audio files when they exist (public/assets/audio/<name>.mp3), procedural WebAudio fallbacks otherwise.
 * Music tracks crossfade by situation: 'menu', 'explore', 'boss'. Created only after the first tap, as phones require.
 *
 * Drop-in files (any of them, mp3/ogg/wav):
 *   music_menu, music_explore, music_boss                     (loops)
 *   swing, hit, hit_heavy, slam, dash, hurt, die, warn, roar, magic, zap, soul, levelup
 */
const SFX_FILES = ['swing', 'hit', 'hit_heavy', 'slam', 'dash', 'hurt', 'die', 'warn', 'roar', 'magic', 'zap', 'soul', 'levelup', 'splash'];
const MUSIC = ['menu', 'explore', 'boss'] as const;
export type MusicTrack = typeof MUSIC[number] | null;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null; private sfxBus: GainNode | null = null; private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private files = new Map<string, AudioBuffer>();
  private track: MusicTrack = null; private trackNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wanted: MusicTrack = null;
  private base = '/';
  muted = false;

  /** Where audio files live (the game's base URL). */
  setBase(base: string): void { this.base = base; }

  unlock(): void {
    if (!this.ctx) {
      const C = window.AudioContext || (window as any).webkitAudioContext; if (!C) return;
      this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.45; this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      void this.loadFiles();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async loadFiles(): Promise<void> {
    const names = new Set<string>([...SFX_FILES, ...MUSIC.map((m) => 'music_' + m)]);
    let have: string[] = [];                                       // manifest.json is written at build time from the folder's contents
    try { const r = await fetch(`${this.base}assets/audio/manifest.json`); if (r.ok) have = await r.json(); } catch { /* none */ }
    await Promise.all(have.map(async (f) => {
      const n = f.replace(/\.[^.]+$/, ''); if (!names.has(n) || this.files.has(n)) return;
      try { const r = await fetch(`${this.base}assets/audio/${f}`); if (r.ok) this.files.set(n, await this.ctx!.decodeAudioData(await r.arrayBuffer())); }
      catch { /* unreadable file: the procedural sound plays */ }
    }));
    if (this.wanted) { const w = this.wanted; this.track = null; this.music(w); }
  }

  /** Play a file if present; returns false so the caller falls back to the synth. */
  private file(name: string, vol = 1, rate = 1): boolean {
    const b = this.files.get(name); if (!b || !this.ctx || !this.sfxBus || this.muted) return !!b;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g).connect(this.sfxBus); s.start(); return true;
  }

  /** Crossfade to a music track (null = silence). Missing tracks are silent. */
  music(t: MusicTrack): void {
    this.wanted = t; if (!this.ctx || !this.musicBus || t === this.track) return; this.track = t;
    const now = this.ctx.currentTime;
    if (this.trackNode) { const old = this.trackNode; old.gain.gain.cancelScheduledValues(now); old.gain.gain.setValueAtTime(old.gain.gain.value, now); old.gain.gain.linearRampToValueAtTime(0, now + 1.6); old.src.stop(now + 1.7); this.trackNode = null; }
    const b = t ? this.files.get('music_' + t) : undefined; if (!b) return;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true; const gain = this.ctx.createGain(); gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(1, now + 1.6); src.connect(gain).connect(this.musicBus); src.start(); this.trackNode = { src, gain };
  }

  private tone(f: number, dur: number, type: OscillatorType, vol: number, to?: number, delay = 0): void {
    if (!this.ctx || !this.sfxBus || this.muted) return; const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.sfxBus); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  private hiss(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0, sweepTo?: number): void {
    if (!this.ctx || !this.sfxBus || !this.noise || this.muted) return; const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q; if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.sfxBus); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }

  // ---- the sounds (each: a file if present, else a layered synth) ----
  /** Staff swing: an airy whoosh sweeping down in pitch; heavier on the later combo hits. */
  swing(i: number): void { if (this.file('swing', 0.8, 1.1 - i * 0.08)) return; this.hiss(0.16 + i * 0.05, 0.22 + i * 0.05, 3200 - i * 400, 1.4, 'bandpass', 0, 700); if (i >= 2) this.hiss(0.22, 0.12, 500, 0.8, 'lowpass', 0.02, 180); }
  /** Impact: a sharp crack, a body thump and a short crunch. */
  hit(heavy: boolean): void {
    if (this.file(heavy ? 'hit_heavy' : 'hit', heavy ? 1 : 0.8)) return;
    this.hiss(0.05, heavy ? 0.5 : 0.35, 3500, 0.9, 'highpass');                                        // crack
    this.tone(heavy ? 110 : 160, heavy ? 0.22 : 0.12, 'sine', heavy ? 0.5 : 0.35, heavy ? 45 : 70);      // thump
    this.hiss(heavy ? 0.18 : 0.09, heavy ? 0.3 : 0.18, 900, 0.8, 'bandpass', 0.01, 300);               // crunch
  }
  slam(): void { if (this.file('slam')) return; this.tone(70, 0.55, 'sine', 0.55, 28); this.hiss(0.5, 0.45, 400, 0.6, 'lowpass', 0, 90); this.hiss(0.12, 0.25, 2500, 0.7, 'highpass'); }
  dash(): void { if (this.file('dash', 0.8)) return; this.hiss(0.24, 0.24, 2600, 0.8, 'bandpass', 0, 600); }
  hurt(): void { if (this.file('hurt')) return; this.tone(200, 0.2, 'sawtooth', 0.12, 90); this.hiss(0.14, 0.28, 800, 0.7); this.tone(90, 0.18, 'sine', 0.3, 50); }
  die(): void { if (this.file('die')) return; this.tone(220, 0.7, 'sawtooth', 0.12, 45); this.hiss(0.6, 0.22, 500, 0.6, 'lowpass', 0, 120); }
  warn(): void { if (this.file('warn', 0.7)) return; this.tone(660, 0.07, 'triangle', 0.07); this.tone(660, 0.07, 'triangle', 0.07, undefined, 0.11); }
  roar(): void { if (this.file('roar')) return; this.tone(62, 1.0, 'sawtooth', 0.18, 38); this.tone(90, 0.9, 'square', 0.06, 42, 0.05); this.hiss(1.0, 0.32, 300, 0.5, 'lowpass', 0, 120); }
  magic(): void { if (this.file('magic', 0.8)) return; this.tone(440, 0.3, 'triangle', 0.09, 1320); this.tone(660, 0.35, 'sine', 0.06, 1760, 0.04); this.hiss(0.25, 0.12, 4200, 1.5, 'bandpass', 0, 2000); }
  zap(): void { if (this.file('zap', 0.8)) return; this.hiss(0.25, 0.26, 6000, 0.8, 'highpass'); this.tone(1400, 0.12, 'square', 0.05, 300); this.tone(80, 0.2, 'sawtooth', 0.1, 45, 0.02); }
  /** Water breaking: a slap and a hiss of spray (big: something huge surfacing or diving). */
  splash(big = false): void { if (this.file('splash', big ? 1 : 0.6)) return; this.hiss(big ? 1.1 : 0.45, big ? 0.3 : 0.14, 1400, 0.8, 'lowpass', 0, 300); this.hiss(big ? 0.6 : 0.3, big ? 0.14 : 0.07, 4800, 1.1, 'highpass', 0.04); if (big) this.tone(55, 0.5, 'sine', 0.25, 30); }
  block(): void { this.hiss(0.2, 0.3, 250, 0.7, 'lowpass'); this.tone(90, 0.25, 'sine', 0.2, 40); }
  /** A soul butterfly absorbed: a soft high chime. */
  soul(): void { if (this.file('soul', 0.5)) return; this.tone(1320 + Math.random() * 300, 0.35, 'sine', 0.035); this.tone(1980, 0.3, 'sine', 0.02, undefined, 0.03); }
  levelup(): void { if (this.file('levelup')) return; [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.08, undefined, i * 0.08)); }
}
export const sfx = new Sfx();
