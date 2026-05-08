import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette } from '../../shared/glsl';

const SPEC = 16;
const RING_SPACING = 2.0;
// Abstand vor der Kamera, an dem ein Beat-Ring aufleuchtet
const BEAT_RING_AHEAD = 8;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uZ;
uniform float uBass;
uniform float uBassRaw;
uniform float uTreble;
uniform float uSpec[${SPEC}];
uniform float uBeatRing;
uniform float uBeatAge;
${palette}

const float TAU = 6.2831853;
const float S = ${RING_SPACING.toFixed(1)};

vec2 path(float z) {
  return vec2(sin(z * 0.13) * 1.6 + sin(z * 0.071) * 0.8, cos(z * 0.1) * 1.0);
}

float spec(float x) {
  float f = clamp(x, 0.0, 1.0) * float(${SPEC - 1});
  int i = int(floor(f));
  return mix(uSpec[i], uSpec[min(i + 1, ${SPEC - 1})], smoothstep(0.0, 1.0, fract(f)));
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

  vec3 ro = vec3(path(uZ), uZ);
  vec3 ta = vec3(path(uZ + 3.0), uZ + 3.0);
  // In Kurven leicht in die Schräglage gehen
  float roll = (path(uZ + 2.0).x - path(uZ).x) * 0.25;
  vec3 fw = normalize(ta - ro);
  vec3 up = vec3(sin(roll), cos(roll), 0.0);
  vec3 rt = normalize(cross(fw, up));
  vec3 upv = cross(rt, fw);
  vec3 rd = normalize(fw * 1.25 + rt * uv.x + upv * uv.y);

  float R = 1.6 + uBass * 0.15;
  vec3 glow = vec3(0.0);
  vec3 col = vec3(0.0);
  float t = 0.05;
  bool hit = false;
  vec3 p;

  for (int i = 0; i < 96; i++) {
    p = ro + rd * t;
    vec2 q = p.xy - path(p.z);
    float r = length(q);
    float wall = R - r;

    float a = atan(q.y, q.x);
    float k = floor((p.z + S * 0.5) / S);
    float zz = p.z - k * S;
    float ringR = R - 0.12 - spec(abs(a) / 3.14159) * 0.32;
    float dr = length(vec2(r - ringR, zz)) - 0.012;

    float flash = k == uBeatRing ? 4.0 * exp(-uBeatAge * 1.2) : 0.0;
    vec3 ringCol = pal(fract(k * 0.137 + uTime * 0.015) * 0.5 + 0.3) * (0.7 + uBassRaw * 0.9 + flash);
    float fog = exp(-t * 0.07);
    float stepLen = clamp(min(wall, max(dr, 0.02)) * 0.8, 0.02, 0.6);
    glow += ringCol * exp(-max(dr, 0.0) * 22.0) * stepLen * 3.0 * fog;

    if (wall < 0.003) { hit = true; break; }
    t += stepLen;
    if (t > 40.0) break;
  }

  if (hit) {
    vec2 q = p.xy - path(p.z);
    float a = atan(q.y, q.x) / TAU;
    // Feines Gitter auf der Tunnelwand, Längslinien laufen mit Tempo vorbei
    float lon = abs(fract(a * 24.0) - 0.5);
    float lat = abs(fract(p.z / S * 4.0) - 0.5);
    float grid = exp(-lon * 60.0) * 0.6 + exp(-lat * 40.0) * 0.25;
    float lane = exp(-abs(fract(a * 6.0 + 0.5) - 0.5) * 120.0) * (0.5 + uTreble * 2.0);
    float fog = exp(-t * 0.09);
    col += pal(0.12) * 0.04 * fog;
    col += pal(0.55) * grid * 0.07 * fog;
    col += pal(0.7) * lane * 0.5 * fog;
  }

  col += glow;
  gl_FragColor = vec4(col, 1.0);
}
`;

class NeonTunnel implements VisualMode {
  private pass!: FullscreenPass;
  private readonly spec = new Float32Array(SPEC);
  private z = 0;
  private time = 0;
  private beatRing = -999;
  private beatAge = 10;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uZ: { value: 0 },
      uBass: { value: 0 },
      uBassRaw: { value: 0 },
      uTreble: { value: 0 },
      uSpec: { value: this.spec },
      uBeatRing: { value: -999 },
      uBeatAge: { value: 10 },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.z += a.dt * (2.2 + a.energy * 6 + a.bassRaw * 2);
    // 16 breite Bänder für weiche Ringe
    for (let i = 0; i < SPEC; i++) {
      let sum = 0;
      for (let k = 0; k < 6; k++) sum += a.spectrum[i * 6 + k];
      this.spec[i] = sum / 6;
    }

    this.beatAge += a.dt;
    if (a.beat) {
      this.beatRing = Math.floor((this.z + RING_SPACING * 0.5) / RING_SPACING) + BEAT_RING_AHEAD;
      this.beatAge = 0;
    }

    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uZ.value = this.z;
    u.uBass.value = a.bass;
    u.uBassRaw.value = a.bassRaw;
    u.uTreble.value = a.treble;
    u.uBeatRing.value = this.beatRing;
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
  meta: findMode('neon-tunnel').meta,
  create: () => new NeonTunnel(),
};
export default definition;
