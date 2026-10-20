import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, simplex2, tint } from '../../shared/glsl';

const BLOBS = 12;

// Mitten in der Lavalampe: glühendes Wachs schwebt durch violette Flüssigkeit, von unten durchleuchtet
const frag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uHeat;
uniform float uBass;
uniform float uFlash;
uniform vec4 uBlobs[${BLOBS}];
${palette}
${tint}
${hash}
${simplex2}

const float FLOOR = -2.15;
const float CEIL = 2.5;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Wachs: schwebende Blasen, unten eine wellige Pfütze, oben ein Rest
float wax(vec3 p) {
  float pool = p.y - FLOOR - 0.12 * sin(p.x * 1.3 + uTime * 0.3) - 0.08 * sin(p.z * 2.1 - uTime * 0.2) - uBass * 0.08;
  float top = CEIL - p.y + 0.06 * sin(p.x * 1.7 - uTime * 0.25);
  float d = smin(pool, top, 0.3);
  for (int i = 0; i < ${BLOBS}; i++) {
    vec4 b = uBlobs[i];
    vec3 q = p - b.xyz;
    q.y *= 0.82;
    d = smin(d, length(q) - b.w, 0.32);
  }
  // Zähes Wachs: leichte Beulen, die langsam über die Oberfläche wandern
  return d + snoise(vec2(p.x * 1.6 + p.z * 0.7, p.y * 1.6 - uTime * 0.3)) * 0.05;
}

vec3 waxNormal(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(wax(p + e.xyy) - wax(p - e.xyy), wax(p + e.yxy) - wax(p - e.yxy), wax(p + e.yyx) - wax(p - e.yyx)));
}

vec3 hot(float k) {
  // Tiefrot → Orange → Gelbweiß
  vec3 c = mix(vec3(0.55, 0.02, 0.02), vec3(1.0, 0.25, 0.02), smoothstep(0.0, 0.5, k));
  return tint(mix(c, vec3(1.0, 0.75, 0.3), smoothstep(0.5, 1.0, k)));
}

