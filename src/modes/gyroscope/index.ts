import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { WaveHistory } from '../../engine/field/WaveHistory';
import { LineSet } from '../../engine/field/primitives';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hue, palette, tint } from '../../shared/glsl';

const ROWS = 60;
const RINGS = 3;
const PER_RING = 960;

// Drei ineinander kippende Ringe aus senkrechten Lichtfäden, wie ein Gyroskop
const common = `
${tint}
${hue}
${spectrumHistoryGlsl(ROWS)}
uniform sampler2D uWave;
uniform float uWaveRow;
uniform mat3 uRot[${RINGS}];
uniform float uRadius[${RINGS}];
uniform float uHue;
uniform float uSwell;
const float TAU = 6.2831853;

float ringHeight(int k, float phi) {
  // Gegenüberliegende Seiten zeigen dasselbe Band, der Ring bleibt im Gleichgewicht
  float band = abs(fract(phi / TAU + float(k) * 0.17) * 2.0 - 1.0);
  float age = float(k) * 0.12;
  float e = specAt(pow(band, 1.2) * 0.85, age);
  float w = texture(uWave, vec2(fract(phi / TAU * 3.0 + float(k) * 0.3), uWaveRow)).r;
  return 0.03 + pow(e, 1.3) * 0.62 * (0.7 + uSwell * 0.6) + abs(w) * 0.03 * (0.4 + e);
}

vec3 ringPoint(int k, float phi, float y) {
  float r = uRadius[k];
  return uRot[k] * vec3(cos(phi) * r, y, sin(phi) * r);
}

vec3 ringColor(int k, float tip) {
  vec3 c = hue2rgb(fract(uHue + float(k) * 0.31));
  return tint(mix(c, vec3(1.0), tip * tip * 0.45));
}
`;

const strandGlsl = `
${common}
void strand(float line, out int k, out float phi) {
  float id = floor(line * ${RINGS * PER_RING - 1}.0 + 0.5);
  k = int(id / ${PER_RING}.0);
  phi = mod(id, ${PER_RING}.0) / ${PER_RING}.0 * TAU;
}
vec3 linePos(float line, float t) {
  int k; float phi;
  strand(line, k, phi);
  float h = ringHeight(k, phi);
  return ringPoint(k, phi, mix(-h, h, t));
}
float lineIntensity(float line, float t) {
  int k; float phi;
  strand(line, k, phi);
  float e = ringHeight(k, phi);
  return (0.22 + e * 3.2) * (0.35 + 0.65 * pow(abs(t - 0.5) * 2.0, 2.0));
}
vec3 lineColor(float line, float t) {
  int k; float phi;
  strand(line, k, phi);
  return ringColor(k, abs(t - 0.5) * 2.0);
}
`;

const edgeGlsl = `
${common}
vec3 linePos(float line, float t) {
  float id = floor(line * ${RINGS * 2 - 1}.0 + 0.5);
  int k = int(id / 2.0);
  float side = mod(id, 2.0) * 2.0 - 1.0;
  float phi = t * TAU;
  return ringPoint(k, phi, side * ringHeight(k, phi));
}
float lineIntensity(float line, float t) {
  float id = floor(line * ${RINGS * 2 - 1}.0 + 0.5);
  int k = int(id / 2.0);
  return 1.6 + ringHeight(k, t * TAU) * 7.0;
}
vec3 lineColor(float line, float t) {
  float id = floor(line * ${RINGS * 2 - 1}.0 + 0.5);
  return ringColor(int(id / 2.0), 0.8);
}
`;

