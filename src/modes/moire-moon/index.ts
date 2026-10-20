import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { PointSphere } from '../../engine/field/PointSphere';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, tint } from '../../shared/glsl';

// Ein Mond aus dichten Punkten; der Bass drückt Krater hinein, ihre Ränder glühen magenta
const glsl = `
uniform float uDepth;
uniform float uSpread;
uniform float uFlow;
uniform float uSwirl;
uniform float uWobble;
uniform vec3 uWaveDir[3];
uniform float uWaveAge[3];
uniform float uWaveAmp[3];

// Schockwellen laufen vom Einschlagpunkt über die Kugel
float shock(vec3 n) {
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float ang = acos(clamp(dot(n, uWaveDir[i]), -1.0, 1.0));
    float x = (ang - uWaveAge[i] * 2.2) * 9.0;
    s += sin(x) * exp(-x * x * 0.05) * exp(-uWaveAge[i] * 1.6) * uWaveAmp[i];
  }
  return s;
}

float craterField(vec3 n) {
  vec3 q = n * 1.05 + vec3(0.0, uFlow * 0.4, uFlow * 0.25);
  vec3 w = vec3(snoise3(q * 0.8 + 3.0), snoise3(q * 0.8 + 9.0), snoise3(q * 0.8 + 17.0));
  return snoise3(q + w * 0.45);
}

float displace(vec3 n) {
  float c = craterField(n);
  float th = 0.3 - uSpread;
  float crater = smoothstep(th, th + 0.22, c);
  float rim = smoothstep(th - 0.12, th, c) * (1.0 - smoothstep(th, th + 0.1, c));
  float wob = snoise3(n * 1.3 + vec3(uFlow * 0.6, 0.0, -uFlow * 0.4)) * uWobble;
  return -crater * uDepth + rim * 0.035 + snoise3(n * 7.0 + uFlow) * 0.006 + wob + shock(n) * 0.035;
}

vec3 surfaceColor(vec3 n, float d, vec3 nrm, vec3 view) {
  float c = craterField(n);
  float th = 0.3 - uSpread;
  float inside = smoothstep(th, th + 0.12, c);
  float rim = smoothstep(th - 0.1, th, c) * (1.0 - smoothstep(th, th + 0.08, c));
  // Marmorierte Höhenlinien auf der Oberfläche
  float swirl = snoise3(n * 2.2 + vec3(uFlow * 0.3)) * 6.0 + c * 9.0;
  float lines = 0.5 + 0.5 * sin(swirl * (3.0 + uSwirl));
  vec3 base = mix(vec3(0.1, 0.9, 1.0), vec3(0.8, 1.0, 1.0), lines * 0.55);
  float light = 0.55 + 0.45 * max(dot(nrm, normalize(vec3(-0.4, 0.6, 0.8))), 0.0);
  vec3 col = base * light;
  // Wellenkämme leuchten kurz auf
  col += vec3(0.6, 0.9, 1.0) * max(shock(n), 0.0) * 0.6;
  // Kraterinneres: dunkel mit feinen Ringen
  float rings = 0.5 + 0.5 * sin(d * 160.0);
  vec3 deep = mix(vec3(0.02, 0.03, 0.12), vec3(0.15, 0.35, 0.55), rings * 0.6) * (0.4 + light * 0.6);
  col = mix(col, deep, inside);
  col = mix(col, vec3(1.0, 0.18, 0.75) * 1.4, rim * 0.85);
  float fres = pow(1.0 - max(dot(nrm, view), 0.0), 3.0);
  col += vec3(0.4, 0.9, 1.0) * fres * 0.4;
  return tint(col) * 0.9;
}
`;

const backdrop = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
${palette}
${tint}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 col = mix(vec3(0.0025, 0.0025, 0.03), vec3(0.0008, 0.0008, 0.012), smoothstep(0.0, 0.9, length(p)));
  gl_FragColor = vec4(tint(col), 1.0);
}
`;

class MoireMoon implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  private sphere!: PointSphere;
  private bg!: FullscreenPass;
  private height = 1080;
  private time = 0;
  private flow = 0;
  private depth = 0;
  private spin = 0;
  private spinKick = 0;
  private pump = 0;
  private wobble = 0;
  private waveNext = 0;
  private readonly waveDir = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
  private readonly waveAge = new Float32Array([9, 9, 9]);
  private readonly waveAmp = new Float32Array(3);

  init(ctx: ModeContext) {
    this.sphere = new PointSphere({
      columns: 900,
      rows: 450,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      size: 2.2,
      glsl,
      uniforms: {
        uDepth: { value: 0.1 }, uSpread: { value: 0 }, uFlow: { value: 0 }, uSwirl: { value: 0 }, uWobble: { value: 0 },
        uWaveDir: { value: this.waveDir }, uWaveAge: { value: this.waveAge }, uWaveAmp: { value: this.waveAmp },
      },
    });
    this.bg = new FullscreenPass(backdrop, { uPalette: { value: ctx.palette }, uPaletteMix: ctx.paletteMix });
    this.scene.add(this.sphere.points);
  }

  resize(width: number, height: number) {
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.bg.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.flow += dt * (0.15 + a.mid * 0.8 + a.energy * 0.3);
    this.depth += (0.14 + a.bass * 0.38 - this.depth) * Math.min(dt * 7, 1);
    this.wobble += (0.02 + a.bass * 0.09 - this.wobble) * Math.min(dt * 5, 1);
    // Jeder Kick: Drehimpuls, kurzes Pumpen und eine Schockwelle von einem zufälligen Punkt
    if (a.beat) {
      this.spinKick += 0.9 + a.bassRaw;
      this.pump = 0.05 + a.bassRaw * 0.05;
      const i = this.waveNext;
      this.waveNext = (i + 1) % 3;
      this.waveDir[i].set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      this.waveAge[i] = 0;
      this.waveAmp[i] = 0.6 + a.bassRaw * 0.8;
    }
    for (let i = 0; i < 3; i++) this.waveAge[i] += dt;
    this.spinKick *= Math.exp(-dt * 2.5);
    this.pump *= Math.exp(-dt * 7);
    this.spin += dt * (0.1 + a.energy * 0.25 + this.spinKick);

    const u = this.sphere.uniforms;
    u.uDepth.value = this.depth;
    u.uSpread.value = a.energy * 0.12;
    u.uFlow.value = this.flow;
    u.uSwirl.value = a.treble * 3;
    u.uWobble.value = this.wobble;
    this.sphere.points.scale.setScalar(1 + this.pump);
    this.sphere.update(this.time, this.height);
    this.sphere.points.rotation.set(Math.sin(this.time * 0.09) * 0.35 + this.spinKick * 0.05, this.spin, 0.15 + Math.sin(this.time * 0.13) * 0.1);

    this.camera.position.set(0, 0, 5.0);
    this.camera.lookAt(0, 0, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.bg.render(renderer, target);
    renderer.clearDepth();
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.sphere.dispose();
    this.bg.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('moire-moon').meta,
  create: () => new MoireMoon(),
};
export default definition;
