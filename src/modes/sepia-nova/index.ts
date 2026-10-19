import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { LineSet } from '../../engine/field/primitives';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, simplex3, tint } from '../../shared/glsl';

const ROWS = 60;
const HAIRS = 9000;
const SEGMENTS = 6;

// Ein Fellball aus tausenden Haaren; jedes Haar hängt an einem Frequenzband
const hairGlsl = `
${simplex3}
${spectrumHistoryGlsl(ROWS)}
uniform float uReach;
const float PI = 3.14159265;

float h1(float x) { return fract(sin(x * 91.345) * 47453.5453); }

vec3 hairDir(float id) {
  // Fibonacci-Kugel: gleichmäßig verteilte Wurzeln
  float k = id + 0.5;
  float y = 1.0 - 2.0 * k / ${HAIRS}.0;
  float r = sqrt(max(1.0 - y * y, 0.0));
  float th = k * 2.39996323;
  return vec3(cos(th) * r, y, sin(th) * r);
}

vec3 linePos(float line, float t) {
  float id = floor(line * ${HAIRS - 1}.0 + 0.5);
  vec3 n = hairDir(id);
  float band = h1(id);
  float e = specAt(band * 0.85, h1(id + 3.1) * 0.25);
  float tuft = smoothstep(-0.35, 0.75, snoise3(n * 2.6 + uTime * 0.12)) * 1.1;
  float len = (0.18 + pow(e, 1.2) * 1.25 * uReach) * (0.4 + tuft);
  // Leichte Krümmung, wie gekämmt
  vec3 curl = vec3(snoise3(n * 3.0 + 11.0), snoise3(n * 3.0 + 23.0), snoise3(n * 3.0 + 37.0)) * 0.35;
  vec3 dir = normalize(n + curl * t);
  return n * 0.62 + dir * len * t;
}

float lineIntensity(float line, float t) {
  float id = floor(line * ${HAIRS - 1}.0 + 0.5);
  float e = specAt(h1(id) * 0.85, 0.0);
  return (0.05 + e * 0.38) * (0.4 + t * 0.8) * (1.0 - smoothstep(0.85, 1.0, t) * 0.6);
}

vec3 lineColor(float line, float t) { return vec3(1.0, 0.86, 0.66); }
`;

// Zoom-Unschärfe plus Rückkopplung: jedes Bild wird leicht vergrößert und gedreht mitgenommen
const feedback = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uScene;
uniform sampler2D uPrev;
uniform float uZoom;
uniform float uTwist;
uniform float uDecay;
uniform float uStreak;

void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 c = (vUv - 0.5) * asp;
  vec3 cur = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float s = 1.0 - float(i) * uStreak;
    cur += texture(uScene, 0.5 + c * s / asp).rgb;
  }
  cur /= 10.0;
  float ca = cos(uTwist), sa = sin(uTwist);
  vec2 q = mat2(ca, -sa, sa, ca) * c * (1.0 - uZoom);
  vec3 prev = texture(uPrev, 0.5 + q / asp).rgb;
  gl_FragColor = vec4(cur * (1.0 - uDecay) * 1.6 + prev * uDecay, 1.0);
}
`;

// Sepia-Grading, Vignette und feines Korn
const grade = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uSrc;
uniform float uTime;
${palette}
${tint}
${hash}
void main() {
  vec3 col = texture(uSrc, vUv).rgb;
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  vec3 sepia = vec3(1.0, 0.82, 0.6) * lum;
  // Mit gewählter Palette: Tonung entlang ihres Verlaufs statt Sepia
  vec3 ramp = pal(clamp(0.18 + sqrt(lum) * 0.75, 0.0, 0.97));
  ramp *= lum * 1.3 / max(max(ramp.r, max(ramp.g, ramp.b)), 1e-3);
  sepia = mix(sepia, ramp, uPaletteMix);
  vec2 c = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = 1.0 - smoothstep(0.35, 1.05, length(c));
  vec3 bg = vec3(0.006, 0.0045, 0.003);
  float grain = (hash12(vUv * uRes + fract(uTime) * 97.0) - 0.5) * 0.004;
  gl_FragColor = vec4(tint(bg + sepia * vig) + grain, 1.0);
}
`;

class SepiaNova implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  private history!: SpectrumHistory;
  private hair!: LineSet;
  private sceneRT!: THREE.WebGLRenderTarget;
  private fb: THREE.WebGLRenderTarget[] = [];
  private feedback!: FullscreenPass;
  private grade!: FullscreenPass;
  private ping = 0;
  private time = 0;
  private reach = 0;
  private spin = 0;
  private zoomKick = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.hair = new LineSet({
      lines: HAIRS,
      points: SEGMENTS,
      width: 1.2,
      palette: ctx.palette,
      glsl: hairGlsl,
      uniforms: { uSpecHist: { value: this.history.texture }, uReach: { value: 1 } },
    });
    this.hair.uniforms.uFocus.value = 4.2;
    this.hair.uniforms.uDof.value = 1.2;
    this.scene.add(this.hair.mesh);
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, opts);
    this.fb = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.feedback = new FullscreenPass(feedback, {
      uScene: { value: this.sceneRT.texture },
      uPrev: { value: this.fb[0].texture },
      uZoom: { value: 0.01 },
      uTwist: { value: 0.004 },
      uDecay: { value: 0.86 },
      uStreak: { value: 0.012 },
    });
    this.grade = new FullscreenPass(grade, {
      uSrc: { value: this.fb[1].texture },
      uTime: { value: 0 },
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
    });
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.hair.uniforms.uRes.value.set(width, height);
    this.sceneRT.setSize(width, height);
    for (const t of this.fb) t.setSize(width, height);
    this.feedback.resize(width, height);
    this.grade.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.reach += (0.75 + a.bass * 0.7 - this.reach) * Math.min(dt * 6, 1);
    this.spin += dt * (0.08 + a.energy * 0.2);
    this.zoomKick = Math.max(this.zoomKick * Math.exp(-dt * 4), a.beat ? 0.02 + a.bassRaw * 0.025 : 0);

    this.hair.uniforms.uTime.value = this.time;
    this.hair.uniforms.uReach.value = this.reach;
    this.hair.mesh.rotation.set(Math.sin(this.time * 0.1) * 0.4, this.spin, Math.sin(this.time * 0.07) * 0.2);

    const f = this.feedback.uniforms;
    // Bildratenunabhängig: Zerfall und Zoom pro Sekunde
    const step = Math.min(dt * 60, 3);
    f.uDecay.value = Math.pow(0.8, step);
    f.uZoom.value = (0.008 + a.energy * 0.01 + this.zoomKick) * step;
    f.uTwist.value = (0.003 + Math.sin(this.time * 0.2) * 0.002) * step;
    f.uStreak.value = 0.004 + a.bass * 0.009;
    this.grade.uniforms.uTime.value = this.time;

    this.camera.position.set(0, 0, 4.2);
    this.camera.lookAt(0, 0, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    const prev = this.fb[this.ping];
    const next = this.fb[1 - this.ping];
    this.feedback.uniforms.uPrev.value = prev.texture;
    this.feedback.render(renderer, next);
    this.grade.uniforms.uSrc.value = next.texture;
    this.grade.render(renderer, target);
    this.ping = 1 - this.ping;
  }

  dispose() {
    this.history.dispose();
    this.hair.dispose();
    this.sceneRT.dispose();
    for (const t of this.fb) t.dispose();
    this.feedback.dispose();
    this.grade.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('sepia-nova').meta,
  create: () => new SepiaNova(),
};
export default definition;