const backdrop = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uGlow;
uniform float uHue;
${palette}
${tint}
${hue}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  vec3 c = hue2rgb(fract(uHue + 0.07));
  // Glimmender Kern und ein Hauch Dunst
  vec3 col = mix(c, vec3(1.0), 0.5) * (0.25 + uGlow * 1.8) * exp(-r * r * 700.0);
  col += c * 0.012 * exp(-r * r * 7.0) * (0.4 + uGlow);
  col += vec3(0.003, 0.0015, 0.001);
  gl_FragColor = vec4(tint(col), 1.0);
}
`;

class Gyroscope implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private history!: SpectrumHistory;
  private wave!: WaveHistory;
  private strands!: LineSet;
  private edges!: LineSet;
  private bg!: FullscreenPass;
  private readonly rot = Array.from({ length: RINGS }, () => new THREE.Matrix3());
  private readonly angles = [0, 1.1, 2.3];
  private readonly spinBoost = [0, 0, 0];
  private time = 0;
  private swell = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly tmp = new THREE.Matrix4();

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.wave = new WaveHistory(1, 60, 4);
    const uniforms = {
      uSpecHist: { value: this.history.texture },
      uWave: { value: this.wave.texture },
      uWaveRow: { value: this.wave.rowCoord(0) },
      uRot: { value: this.rot },
      uRadius: { value: [1.35, 1.8, 2.25] },
      uHue: { value: 0 },
      uSwell: { value: 0 },
      uPaletteMix: ctx.paletteMix,
    };
    this.strands = new LineSet({ lines: RINGS * PER_RING, points: 2, width: 1.1, palette: ctx.palette, glsl: strandGlsl, uniforms });
    this.edges = new LineSet({ lines: RINGS * 2, points: 720, width: 1.8, palette: ctx.palette, glsl: edgeGlsl, uniforms });
    for (const l of [this.strands, this.edges]) {
      l.uniforms.uFocus.value = 7.5;
      l.uniforms.uDof.value = 1.6;
    }
    this.bg = new FullscreenPass(backdrop, {
      uGlow: { value: 0 },
      uHue: { value: 0 },
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
    });
    this.scene.add(this.strands.mesh, this.edges.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.strands.uniforms.uRes.value.set(width, height);
    this.edges.uniforms.uRes.value.set(width, height);
    this.bg.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.wave.update(a);
    this.swell += (a.bass - this.swell) * Math.min(dt * 4, 1);

    // Jeder Kick stößt einen anderen Ring an
    if (a.beat) this.spinBoost[Math.floor(this.time * 7) % RINGS] += 0.8 + a.bassRaw;
    const speeds = [0.21, -0.16, 0.12];
    for (let k = 0; k < RINGS; k++) {
      this.spinBoost[k] *= Math.exp(-dt * 1.8);
      this.angles[k] += dt * (speeds[k] + Math.sign(speeds[k]) * this.spinBoost[k] * 0.6);
    }
    const [a0, a1, a2] = this.angles;
    // Kardanische Aufhängung: jeder Ring kippt um eine eigene Achse
    this.m4.makeRotationX(a0).multiply(this.tmp.makeRotationZ(0.35));
    this.rot[0].setFromMatrix4(this.m4);
    this.m4.makeRotationY(a1).multiply(this.tmp.makeRotationX(1.2 + Math.sin(this.time * 0.13) * 0.3));
    this.rot[1].setFromMatrix4(this.m4);
    this.m4.makeRotationZ(a2).multiply(this.tmp.makeRotationY(a2 * 0.7)).multiply(this.tmp.makeRotationX(0.6));
    this.rot[2].setFromMatrix4(this.m4);

    const hueValue = (0.2 + this.time * 0.012) % 1;
    for (const l of [this.strands, this.edges]) {
      l.uniforms.uTime.value = this.time;
      l.uniforms.uHue.value = hueValue;
      l.uniforms.uSwell.value = this.swell;
    }
    this.bg.uniforms.uGlow.value = this.swell;
    this.bg.uniforms.uHue.value = hueValue;

    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.05) * 1.2, 0.6 + Math.sin(t * 0.07) * 0.5, 7.4);
    this.camera.lookAt(0, 0, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.bg.render(renderer, target);
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.wave.dispose();
    this.strands.dispose();
    this.edges.dispose();
    this.bg.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('gyroscope').meta,
  create: () => new Gyroscope(),
};
export default definition;
