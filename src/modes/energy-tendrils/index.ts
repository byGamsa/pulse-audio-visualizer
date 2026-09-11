import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { LineSet } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { tint } from '../../shared/glsl';

const LINES = 380;
const POINTS = 220;
const BANDS = 16;

const glsl = `
${tint}
uniform float uBand[${BANDS}];
uniform float uBurst;
uniform float uFlow;
uniform float uJitter;
uniform float uSpin;
const float CORE_Z = -9.0;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }

vec3 linePos(float line, float t) {
  float i = floor(line * ${LINES - 1}.0 + 0.5);
  float ang = h11(i + 5.0) * 6.2831853 + uSpin * (0.5 + h11(i + 9.0));
  vec2 dir = vec2(cos(ang), sin(ang));
  // Start dicht am Kern, Ende weit außen kurz vor der Kamera
  vec3 a = vec3(dir * h11(i + 1.0) * 0.35, CORE_Z + (h11(i + 2.0) - 0.5) * 1.2);
  float spread = 1.2 + pow(h11(i + 3.0), 1.5) * 5.0;
  vec3 b = vec3(dir * spread * (1.0 + uBurst * 0.25), -0.6 - h11(i + 4.0) * 1.2);
  // Erst langsam, zur Kamera hin stark auffächern
  float k = t * t * (0.4 + 0.6 * t);
  vec3 p = vec3(mix(a.xy, b.xy, k), mix(a.z, b.z, t));
  // Am Kern eng gekräuselt, außen ruhige Bögen
  vec2 side = vec2(-dir.y, dir.x);
  float ph = h11(i + 11.0) * 6.28;
  float near = 1.0 - t;
  float freq = 5.0 + 40.0 * near * near;
  // Ausschlag wächst mit dem Abstand zur Achse
  float amp = (0.05 + length(p.xy) * 0.22) * (0.5 + h11(i + 13.0)) + uJitter * 0.06 * near;
  float w = sin(t * freq - uFlow * 3.0 + ph) * amp + sin(t * freq * 2.3 - uFlow * 5.0 + ph * 2.0) * amp * 0.35 * near;
  p.xy += side * w;
  p.z += cos(t * freq * 0.7 + ph) * amp * 0.5;
  return p;
}

float lineIntensity(float line, float t) {
  float i = floor(line * ${LINES - 1}.0 + 0.5);
  float h = h11(i + 17.0);
  float e = uBand[int(h * ${BANDS - 0.01})];
  // Lichtpulse, die den Faden entlang auf die Kamera zulaufen
  float pulse = pow(fract(t * 1.5 - uFlow * 0.35 + h * 3.0), 6.0);
  float base = (0.04 + e * e * 1.3 + pulse * (0.15 + e * 0.8)) * smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.85, t);
  // Ein paar Fäden sind gepunktet
  if (h11(i + 19.0) > 0.88) base *= step(0.0, sin(t * 200.0 - uFlow * 8.0)) * 1.8;
  return base;
}

vec3 lineColor(float line, float t) {
  float i = floor(line * ${LINES - 1}.0 + 0.5);
  float h = h11(i + 23.0);
  vec3 blue = vec3(0.1, 0.28, 1.0);
  vec3 cyan = vec3(0.3, 0.85, 1.0);
  vec3 violet = vec3(0.45, 0.12, 1.0);
  vec3 c = h < 0.55 ? blue : (h < 0.85 ? cyan : violet);
  // Am Kern fast weiß
  return mix(tint(c), vec3(0.8, 0.95, 1.0), (1.0 - smoothstep(0.0, 0.2, t)) * 0.6);
}
`;

class EnergyTendrils implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50);
  private lines!: LineSet;
  private readonly bands = new Float32Array(BANDS);
  private time = 0;
  private flow = 0;
  private burst = 0;
  private burstVel = 0;

  init(ctx: ModeContext) {
    this.lines = new LineSet({
      lines: LINES, points: POINTS, width: 1.0, palette: ctx.palette, glsl,
      uniforms: {
        uPaletteMix: ctx.paletteMix,
        uBand: { value: this.bands }, uBurst: { value: 0 }, uFlow: { value: 0 }, uJitter: { value: 0 }, uSpin: { value: 0 },
      },
    });
    // Scharf am Kern, je näher an der Kamera, desto weicher
    this.lines.uniforms.uFocus.value = 8;
    this.lines.uniforms.uDof.value = 1.6;
    this.scene.add(this.lines.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.lines.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    for (let i = 0; i < BANDS; i++) {
      let v = 0;
      for (let k = 0; k < 7; k++) v = Math.max(v, a.spectrum[i * 7 + k]);
      this.bands[i] = v > this.bands[i] ? v : this.bands[i] * Math.exp(-dt * 3);
    }
    // Federnder Stoß auf Kicks
    if (a.beat) this.burstVel += 3 + a.bassRaw * 4;
    this.burstVel += (-(this.burst - a.bass * 0.4) * 40 - this.burstVel * 7) * dt;
    this.burst += this.burstVel * dt;
    this.flow += dt * (0.7 + a.energy * 2 + Math.max(this.burst, 0) * 2);
    const u = this.lines.uniforms;
    u.uTime.value = this.time;
    u.uBurst.value = this.burst;
    u.uFlow.value = this.flow;
    u.uJitter.value = a.treble;
    u.uSpin.value = this.time * 0.03;
    // Leichtes Schwanken, als würde man im Strom treiben
    this.camera.position.set(Math.sin(this.time * 0.11) * 0.15, Math.cos(this.time * 0.09) * 0.1, 0);
    this.camera.lookAt(Math.sin(this.time * 0.07) * 0.3, Math.cos(this.time * 0.05) * 0.2, -9);
    this.camera.rotateZ(Math.sin(this.time * 0.04) * 0.2);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.lines.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('energy-tendrils').meta,
  create: () => new EnergyTendrils(),
};
export default definition;
