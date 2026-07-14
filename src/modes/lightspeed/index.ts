import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { DotGrid, LineSet } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const STREAKS = 360;
const SPEC = 16;
const DEPTH = 42;

const shared = `
uniform float uTravel;
uniform float uSpec[${SPEC}];
uniform float uBoost;
const float TAU = 6.2831853;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float spec(float x) {
  float f = clamp(x, 0.0, 1.0) * float(${SPEC - 1});
  int i = int(floor(f));
  return mix(uSpec[i], uSpec[min(i + 1, ${SPEC - 1})], fract(f));
}
`;

const streakGlsl = shared + `
vec3 streak(float line, float t, out float head) {
  float ang = h11(line * 13.0) * TAU;
  float r = 0.35 + pow(h11(line * 7.0), 0.7) * 3.2;
  float len = 4.0 + h11(line * 3.0) * 10.0 * (1.0 + uBoost);
  head = mod(uTravel * (0.7 + h11(line * 5.0) * 0.6) + h11(line * 11.0) * ${DEPTH}.0, ${DEPTH}.0);
  float z = -${DEPTH}.0 + head - t * len;
  vec3 p = vec3(cos(ang) * r, sin(ang) * r, z);
  // 35 % der Strahlen schlängeln sich, getrieben von „ihrem“ Frequenzband
  if (h11(line * 17.0) < 0.35) {
    float band = h11(line * 19.0);
    float amp = (0.05 + spec(band) * 0.4) * r * 0.4;
    vec3 side = vec3(-sin(ang), cos(ang), 0.0);
    p += side * sin(t * 18.0 + uTravel * 0.8 + line) * amp;
  }
  return p;
}
vec3 linePos(float line, float t) { float h; return streak(line, t, h); }
float lineIntensity(float line, float t) {
  float h;
  vec3 p = streak(line, t, h);
  float fade = smoothstep(-${DEPTH}.0, -${DEPTH - 12}.0, p.z) * smoothstep(0.5, -2.0, p.z);
  float tail = 1.0 - t;
  bool squiggle = h11(line * 17.0) < 0.35;
  return (squiggle ? 1.3 : 0.6) * tail * fade * (0.7 + uBoost);
}
vec3 lineColor(float line, float t) { return pal(0.35 + h11(line * 23.0) * 0.42); }
`;

const dotGlsl = shared + `
float h21(vec2 p, float k) { return fract(sin(dot(p, vec2(127.1, 311.7)) + k * 74.7) * 43758.5453); }
vec3 dotPos(vec2 g) {
  // g.y = Strom, g.x = Position im Strom
  float ang = h21(vec2(g.y, 1.0), 1.0) * TAU;
  float r = 0.5 + pow(h21(vec2(g.y, 2.0), 2.0), 0.6) * 3.5;
  float z = -mod(g.x * ${DEPTH}.0 - uTravel * 1.2 + h21(vec2(g.y, 3.0), 3.0) * 7.0, ${DEPTH}.0);
  return vec3(cos(ang) * r, sin(ang) * r, z);
}
float dotIntensity(vec2 g) {
  vec3 p = dotPos(g);
  return 1.6 * smoothstep(-${DEPTH}.0, -${DEPTH - 10}.0, p.z) * smoothstep(0.5, -1.5, p.z) * step(0.45, h21(vec2(g.y, 4.0), 4.0));
}
vec3 dotColor(vec2 g) { return mix(pal(0.55), vec3(0.85, 0.95, 1.0), 0.15); }
`;

class Lightspeed implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
  private streaks!: LineSet;
  private dots!: DotGrid;
  private readonly spec = new Float32Array(SPEC);
  private travel = 0;
  private boost = 0;
  private time = 0;

  init(ctx: ModeContext) {
    const uniforms = () => ({ uTravel: { value: 0 }, uSpec: { value: this.spec }, uBoost: { value: 0 } });
    this.streaks = new LineSet({ lines: STREAKS, points: 64, width: 2.2, palette: ctx.palette, glsl: streakGlsl, uniforms: uniforms() });
    this.streaks.uniforms.uDof.value = 0;
    this.dots = new DotGrid({ columns: 160, rows: 90, size: 2.2, palette: ctx.palette, glsl: dotGlsl, uniforms: uniforms() });
    this.dots.uniforms.uFocus.value = 8;
    this.dots.uniforms.uDof.value = 0.6;
    this.scene.add(this.dots.points, this.streaks.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.streaks.uniforms.uRes.value.set(width, height);
    this.dots.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    if (a.beat) this.boost = Math.min(this.boost + 0.6 + a.bassRaw * 0.6, 1.5);
    this.boost *= Math.exp(-dt * 2.5);
    this.travel += dt * (10 + a.energy * 26 + this.boost * 30);
    for (let i = 0; i < SPEC; i++) {
      let s = 0;
      for (let k = 0; k < 7; k++) s += a.spectrum[i * 7 + k];
      this.spec[i] += (s / 7 - this.spec[i]) * Math.min(dt * 12, 1);
    }
    for (const set of [this.streaks, this.dots]) {
      set.uniforms.uTravel.value = this.travel;
      set.uniforms.uBoost.value = this.boost;
      set.uniforms.uTime.value = this.time;
    }
    // Leichtes Rollen und Schwanken, als würde man durch den Strom fliegen
    this.camera.rotation.z = Math.sin(this.time * 0.15) * 0.15;
    this.camera.position.set(Math.sin(this.time * 0.3) * 0.15, Math.cos(this.time * 0.23) * 0.15, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.streaks.dispose();
    this.dots.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('lightspeed').meta,
  create: () => new Lightspeed(),
};
export default definition;
