import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, simplex2, tint } from '../../shared/glsl';

const SPLATS = 8;

// Tinte in dunklem Wasser, links und rechts gespiegelt: ein lebendiger Rorschach-Klecks
const simFrag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uPrev;
uniform float uTime;
uniform float uDt;
uniform float uSwirl;
uniform float uPush;
uniform float uDecay;
uniform vec4 uSplat[${SPLATS}];
uniform vec3 uSplatCol[${SPLATS}];
${simplex2}

// Wirbelfeld aus Rauschen; auf der Spiegelachse gespiegelt, damit beide Hälften gleich fließen
vec2 curl(vec2 p) {
  float e = 0.01;
  float n1 = snoise(p + vec2(0.0, e)), n2 = snoise(p - vec2(0.0, e));
  float n3 = snoise(p + vec2(e, 0.0)), n4 = snoise(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

vec2 flow(vec2 p) {
  vec2 q = vec2(abs(p.x), p.y);
  vec2 v = curl(q * 1.6 + vec2(0.0, uTime * 0.05)) * 0.05 * uSwirl;
  v += curl(q * 4.0 - vec2(uTime * 0.08, 0.0)) * 0.022 * uSwirl;
  // Von der Achse weg nach außen, wie Tinte zwischen zwei Blättern
  v.x += 0.03 * uPush * exp(-q.x * 3.0);
  v.x *= sign(p.x + 1e-6);
  return v;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  vec2 back = p - flow(p) * uDt * 6.0;
  vec3 ink = texture(uPrev, back / vec2(aspect, 1.0) + 0.5).rgb * uDecay;
  for (int i = 0; i < ${SPLATS}; i++) {
    vec4 s = uSplat[i];
    if (s.w <= 0.0) continue;
    vec2 d = vec2(abs(p.x) - s.x, p.y - s.y);
    ink += uSplatCol[i] * exp(-dot(d, d) / (s.z * s.z)) * s.w * uDt * 6.0;
  }
  gl_FragColor = vec4(min(ink, vec3(4.0)), 1.0);
}
`;

const showFrag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uInk;
uniform float uTime;
uniform float uGlow;
${palette}
${tint}
${hash}
void main() {
  vec2 px = 1.0 / uRes;
  vec3 ink = texture(uInk, vUv).rgb;
  float l = dot(ink, vec3(0.3, 0.5, 0.2));
  // Kanten der Schlieren leuchten als feine Fäden
  float lx = dot(texture(uInk, vUv + vec2(px.x, 0.0)).rgb - texture(uInk, vUv - vec2(px.x, 0.0)).rgb, vec3(0.3, 0.5, 0.2));
  float ly = dot(texture(uInk, vUv + vec2(0.0, px.y)).rgb - texture(uInk, vUv - vec2(0.0, px.y)).rgb, vec3(0.3, 0.5, 0.2));
  float edge = smoothstep(0.02, 0.2, length(vec2(lx, ly)) * 10.0 / (0.4 + l));
  vec2 c = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 bg = mix(vec3(0.004, 0.003, 0.012), vec3(0.0012, 0.001, 0.004), smoothstep(0.0, 0.9, length(c)));
  vec3 col = tint(bg);
  // Tinte: dichte Stellen satt, dünne Stellen zart, dazu leuchtende Kanten
  // Dichte Tinte wird nicht weiß: Farbe behalten, Helligkeit sanft begrenzen
  vec3 body = ink / (0.55 + l) * 0.75;
  vec3 lit = body + normalize(ink + 1e-4) * edge * (0.4 + uGlow * 0.8) * smoothstep(0.02, 0.2, l);
  // Leichter Hof um sehr helle Kerne
  lit += normalize(ink + 1e-4) * smoothstep(0.9, 2.5, l) * 0.5;
  col += tint(lit);
  float grain = (hash12(vUv * uRes + fract(uTime) * 61.0) - 0.5) * 0.004;
  gl_FragColor = vec4(col + grain, 1.0);
}
`;

const HUES = [0.92, 0.52, 0.12, 0.75, 0.35];

class InkBloom implements VisualMode {
  private sim!: FullscreenPass;
  private show!: FullscreenPass;
  private buffers: THREE.WebGLRenderTarget[] = [];
  private ping = 0;
  private readonly splat = Array.from({ length: SPLATS }, () => new THREE.Vector4(0, 0, 0.05, 0));
  private readonly splatCol = Array.from({ length: SPLATS }, () => new THREE.Vector3());
  private readonly splatLife = new Float32Array(SPLATS);
  private next = 0;
  private hueIndex = 0;
  private time = 0;
  private drip = 0;

  init(ctx: ModeContext) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.buffers = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.sim = new FullscreenPass(simFrag, {
      uPrev: { value: this.buffers[0].texture },
      uTime: { value: 0 }, uDt: { value: 0.016 }, uSwirl: { value: 1 }, uPush: { value: 1 }, uDecay: { value: 0.99 },
      uSplat: { value: this.splat }, uSplatCol: { value: this.splatCol },
    });
    this.show = new FullscreenPass(showFrag, {
      uInk: { value: this.buffers[1].texture }, uTime: { value: 0 }, uGlow: { value: 0 },
      uPalette: { value: ctx.palette }, uPaletteMix: ctx.paletteMix,
    });
  }

  resize(width: number, height: number) {
    // Halbe Auflösung reicht für weiche Tinte und spart viel
    const w = Math.max(1, width >> 1), h = Math.max(1, height >> 1);
    for (const b of this.buffers) b.setSize(w, h);
    this.sim.resize(w, h);
    this.show.resize(width, height);
  }

  private readonly tmp = new THREE.Color();

  private emit(x: number, y: number, radius: number, strength: number, hueValue: number) {
    const i = this.next;
    this.next = (this.next + 1) % SPLATS;
    this.splat[i].set(x, y, radius, 1);
    this.tmp.setHSL(((hueValue % 1) + 1) % 1, 0.85, 0.55);
    this.splatCol[i].set(this.tmp.r, this.tmp.g, this.tmp.b).multiplyScalar(strength);
    this.splatLife[i] = 0.35;
  }

  update(a: AudioFeatures) {
    const dt = Math.min(a.dt, 1 / 30);
    this.time += dt;

    // Kicks setzen einen neuen Klecks auf die Achse, mit der nächsten Farbe der Reihe
    if (a.beat) {
      this.hueIndex = (this.hueIndex + 1) % HUES.length;
      const y = (Math.random() - 0.5) * 0.5;
      this.emit(Math.random() * 0.05, y, 0.04 + a.bassRaw * 0.05, 0.7 + a.bassRaw * 0.9, HUES[this.hueIndex] + this.time * 0.003);
      // Kleiner Spritzer daneben
      this.emit(0.12 + Math.random() * 0.2, y + (Math.random() - 0.5) * 0.25, 0.015 + Math.random() * 0.02, 0.6, HUES[(this.hueIndex + 2) % HUES.length]);
    }
    // Leises Nachtröpfeln aus den Mitten
    this.drip += dt * (0.6 + a.mid * 4);
    if (this.drip > 1) {
      this.drip = 0;
      this.emit(0.02, (Math.random() - 0.5) * 0.7, 0.015 + a.mid * 0.02, 0.25 + a.mid * 0.6, HUES[(this.hueIndex + 1) % HUES.length]);
    }
    for (let i = 0; i < SPLATS; i++) {
      this.splatLife[i] = Math.max(0, this.splatLife[i] - dt);
      this.splat[i].w = this.splatLife[i] > 0 ? this.splatLife[i] / 0.35 : 0;
    }

    const s = this.sim.uniforms;
    s.uTime.value = this.time;
    s.uDt.value = dt;
    s.uSwirl.value = 0.7 + a.energy * 1.6;
    s.uPush.value = 0.5 + a.bass * 2.5;
    // Tinte bleibt einige Sekunden, bei lauter Musik etwas kürzer
    s.uDecay.value = Math.pow(0.976 - a.energy * 0.008, dt * 60);
    this.show.uniforms.uTime.value = this.time;
    this.show.uniforms.uGlow.value = a.treble;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    const prev = this.buffers[this.ping];
    const next = this.buffers[1 - this.ping];
    this.sim.uniforms.uPrev.value = prev.texture;
    this.sim.render(renderer, next);
    this.show.uniforms.uInk.value = next.texture;
    this.show.render(renderer, target);
    this.ping = 1 - this.ping;
  }

  dispose() {
    for (const b of this.buffers) b.dispose();
    this.sim.dispose();
    this.show.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('ink-bloom').meta,
  create: () => new InkBloom(),
};
export default definition;
