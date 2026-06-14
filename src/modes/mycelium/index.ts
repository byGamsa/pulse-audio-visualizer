import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { LineSet } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const LINES = 1600;
const POINTS = 120;
const TRUNKS = 9;
const MAX_PULSES = 4;

// Jede Linie folgt einem von neun Stämmen und zweigt zufällig ab
const glsl = `
uniform float uGrow;
uniform float uFade;
uniform float uSeed;
uniform float uTrunk[${TRUNKS}];
uniform float uPulse[${MAX_PULSES}];
uniform float uPulseAmp[${MAX_PULSES}];

const float TAU = 6.2831853;
float h11(float x) { return fract(sin(x * 127.1 + uSeed * 31.7) * 43758.5453); }

float trunkOf(float line) { return floor(h11(line * 17.0) * ${TRUNKS}.0); }
float branchAt(float line) { return 0.06 + pow(h11(line * 29.0), 1.6) * 0.75; }

vec3 linePos(float line, float t) {
  float k = trunkOf(line);
  float s1 = h11(k * 3.1) * TAU, s2 = h11(k * 5.7) * TAU;
  float theta = k / ${TRUNKS}.0 * TAU + h11(k) * 0.5
    + 0.6 * sin(t * 3.0 + s1) * t + 0.3 * sin(t * 7.0 + s2) * t;
  float tb = branchAt(line);
  float after = max(t - tb, 0.0);
  float bend = (h11(line * 41.0) - 0.5) * 2.2;
  theta += after * bend + 0.1 * sin(after * 11.0 + h11(line * 7.0) * TAU) * after * 3.0;
  // Äste wachsen langsamer als ihr Stamm
  float r = t * 2.3 * (1.0 - 0.3 * h11(line * 3.0) * after);
  float z = sin(t * 4.0 + s1 + after * 6.0) * 0.35 * t;
  return vec3(cos(theta) * r, sin(theta) * r * 0.82, z);
}

float lineIntensity(float line, float t) {
  float tb = branchAt(line);
  // Äste wachsen erst los, wenn der Stamm ihren Abzweig erreicht hat
  float grow = uGrow - tb * 0.25;
  float visible = smoothstep(grow, grow - 0.04, t);
  float tip = exp(-pow((t - grow) / 0.02, 2.0)) * 1.8;
  float pulse = 0.0;
  for (int i = 0; i < ${MAX_PULSES}; i++) {
    float age = uPulse[i];
    if (age < 0.0) continue;
    float x = (t - age * 0.55) / 0.03;
    pulse += exp(-x * x) * uPulseAmp[i] * exp(-age * 0.8);
  }
  int k = int(trunkOf(line));
  float band = 0.35 + uTrunk[k] * 1.4;
  // Geteilte Stamm-Abschnitte dünner gewichten
  float shared = t < tb ? 0.25 : 1.0;
  return (0.045 * band * shared * (1.0 - t * 0.5) * visible + (tip + pulse * 3.0) * 0.03 * visible) * uFade;
}

vec3 lineColor(float line, float t) {
  float k = trunkOf(line);
  return pal(clamp(0.3 + t * 0.55 + (k / ${TRUNKS}.0 - 0.5) * 0.15, 0.0, 1.0));
}
`;

class Mycelium implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private lines!: LineSet;
  private readonly trunk = new Float32Array(TRUNKS);
  private readonly pulse = new Float32Array(MAX_PULSES).fill(-1);
  private readonly pulseAmp = new Float32Array(MAX_PULSES);
  private pulseIndex = 0;
  private grow = 0.08;
  private fade = 1;
  private seed = Math.random() * 10;
  private time = 0;

  init(ctx: ModeContext) {
    this.lines = new LineSet({
      lines: LINES,
      points: POINTS,
      width: 0.8,
      palette: ctx.palette,
      glsl,
      uniforms: {
        uGrow: { value: 0 },
        uFade: { value: 1 },
        uSeed: { value: this.seed },
        uTrunk: { value: this.trunk },
        uPulse: { value: this.pulse },
        uPulseAmp: { value: this.pulseAmp },
      },
    });
    this.lines.uniforms.uFocus.value = 6;
    this.lines.uniforms.uDof.value = 2;
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

    // Wachsen mit der Energie; ausgewachsen → verblassen → neu keimen
    if (this.grow < 1.3) {
      this.grow += dt * (0.06 + a.energy * 0.12);
      this.fade = Math.min(this.fade + dt * 0.8, 1);
    } else {
      this.fade -= dt * 0.35;
      if (this.fade <= 0) {
        this.grow = 0.08;
        this.seed = Math.random() * 10;
      }
    }

    // 9 Stämme ↔ 9 Frequenzbereiche von Bass bis Höhen
    for (let k = 0; k < TRUNKS; k++) {
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += a.spectrum[k * 12 + i];
      this.trunk[k] += (sum / 12 - this.trunk[k]) * Math.min(dt * 8, 1);
    }

    for (let i = 0; i < MAX_PULSES; i++) if (this.pulse[i] >= 0) this.pulse[i] = this.pulse[i] > 3 ? -1 : this.pulse[i] + dt;
    if (a.beat) {
      this.pulse[this.pulseIndex] = 0;
      this.pulseAmp[this.pulseIndex] = 0.5 + a.bassRaw;
      this.pulseIndex = (this.pulseIndex + 1) % MAX_PULSES;
    }

    const u = this.lines.uniforms;
    u.uTime.value = this.time;
    u.uGrow.value = this.grow;
    u.uFade.value = Math.max(this.fade, 0);
    u.uSeed.value = this.seed;

    const t = this.time * 0.04;
    this.camera.position.set(Math.sin(t) * 1.2, Math.cos(t * 0.8) * 0.8, 5.6);
    this.camera.lookAt(0, 0, 0);
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
  meta: findMode('mycelium').meta,
  create: () => new Mycelium(),
};
export default definition;
