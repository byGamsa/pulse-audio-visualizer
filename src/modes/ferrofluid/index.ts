import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette } from '../../shared/glsl';

const SPEC = 24;
const ROWS = 14;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uRot;
uniform float uBass;
uniform float uTreble;
uniform float uSpec[${SPEC}];
${palette}

const float PI = 3.14159265;
const float ROWS = ${ROWS}.0;

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float spec(float x) {
  float f = clamp(x, 0.0, 1.0) * float(${SPEC - 1});
  int i = int(floor(f));
  return mix(uSpec[i], uSpec[min(i + 1, ${SPEC - 1})], fract(f));
}

// Nur die 3×3 Nachbarzellen prüfen, hält die SDF billig
float spikes(vec3 n) {
  float lat = acos(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  float row = lat / PI * ROWS;
  float best = 0.0;
  for (int dr = -1; dr <= 1; dr++) {
    float r = floor(row) + float(dr);
    if (r < 0.0 || r >= ROWS) continue;
    float latc = (r + 0.5) / ROWS * PI;
    float count = max(1.0, floor(2.0 * ROWS * sin(latc)));
    float stagger = r * 0.5;
    float cell = (lon / (2.0 * PI)) * count - stagger;
    for (int dc = -1; dc <= 1; dc++) {
      float c = floor(cell) + float(dc);
      float lonc = (c + 0.5 + stagger) / count * 2.0 * PI;
      vec3 cd = vec3(sin(latc) * cos(lonc), cos(latc), sin(latc) * sin(lonc));
      float ang = acos(clamp(dot(n, cd), -1.0, 1.0));
      // Äquator = Bass, Pole = Höhen
      float band = abs(latc - PI * 0.5) / (PI * 0.5);
      float rnd = h21(vec2(r, mod(c, count)));
      float jitter = 1.0 + uTreble * 0.25 * sin(uTime * 30.0 + rnd * 50.0);
      float h = (0.04 + spec(band) * 0.55 * (0.6 + 0.7 * rnd)) * (0.6 + uBass * 0.7) * jitter;
      float w = PI / ROWS * 0.62;
      best = max(best, h * pow(max(0.0, 1.0 - ang / w), 2.4));
    }
  }
  return best;
}

mat3 rotation() {
  float cy = cos(uRot.x), sy = sin(uRot.x), cx = cos(uRot.y), sx = sin(uRot.y);
  return mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
}

float map(vec3 p, mat3 rot) {
  vec3 q = rot * p;
  float r = length(q);
  vec3 n = q / max(r, 1e-4);
  float radius = 1.0 + uBass * 0.04;
  return (r - radius - spikes(n)) * 0.55;
}

// Softboxen, Bodenlicht und farbige Kantenlichter
vec3 env(vec3 d) {
  vec3 col = mix(pal(0.05) * 0.02, pal(0.15) * 0.05, smoothstep(-0.4, 0.8, d.y));
  col += vec3(1.0, 0.98, 0.95) * 3.5 * smoothstep(0.93, 0.97, dot(d, normalize(vec3(-0.6, 0.7, 0.4))));
  col += vec3(1.0) * 1.6 * smoothstep(0.88, 0.95, dot(d, normalize(vec3(0.8, 0.3, 0.5))));
  col += pal(0.75) * 1.8 * smoothstep(0.5, 1.0, -d.z) * smoothstep(-0.2, 0.3, d.y);
  col += pal(0.45) * 0.8 * pow(max(0.0, -d.y), 2.0);
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, 4.5);
  vec3 rd = normalize(vec3(uv, -1.45));
  mat3 rot = rotation();

  vec3 col = pal(0.1) * 0.03 * smoothstep(1.2, 0.0, length(uv));
  // Weicher Lichthof hinter der Kugel, atmet mit dem Bass
  col += pal(0.6) * exp(-length(uv) * 2.4) * (0.08 + uBass * 0.25);

  float t = 2.6;
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t, rot);
    if (d < 0.0006 * t) { hit = true; break; }
    t += d;
    if (t > 7.0) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec2 e = vec2(0.0015, 0.0);
    vec3 n = normalize(vec3(
      map(p + e.xyy, rot) - map(p - e.xyy, rot),
      map(p + e.yxy, rot) - map(p - e.yxy, rot),
      map(p + e.yyx, rot) - map(p - e.yyx, rot)
    ));
    vec3 refl = reflect(rd, n);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    // Schwarz glänzend wie Ferrofluid: fast nur Reflexion, kaum Eigenfarbe
    col = vec3(0.004) + env(refl) * (0.18 + 0.82 * fres);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

class Ferrofluid implements VisualMode {
  private pass!: FullscreenPass;
  private readonly spec = new Float32Array(SPEC);
  private time = 0;
  private yaw = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uRot: { value: new THREE.Vector2() },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uSpec: { value: this.spec },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.yaw += a.dt * (0.12 + a.mid * 0.4);
    // 24 Bänder, jeweils gemittelt; die obersten Höhen bleiben draußen
    for (let i = 0; i < SPEC; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a.spectrum[i * 4 + k];
      // Leicht träge, damit die Stacheln wachsen statt zu zittern
      this.spec[i] += (sum / 4 - this.spec[i]) * Math.min(a.dt * 14, 1);
    }
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uRot.value.set(this.yaw, 0.35 + Math.sin(this.time * 0.11) * 0.25);
    u.uBass.value = a.bass;
    u.uTreble.value = a.treble;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('ferrofluid').meta,
  create: () => new Ferrofluid(),
};
export default definition;
