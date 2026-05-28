import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette } from '../../shared/glsl';

const SPEC = 32;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uZ;
uniform float uBass;
uniform float uBassRaw;
uniform float uTreble;
uniform float uFlash;
uniform float uBeatAge;
uniform float uSpec[${SPEC}];
${palette}
${hash}

const float HORIZON = -0.06;
const float CAM_H = 0.32;

float spec(float x) {
  float f = clamp(x, 0.0, 1.0) * float(${SPEC - 1});
  int i = int(floor(f));
  return mix(uSpec[i], uSpec[min(i + 1, ${SPEC - 1})], smoothstep(0.0, 1.0, fract(f)));
}

float ridge(float x, float seed) {
  float n = sin(x * 7.0 + seed) * 0.5 + sin(x * 13.0 + seed * 2.3) * 0.25 + sin(x * 29.0 + seed * 1.7) * 0.12;
  return n * 0.5 + 0.5;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 col;

  if (uv.y > HORIZON) {
    // Himmel: Verlauf zum Horizont, Sterne oben
    float h = (uv.y - HORIZON) / (0.5 - HORIZON);
    col = mix(pal(0.55) * 0.55, pal(0.06) * 0.08, pow(h, 0.6));
    vec2 sp = uv * 140.0;
    float hs = hash12(floor(sp));
    if (hs > 0.985) {
      float d = length(fract(sp) - 0.5);
      col += vec3(1.0) * exp(-d * d * 40.0) * smoothstep(0.25, 0.6, h) * (0.4 + 0.6 * sin(uTime * 2.0 + hs * 40.0)) * (0.5 + uTreble);
    }

    // Sonne mit nach unten breiter werdenden Streifen
    vec2 sc = vec2(0.0, 0.14);
    float sr = 0.25 * (1.0 + uFlash * 0.03);
    float d = length(uv - sc);
    float disk = smoothstep(sr, sr - 0.003, d);
    float y = (uv.y - sc.y) / sr;
    if (y < 0.3) {
      float stripe = fract(y * 6.0 + uTime * 0.25);
      float gap = smoothstep(0.3, -0.85, y) * 0.75;
      disk *= smoothstep(gap - 0.02, gap + 0.02, stripe);
    }
    vec3 sun = mix(pal(0.55), pal(0.92), smoothstep(-0.9, 0.9, y));
    col += pal(0.7) * exp(-max(d - sr, 0.0) * 7.0) * (0.35 + uFlash * 0.6 + uBass * 0.2);
    col = mix(col, sun * (1.05 + uFlash * 1.2), disk);

    // Zwei Bergketten; die vordere zeichnet das Spektrum nach
    float sx = abs(uv.x);
    float far = HORIZON + 0.05 + ridge(uv.x * 0.6, 1.0) * 0.07;
    float near = HORIZON + 0.015 + spec(sx * 0.9) * 0.2 + ridge(uv.x, 4.0) * 0.03;
    if (uv.y < far) {
      col = pal(0.12) * 0.12;
      col += pal(0.5) * exp(-(far - uv.y) * 160.0) * 0.5;
    }
    if (uv.y < near) {
      col = pal(0.05) * 0.06;
      col += pal(0.85) * exp(-(near - uv.y) * 220.0) * (0.9 + uBassRaw);
    }
  } else {
    // Boden: perspektivisches Gitter
    vec3 rd = normalize(vec3(uv.x, uv.y - HORIZON - 0.0001, 1.0));
    float t = CAM_H / max(-rd.y, 1e-4);
    vec2 p = vec2(rd.x * t, rd.z * t + uZ);
    vec2 g = p * 0.9;
    vec2 fw = fwidth(g);
    vec2 a = abs(fract(g) - 0.5);
    // Antialiasing über fwidth: Linien bleiben bis zum Horizont sauber
    float lx = smoothstep(0.5 - fw.x * 1.6, 0.5, a.x);
    float lz = smoothstep(0.5 - fw.y * 1.6, 0.5, a.y);
    float fade = exp(-t * 0.09);
    float line = max(lx, lz);
    // Ein heller Querbalken rast bei jedem Beat auf die Kamera zu
    float beatZ = 24.0 - uBeatAge * 30.0;
    float wave = exp(-pow((rd.z * t - beatZ) * 0.6, 2.0)) * exp(-uBeatAge * 1.5);
    col = pal(0.04) * 0.05;
    col += pal(0.82) * line * fade * (0.9 + uBassRaw * 1.4 + wave * 3.0);
    // Spiegelung der Sonne im Boden
    col += pal(0.7) * exp(-abs(uv.x) * 5.0) * exp(-(HORIZON - uv.y) * 14.0) * 0.25;
  }

  // Dunst am Horizont
  col += pal(0.75) * exp(-abs(uv.y - HORIZON) * 55.0) * 0.45;
  // Leichte Scanlines
  col *= 0.94 + 0.06 * sin(gl_FragCoord.y * 3.14159);
  gl_FragColor = vec4(col, 1.0);
}
`;

class Outrun implements VisualMode {
  private pass!: FullscreenPass;
  private readonly spec = new Float32Array(SPEC);
  private time = 0;
  private z = 0;
  private flash = 0;
  private beatAge = 10;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uZ: { value: 0 },
      uBass: { value: 0 },
      uBassRaw: { value: 0 },
      uTreble: { value: 0 },
      uFlash: { value: 0 },
      uBeatAge: { value: 10 },
      uSpec: { value: this.spec },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.z += a.dt * (2.5 + a.energy * 5);
    this.beatAge += a.dt;
    if (a.beat) {
      this.flash = 1;
      this.beatAge = 0;
    }
    this.flash *= Math.exp(-a.dt * 5);
    for (let i = 0; i < SPEC; i++) {
      const target = (a.spectrum[i * 3] + a.spectrum[i * 3 + 1] + a.spectrum[i * 3 + 2]) / 3;
      this.spec[i] += (target - this.spec[i]) * Math.min(a.dt * 10, 1);
    }
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uZ.value = this.z;
    u.uBass.value = a.bass;
    u.uBassRaw.value = a.bassRaw;
    u.uTreble.value = a.treble;
    u.uFlash.value = this.flash;
    u.uBeatAge.value = this.beatAge;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('outrun').meta,
  create: () => new Outrun(),
};
export default definition;
