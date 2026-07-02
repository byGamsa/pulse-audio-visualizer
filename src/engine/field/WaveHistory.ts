import * as THREE from 'three';
import { WAVE_SIZE, type AudioFeatures } from '../../audio/types';

// Letzte N Wellenformen als Textur, Zeile 0 = jetzt
export class WaveHistory {
  readonly texture: THREE.DataTexture;
  private readonly data: Float32Array;
  private readonly scratch = new Float32Array(WAVE_SIZE);
  private clock = 0;
  private peak = 0.1;

  constructor(
    readonly rows: number,
    private readonly rate = 30,
    private readonly smoothing = 6,
  ) {
    this.data = new Float32Array(WAVE_SIZE * rows);
    this.texture = new THREE.DataTexture(this.data, WAVE_SIZE, rows, THREE.RedFormat, THREE.FloatType);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
  }

  // Zeilenmitte treffen
  rowCoord(row: number) {
    return (row + 0.5) / this.rows;
  }

  update(a: AudioFeatures) {
    this.clock += a.dt * this.rate;
    if (this.clock < 1) return;
    this.clock = 0;

    // Mono, gleitender Mittelwert und eigene Normierung auf etwa ±1
    let max = 0;
    const k = this.smoothing;
    for (let i = 0; i < WAVE_SIZE; i++) {
      let s = 0;
      let n = 0;
      for (let j = -k; j <= k; j++) {
        const x = i + j;
        if (x < 0 || x >= WAVE_SIZE) continue;
        s += a.waveL[x] + a.waveR[x];
        n += 2;
      }
      this.scratch[i] = s / n;
      max = Math.max(max, Math.abs(this.scratch[i]));
    }
    this.peak = Math.max(max, this.peak * 0.97, 0.01);

    this.data.copyWithin(WAVE_SIZE, 0, WAVE_SIZE * (this.rows - 1));
    for (let i = 0; i < WAVE_SIZE; i++) this.data[i] = this.scratch[i] / this.peak;
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
