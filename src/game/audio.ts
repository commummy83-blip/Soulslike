export const DODGE_IFRAME_AUDIO_CONFIG = {
  duration: 0.28,
  filterType: 'lowpass' as BiquadFilterType,
  cutoffStartHz: 1480,
  cutoffEndHz: 210,
  filterQ: 3.4,
  harmonicCutoffStartHz: 1120,
  harmonicCutoffEndHz: 190,
  harmonicFilterQ: 2.6,
  carrierFreqStart: 310,
  carrierFreqEnd: 138,
  harmonicFreqStart: 465,
  harmonicFreqEnd: 205,
} as const;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private volume = 0.7;
  private muted = false;

  public setAudioContextForTest(ctx: AudioContext | null): void {
    this.ctx = ctx;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || this.volume <= 0.01) return null;
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    this.ctx = new AudioCtx();
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

  /**
   * Distinct low-pass filtered spectral phase cue triggered at the moment
   * the player enters the dodge i-frame window.
   */
  public dodgeIframe(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const cfg = DODGE_IFRAME_AUDIO_CONFIG;
    const now = ctx.currentTime;
    const dur = cfg.duration;

    // 1. Low-pass filtered air-slip sweep
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.55);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = cfg.filterType;
    noiseFilter.Q.setValueAtTime(cfg.filterQ, now);
    noiseFilter.frequency.setValueAtTime(cfg.cutoffStartHz, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(cfg.cutoffEndHz, now + dur);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.22 * this.volume, now + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSrc.start(now);

    // 2. Low-pass filtered sub-harmonic phase shimmer
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const oscFilter = ctx.createBiquadFilter();
    const oscGain = ctx.createGain();

    oscA.type = 'sine';
    oscA.frequency.setValueAtTime(cfg.carrierFreqStart, now);
    oscA.frequency.exponentialRampToValueAtTime(cfg.carrierFreqEnd, now + dur);

    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(cfg.harmonicFreqStart, now);
    oscB.frequency.exponentialRampToValueAtTime(cfg.harmonicFreqEnd, now + dur);

    oscFilter.type = cfg.filterType;
    oscFilter.Q.setValueAtTime(cfg.harmonicFilterQ, now);
    oscFilter.frequency.setValueAtTime(cfg.harmonicCutoffStartHz, now);
    oscFilter.frequency.exponentialRampToValueAtTime(cfg.harmonicCutoffEndHz, now + dur);

    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.linearRampToValueAtTime(0.16 * this.volume, now + 0.018);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    oscA.connect(oscFilter);
    oscB.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(ctx.destination);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + dur + 0.02);
    oscB.stop(now + dur + 0.02);
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
