import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette } from '../../shared/glsl';

const BALLS = 6;
const SPEC = 16;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uBassRaw;
uniform float uTreble;
uniform float uSplit;
uniform vec3 uSplitAxis;
uniform vec3 uBalls[${BALLS}];
uniform float uRadii[${BALLS}];
uniform float uSpec[${SPEC}];
${palette}
${hash}

float spec(float x) {
  float f = clamp(x, 0.0, 1.0) * float(${SPEC - 1});
  int i = int(floor(f));
  return mix(uSpec[i], uSpec[min(i + 1, ${SPEC - 1})], smoothstep(0.0, 1.0, fract(f)));
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Weiche Oberflächenwellen: billiges 3D-„Noise“ aus Sinusprodukten
float ripples(vec3 p) {
  return sin(p.x * 5.1 + uTime * 0.9) * sin(p.y * 4.3 - uTime * 0.7) * sin(p.z * 4.7 + uTime * 0.6);
}

float map(vec3 p) {
  // Zellkern teilt sich bei Beats
  vec3 off = uSplitAxis * uSplit * 0.55;
  float core = smin(length(p - off) - 0.62, length(p + off) - 0.62, 0.55 - uSplit * 0.25);
  float d = core;
  for (int i = 0; i < ${BALLS}; i++) d = smin(d, length(p - uBalls[i]) - uRadii[i], 0.5);
  // Spektrum verformt die Membran: Breitengrad = Frequenz
  vec3 n = normalize(p + 1e-4);
  float band = acos(clamp(n.y, -1.0, 1.0)) / 3.14159;
  d -= (spec(band) * 0.14 + 0.02) * ripples(p * (1.0 + uTreble * 0.4));
  return d;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, 4.2);
  vec3 rd = normalize(vec3(uv, -1.5));

  // Hintergrund: tiefe Flüssigkeit mit schwebenden Partikeln
  vec3 col = mix(pal(0.04) * 0.04, pal(0.12) * 0.09, smoothstep(0.6, -0.6, uv.y));
  vec2 g = floor(uv * 40.0 + vec2(0.0, uTime * 0.4));
  float hp = hash12(g);
  if (hp > 0.97) {
    vec2 f = fract(uv * 40.0 + vec2(0.0, uTime * 0.4)) - 0.5;
    col += pal(0.6) * exp(-dot(f, f) * 30.0) * 0.12;
  }

  float t = 2.0;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001) { hit = true; break; }
    t += d * 0.8;
    if (t > 7.0) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    // Subsurface: dünne Membran lässt mehr Licht durch
    float inside = max(-map(p - n * 0.3), 0.0);
    float sss = exp(-inside * 5.0);
    // Adern: Domain-Warp bricht das Sinus-Raster auf
    vec3 wp = p * 2.1 + vec3(ripples(p * 1.3 + 1.0), ripples(p * 1.1 + 4.0), ripples(p * 1.7 + 7.0)) * 0.9;
    float veins = smoothstep(0.06, 0.0, abs(ripples(wp))) * 0.5;
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
    float diff = max(dot(n, lightDir), 0.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float spec = pow(max(dot(reflect(-lightDir, n), v), 0.0), 40.0);
    col = pal(0.18) * 0.06 * diff;
    col += pal(0.42 + veins * 0.2) * (sss * (0.45 + uBass * 1.0) + veins * 0.35);
    col += pal(0.85) * fres * (0.7 + uBassRaw * 1.2);
    col += vec3(1.0) * spec * 0.8;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

class Organism implements VisualMode {
  private pass!: FullscreenPass;
  private readonly balls = Array.from({ length: BALLS }, () => new THREE.Vector3());
  private readonly radii = new Float32Array(BALLS);
  private readonly spec = new Float32Array(SPEC);
  private readonly axis = new THREE.Vector3(1, 0, 0);
  private readonly seeds = Array.from({ length: BALLS }, () => Math.random() * 100);
  private time = 0;
  private phase = 0;
  private split = 0;
  private splitVel = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uBassRaw: { value: 0 },
      uTreble: { value: 0 },
      uSplit: { value: 0 },
      uSplitAxis: { value: this.axis },
      uBalls: { value: this.balls },
      uRadii: { value: this.radii },
      uSpec: { value: this.spec },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.phase += dt * (0.25 + a.mid * 0.8);

    // Kleine Zellen kreisen auf verschlungenen Bahnen um den Kern
    for (let i = 0; i < BALLS; i++) {
      const s = this.seeds[i];
      const t = this.phase * (0.6 + (i % 3) * 0.2) + s;
      const r = 0.75 + 0.25 * Math.sin(t * 0.7 + s);
      this.balls[i].set(Math.cos(t) * r, Math.sin(t * 1.3 + s) * 0.6, Math.sin(t) * r * 0.8);
      this.radii[i] = 0.24 + 0.06 * Math.sin(this.time * 2 + s) + a.bass * 0.08;
    }

    // Starker Kick stößt die Teilung an
    if (a.beat && a.bassRaw > 0.55 && this.split < 0.2) {
      this.splitVel += 2.2 + a.bassRaw * 1.5;
      this.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    }
    this.splitVel += (-this.split * 18 - this.splitVel * 4.5) * dt;
    this.split = Math.max(this.split + this.splitVel * dt, 0);

    for (let i = 0; i < SPEC; i++) {
      let sum = 0;
      for (let k = 0; k < 6; k++) sum += a.spectrum[i * 6 + k];
      this.spec[i] += (sum / 6 - this.spec[i]) * Math.min(dt * 10, 1);
    }

    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uBass.value = a.bass;
    u.uBassRaw.value = a.bassRaw;
    u.uTreble.value = a.treble;
    u.uSplit.value = this.split;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('organism').meta,
  create: () => new Organism(),
};
export default definition;