vec3 liquid(vec2 uv, float y) {
  // Unten glüht die Birne durch, oben wird es dunkel violett
  vec3 deep = tint(vec3(0.012, 0.002, 0.02));
  vec3 lit = tint(vec3(0.32, 0.02, 0.22));
  float glow = exp(-(y + 1.4) * 1.3);
  vec3 col = mix(deep, lit, clamp(glow, 0.0, 1.0)) * (0.3 + uHeat * 0.2 + uFlash * 0.3);
  // Hitzeschlieren
  float s = snoise(vec2(uv.x * 2.0, uv.y * 3.0 - uTime * 0.25)) * snoise(vec2(uv.x * 5.0 + uTime * 0.1, uv.y * 2.0 - uTime * 0.4));
  col *= 1.0 + s * 0.35;
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  // Leichtes Flimmern durch die warme Flüssigkeit
  vec2 shimmer = vec2(snoise(uv * 6.0 + vec2(0.0, -uTime * 0.6)), snoise(uv * 6.0 + vec2(7.0, -uTime * 0.5))) * 0.004;
  vec3 ro = vec3(0.0, 0.0, 3.4);
  vec3 rd = normalize(vec3(uv + shimmer, -1.45));

  vec3 col = liquid(uv, uv.y * 2.4);

  float t = 0.5;
  bool hit = false;
  for (int i = 0; i < 96; i++) {
    float d = wax(ro + rd * t);
    if (d < 0.002) { hit = true; break; }
    t += d * 0.8;
    if (t > 8.0) break;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = waxNormal(p);
    float facing = max(dot(n, -rd), 0.0);
    // Von unten durchleuchtet: Unterseiten und dünne Ränder glühen am stärksten
    float under = max(-n.y, 0.0);
    float rim = pow(1.0 - facing, 2.5);
    float depthWarm = clamp(1.0 - (p.y - FLOOR) / (CEIL - FLOOR), 0.0, 1.0);
    // Gegenlicht: Kern dunkelrot, Ränder durchscheinend glühend
    float k = clamp(0.1 + rim * 0.75 + under * 0.35 + depthWarm * 0.2, 0.0, 1.0);
    vec3 w = hot(k) * (0.06 + pow(rim, 0.8) * 1.6 + under * 0.7 + depthWarm * 0.15) * (0.8 + uHeat * 0.5 + uFlash * 0.7);
    // Weicher Glanz von oben
    vec3 l = normalize(vec3(-0.3, 1.0, 0.5));
    w += vec3(1.0, 0.85, 0.7) * pow(max(dot(reflect(-l, n), -rd), 0.0), 40.0) * 0.18;
    // Tiefe: entfernte Blasen versinken im violetten Dunst
    float fog = exp(-max(t - 2.6, 0.0) * 0.7);
    col = mix(col, w, fog);
  }

  // Schwebende Bläschen vor der Kamera
  vec2 g = uv * 14.0 + vec2(0.0, -uTime * 0.6);
  vec2 cell = floor(g);
  float hb = hash12(cell);
  if (hb > 0.93) {
    vec2 f = fract(g) - 0.5 - (hash22(cell) - 0.5) * 0.5;
    col += hot(0.8) * smoothstep(0.08, 0.0, length(f)) * 0.15;
  }

  // Vignette wie durch gewölbtes Glas
  col *= 1.0 - smoothstep(0.55, 1.15, length(uv * vec2(0.8, 1.0)));
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 50.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Blob {
  x: number;
  z: number;
  phase: number;
  speed: number;
  radius: number;
  wobble: number;
}

class LavaLamp implements VisualMode {
  private pass!: FullscreenPass;
  private readonly uniformBlobs = Array.from({ length: BLOBS }, () => new THREE.Vector4());
  private blobs: Blob[] = [];
  private time = 0;
  private heat = 0;
  private flash = 0;

  init(ctx: ModeContext) {
    this.blobs = Array.from({ length: BLOBS }, (_, i) => ({
      x: (i / (BLOBS - 1) - 0.5) * 3.6 + (Math.random() - 0.5) * 0.4,
      z: -Math.random() * 2.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.14 + Math.random() * 0.12,
      radius: 0.22 + Math.random() * 0.22,
      wobble: Math.random() * 10,
    }));
    this.pass = new FullscreenPass(frag, {
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uBass: { value: 0 },
      uFlash: { value: 0 },
      uBlobs: { value: this.uniformBlobs },
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    // Energie heizt die Lampe auf, das Wachs steigt schneller
    this.heat += (a.energy - this.heat) * Math.min(dt * 1.5, 1);
    this.flash = Math.max(this.flash * Math.exp(-dt * 4), a.beat ? 0.35 + a.bassRaw * 0.4 : 0);
    const speedUp = 0.5 + this.heat * 1.8;

    // Ein Kick löst die unterste Blase aus der Pfütze
    if (a.beat) {
      let low = this.blobs[0];
      for (const b of this.blobs) if (Math.cos(b.phase) > Math.cos(low.phase)) low = b;
      low.phase += 0.3;
    }

    for (let i = 0; i < BLOBS; i++) {
      const b = this.blobs[i];
      b.phase += dt * b.speed * speedUp;
      // Langsam aufsteigen, oben kurz verweilen, wieder sinken
      const s = 0.5 - 0.5 * Math.cos(b.phase);
      const y = -2.0 + s * 4.1;
      const wob = Math.sin(this.time * 0.35 + b.wobble);
      // In der Mitte des Wegs gestreckt, an den Enden breit
      const r = b.radius * (1 + 0.25 * Math.sin(b.phase * 2 + b.wobble)) * (1 + a.bass * 0.3);
      this.uniformBlobs[i].set(b.x + wob * 0.15, y, b.z + Math.cos(this.time * 0.2 + b.wobble) * 0.2, r);
    }

    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uHeat.value = this.heat;
    u.uBass.value = a.bass;
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
  meta: findMode('lava-lamp').meta,
  create: () => new LavaLamp(),
};
export default definition;
