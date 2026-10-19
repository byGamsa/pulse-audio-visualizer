import * as THREE from 'three';
import { BAND_COUNT, type AudioFeatures } from '../../audio/types';

const BANDS = 64;

// Spektrum der letzten Sekunden als Textur, x = Band (tief → hoch), y = Alter (0 = jetzt)
export class SpectrumHistory {
  readonly texture: THREE.DataTexture;
  private readonly data: Uint16Array;
  private clock = 0;

  constructor(
    readonly rows: number,
    private readonly rate = 60,
  ) {
    // Half-Float, damit WebGL2 ohne Extension linear filtert
    this.data = new Uint16Array(BANDS * rows);
    this.texture = new THREE.DataTexture(this.data, BANDS, rows, THREE.RedFormat, THREE.HalfFloatType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  // Sekunden, die die Textur abdeckt
  get seconds() {
    return this.rows / this.rate;
  }

  update(a: AudioFeatures) {
    this.clock += a.dt * this.rate;
    if (this.clock < 1) return;
    const steps = Math.min(Math.floor(this.clock), this.rows);
    this.clock -= Math.floor(this.clock);

    this.data.copyWithin(BANDS * steps, 0, BANDS * (this.rows - steps));
    for (let i = 0; i < BANDS; i++) {
      const src = i * 2;
      const v = Math.max(a.spectrum[src], a.spectrum[Math.min(src + 1, BAND_COUNT - 1)]);
      const h = THREE.DataUtils.toHalfFloat(Math.min(v, 1.5));
      for (let s = 0; s < steps; s++) this.data[s * BANDS + i] = h;
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

// band und age jeweils 0..1
export function spectrumHistoryGlsl(rows: number) {
  return `
uniform sampler2D uSpecHist;
float specAt(float band, float age) {
  vec2 uv = vec2(clamp(band, 0.0, 1.0) * ${(BANDS - 1) / BANDS} + ${0.5 / BANDS},
                 clamp(age, 0.0, 1.0) * ${(rows - 1) / rows} + ${0.5 / rows});
  return textureLod(uSpecHist, uv, 0.0).r;
}
float specNow(float band) { return specAt(band, 0.0); }
`;
}
