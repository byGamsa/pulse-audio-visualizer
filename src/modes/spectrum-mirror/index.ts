import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

const BARS = 48;
const LAYERS = 3;
// Frames zwischen den Tiefenebenen
const LAYER_DELAY = 9;

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uSpec[${BARS * LAYERS}];
uniform float uBass;
uniform float uTime;

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return tint(v * mix(vec3(1.0), k, s));
}

// p: Bildkoordinaten, Mitte = (0, 0)
vec3 layer(vec2 p, int L, float scale) {
  p /= scale;
  float ax = abs(p.x);
  float width = 0.5 * uRes.x / uRes.y;
  if (ax > width) return vec3(0.0);
  float f = ax / width;
  float bi = floor(f * ${BARS}.0);
  float local = fract(f * ${BARS}.0);
  float h = uSpec[L * ${BARS} + int(bi)] * 0.46;
  float ay = abs(p.y);
  // Säule aus LED-Strichen
  float column = smoothstep(0.08, 0.14, local) * smoothstep(0.86, 0.8, local);
  float segs = 90.0;
  float dash = smoothstep(0.15, 0.3, fract(ay * segs)) * smoothstep(0.85, 0.7, fract(ay * segs));
  float lit = step(ay, h) * column * dash;
  // Leuchtende Spitze
  float cap = exp(-pow((ay - h) * 220.0, 2.0)) * column;
  // Regenbogen von der Mitte (Rot) nach außen (Violett)
  vec3 c = hsv(f * 0.78, 0.85, 1.0);
  float glow = exp(-ay * 6.0) * 0.12 * column;
  return c * (lit * (0.9 + 0.6 * (1.0 - ay / max(h, 1e-3))) + cap * 1.4 + glow * step(ay, h + 0.02));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 col = vec3(0.01, 0.012, 0.02);
  // Tiefenebenen von hinten nach vorn: kleiner, dunkler, ältere Daten
  for (int L = ${LAYERS - 1}; L >= 0; L--) {
    float s = pow(0.62, float(L));
    float a = pow(0.38, float(L));
    col += layer(p, L, s) * a;
  }
  // Lichtachse in der Mitte
  col += tint(vec3(1.0, 0.75, 0.55)) * exp(-abs(p.y) * 220.0) * 0.25 * (0.6 + uBass);
  col += tint(vec3(1.0, 0.6, 0.4)) * exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * 3.0) * 0.12 * (0.5 + uBass);
  gl_FragColor = vec4(col, 1.0);
}
`;

class SpectrumMirror implements VisualMode {
  private pass!: FullscreenPass;
  private readonly spec = new Float32Array(BARS * LAYERS);
  private readonly history: Float32Array[] = [];
  private readonly current = new Float32Array(BARS);
  private time = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uSpec: { value: this.spec },
      uBass: { value: 0 },
      uTime: { value: 0 },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    for (let i = 0; i < BARS; i++) {
      const from = Math.floor((i / BARS) * 110);
      const to = Math.floor(((i + 1) / BARS) * 110);
      let v = 0;
      for (let k = from; k <= to; k++) v = Math.max(v, a.spectrum[k]);
      // LED-Balken: sofort hoch, sanft runter
      this.current[i] = v > this.current[i] ? v : Math.max(this.current[i] - a.dt * 1.8, 0);
    }
    this.history.unshift(new Float32Array(this.current));
    if (this.history.length > LAYER_DELAY * LAYERS) this.history.pop();
    for (let L = 0; L < LAYERS; L++) {
      const src = this.history[Math.min(L * LAYER_DELAY, this.history.length - 1)];
      this.spec.set(src, L * BARS);
    }
    this.pass.uniforms.uBass.value = a.bass;
    this.pass.uniforms.uTime.value = this.time;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('spectrum-mirror').meta,
  create: () => new SpectrumMirror(),
};
export default definition;
