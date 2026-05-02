import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass, getNoiseTexture } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette } from '../../shared/glsl';

// Raymarch-Schritte durch die Vorhangschicht
const LAYERS = 48;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uFlow;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uShift;
uniform float uYaw;
uniform sampler2D uNoise;
${palette}
${hash}

// Value-Noise mit Hermite-Interpolation, keine Rauten
float vn(vec2 p) {
  p *= 256.0;
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  // textureLod: sicher in Schleifen mit Abbruch
  return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).r;
}
float n3(vec2 p) {
  return vn(p) * 0.55 + vn(p * 2.03 + 0.17) * 0.3 + vn(p * 4.01 + 0.43) * 0.15;
}

// Jede Kurve in der xz-Ebene wird ein Vorhang zwischen H0 und H1
const float H0 = 3.6;
const float H1 = 17.0;

float curtainZ(float x, float seed) {
  float slow = uFlow * 0.06;
  return 26.0 + seed * 9.0
    + sin(x * 0.045 + slow + seed * 4.0) * 7.0
    + (vn(vec2(x * 0.0009 + slow * 0.01, seed * 0.37)) * 2.0 - 1.0) * 14.0;
}

float density(vec3 p) {
  float v = (p.y - H0) / (H1 - H0);
  if (v < 0.0 || v > 1.0) return 0.0;
  float vertical = smoothstep(0.0, 0.035, v) * exp(-v * 3.2);
  float d = 0.0;
  for (int c = 0; c < 3; c++) {
    float seed = float(c);
    float dz = p.z - curtainZ(p.x, seed);
    float width = 0.35 + v * 1.3;
    float sheet = exp(-dz * dz / (width * width));
    // Strahlen: Helligkeit variiert entlang der Kurve, nicht in der Höhe
    float rays = 0.25 + 1.2 * pow(vn(vec2(p.x * 0.006 + seed * 0.21, uFlow * 0.0015)), 2.0);
    float presence = smoothstep(0.3, 0.65, vn(vec2(p.x * 0.0012 - uFlow * 0.0008, seed * 0.53 + 0.1)));
    d += sheet * rays * presence * (1.0 - seed * 0.25);
  }
  return d * vertical;
}

vec3 aurora(vec3 rd) {
  if (rd.y <= 0.002) return vec3(0.0);
  float t0 = H0 / rd.y;
  float t1 = min(H1 / rd.y, 90.0);
  if (t0 > 90.0) return vec3(0.0);
  const int STEPS = ${LAYERS};
  float dt = (t1 - t0) / float(STEPS);
  float t = t0 + dt * hash12(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 p = rd * t;
    float dens = density(p);
    if (dens > 0.001) {
      float v = (p.y - H0) / (H1 - H0);
      acc += pal(clamp(0.38 + v * 0.55 + uShift, 0.0, 1.0)) * dens * dt;
    }
    t += dt;
  }
  return acc * (0.11 + uBass * 0.14);
}

float mountains(vec3 rd) {
  float a = atan(rd.x, rd.z);
  return 0.015 + n3(vec2(a * 0.12, 0.31)) * 0.07 + n3(vec2(a * 0.5, 0.71)) * 0.02;
}

vec3 sky(vec3 rd) {
  vec3 col = mix(pal(0.08) * 0.05, pal(0.02) * 0.01, clamp(rd.y * 2.0, 0.0, 1.0));
  // Sterne
  vec2 sp = rd.xy / max(rd.z, 0.1) * 160.0;
  vec2 cell = floor(sp);
  float hs = hash12(cell);
  if (hs > 0.975) {
    vec2 o = hash22(cell) - 0.5;
    float d = length(fract(sp) - 0.5 - o * 0.6);
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + hs * 4.0) + hs * 50.0);
    col += vec3(0.9, 0.95, 1.0) * exp(-d * d * 60.0) * tw * (0.3 + uTreble * 0.8) * smoothstep(0.0, 0.15, rd.y);
  }
  col += aurora(rd) * smoothstep(0.0, 0.08, rd.y);
  if (rd.y < mountains(rd)) col = pal(0.04) * 0.012;
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 rd = normalize(vec3(uv.x, uv.y + 0.2, 1.1));
  rd.xz = mat2(cy, -sy, sy, cy) * rd.xz;

  vec3 col;
  if (rd.y >= 0.0) {
    col = sky(rd);
  } else {
    // Stiller See: gespiegelter Himmel mit leichten Wellen
    vec3 rr = vec3(rd.x, -rd.y, rd.z);
    float dist = 1.0 / max(-rd.y, 0.02);
    rr.x += (texture(uNoise, vec2(rd.x * dist * 0.02, dist * 0.02 + uTime * 0.01)).r - 0.5) * 0.02;
    col = sky(rr) * 0.45 * (1.0 - exp(-dist * 0.05));
    col += pal(0.05) * 0.008;
  }
  col += (hash12(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

class Aurora implements VisualMode {
  private pass!: FullscreenPass;
  private flow = 0;
  private time = 0;
  private shift = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uShift: { value: 0 },
      uYaw: { value: 0 },
      uNoise: { value: getNoiseTexture() },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.flow += a.dt * (0.6 + a.mid * 3.0);
    // Heller Klang schiebt die Farben in den oberen Teil der Palette
    this.shift += ((a.centroid - 0.35) * 0.5 - this.shift) * Math.min(a.dt * 0.8, 1);
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uFlow.value = this.flow;
    u.uBass.value += (a.bass - u.uBass.value) * Math.min(a.dt * 4, 1);
    u.uMid.value = a.mid;
    u.uTreble.value = a.treble;
    u.uShift.value = this.shift;
    u.uYaw.value = Math.sin(this.time * 0.02) * 0.35;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('aurora').meta,
  create: () => new Aurora(),
};
export default definition;
