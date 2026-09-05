import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

const BEAMS = 14;

// Farbstimmungen: Magenta-Violett und Neonblau, im Takt überblendet
const LOOKS: [THREE.Color, THREE.Color][] = [
  [new THREE.Color(1.0, 0.0, 0.85), new THREE.Color(0.5, 0.0, 1.0)],
  [new THREE.Color(0.25, 0.3, 1.0), new THREE.Color(0.38, 0.45, 1.0)],
  [new THREE.Color(0.7, 0.0, 1.0), new THREE.Color(0.2, 0.25, 1.0)],
];

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBeam[${BEAMS}];
uniform float uFlash;
uniform float uSym;
uniform float uWidth;
uniform vec3 uColA;
uniform vec3 uColB;

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  // Linsenwölbung: gerade Strahlen biegen sich zum Rand hin leicht
  p *= 1.0 + dot(p, p) * 0.12;
  float px = 1.0 / uRes.y;

  vec3 col = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < ${BEAMS}; i++) {
    float fi = float(i);
    float h1 = h11(fi + 1.0), h2 = h11(fi + 7.0), h3 = h11(fi + 13.0), h4 = h11(fi + 19.0);
    // Jeder Strahl dreht langsam um einen eigenen Drehpunkt
    float ang = h1 * 3.14159 + sin(uTime * (0.05 + h2 * 0.12) + fi * 1.7) * 0.55;
    vec2 pivot = (vec2(h3, h4) - 0.5) * vec2(1.1, 0.8);
    // Gerade Indizes bilden Spiegelpaare: links wie rechts, gespiegelt
    vec2 q = p;
    if (mod(fi, 2.0) < 1.0) q.x = mix(q.x, abs(q.x), uSym);
    vec2 n = vec2(-sin(ang), cos(ang));
    float d = abs(dot(q - pivot, n));
    float e = uBeam[i];
    float w = (2.2 + e * 1.5) * px * uWidth;
    float level = 0.3 + e * e * 1.2 + uFlash * 0.5;
    float core = exp(-d * d / (w * w));
    // Naher und weiter Schein
    float halo = exp(-d / (w * 4.0)) * 0.55 + exp(-d / (w * 18.0)) * 0.12;
    vec3 c = tint(mix(uColA, uColB, h2));
    col += (mix(c, vec3(1.0), 0.55) * core * 1.6 + c * halo) * level;
    total += core * level;
  }
  // Kreuzungen: wo sich Kerne überlagern, wird es weiß
  col += vec3(1.0) * max(total - 0.9, 0.0) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

class NeonLasers implements VisualMode {
  private pass!: FullscreenPass;
  private readonly beams = new Float32Array(BEAMS);
  private readonly colA = new THREE.Color().copy(LOOKS[0][0]);
  private readonly colB = new THREE.Color().copy(LOOKS[0][1]);
  private time = 0;
  private flash = 0;
  private beats = 0;
  private look = 0;
  private sym = 1;
  private symTarget = 1;

  init(ctx: ModeContext) {
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uTime: { value: 0 },
      uBeam: { value: this.beams },
      uFlash: { value: 0 },
      uSym: { value: 1 },
      uWidth: { value: 1 },
      uColA: { value: this.colA },
      uColB: { value: this.colB },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    // Die Strahlen schwenken schneller, wenn die Musik dichter wird
    this.time += dt * (0.6 + a.energy * 1.6);
    for (let i = 0; i < BEAMS; i++) {
      let v = 0;
      for (let k = 0; k < 8; k++) v = Math.max(v, a.spectrum[i * 8 + k]);
      this.beams[i] = v > this.beams[i] ? v : this.beams[i] * Math.exp(-dt * 5);
    }
    if (a.beat) {
      this.beats++;
      this.flash = 0.5 + a.bassRaw * 0.6;
      if (this.beats % 16 === 0) this.look = (this.look + 1) % LOOKS.length;
      if (this.beats % 32 === 0) this.symTarget = 1 - this.symTarget;
    }
    this.flash *= Math.exp(-dt * 7);
    this.sym += (this.symTarget - this.sym) * Math.min(dt * 0.8, 1);
    const k = Math.min(dt * 1.5, 1);
    this.colA.lerp(LOOKS[this.look][0], k);
    this.colB.lerp(LOOKS[this.look][1], k);
    const u = this.pass.uniforms;
    u.uTime.value = this.time;
    u.uFlash.value = this.flash;
    u.uSym.value = this.sym;
    u.uWidth.value = 1 + a.bass * 0.5;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('neon-lasers').meta,
  create: () => new NeonLasers(),
};
export default definition;
