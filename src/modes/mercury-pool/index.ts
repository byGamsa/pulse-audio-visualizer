import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette } from '../../shared/glsl';
import { studioGlsl } from '../../shared/studio';

const DROPS = 8;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uSwell;
uniform float uRipple;
uniform vec4 uDrops[${DROPS}];
uniform vec4 uFall;
${palette}
${studioGlsl}

float height(vec2 p) {
  float h = sin(p.x * 0.55 + uTime * 0.7) * 0.05 * uSwell + sin(p.y * 0.48 - uTime * 0.6) * 0.04 * uSwell;
  for (int i = 0; i < ${DROPS}; i++) {
    vec4 d = uDrops[i];
    if (d.w <= 0.0) continue;
    float r = length(p - d.xy);
    float front = r - d.z * 2.4;
    float env = exp(-front * front * 1.5) * exp(-d.z * 1.1) * d.w / (1.0 + r * 0.6);
    h += sin(front * 11.0) * env * 0.16;
  }
  h += sin(p.x * 9.0 + uTime * 3.0) * sin(p.y * 8.0 - uTime * 2.6) * 0.004 * uRipple;
  return h;
}

vec3 surfaceNormal(vec2 p, float e) {
  return normalize(vec3(height(p - vec2(e, 0.0)) - height(p + vec2(e, 0.0)), 2.0 * e, height(p - vec2(0.0, e)) - height(p + vec2(0.0, e))));
}

// Helle Hohlkehle, sonst spiegelt das Metall nur Schwarz
vec3 env(vec3 d) {
  return studio(d) + vec3(0.2, 0.21, 0.23) * smoothstep(-0.02, 0.45, d.y) + vec3(0.6) * exp(-abs(d.y - 0.04) * 30.0) * 0.25;
}

// Chrom: fast vollständige Spiegelung, minimal kühl getönt
vec3 chrome(vec3 rd, vec3 n) {
  float f = 0.8 + 0.2 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  return env(reflect(rd, n)) * f * vec3(0.95, 0.97, 1.0);
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 2.1, 5.2);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 1.7 + rt * uv.x + up * uv.y);

  vec3 col = env(rd) * 0.25;
  float tHit = 1e9;

  // Fallender Tropfen als Kugel
  if (uFall.w > 0.0) {
    vec3 c = vec3(uFall.x, uFall.z, uFall.y);
    vec3 oc = ro - c;
    float b = dot(oc, rd);
    float h = b * b - dot(oc, oc) + uFall.w * uFall.w;
    if (h > 0.0) {
      tHit = -b - sqrt(h);
      vec3 p = ro + rd * tHit;
      col = chrome(rd, normalize(p - c));
    }
  }

  // Oberfläche: Höhenfeld abtasten
  if (rd.y < 0.0) {
    float t = (0.3 - ro.y) / rd.y;
    for (int i = 0; i < 60; i++) {
      vec3 p = ro + rd * t;
      float d = p.y - height(p.xz);
      if (abs(d) < 0.0008 * t) break;
      t += d * 0.7;
    }
    if (t < tHit) {
      vec3 p = ro + rd * t;
      vec3 n = surfaceNormal(p.xz, 0.004 + t * 0.0015);
      col = chrome(rd, n);
      // Zum Horizont hin im Dunkel verschwinden
      col *= exp(-max(t - 4.0, 0.0) * 0.12);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

class MercuryPool implements VisualMode {
  private pass!: FullscreenPass;
  private readonly drops = Array.from({ length: DROPS }, () => new THREE.Vector4(0, 0, 0, 0));
  private readonly fall = new THREE.Vector4(0, 0, 0, 0);
  private fallVel = 0;
  private dropIndex = 0;
  private time = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uSwell: { value: 1 },
      uRipple: { value: 0 },
      uDrops: { value: this.drops },
      uFall: { value: this.fall },
      uStudioSpin: { value: 0 },
      uPalette: { value: ctx.palette },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    // Neuer Tropfen auf einen Kick, solange nicht gerade einer fällt
    if (a.beat && this.fall.w <= 0) {
      this.fall.set((Math.random() - 0.5) * 3.2, (Math.random() - 0.3) * 2.2, 2.6, 0.06 + a.bassRaw * 0.05);
      this.fallVel = 0;
    }
    if (this.fall.w > 0) {
      this.fallVel += 9.81 * dt;
      this.fall.z -= this.fallVel * dt;
      if (this.fall.z <= 0) {
        // Einschlag: Ringwelle, Stärke nach Tropfengröße
        this.drops[this.dropIndex].set(this.fall.x, this.fall.y, 0, 0.6 + this.fall.w * 8);
        this.dropIndex = (this.dropIndex + 1) % DROPS;
        this.fall.w = 0;
      }
    }
    for (const d of this.drops) {
      if (d.w <= 0) continue;
      d.z += dt;
      if (d.z > 5) d.w = 0;
    }
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uSwell.value += (0.6 + a.bass * 1.6 - u.uSwell.value) * Math.min(dt * 2, 1);
    u.uRipple.value = a.treble * 1.5;
    u.uStudioSpin.value = this.time * 0.04;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('mercury-pool').meta,
  create: () => new MercuryPool(),
};
export default definition;
