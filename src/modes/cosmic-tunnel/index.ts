import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass, getNoiseTexture } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, tint } from '../../shared/glsl';

const RING_BANDS = 8;

const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uZ;
uniform float uHue;
uniform float uCloud;
uniform float uFlash;
uniform float uRing[${RING_BANDS}];
uniform sampler2D uNoise;
${hash}
${palette}
${tint}

const float R = 2.2;
const float TAU = 6.2831853;

// Mittellinie der Röhre, fest in der Welt
vec2 path(float z) {
  float amp = 0.75 + 0.4 * sin(z * 0.013) + 0.25 * sin(z * 0.029 + 1.7);
  return amp * vec2(sin(z * 0.11) * 2.2 + sin(z * 0.047) * 1.6, cos(z * 0.083) * 1.7 + sin(z * 0.031) * 0.9);
}

// In x periodisch, damit der Umfang nahtlos umläuft
float texel(float x, float y) { return texelFetch(uNoise, ivec2(int(x), int(mod(y, 256.0))), 0).r; }
float vnp(vec2 x, float P) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, P), x1 = mod(i.x + 1.0, P);
  float a = mix(texel(x0, i.y), texel(x1, i.y), f.x);
  float b = mix(texel(x0, i.y + 1.0), texel(x1, i.y + 1.0), f.x);
  return mix(a, b, f.y);
}
// x läuft über einen Umlauf von 0 bis P; jede Oktave verdoppelt beides
float fbm(vec2 x, float P) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += vnp(x, P) * a; x *= 2.0; P *= 2.0; a *= 0.5; }
  return s;
}

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

// Wandfarbe an Umfangsposition u (0..1) und Tiefe z
vec3 wall(float u, float z, float dist) {
  // Sterne: winzige Punkte, in der Ferne etwas weicher
  vec2 sg = vec2(u * 256.0, z * 9.0);
  vec2 cell = floor(sg);
  float h = hash12(cell);
  vec2 off = hash22(cell + 3.1) - 0.5;
  float star = step(0.965, h) * exp(-dot(fract(sg) - 0.5 - off * 0.6, fract(sg) - 0.5 - off * 0.6) * (70.0 / (1.0 + dist * 0.15)));
  star *= 0.4 + 0.6 * hash12(cell + 7.7);
  // Milchstraße: schwaches, warm-graues Band
  float milky = fbm(vec2(u * 16.0, z * 0.9 + 11.0), 16.0);
  vec3 col = vec3(0.012, 0.011, 0.018) + vec3(0.09, 0.07, 0.085) * pow(milky, 3.0) * 1.6;
  col += vec3(0.9, 0.92, 1.0) * star * 1.4;
  // Nebelbänder als feste Spirale
  float v = fract(u + z * 0.03);
  float c = fbm(vec2(v * 8.0, z * 0.35), 8.0);
  float cloud = smoothstep(0.42, 0.72, c) * uCloud;
  vec3 neb = tint(hsv(uHue, 0.78, 1.0));
  // Wolken lassen das Sternenlicht durchscheinen, statt es zu verdecken
  col = mix(col, neb * (0.55 + c * 0.6), cloud * 0.85) + vec3(0.9) * star * cloud * 0.4;
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  // Kamera folgt dem Pfad, blickt ein Stück voraus in die Kurve
  vec3 ro = vec3(path(uZ), uZ);
  vec3 ta = vec3(path(uZ + 3.0), uZ + 3.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.05 + rt * uv.x + up * uv.y);

  float t = 0.05;
  vec3 p = ro;
  for (int i = 0; i < 72; i++) {
    p = ro + rd * t;
    float d = R - length(p.xy - path(p.z));
    if (d < 0.005) break;
    t += d * 0.75;
    if (t > 60.0) break;
  }
  vec2 q = p.xy - path(p.z);
  float u = fract(atan(q.y, q.x) / TAU + 0.5);
  vec3 col = wall(u, p.z, t);

  // LED-Bögen blitzen nur auf den Beat auf
  for (int layer = 0; layer < 2; layer++) {
    float spacing = layer == 0 ? 2.4 : 3.3;
    float zz = p.z + float(layer) * 1.1;
    float k = floor(zz / spacing + 0.5) + float(layer) * 101.0;
    float dz = abs(zz - (k - float(layer) * 101.0) * spacing);
    int band = int(mod(k, ${RING_BANDS}.0));
    float e = uRing[band];
    float level = uFlash * (2.5 + e * 2.5);
    for (int j = 0; j < 2; j++) {
      vec2 id = vec2(k, float(j));
      float a0 = hash12(id + 2.0);
      float span = 0.12 + hash12(id + 5.0) * 0.3;
      float rel = fract(u - a0);
      float arc = smoothstep(0.0, 0.015, rel) * smoothstep(span, span - 0.015, rel);
      // Jeder Ring eine eigene Neonfarbe
      vec3 warm = tint(hsv(fract(k * 0.137 + float(j) * 0.08), 1.0, 1.0));
      // Heller LED-Kern, weicher Schein und ein Lichthof auf der Wand
      float led = exp(-dz / 0.016) + exp(-dz / 0.07) * 0.2;
      col += warm * led * arc * level;
      col += warm * exp(-dz / 0.7) * arc * level * 0.04;
    }
  }

  // Nebel in der Tiefe: die Mitte versinkt im Dunkel
  col *= exp(-max(t - 3.0, 0.0) * 0.07);
  col *= 1.0 - dot(uv, uv) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

class CosmicTunnel implements VisualMode {
  private pass!: FullscreenPass;
  private readonly rings = new Float32Array(RING_BANDS);
  private time = 0;
  private z = 0;
  private speed = 5;
  private hue = 0.85;
  private cloud = 1;
  private boost = 0;
  private flash = 0;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uNoise: { value: getNoiseTexture() },
      uTime: { value: 0 },
      uZ: { value: 0 },
      uHue: { value: this.hue },
      uCloud: { value: 1 },
      uRing: { value: this.rings },
      uFlash: { value: 0 },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    // Zwei Glättungsstufen, damit die Kamera ohne Ruck beschleunigt
    if (a.beat) {
      this.boost = Math.min(this.boost + 4 + a.bassRaw * 3.5, 16);
      this.flash = 0.7 + a.bassRaw * 0.6;
    }
    this.flash *= Math.exp(-dt * 5);
    this.boost *= Math.exp(-dt * 1.4);
    const target = 5 + a.energy * 9 + this.boost;
    this.speed += (target - this.speed) * Math.min(dt * 2.2, 1);
    this.z += this.speed * dt;
    // Nebelfarbe wandert langsam weiter
    this.hue = (this.hue + dt * 0.012) % 1;
    this.cloud += (0.75 + a.bass * 0.6 - this.cloud) * Math.min(dt * 3, 1);
    for (let i = 0; i < RING_BANDS; i++) {
      let v = 0;
      for (let k = 0; k < 16; k++) v = Math.max(v, a.spectrum[i * 16 + k]);
      this.rings[i] = v > this.rings[i] ? v : this.rings[i] * Math.exp(-dt * 3);
    }
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uZ.value = this.z;
    u.uHue.value = this.hue;
    u.uCloud.value = this.cloud;
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
  meta: findMode('cosmic-tunnel').meta,
  create: () => new CosmicTunnel(),
};
export default definition;
