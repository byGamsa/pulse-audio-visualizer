import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { Motes } from '../../engine/field/Motes';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, simplex2, tint } from '../../shared/glsl';

const ROWS = 90;
const RINGS = 10;

// Konzentrische Bogenstücke auf einer kippenden Scheibe; jeder Ring ist ein Frequenzband
const arcFrag = `
precision highp float;
in vec2 vUv;
uniform float uTime;
uniform float uSpin;
uniform float uGain;
${palette}
${tint}
${hash}
${simplex2}
${spectrumHistoryGlsl(ROWS)}
const float TAU = 6.2831853;
const float W = 0.2;

void main() {
  vec2 p = (vUv - 0.5) * 5.0;
  float r = length(p);
  float a = atan(p.y, p.x) / TAU + 0.5;
  float rf = r / W;
  float k = floor(rf);
  float f = fract(rf);
  if (k < 1.0 || k > ${RINGS}.0) discard;

  float band = (k - 1.0) / ${RINGS - 1}.0 * 0.85;
  // Benachbarte Ringe drehen gegeneinander
  float dir = mod(k, 2.0) * 2.0 - 1.0;
  float n = 2.0 + floor(k * 0.45);
  float ca = fract(a + uSpin * (0.4 + k * 0.07) * dir) * n;
  float cell = floor(ca);
  float cf = fract(ca);
  float v = specAt(band, hash12(vec2(cell, k * 17.0)) * 0.6);
  float len = clamp(0.15 + pow(v, 0.9) * 1.1, 0.0, 0.92);
  float inSeg = smoothstep(0.03, 0.05, cf) * smoothstep(0.05 + len, 0.03 + len, cf);

  // Ausgefranste Kanten, wie gerissenes Papier
  float tear = snoise(vec2(a * 140.0 + k * 3.0, uTime * 0.7)) * 0.07;
  float thick = 0.1 + v * 0.22 + tear * 0.7;
  float d = abs(f - 0.5);
  float body = smoothstep(thick, thick - 0.05, d) * inSeg;
  float halo = exp(-max(d - thick, 0.0) * 18.0) * inSeg * 0.25;

  float pos = (cf - 0.04) / max(len, 0.001);
  float endness = 1.0 - smoothstep(0.0, 0.22, min(pos, 1.0 - pos));
  vec3 core = vec3(0.78, 0.9, 1.0) * 2.4;
  vec3 hot = vec3(1.0, 0.25, 0.85) * 2.2;
  vec3 col = mix(core, hot, endness * 0.8) * body + vec3(0.25, 0.4, 1.0) * halo;
  float fade = smoothstep(${RINGS + 0.9}, ${RINGS - 1.5}, rf);
  gl_FragColor = vec4(tint(col) * uGain * fade, 1.0);
}
`;

const arcVert = `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const backdrop = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uGlow;
${palette}
${tint}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  vec3 col = mix(vec3(0.008, 0.004, 0.05), vec3(0.002, 0.001, 0.014), smoothstep(0.0, 0.9, r));
  col += vec3(0.012, 0.005, 0.035) * uGlow * exp(-r * r * 4.0);
  gl_FragColor = vec4(tint(col), 1.0);
}
`;

class PolarArcs implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
  private history!: SpectrumHistory;
  private disc!: THREE.Mesh;
  private discMat!: THREE.ShaderMaterial;
  private motes!: Motes;
  private bg!: FullscreenPass;
  private height = 1080;
  private time = 0;
  private spin = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.discMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uSpecHist: { value: this.history.texture },
        uPalette: { value: ctx.palette },
        uPaletteMix: ctx.paletteMix,
        uTime: { value: 0 },
        uSpin: { value: 0 },
        uGain: { value: 1 },
      },
      vertexShader: arcVert,
      fragmentShader: arcFrag,
    });
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), this.discMat);
    this.disc.frustumCulled = false;
    this.motes = new Motes({
      count: 520,
      box: new THREE.Vector3(7, 4.5, 9),
      drift: new THREE.Vector3(0, 0, 1.4),
      size: 16,
      color: new THREE.Color(1, 0.35, 0.85),
      focus: 5,
      dof: 3.5,
    });
    this.motes.points.position.z = -3;
    this.bg = new FullscreenPass(backdrop, { uGlow: { value: 0 }, uPalette: { value: ctx.palette }, uPaletteMix: ctx.paletteMix });
    this.scene.add(this.motes.points, this.disc);
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
    this.history.update(a);
    this.spin += dt * (0.25 + a.energy * 0.6) + (a.beat ? 0.02 : 0);
    const u = this.discMat.uniforms;
    u.uTime.value = this.time;
    u.uSpin.value = this.spin;
    u.uGain.value = 0.8 + a.bass * 0.4;
    this.bg.uniforms.uGlow.value = a.energy;
    this.motes.update(this.time, this.height);
    this.motes.uniforms.uGain.value = 1.4 + a.treble * 2.0;

    // Die Scheibe kippt langsam im Raum
    const t = this.time;
    this.disc.rotation.set(-0.75 + Math.sin(t * 0.11) * 0.25, Math.sin(t * 0.08) * 0.55, t * 0.03);
    this.camera.position.set(0, 0, 6.2);
    this.camera.lookAt(0, 0, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.bg.render(renderer, target);
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.disc.geometry.dispose();
    this.discMat.dispose();
    this.motes.dispose();
    this.bg.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('polar-arcs').meta,
  create: () => new PolarArcs(),
};
export default definition;
