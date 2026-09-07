import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { LineSet } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { tint } from '../../shared/glsl';

const COLS = 26;
const ROWS = 22;
const BANDS = 16;

const glsl = `
${tint}
uniform float uBand[${BANDS}];
uniform float uPush;
uniform float uWave;
uniform float uWaveAmp;
const float CELL = 1.5;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float h21(vec2 p) { return h11(p.x * 17.31 + p.y * 113.7); }

vec3 vertexAt(vec2 g) {
  float a = h21(g), b = h21(g + 3.1), c = h21(g + 7.7), d = h21(g + 11.3);
  vec3 p = vec3((g.x - ${COLS / 2}.0 + (a - 0.5) * 0.75) * CELL, 0.0, (g.y - ${ROWS / 2}.0 + (b - 0.5) * 0.75) * CELL);
  // Nur einzelne Knoten heben sich zu Spitzen
  float peak = smoothstep(0.62, 0.7, c);
  float rise = 0.5 - 0.5 * cos(uTime * (0.18 + a * 0.22) + d * 6.2831853);
  p.y = peak * rise * (0.8 + d * 1.4) * (0.7 + uPush);
  return p;
}

void edge(float line, out vec2 g0, out vec2 g1, out float id) {
  id = floor(line * ${COLS * ROWS * 3 - 1}.0 + 0.5);
  float k = mod(id, 3.0);
  float cell = floor(id / 3.0);
  vec2 g = vec2(mod(cell, ${COLS}.0), floor(cell / ${COLS}.0));
  g0 = g;
  g1 = g + (k < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  if (k > 1.5) {
    bool flip = h21(g + 0.5) > 0.5;
    g0 = flip ? g : g + vec2(1.0, 0.0);
    g1 = flip ? g + vec2(1.0) : g + vec2(0.0, 1.0);
  }
}

vec3 linePos(float line, float t) {
  vec2 g0, g1; float id;
  edge(line, g0, g1, id);
  return mix(vertexAt(g0), vertexAt(g1), t);
}

float lineIntensity(float line, float t) {
  vec2 g0, g1; float id;
  edge(line, g0, g1, id);
  float h = h11(id * 0.731 + 0.17);
  float e = uBand[int(h * ${BANDS - 0.01})];
  bool major = h > 0.7;
  float level = major ? 0.6 + e * e * 3.0 : 0.09 + e * 0.15;
  vec3 m = (vertexAt(g0) + vertexAt(g1)) * 0.5;
  level += exp(-pow((length(m.xz) - uWave) * 0.5, 2.0)) * uWaveAmp * (major ? 1.6 : 0.3);
  // Zum Rand der Platte hin ausblenden
  vec2 q = abs((g0 + g1) * 0.5 / vec2(${COLS}.0, ${ROWS}.0) - 0.5) * 2.0;
  return level * smoothstep(1.0, 0.75, max(q.x, q.y));
}

vec3 lineColor(float line, float t) { return tint(vec3(1.0, 0.05, 0.025)); }
`;

class RedLattice implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
  private lines!: LineSet;
  private readonly bands = new Float32Array(BANDS);
  private time = 0;
  private push = 0;
  private wave = 99;
  private waveAmp = 0;

  init(ctx: ModeContext) {
    this.lines = new LineSet({
      lines: COLS * ROWS * 3, points: 2, width: 1.6, palette: ctx.palette, glsl,
      uniforms: { uBand: { value: this.bands }, uPush: { value: 0 }, uWave: { value: 99 }, uWaveAmp: { value: 0 }, uPaletteMix: ctx.paletteMix },
    });
    this.lines.uniforms.uFocus.value = 9;
    this.lines.uniforms.uDof.value = 0.5;
    this.scene.add(this.lines.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.lines.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    for (let i = 0; i < BANDS; i++) {
      let v = 0;
      for (let k = 0; k < 7; k++) v = Math.max(v, a.spectrum[i * 7 + k]);
      this.bands[i] = v > this.bands[i] ? v : this.bands[i] * Math.exp(-dt * 4);
    }
    if (a.beat) {
      this.wave = 0;
      this.waveAmp = 0.6 + a.bassRaw * 0.8;
    }
    this.wave += dt * 7;
    this.waveAmp *= Math.exp(-dt * 1.2);
    // Weich nachgeführt, damit die Spitzen nie springen
    this.push += (a.bass * 0.8 - this.push) * Math.min(dt * 1.2, 1);
    const u = this.lines.uniforms;
    u.uTime.value = this.time;
    u.uPush.value = this.push;
    u.uWave.value = this.wave;
    u.uWaveAmp.value = this.waveAmp;
    // Die Kamera driftet langsam über die Platte
    const t = this.time * 0.04;
    // Steil von oben, Platte füllt das Bild
    this.camera.position.set(Math.sin(t) * 2, 8.5 + Math.sin(this.time * 0.06) * 0.6, 8 + Math.cos(t) * 1.2);
    this.camera.lookAt(Math.sin(t * 0.7) * 1.2, 0, -0.5);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.lines.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('red-lattice').meta,
  create: () => new RedLattice(),
};
export default definition;
