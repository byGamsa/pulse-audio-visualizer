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

// Exakter Abstand zu einem Kegelstumpf (Inigo Quilez), q = (Abstand zur Achse, Höhe um die Mitte)
float sdCappedCone(vec2 q, float h, float r1, float r2) {
  vec2 k1 = vec2(r2, h);
  vec2 k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Jede Stachel ist ein echter Kegel; nur die 3×3 Nachbarzellen zählen, das hält es billig
float spikes(vec3 q, float radius) {
  float r = length(q);
  vec3 n = q / max(r, 1e-4);
  float lat = acos(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  float row = lat / PI * ROWS;
  float best = 1e3;
  for (int dr = -1; dr <= 1; dr++) {
    float rw = floor(row) + float(dr);
    if (rw < 0.0 || rw >= ROWS) continue;
    float latc = (rw + 0.5) / ROWS * PI;
    float count = max(1.0, floor(2.0 * ROWS * sin(latc)));
    float stagger = rw * 0.5;
    float cell = (lon / (2.0 * PI)) * count - stagger;
    for (int dc = -1; dc <= 1; dc++) {
      float c = floor(cell) + float(dc);
      float lonc = (c + 0.5 + stagger) / count * 2.0 * PI;
      vec3 cd = vec3(sin(latc) * cos(lonc), cos(latc), sin(latc) * sin(lonc));
      // Äquator = Bass, Pole = Höhen
      float band = abs(latc - PI * 0.5) / (PI * 0.5);
      float rnd = h21(vec2(rw, mod(c, count)));
      float jitter = 1.0 + uTreble * 0.25 * sin(uTime * 30.0 + rnd * 50.0);
      float h = (0.04 + spec(band) * 0.55 * (0.6 + 0.7 * rnd)) * (0.6 + uBass * 0.7) * jitter;
      // Weiche Obergrenze statt endlos langer Nadeln
      h = 1.05 * (1.0 - exp(-h / 1.05));
      // Kegel vom Inneren der Kugel bis zur Spitze, Breite wächst etwas mit der Höhe
      float y0 = radius * 0.86;
      float y1 = radius + h;
      float half_ = (y1 - y0) * 0.5;
      float along = dot(q, cd);
      float perp = length(q - cd * along);
      float base = 0.075 + h * 0.05;
      best = min(best, sdCappedCone(vec2(perp, along - (y0 + half_)), half_, base, 0.004));
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
  float radius = 1.0 + uBass * 0.04;
  float sphere = length(q) - radius;
  // Weiche Kehle zwischen Kugel und Stacheln, wie bei echtem Ferrofluid
  float d = smin(sphere, spikes(q, radius), 0.09);
  // Nie weiter als eine halbe Zelle springen, sonst könnte eine Nachbarstachel übersprungen werden
  return min(d, max(length(q) * 0.11, 0.02));
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

  // Ab der Kamera marschieren: lange Spitzen ragen weit nach vorn
  float t = 0.6;
  bool hit = false;
  for (int i = 0; i < 220; i++) {
    float d = map(ro + rd * t, rot);
    if (d < 0.0004 * t) { hit = true; break; }
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
