import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, tint } from '../../shared/glsl';

const BARS = 128;

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uBars[${BARS}];
uniform float uTime;
uniform float uBass;
${hash}

const float FLOOR = 0.24;

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return tint(v * mix(vec3(1.0), k, s));
}

float bar(float x) {
  float f = clamp(x, 0.0, 0.9999) * ${BARS}.0;
  return uBars[int(f)];
}

// Spektrum oberhalb des Bodens bei Bildhöhe y (0 = Bodenlinie)
vec3 stage(float x, float y, float blur) {
  float f = x * ${BARS}.0;
  float local = fract(f);
  float h = bar(x) * 0.62;
  float w = 0.3 + blur * 0.4;
  float line = smoothstep(0.5, 0.5 - w, abs(local - 0.5));
  vec3 c = hsv(fract(x * 0.95 + 0.3), 0.8, 1.0);
  float body = step(y, h) * line;
  // Lichtvorhang: weich nach oben auslaufend, auch über der Spitze
  float curtain = exp(-max(y - h, 0.0) * 3.5) * smoothstep(0.0, 0.08, h) * (0.12 + blur);
  float base = exp(-y * 10.0) * 0.25;
  return c * (body * (0.8 + 0.4 * (y / max(h, 1e-3))) + curtain * (0.35 + 0.65 * line) + base * line);
}

void main() {
  vec2 uv = vUv;
  vec3 col = vec3(0.004, 0.004, 0.008);
  if (uv.y >= FLOOR) {
    col += stage(uv.x, uv.y - FLOOR, 0.0);
    // Staub in der Luft
    vec2 dp = uv * vec2(uRes.x / uRes.y, 1.0) * 60.0 + vec2(0.0, uTime * 0.6);
    float h = hash12(floor(dp));
    if (h > 0.992) col += vec3(1.0) * exp(-dot(fract(dp) - 0.5, fract(dp) - 0.5) * 30.0) * 0.25;
  } else {
    // Spiegelung: je weiter vom Bühnenrand, desto unschärfer und dunkler
    float d = FLOOR - uv.y;
    float ripple = sin(uv.y * 90.0 + uTime * 1.5) * 0.0012 * (1.0 + uBass);
    vec3 r = vec3(0.0);
    for (int i = -2; i <= 2; i++) {
      float ox = float(i) * d * 0.012;
      r += stage(uv.x + ox + ripple, d, d * 2.0);
    }
    col += r / 5.0 * 0.45 * exp(-d * 4.0);
    // Glanzlinie an der Bühnenkante
    col += vec3(1.0, 0.9, 0.8) * exp(-d * 220.0) * 0.08;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

class NeonStage implements VisualMode {
  private pass!: FullscreenPass;
  private readonly bars = new Float32Array(BARS);
  private time = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix, uBars: { value: this.bars }, uTime: { value: 0 }, uBass: { value: 0 } });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    for (let i = 0; i < BARS; i++) {
      // Leicht zufällige Feinheit wie bei echten Analyzern
      const src = Math.min(Math.floor((i / BARS) * 112), 127);
      const v = a.spectrum[src] * (0.85 + 0.3 * Math.abs(Math.sin(i * 12.9898)));
      this.bars[i] = v > this.bars[i] ? v : Math.max(this.bars[i] - a.dt * 1.2, 0);
    }
    this.pass.uniforms.uTime.value = this.time;
    this.pass.uniforms.uBass.value = a.bass;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('neon-stage').meta,
  create: () => new NeonStage(),
};
export default definition;
