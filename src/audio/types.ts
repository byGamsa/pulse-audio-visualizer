export const BAND_COUNT = 128;
export const WAVE_SIZE = 512;

// Werte 0..1, sofern nicht anders angegeben
export interface AudioFeatures {
  // Log-skalierte Bänder (tief → hoch), geglättet und nach Auto-Gain
  spectrum: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  // Ungeglättet, für harte Impulse
  bassRaw: number;
  midRaw: number;
  trebleRaw: number;
  // Spectral Flux, normiert
  onset: number;
  // true genau in dem Frame, in dem ein Beat erkannt wurde
  beat: boolean;
  // 0..1 zwischen zwei erwarteten Beats
  beatPhase: number;
  bpm: number;
  // Spektraler Schwerpunkt, 0 = dumpf, 1 = hell
  centroid: number;
  waveL: Float32Array;
  waveR: Float32Array;
  // Sekunden seit Start, und Delta zum letzten Frame
  time: number;
  dt: number;
}

export function createEmptyFeatures(): AudioFeatures {
  return {
    spectrum: new Float32Array(BAND_COUNT),
    bass: 0, mid: 0, treble: 0, energy: 0,
    bassRaw: 0, midRaw: 0, trebleRaw: 0,
    onset: 0, beat: false, beatPhase: 0, bpm: 120, centroid: 0,
    waveL: new Float32Array(WAVE_SIZE),
    waveR: new Float32Array(WAVE_SIZE),
    time: 0, dt: 0,
  };
}

export type AudioSourceKind = 'demo' | 'file' | 'mic' | 'display';

export const MIN_FREQ = 30;
export const MAX_FREQ = 16000;

// Mittenfrequenz von Band i (logarithmisch verteilt)
export function bandFrequency(i: number): number {
  return MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, (i + 0.5) / BAND_COUNT);
}

// Untere Kante von Band i; bandEdge(BAND_COUNT) ist MAX_FREQ
export function bandEdge(i: number): number {
  return MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / BAND_COUNT);
}

export interface AudioSource {
  readonly kind: AudioSourceKind;
  readonly label: string;
  // Pegel pro Band in dB (ca. -100 .. 0)
  readBandsDb(out: Float32Array): void;
  // Zeitbereich, Stereo, -1..1
  readWaveform(left: Float32Array, right: Float32Array): void;
  // RMS des Tiefpass-Signals, reagiert schneller als die FFT
  readKick(): number;
  dispose(): void;
}
