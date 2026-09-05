import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

const LINES = 4;

// Zwei Layouts: waagerechte Bahnen und Kaleidoskop
const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel[${LINES}];
uniform float uZap[${LINES}];
uniform float uKaleido;
uniform float uCrackle;

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  return mix(h11(i), h11(i + 1.0), f * f * (3.0 - 2.0 * f)) * 2.0 - 1.0;
}
// Große Wellen plus schnelles Knistern
float jitter(float s, float id, float amp) {
  float t = uTime;
  float slow = vnoise(s * 2.2 + t * 0.5 + id * 11.0) * 0.6 + vnoise(s * 5.0 - t * 0.8 + id * 5.0) * 0.3;
  // Knistern springt in Zeitschritten
  float tick = floor(t * 24.0);
  float fine = vnoise(s * 18.0 + tick * 3.1 + id * 7.0) * 0.18 + vnoise(s * 42.0 + tick * 1.7 + id) * 0.09;
  return slow * amp + fine * amp * (0.6 + uCrackle);
}

vec3 lineColor(float i) {
  if (i < 0.5) return vec3(0.62, 0.18, 1.0);
  if (i < 1.5) return vec3(0.12, 1.0, 0.35);
  if (i < 2.5) return vec3(0.25, 0.32, 1.0);
  return vec3(1.0, 0.12, 0.18);
}

// Kern + naher Schein + weiter Schein, d in Bildhöhen
vec3 glow(float d, vec3 c, float level, float px) {
  float w = 1.3 * px;
  float core = exp(-d * d / (w * w));
  float nearGlow = exp(-d / (px * 5.0)) * 0.5 + exp(-d / (px * 22.0)) * 0.12;
  float wide = exp(-d / 0.07) * 0.07;
  return (mix(c, vec3(1.0), 0.35) * core * 1.8 + c * (nearGlow + wide)) * level;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float px = 1.0 / uRes.y;

  vec3 straight = vec3(0.0);
  vec3 kaleido = vec3(0.0);
  // In ein Achtel falten
  vec2 q = abs(p);
  if (q.y > q.x) q = q.yx;
  float ks = (q.x + q.y) * 0.7071;
  float ko = (q.x - q.y) * 0.7071;

  for (int i = 0; i < ${LINES}; i++) {
    float fi = float(i);
    float level = 0.28 + uLevel[i] * 1.1 + uZap[i] * 1.2;
    float amp = 0.006 + uLevel[i] * 0.03 + uZap[i] * 0.03;
    // Waagerecht: vier Bahnen übereinander
    float y = 0.36 - fi * 0.24;
    float d = abs(p.y - y - jitter(p.x, fi, amp));
    straight += glow(d, tint(lineColor(fi)), level, px);
    // Kaleidoskop: zwei Lila- und zwei Blau-Linien in wachsendem Abstand
    float c = 0.12 + fi * 0.13;
    float dk = abs(ko - c - jitter(ks, fi + 10.0, amp * 0.8));
    vec3 kc = mod(fi, 2.0) < 1.0 ? vec3(0.68, 0.2, 1.0) : vec3(0.3, 0.36, 1.0);
    kaleido += glow(dk, tint(kc), level, px) * 0.6;
  }
  vec3 bg = tint(vec3(0.02, 0.015, 0.035));
  gl_FragColor = vec4(bg + mix(straight, kaleido, uKaleido), 1.0);
}
`;

class TeslaWaves implements VisualMode {
  private pass!: FullscreenPass;
  private readonly level = new Float32Array(LINES);
  private readonly zap = new Float32Array(LINES);
  private time = 0;
  private beats = 0;
  private kaleido = 0;
  private kaleidoTarget = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uTime: { value: 0 },
      uLevel: { value: this.level },
      uZap: { value: this.zap },
      uKaleido: { value: 0 },
      uCrackle: { value: 0 },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt * (0.8 + a.energy * 1.5);
    // Linie 0 = Höhen, 1 = obere Mitten, 2 = untere Mitten, 3 = Bass
    const ranges: [number, number][] = [[80, 128], [48, 80], [20, 48], [0, 20]];
    for (let i = 0; i < LINES; i++) {
      let v = 0;
      for (let k = ranges[i][0]; k < ranges[i][1]; k++) v = Math.max(v, a.spectrum[k]);
      this.level[i] += (v - this.level[i]) * Math.min(dt * (v > this.level[i] ? 20 : 4), 1);
      this.zap[i] *= Math.exp(-dt * 8);
    }
    if (a.beat) {
      this.beats++;
      // Kick zuckt durch die Bass-Linie
      this.zap[3] = 0.6 + a.bassRaw * 0.6;
      this.zap[this.beats % 3] = Math.max(this.zap[this.beats % 3], 0.4);
      if (this.beats % 32 === 0) this.kaleidoTarget = 1 - this.kaleidoTarget;
    }
    this.kaleido += (this.kaleidoTarget - this.kaleido) * Math.min(dt * 1.2, 1);
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uKaleido.value = this.kaleido;
    u.uCrackle.value = a.treble;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('tesla-waves').meta,
  create: () => new TeslaWaves(),
};
export default definition;
