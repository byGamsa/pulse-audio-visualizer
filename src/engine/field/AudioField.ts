import * as THREE from 'three';
import { BAND_COUNT, type AudioFeatures } from '../../audio/types';
import { fullscreenVert, simplex2 } from '../../shared/glsl';

// Spalten der Spektrum-Historie (Bänder) und Zeilen (Zeitschritte)
const HIST_BANDS = 64;
const HIST_ROWS = 128;
// Zeilen pro Sekunde: 128 Zeilen ≈ 2.1 s Audio-Gedächtnis
const HIST_RATE = 60;
const FIELD_SIZE = 256;
const MAX_IMPULSES = 4;

// R = Historie, G = Noise, B = Beat-Impulse, A = aktuelles Spektrum
export class AudioField {
  readonly texture: THREE.Texture;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly history: THREE.DataTexture;
  private readonly historyData: Uint16Array;
  private readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly impulses = new Float32Array(MAX_IMPULSES).fill(-1);
  private readonly impulseAmp = new Float32Array(MAX_IMPULSES);
  private impulseIndex = 0;
  private head = 0;
  private rowClock = 0;
  private time = 0;
  private flow = 0;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(FIELD_SIZE, FIELD_SIZE, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    });
    this.texture = this.target.texture;

    // Half-Float statt Float: in WebGL2 ohne Extension linear filterbar
    this.historyData = new Uint16Array(HIST_BANDS * HIST_ROWS);
    this.history = new THREE.DataTexture(this.historyData, HIST_BANDS, HIST_ROWS, THREE.RedFormat, THREE.HalfFloatType);
    this.history.minFilter = THREE.LinearFilter;
    this.history.magFilter = THREE.LinearFilter;
    this.history.wrapS = THREE.ClampToEdgeWrapping;
    this.history.wrapT = THREE.RepeatWrapping;
    this.history.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uHistory: { value: this.history },
        uHead: { value: 0 },
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uBass: { value: 0 },
        uImpulse: { value: this.impulses },
        uImpulseAmp: { value: this.impulseAmp },
        uCurrent: { value: new Float32Array(32) },
      },
      vertexShader: fullscreenVert,
      fragmentShader: `
        precision highp float;
        in vec2 vUv;
        uniform sampler2D uHistory;
        uniform float uHead;
        uniform float uTime;
        uniform float uFlow;
        uniform float uBass;
        uniform float uImpulse[${MAX_IMPULSES}];
        uniform float uImpulseAmp[${MAX_IMPULSES}];
        uniform float uCurrent[32];
        ${simplex2}

        float current(float x) {
          float f = clamp(x, 0.0, 1.0) * 31.0;
          int i = int(floor(f));
          return mix(uCurrent[i], uCurrent[min(i + 1, 31)], fract(f));
        }

        void main() {
          float u = vUv.x;
          float v = vUv.y;
          float band = abs(u * 2.0 - 1.0);
          // Leicht nach außen, sonst nur Sub-Bass in der Mitte
          float bx = pow(band, 0.85) * 0.92 + 0.5 / ${HIST_BANDS}.0;
          float row = uHead - v * ${HIST_ROWS - 1}.0 / ${HIST_ROWS}.0;
          float spec = texture(uHistory, vec2(bx, row)).r;

          vec2 np = vec2(u * 3.0, v * 3.0);
          vec2 warp = vec2(snoise(np * 0.5 + uFlow * 0.3), snoise(np * 0.5 + 7.1 - uFlow * 0.25));
          float noise = fbm(np + warp * (0.6 + uBass * 1.4) + vec2(0.0, -uFlow));

          float d = length(vec2((u - 0.5) * 2.0, v));
          float imp = 0.0;
          for (int i = 0; i < ${MAX_IMPULSES}; i++) {
            float age = uImpulse[i];
            if (age < 0.0) continue;
            float x = (d - age * 0.9) / (0.04 + age * 0.05);
            imp += exp(-x * x) * exp(-age * 1.6) * uImpulseAmp[i];
          }

          gl_FragColor = vec4(spec, noise, imp, current(band));
        }
      `,
    });
    const quad = new THREE.Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  update(renderer: THREE.WebGLRenderer, a: AudioFeatures) {
    this.time += a.dt;
    this.flow += a.dt * (0.08 + a.energy * 0.35);

    // Spektrum-Historie mit fester Rate, unabhängig von der Framerate
    this.rowClock += a.dt * HIST_RATE;
    let pushed = false;
    while (this.rowClock >= 1) {
      this.rowClock -= 1;
      this.head = (this.head + 1) % HIST_ROWS;
      const off = this.head * HIST_BANDS;
      for (let i = 0; i < HIST_BANDS; i++) {
        // 128 → 64 Bänder; obere 15 % (sehr hohe Höhen) weglassen
        const src = Math.floor(i * 1.7);
        const v = Math.max(a.spectrum[src], a.spectrum[Math.min(src + 1, BAND_COUNT - 1)]);
        this.historyData[off + i] = THREE.DataUtils.toHalfFloat(Math.min(v, 1.5));
      }
      pushed = true;
    }
    if (pushed) this.history.needsUpdate = true;

    for (let i = 0; i < MAX_IMPULSES; i++) {
      if (this.impulses[i] >= 0) this.impulses[i] = this.impulses[i] > 3 ? -1 : this.impulses[i] + a.dt;
    }
    if (a.beat) {
      this.impulses[this.impulseIndex] = 0;
      this.impulseAmp[this.impulseIndex] = 0.4 + a.bassRaw;
      this.impulseIndex = (this.impulseIndex + 1) % MAX_IMPULSES;
    }

    const cur = this.material.uniforms.uCurrent.value as Float32Array;
    for (let i = 0; i < 32; i++) cur[i] = a.spectrum[Math.floor(i * 3.4)];

    const u = this.material.uniforms;
    // Zeilenmitte des neuesten Eintrags in Texturkoordinaten
    u.uHead.value = (this.head + 0.5) / HIST_ROWS;
    u.uTime.value = this.time;
    u.uFlow.value = this.flow;
    u.uBass.value = a.bass;

    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
  }

  dispose() {
    this.target.dispose();
    this.history.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}

export const fieldGlsl = `
uniform sampler2D uField;
vec4 field(vec2 uv) { return texture(uField, clamp(uv, 0.0, 1.0)); }
`;
