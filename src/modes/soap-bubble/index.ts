import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass, getNoiseTexture } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette } from '../../shared/glsl';
import { studioGlsl } from '../../shared/studio';

// Farbe aus Dünnschicht-Interferenz je nach Schichtdicke
const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uWobble;
uniform float uMid;
uniform float uFlow;
uniform sampler2D uNoise;
${palette}
${hash}
${studioGlsl}

float vn(vec2 p) {
  p *= 256.0;
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).r;
}

vec3 satellite(int i) {
  float t = uTime * (0.25 + float(i) * 0.07) + float(i) * 2.1;
  return vec3(cos(t) * 2.0, sin(t * 1.3) * 0.9, sin(t) * 1.2 - 0.5);
}

float map(vec3 p) {
  vec3 n = normalize(p + 1e-4);
  float w = sin(dot(n, vec3(0.8, 0.5, 0.3)) * 3.0 + uTime * 1.7) * 0.06 * uWobble
          + sin(dot(n, vec3(-0.3, 0.9, 0.2)) * 5.0 - uTime * 2.3) * 0.03 * (uWobble + uMid);
  float d = length(p) - 1.25 - w;
  for (int i = 0; i < 3; i++) d = min(d, length(p - satellite(i)) - (0.18 + float(i) * 0.05));
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

// Dünnschicht-Reflexion für drei Wellenlängen
vec3 thinFilm(float thicknessNm, float cosT) {
  vec3 lambda = vec3(650.0, 532.0, 460.0);
  vec3 phase = 4.0 * 3.14159265 * 1.33 * thicknessNm * cosT / lambda;
  return 0.5 - 0.5 * cos(phase);
}

vec3 background(vec2 uv) {
  vec3 col = mix(vec3(0.01, 0.01, 0.015), vec3(0.03, 0.025, 0.04), uv.y + 0.5);
  // Bokeh-Lichter in der Ferne
  for (int i = 0; i < 2; i++) {
    float s = 7.0 + float(i) * 5.0;
    vec2 g = uv * s + vec2(uTime * 0.02 * float(i + 1), 0.0);
    vec2 c = floor(g);
    float h = hash12(c + float(i) * 17.0);
    if (h > 0.88) {
      vec2 o = hash22(c) - 0.5;
      float d = length(fract(g) - 0.5 - o * 0.4);
      col += pal(h * 2.0 - 0.8) * smoothstep(0.17, 0.13, d) * 0.05;
    }
  }
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, 4.6);
  vec3 rd = normalize(vec3(uv, -1.5));
  vec3 bg = background(uv);
  vec3 col = bg;

  float t = 1.5;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0008) { hit = true; break; }
    t += d;
    if (t > 9.0) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    float cosI = max(dot(-rd, n), 0.0);
    float cosT = sqrt(1.0 - (1.0 - cosI * cosI) / (1.33 * 1.33));
    // Schichtdicke: oben dünn, unten dick, dazu fließende Wirbel
    vec2 q = vec2(atan(n.z, n.x) * 0.25, n.y * 0.5) + vec2(uFlow * 0.004, -uFlow * 0.006);
    // Große, langsame Schlieren; feines Rauschen würde wie Körnung aussehen
    float swirl = vn(q * 0.025) * 0.65 + vn(q * 0.07 + 0.3) * 0.35;
    float thickness = mix(220.0, 1300.0, clamp(0.5 - n.y * 0.45 + (swirl - 0.5) * 1.3, 0.0, 1.0));
    vec3 film = thinFilm(thickness, cosT);
    vec3 refl = studio(reflect(rd, n));
    float fres = 0.04 + 0.96 * pow(1.0 - cosI, 3.0);
    // Durchsichtig, Schillern auch ohne Spiegelung
    col = bg * (1.0 - fres * 0.5) + refl * film * (0.6 + fres * 2.0) + film * (0.05 + fres * 0.55);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

class SoapBubble implements VisualMode {
  private pass!: FullscreenPass;
  private time = 0;
  private flow = 0;
  private wobble = 0;
  private wobbleVel = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uWobble: { value: 0 },
      uMid: { value: 0 },
      uFlow: { value: 0 },
      uNoise: { value: getNoiseTexture() },
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
    this.flow += dt * (1 + a.energy * 4);
    // Federnde Membran: Kicks stoßen an, danach schwingt sie aus
    if (a.beat) this.wobbleVel += 2 + a.bassRaw * 3;
    this.wobbleVel += (-(this.wobble - a.bass * 0.6) * 30 - this.wobbleVel * 3.5) * dt;
    this.wobble += this.wobbleVel * dt;
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uFlow.value = this.flow;
    u.uWobble.value = 0.4 + this.wobble;
    u.uMid.value = a.mid;
    u.uStudioSpin.value = this.time * 0.08;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('soap-bubble').meta,
  create: () => new SoapBubble(),
};
export default definition;
