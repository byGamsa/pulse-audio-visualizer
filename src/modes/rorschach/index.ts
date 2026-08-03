import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { LineSet } from '../../engine/field/primitives';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, tint } from '../../shared/glsl';

const LOOPS = 6;
const STROKES = 3;
const POINTS = 600;

const lineGlsl = `
uniform float uPhase;
uniform float uBass;
uniform float uMid;
uniform float uSweep;
uniform float uLift;
// Schleifen (dünn) und Pinselstriche (breit)
uniform float uBase;
uniform float uCount;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }

float idx(float line) { return uBase + floor(line * max(uCount - 1.0, 1.0) + 0.5); }

vec3 linePos(float line, float t) {
  float i = idx(line);
  float h1 = h11(i + 1.0), h2 = h11(i + 7.0), h3 = h11(i + 13.0), h4 = h11(i + 21.0);
  // Obere Bildhälfte, Spiegelung erzeugt den Rest
  float cy = 0.2 + uLift;
  if (i < ${LOOPS}.0) {
    float a = t * 6.2831853;
    vec2 c = vec2(0.03 + h1 * 0.14, cy + (h2 - 0.5) * 0.08 + sin(uPhase * 0.3 + i) * 0.015);
    vec2 r = vec2(0.1 + h3 * 0.14, 0.07 + h4 * 0.14) * (1.0 + uBass * 0.18 * (0.5 + h1));
    // Leichte Oberwelle: aus Ellipsen werden Herzen und Bohnen
    float k = 1.0 + (0.06 + uMid * 0.1) * sin(2.0 * a + uPhase * (0.4 + h2 * 0.5) + i);
    float rot = (h1 - 0.5) * 0.5 + sin(uPhase * 0.2 + i * 1.7) * 0.12;
    vec2 e = vec2(cos(a) * r.x, sin(a) * r.y) * k;
    e = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * e;
    return vec3(c + e, 0.0);
  }
  // Pinselstriche schwenken um einen Punkt nahe der Achse
  float s = i - ${LOOPS}.0;
  vec2 pivot = vec2(0.04 + h1 * 0.12, cy - 0.02 + (h2 - 0.5) * 0.1);
  float base = -1.2 + h3 * 2.4 + sin(uSweep * (0.6 + h4) + s * 2.0) * 0.5;
  float ang = base + (t - 0.5) * 0.35;
  float rad = 0.07 + h4 * 0.1;
  return vec3(pivot + vec2(cos(ang), sin(ang)) * rad * (0.3 + t * 0.7), 0.0);
}

float lineIntensity(float line, float t) {
  float i = idx(line);
  // Striche laufen spitz aus: dick in der Mitte, dünn an den Enden
  if (i >= ${LOOPS}.0) return 2.2 * pow(sin(t * 3.14159), 1.5);
  return 1.0;
}
vec3 lineColor(float line, float t) { return vec3(1.0); }
`;

// Spuren verblassen ohne Weichzeichnen, so bleiben feine Linien scharf
const feedbackFrag = `
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform float uDecay;
void main() { gl_FragColor = vec4(texture(uPrev, vUv).rgb * uDecay, 1.0); }
`;

