import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

const STRANDS = 8;

// Analytisch gezeichnet, daher ohne Treppenstufen
const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uSpread;
uniform float uHue;
uniform float uGlow;
uniform float uBand[${STRANDS}];
${palette}
${tint}

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

// Höhe von Strang i an Stelle x
float strand(float x, float i) {
  float o = (i / ${STRANDS - 1}.0 - 0.5) * 2.0;
  // Engstelle wandert, Bündel fächert ungleich auf
  float pinch = 0.15 + sin(uTime * 0.11) * 0.35;
  float dx = x - pinch;
  float fan = mix(0.28, 0.4, step(0.0, dx)) * uSpread * pow(abs(dx) + 0.02, 1.15);
  // Grundkurve: sanftes S, das sich langsam neigt und wogt
  float c = -0.08 + 0.22 * tanh(dx * 1.6) + sin(x * 1.3 + uTime * 0.27) * 0.06;
  // Jeder Strang schwingt ein wenig mit seinem Band
  float wob = sin(x * 2.4 - uTime * (0.6 + i * 0.05) + i * 1.7) * 0.02 * (0.3 + uBand[int(i)] * 2.0) * abs(dx);
  return c + o * fan + wob;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float px = 1.0 / uRes.y;

  // Farbe wandert, Stränge leicht versetzt
  vec3 core = vec3(0.0);
  vec3 glow = vec3(0.0);
  float hot = 0.0;
  for (int k = 0; k < ${STRANDS}; k++) {
    float i = float(k);
    float y = strand(p.x, i);
    // Senkrechter Abstand, damit die Breite konstant bleibt
    float slope = (strand(p.x + 0.002, i) - strand(p.x - 0.002, i)) / 0.004;
    float d = abs(p.y - y) / sqrt(1.0 + slope * slope);
    float level = 0.9 + uBand[k] * 1.3;
    float w = (9.0 + uBand[k] * 5.0) * px;
    vec3 c = tint(hsv(uHue + i * 0.018, 0.7, 1.0));
    float cr = exp(-d * d / (w * w));
    core += mix(c, vec3(1.0), 0.75) * cr * level * 1.4;
    glow += c * (exp(-d / (w * 2.2)) * 0.6 + exp(-d / 0.06) * 0.05) * level;
    hot += cr * level;
  }
  // Weiter Schein und farbig getönter Grund
  float bundle = abs(p.y - strand(p.x, ${((STRANDS - 1) / 2).toFixed(1)}));
  vec3 base = tint(hsv(uHue, 0.62, 1.0));
  vec3 bg = mix(base * 0.06, base * 0.01, smoothstep(0.0, 0.8, bundle));
  vec3 col = bg + (core + glow) * uGlow;
  // Wo sich viele Kerne überlagern, brennt es weiß aus
  col += vec3(1.0) * max(hot - 1.2, 0.0) * 0.25 * uGlow;
  gl_FragColor = vec4(col, 1.0);
}
`;

class SilkLight implements VisualMode {
  private pass!: FullscreenPass;
  private readonly bands = new Float32Array(STRANDS);
  private time = 0;
  private hue = 0.92;
  private spread = 1;
  private glow = 1;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uTime: { value: 0 },
      uSpread: { value: 1 },
      uHue: { value: this.hue },
      uGlow: { value: 1 },
      uBand: { value: this.bands },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt * (0.7 + a.energy * 0.8);
    // Langsamer Farbwechsel, bei Kicks ein kleiner Sprung nach vorn
    this.hue = (this.hue + dt * 0.02 + (a.beat ? 0.01 : 0)) % 1;
    this.spread += (0.85 + a.bass * 0.9 - this.spread) * Math.min(dt * 2.5, 1);
    this.glow += (0.9 + a.energy * 0.5 + (a.beat ? 0.25 : 0) - this.glow) * Math.min(dt * 6, 1);
    for (let i = 0; i < STRANDS; i++) {
      let s = 0;
      for (let k = 0; k < 14; k++) s += a.spectrum[i * 14 + k];
      this.bands[i] += (s / 14 - this.bands[i]) * Math.min(dt * 5, 1);
    }
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uSpread.value = this.spread;
    u.uHue.value = this.hue;
    u.uGlow.value = this.glow;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('silk-light').meta,
  create: () => new SilkLight(),
};
export default definition;
