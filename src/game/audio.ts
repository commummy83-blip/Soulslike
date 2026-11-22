class SoundEngine {
  private ctx: AudioContext | null = null;
  private volume = 0.7;
  private muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || this.volume <= 0.01) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public configure(volume: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const jitter = 0.94 + Math.random() * 0.12;

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd * jitter), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak * this.volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoiseBurst(duration: number, filterFreq: number, gainPeak: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.value = gainPeak * this.volume;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  public swing(heavy = false): void {
    this.playNoiseBurst(heavy ? 0.24 : 0.14, heavy ? 420 : 680, heavy ? 0.24 : 0.16);
    this.playTone(heavy ? 180 : 280, heavy ? 70 : 110, heavy ? 0.22 : 0.12, 'triangle', 0.12);
  }

  public hit(heavy = false): void {
    this.playNoiseBurst(heavy ? 0.16 : 0.09, heavy ? 520 : 880, heavy ? 0.34 : 0.22);
    this.playTone(heavy ? 150 : 210, 46, heavy ? 0.18 : 0.11, 'sawtooth', heavy ? 0.25 : 0.16);
  }

  public parry(): void {
    this.playTone(980, 1480, 0.22, 'sine', 0.26);
    this.playTone(620, 420, 0.28, 'triangle', 0.18);
  }

  public block(): void {
    this.playNoiseBurst(0.08, 1200, 0.22);
    this.playTone(340, 160, 0.12, 'square', 0.14);
  }

  public dodge(): void {
    this.playNoiseBurst(0.16, 360, 0.14);
  }

  public playerHurt(): void {
    this.playTone(145, 52, 0.24, 'sawtooth', 0.24);
    this.playNoiseBurst(0.12, 320, 0.2);
  }

  public estus(): void {
    this.playTone(440, 660, 0.28, 'sine', 0.16);
    this.playTone(660, 880, 0.34, 'triangle', 0.12);
  }

  public enemyDefeat(): void {
    this.playTone(220, 68, 0.38, 'triangle', 0.2);
    this.playNoiseBurst(0.28, 480, 0.16);
  }

  public bossTelegraph(): void {
    this.playTone(110, 240, 0.42, 'sawtooth', 0.18);
  }

  public victory(): void {
    this.playTone(293.66, 293.66, 0.45, 'triangle', 0.2);
    setTimeout(() => this.playTone(440, 440, 0.55, 'triangle', 0.2), 160);
    setTimeout(() => this.playTone(587.33, 587.33, 0.85, 'sine', 0.24), 340);
  }

  public defeat(): void {
    this.playTone(130, 58, 0.85, 'sawtooth', 0.22);
    this.playTone(98, 44, 1.0, 'triangle', 0.2);
  }

  public uiClick(): void {
    this.playTone(520, 390, 0.05, 'triangle', 0.09);
  }
}

export const soundEngine = new SoundEngine();
