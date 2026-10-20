import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { Starfield } from '../../engine/field/Starfield';
import { Streaks } from '../../engine/field/Streaks';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const ROWS = 60;

// Ein Wasserfall aus Licht: oben eine schmale Säule, unten fächert er sich zur Kamera auf
const glsl = `
${spectrumHistoryGlsl(ROWS)}
uniform float uFlow;
uniform float uSpread;
uniform float uHue;
const float H = 11.0;
const float R = 3.4;
const float Z0 = -7.0;
const float F = 12.0;
const float PI = 3.14159265;

float lane(vec4 seed) {
  float v = seed.x * 2.0 - 1.0;
  return sign(v) * pow(abs(v), 1.35);
}

vec3 streakPath(vec4 seed, float s) {
  float l1 = H - R, l2 = PI * 0.5 * R, l3 = F;
  float d = clamp(s, 0.0, 1.0) * (l1 + l2 + l3);
  float y, z;
  if (d < l1) { y = H - d; z = Z0; }
  else if (d < l1 + l2) {
    float a = (d - l1) / R;
    y = R - R * sin(a);
    z = Z0 + R - R * cos(a);
  } else { y = 0.0; z = Z0 + R + (d - l1 - l2); }
  float h = clamp((z - Z0) / (R + F), 0.0, 1.0);
  // Trompetenform: schon in der Biegung beginnt das Auffächern
  float bend = clamp((R - y) / R, 0.0, 1.0);
  float x = lane(seed) * (1.1 + bend * bend * 3.5 + pow(h, 0.75) * 13.0 * uSpread);
  // Die Säule hat etwas Tiefe, die Spuren auf dem Boden etwas Wölbung
  z += (seed.y - 0.5) * 0.8 * (1.0 - h);
  y += h * h * abs(lane(seed)) * 0.3;
  return vec3(x, y, z);
}

vec2 streakSpan(vec4 seed) {
  float len = 0.08 + seed.w * 0.14;
  float speed = 0.06 + seed.z * 0.07;
  return vec2(fract(seed.z * 13.1 + uFlow * speed) * (1.0 + len), len);
}

float streakWidth(vec4 seed, float s) {
  vec3 p = streakPath(seed, s);
  float near = smoothstep(-4.0, 6.0, p.z);
  return (0.008 + seed.w * 0.012) * (1.0 + near * 2.2);
}

vec3 streakColor(vec4 seed, float u, float s) {
  float band = abs(lane(seed));
  float e = specAt(band * 0.85, 0.0);
  // Eine Grundfarbe mit leichter Streuung, dazu ein Nachbarton und wenige weiße Fäden
  float h = uHue + (seed.y - 0.5) * 0.09 + step(0.78, fract(seed.w * 5.3)) * 0.12;
  vec3 c = hue2rgb(fract(h));
  c = mix(c, vec3(1.0), step(0.93, fract(seed.x * 17.3)) * 0.7);
  float head = pow(u, 1.6);
  return tint(c) * (0.18 + e * 1.6) * head;
}
`;

class Lightfall implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 120);
  private history!: SpectrumHistory;
  private streaks!: Streaks;
  private stars!: Starfield;
  private height = 1080;
  private time = 0;
  private flow = 0;
  private spread = 1;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.streaks = new Streaks({
      count: 2600,
      segments: 18,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      glsl,
      uniforms: { uSpecHist: { value: this.history.texture }, uFlow: { value: 0 }, uSpread: { value: 1 }, uHue: { value: 0.5 } },
    });
    this.stars = new Starfield(2500, 90, 0.7);
    this.scene.add(this.stars.points, this.streaks.mesh);
  }

  resize(width: number, height: number) {
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    // Tempo folgt der Energie, Kicks geben Schub
    this.flow += dt * (0.8 + a.energy * 2.2 + (a.beat ? 1.5 : 0));
    this.spread += (0.85 + a.bass * 0.35 - this.spread) * Math.min(dt * 3, 1);
    const u = this.streaks.uniforms;
    u.uTime.value = this.time;
    u.uFlow.value = this.flow;
    u.uSpread.value = this.spread;
    // Der Farbton wandert über Minuten durch das Spektrum
    u.uHue.value = (0.5 + this.time * 0.006) % 1;

    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.05) * 0.8, 1.5 + Math.sin(t * 0.07) * 0.15, 4.5);
    this.camera.lookAt(Math.sin(t * 0.05 + 1.0) * 0.4, 3.6, -6);
    this.stars.points.position.copy(this.camera.position);
    this.stars.update(t, this.height);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.streaks.dispose();
    this.stars.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('lightfall').meta,
  create: () => new Lightfall(),
};
export default definition;
