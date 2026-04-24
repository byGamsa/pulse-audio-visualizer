import { BAND_COUNT, bandFrequency, createEmptyFeatures, type AudioFeatures, type AudioSource } from './types';
import type { AudioSettings } from '../store/settings';

const FLOOR_DB = -88;
const RANGE_DB = 62;
// Musik fällt mit ca. 3 dB/Oktave ab
const TILT_DB_PER_OCTAVE = 3;
const TILT_PIVOT = 400;

// Exponentielles Glätten unabhängig von der Framerate
function follow(current: number, target: number, dt: number, attack: number, release: number) {
  const tau = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)));
}

export class FeatureBus {
  readonly features: AudioFeatures = createEmptyFeatures();
  source: AudioSource | null = null;

  private readonly db = new Float32Array(BAND_COUNT);
  private readonly raw = new Float32Array(BAND_COUNT);
  private readonly prevRaw = new Float32Array(BAND_COUNT);
  private readonly tilt = new Float32Array(BAND_COUNT);
  private readonly freq = new Float32Array(BAND_COUNT);

  private agcPeak = 0.5;
  private agcGain = 1;
  private fluxPeak = 0.01;
  private kickMean = 0;
  private kickVar = 0;
  private kickPeak = 0.05;
  private prevKick = 0;
  private lastBeat = -1;
  private intervals: number[] = [];

  constructor() {
    for (let i = 0; i < BAND_COUNT; i++) {
      this.freq[i] = bandFrequency(i);
      this.tilt[i] = TILT_DB_PER_OCTAVE * Math.log2(this.freq[i] / TILT_PIVOT);
    }
  }

  update(time: number, dt: number, s: AudioSettings) {
    const f = this.features;
    f.time = time;
    f.dt = dt;
    f.beat = false;

    if (!this.source) {
      this.decayToSilence(dt, s);
      return;
    }

    this.source.readBandsDb(this.db);
    this.source.readWaveform(f.waveL, f.waveR);

    // 1) dB → 0..1, mit Tilt-Ausgleich und Band-Gewichten
    let frameMax = 0;
    for (let i = 0; i < BAND_COUNT; i++) {
      const hz = this.freq[i];
      const weight = hz < s.bassCutoff ? s.bassGain : hz < s.trebleCutoff ? s.midGain : s.trebleGain;
      const v = Math.min(Math.max((this.db[i] + this.tilt[i] - FLOOR_DB) / RANGE_DB, 0), 1.5);
      this.raw[i] = v * v * s.sensitivity * weight;
      if (this.raw[i] > frameMax) frameMax = this.raw[i];
    }

    // 2) Auto-Gain: schnell nach oben, langsam (≈ 4 s) wieder nach unten
    if (s.autoGain) {
      this.agcPeak = frameMax > this.agcPeak ? frameMax : this.agcPeak * Math.exp(-dt / 4);
      const target = 0.85 / Math.max(this.agcPeak, 0.12);
      this.agcGain = follow(this.agcGain, target, dt, 0.4, 1.5);
    } else {
      this.agcGain = 1;
    }

    // 3) Smoothing, Bandsummen, Flux, Centroid
    let bass = 0, mid = 0, treble = 0, nb = 0, nm = 0, nt = 0;
    let flux = 0, weighted = 0, total = 0;
    for (let i = 0; i < BAND_COUNT; i++) {
      const r = Math.min(this.raw[i] * this.agcGain, 1.2);
      flux += Math.max(0, r - this.prevRaw[i]);
      this.prevRaw[i] = r;
      f.spectrum[i] = follow(f.spectrum[i], r, dt, s.attack, s.release);
      weighted += i * r;
      total += r;
      const hz = this.freq[i];
      if (hz < s.bassCutoff) { bass += r; nb++; }
      else if (hz < s.trebleCutoff) { mid += r; nm++; }
      else { treble += r; nt++; }
    }
    const fftBass = nb ? bass / nb : 0;
    f.midRaw = nm ? mid / nm : 0;
    f.trebleRaw = nt ? treble / nt : 0;
    f.centroid = follow(f.centroid, total > 0.01 ? weighted / total / BAND_COUNT : 0, dt, 0.2, 0.6);

    flux /= BAND_COUNT;
    this.fluxPeak = Math.max(flux, this.fluxPeak * Math.exp(-dt / 3), 0.004);
    f.onset = follow(f.onset, flux / this.fluxPeak, dt, 0.005, 0.12);

    // 4) Kick-Hüllkurve für Bass-Punch und Beat
    const kick = this.source.readKick();
    this.kickPeak = Math.max(kick, this.kickPeak * Math.exp(-dt / 5), 0.01);
    const kickNorm = Math.min(kick / this.kickPeak, 1);
    f.bassRaw = Math.min(fftBass * 0.5 + kickNorm * 0.6, 1.2);
    this.detectBeat(time, dt, kick, s);

    f.bass = follow(f.bass, f.bassRaw, dt, s.attack, s.release);
    f.mid = follow(f.mid, f.midRaw, dt, s.attack, s.release);
    f.treble = follow(f.treble, f.trebleRaw, dt, s.attack, s.release);
    f.energy = follow(f.energy, total / BAND_COUNT, dt, s.attack, s.release * 1.5);
    this.updatePhase(time);
  }

  private detectBeat(time: number, dt: number, kick: number, s: AudioSettings) {
    // Gleitender Mittelwert + Varianz über ca. 1 s
    const a = 1 - Math.exp(-dt / 1.0);
    const d = kick - this.kickMean;
    this.kickMean += a * d;
    this.kickVar = (1 - a) * (this.kickVar + a * d * d);
    const threshold = this.kickMean + s.beatThreshold * Math.sqrt(this.kickVar);
    const rising = kick > this.prevKick;
    this.prevKick = kick;

    if (rising && kick > threshold && kick > 0.02 && time - this.lastBeat > 0.27) {
      if (this.lastBeat > 0) {
        const iv = time - this.lastBeat;
        this.intervals.push(iv);
        if (this.intervals.length > 16) this.intervals.shift();
        const sorted = [...this.intervals].sort((x, y) => x - y);
        this.features.bpm = 60 / sorted[Math.floor(sorted.length / 2)];
      }
      this.lastBeat = time;
      this.features.beat = true;
    }
  }

  private updatePhase(time: number) {
    const period = 60 / this.features.bpm;
    this.features.beatPhase = this.lastBeat < 0 ? 0 : (((time - this.lastBeat) / period) % 1 + 1) % 1;
  }

  private decayToSilence(dt: number, s: AudioSettings) {
    const f = this.features;
    for (let i = 0; i < BAND_COUNT; i++) f.spectrum[i] = follow(f.spectrum[i], 0, dt, s.attack, s.release);
    f.bass = follow(f.bass, 0, dt, s.attack, s.release);
    f.mid = follow(f.mid, 0, dt, s.attack, s.release);
    f.treble = follow(f.treble, 0, dt, s.attack, s.release);
    f.energy = follow(f.energy, 0, dt, s.attack, s.release);
    f.bassRaw = f.midRaw = f.trebleRaw = f.onset = 0;
    f.waveL.fill(0);
    f.waveR.fill(0);
  }
}
