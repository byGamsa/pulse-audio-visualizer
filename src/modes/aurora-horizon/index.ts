import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass, getNoiseTexture } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, tint } from '../../shared/glsl';

const COLS = 64;

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uCol[${COLS}];
uniform float uBass;
uniform float uFlash;
uniform sampler2D uNoise;
${hash}

float n1(float x) {
  return textureLod(uNoise, vec2(x / 256.0, 0.37), 0.0).r;
}

float band(float x) {
  float f = clamp(abs(x - 0.5) * 2.0, 0.0, 1.0) * ${COLS - 1}.0;
  int i = int(floor(f));
  return mix(uCol[i], uCol[min(i + 1, ${COLS - 1})], fract(f));
}

vec3 hue(float x) {
  vec3 pink = vec3(1.0, 0.32, 0.78);
  vec3 rose = vec3(1.0, 0.2, 0.55);
  vec3 lilac = vec3(0.85, 0.65, 1.0);
  vec3 sky = vec3(0.35, 0.7, 1.0);
  vec3 deep = vec3(0.15, 0.3, 1.0);
  vec3 c = mix(pink, rose, smoothstep(0.1, 0.35, x));
  c = mix(c, lilac, smoothstep(0.38, 0.55, x));
  c = mix(c, sky, smoothstep(0.55, 0.72, x));
  return tint(mix(c, deep, smoothstep(0.78, 1.0, x)));
}

// Lichtvorhang an Position x in Höhe y über dem Horizont
vec3 curtain(float x, float y) {
  float v = band(x);
  // Senkrechte Schlieren, die langsam seitlich wandern
  float s = n1(x * 140.0 + uTime * 0.6) * 0.6 + n1(x * 38.0 - uTime * 0.25 + 50.0) * 0.4;
  s = s * s * 1.8;
  float h = 0.05 + v * 0.42 * (0.55 + s * 0.6);
  float i = exp(-y / h) * (0.06 + v * 1.4) * (0.35 + s)
          + exp(-y / (h * 2.6)) * v * 0.12;
  // Weißes Glühen direkt über der Linie
  float hot = exp(-y * 28.0) * v * v * 1.6;
  return hue(x) * i + mix(hue(x), vec3(1.0), 0.6) * hot;
}

void main() {
  float aspect = uRes.x / uRes.y;
  float horizon = 0.24;
  float y = vUv.y - horizon;
  float x = vUv.x;

  vec3 sky = tint(mix(vec3(0.09, 0.015, 0.1), vec3(0.015, 0.02, 0.1), smoothstep(0.0, 1.0, x)));
  sky *= 0.6 + 0.4 * (1.0 - vUv.y);
  vec3 col;
  if (y >= 0.0) {
    col = sky + curtain(x, y);
    // Vereinzelte Sterne
    vec2 g = vUv * vec2(aspect, 1.0) * 160.0;
    float st = hash12(floor(g));
    float tw = 0.5 + 0.5 * sin(uTime * (1.0 + st * 3.0) + st * 40.0);
    col += vec3(0.8, 0.85, 1.0) * step(0.996, st) * smoothstep(0.3, 0.0, length(fract(g) - 0.5)) * tw * 0.5;
  } else {
    // Spiegelung: gestaucht, leicht gewellt und gedämpft
    float d = -y;
    float wob = (n1(d * 400.0 + uTime * 2.0) - 0.5) * 0.006 * (1.0 + d * 8.0);
    vec3 refl = curtain(x + wob, d * 1.6);
    col = sky * 0.7 + refl * 0.42 * exp(-d * 2.5);
  }
  // Die Horizontlinie selbst
  float px = abs(y) * uRes.y;
  col += vec3(0.92, 0.88, 1.0) * exp(-px * 0.9) * (0.5 + uBass * 1.2 + uFlash);
  col += hue(x) * exp(-px * 0.08) * band(x) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

class AuroraHorizon implements VisualMode {
  private pass!: FullscreenPass;
  private readonly cols = new Float32Array(COLS);
  private time = 0;
  private flash = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uTime: { value: 0 },
      uCol: { value: this.cols },
      uBass: { value: 0 },
      uFlash: { value: 0 },
      uNoise: { value: getNoiseTexture() },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    for (let i = 0; i < COLS; i++) {
      const v = (a.spectrum[i * 2] + a.spectrum[i * 2 + 1]) * 0.5;
      // Vorhänge steigen schnell und sinken langsam, wie echtes Polarlicht
      this.cols[i] = v > this.cols[i] ? this.cols[i] + (v - this.cols[i]) * Math.min(dt * 18, 1) : this.cols[i] * Math.exp(-dt * 1.8);
    }
    if (a.beat) this.flash = 0.6;
    this.flash *= Math.exp(-dt * 6);
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uBass.value = a.bass;
    u.uFlash.value = this.flash;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('aurora-horizon').meta,
  create: () => new AuroraHorizon(),
};
export default definition;