const finalFrag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uInk;
uniform sampler2D uCrisp;
uniform float uInvert;
uniform float uDouble;
uniform float uTime;
${hash}
void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
  // Waagerecht spiegeln, senkrecht optional
  p.x = abs(p.x);
  p.y = mix(p.y + 0.3, abs(p.y), uDouble);
  vec2 uv = vec2(p.x / aspect + 0.5, p.y + 0.5);
  float ink = texture(uInk, uv).r;
  float crisp = 1.0 - exp(-texture(uCrisp, uv).r * 6.0);

  // Filmkorn, jedes Frame neu
  float g = hash12(gl_FragCoord.xy + fract(uTime * 7.3) * 1000.0);
  float trail = 1.0 - exp(-ink * 1.3);
  // Nachspur mit Drucktextur, aktuelle Linie scharf
  float printed = max(smoothstep(g * 0.7 + 0.05, g * 0.7 + 0.3, trail) * 0.75, crisp);
  float line = max(trail * 0.6, crisp);

  vec3 mint = tint(vec3(0.01, 0.6, 0.39));
  vec3 dark = tint(vec3(0.003, 0.012, 0.01));
  vec3 day = mix(mint * (0.94 + g * 0.12), dark, printed * 0.92);
  vec3 night = dark + tint(vec3(0.05, 0.75, 0.62)) * (line * 1.5 + printed * 0.5) * (0.7 + g * 0.6);
  vec3 col = mix(day, night, uInvert);
  gl_FragColor = vec4(col, 1.0);
}
`;

class Rorschach implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, -1, 1);
  private lines!: LineSet;
  private strokes!: LineSet;
  private feedback!: FullscreenPass;
  private final!: FullscreenPass;
  private buffers: THREE.WebGLRenderTarget[] = [];
  private crisp!: THREE.WebGLRenderTarget;
  private time = 0;
  private dt = 1 / 60;
  private phase = 0;
  private sweep = 0;
  private persistence = 0.6;
  private invert = 0;
  private invertTarget = 0;
  private double = 1;
  private doubleTarget = 1;
  private beats = 0;

  init(ctx: ModeContext) {
    const uniforms = (base: number, count: number) => ({
      uPhase: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uSweep: { value: 0 }, uLift: { value: 0 },
      uBase: { value: base }, uCount: { value: count },
    });
    this.lines = new LineSet({ lines: LOOPS, points: POINTS, width: 1.0, palette: ctx.palette, glsl: lineGlsl, uniforms: uniforms(0, LOOPS) });
    this.strokes = new LineSet({ lines: STROKES, points: 160, width: 3.2, palette: ctx.palette, glsl: lineGlsl, uniforms: uniforms(LOOPS, STROKES) });
    for (const l of [this.lines, this.strokes]) {
      l.uniforms.uDof.value = 0;
      this.scene.add(l.mesh);
    }
    this.feedback = new FullscreenPass(feedbackFrag, { uPrev: { value: null }, uDecay: { value: 0.85 } });
    this.final = new FullscreenPass(finalFrag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      uInk: { value: null }, uCrisp: { value: null }, uInvert: { value: 0 }, uDouble: { value: 1 }, uTime: { value: 0 },
    });
  }

  resize(width: number, height: number) {
    for (const b of this.buffers) b.dispose();
    this.crisp?.dispose();
    this.buffers = [0, 1].map(() => new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.crisp = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
    const aspect = width / height;
    this.camera.left = -aspect / 2;
    this.camera.right = aspect / 2;
    this.camera.updateProjectionMatrix();
    this.lines.uniforms.uRes.value.set(width, height);
    this.strokes.uniforms.uRes.value.set(width, height);
    this.feedback.resize(width, height);
    this.final.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.dt = dt;
    this.time += dt;
    this.phase += dt * (0.15 + a.mid * 0.5);
    // Bei Kicks schneller, so entstehen dunkle Keile
    this.sweep += dt * (0.2 + a.bassRaw * 2.5);

    if (a.beat) {
      this.beats++;
      if (this.beats % 16 === 0) this.invertTarget = 1 - this.invertTarget;
      if (this.beats % 32 === 0) this.doubleTarget = 1 - this.doubleTarget;
    }
    // Hartes Umschalten wie im Original, nur ein paar Frames Übergang
    this.invert += (this.invertTarget - this.invert) * Math.min(dt * 25, 1);
    this.double += (this.doubleTarget - this.double) * Math.min(dt * 3, 1);
    // Laut: lange Spuren, die verschmieren
    const target = 0.5 + Math.min(a.energy * 1.2, 1) * 0.4;
    this.persistence += (target - this.persistence) * Math.min(dt * 1.5, 1);

    for (const l of [this.lines, this.strokes]) {
      const u = l.uniforms;
      u.uPhase.value = this.phase;
      u.uBass.value = a.bass;
      u.uMid.value = a.mid;
      u.uSweep.value = this.sweep;
      u.uLift.value = (1 - this.double) * 0.1;
    }
    this.final.uniforms.uInvert.value = this.invert;
    this.final.uniforms.uDouble.value = this.double;
    this.final.uniforms.uTime.value = this.time;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    const [prev, cur] = this.buffers;
    this.feedback.uniforms.uPrev.value = prev.texture;
    this.feedback.uniforms.uDecay.value = Math.pow(this.persistence, this.dt * 60);
    this.feedback.render(renderer, cur);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(cur);
    renderer.render(this.scene, this.camera);
    // Dieselben Linien noch einmal ohne Nachspur: die scharfe Haarlinie
    renderer.autoClear = true;
    renderer.setRenderTarget(this.crisp);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
    this.final.uniforms.uInk.value = cur.texture;
    this.final.uniforms.uCrisp.value = this.crisp.texture;
    this.final.render(renderer, target);
    this.buffers = [cur, prev];
  }

  dispose() {
    for (const b of this.buffers) b.dispose();
    this.crisp.dispose();
    this.lines.dispose();
    this.strokes.dispose();
    this.feedback.dispose();
    this.final.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('rorschach').meta,
  create: () => new Rorschach(),
};
export default definition;
