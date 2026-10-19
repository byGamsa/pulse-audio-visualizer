import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { TiltShift } from '../../engine/field/TiltShift';
import { WireMesh } from '../../engine/field/WireMesh';
import { renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const ROWS = 90;
const COLS = 170;
const DEPTH = 26;

// Ein schmaler Regenbogengrat aus Drahtdreiecken, oben und unten verschwommene Echos
const glsl = `
${spectrumHistoryGlsl(ROWS)}
uniform float uAge;
uniform float uGain;
uniform float uHue;
uniform float uLift;
const float HALF = 7.5;

float heightAt(vec2 g, float x) {
  float side = abs(x) / HALF;
  // Bass in der Mitte, nach außen die Höhen; jede Reihe etwas älter
  float age = uAge + g.y * 0.18;
  float e = specAt(pow(side, 0.85) * 0.9, age);
  float env = pow(1.0 - side, 0.7);
  float rnd = hash12(floor(g * vec2(${COLS}.0, ${DEPTH}.0)));
  float slow = snoise(vec2(x * 0.35 - uTime * 0.25, g.y * 2.0 + uAge * 9.0)) * 0.35;
  float h = env * (0.5 + slow + pow(e, 1.3) * (0.95 + uLift * 0.6) * (0.75 + rnd * 0.5));
  // Einzelne Nadeln
  h += pow(rnd, 18.0) * e * env * 1.2;
  return h;
}

vec3 wirePos(vec2 g) {
  float x = (g.x - 0.5) * HALF * 2.0;
  float z = (g.y - 0.5) * 4.0;
  float h = heightAt(g, x);
  // Ober- und Unterkante: das Band ist hohl wie ein Gebirgskamm
  return vec3(x, h * 1.5 - 0.3, z - h * 0.3);
}

vec3 wireColor(vec2 g, vec3 p) {
  float side = (g.x - 0.5) * 2.0;
  vec3 col = hue2rgb(fract(uHue + 0.17 + side * 0.45));
  float hn = clamp(p.y / 2.6, 0.0, 1.0);
  col = mix(col, vec3(1.0), smoothstep(0.35, 1.0, hn) * 0.6);
  float ends = smoothstep(1.0, 0.75, abs(side));
  float rows = smoothstep(0.0, 0.25, g.y) * smoothstep(1.0, 0.75, g.y);
  return tint(col) * (0.25 + hn * 1.4) * ends * (0.4 + 0.6 * rows) * uGain;
}
`;

class PrismRidge implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  private history!: SpectrumHistory;
  private mesh!: WireMesh;
  private blur!: TiltShift;
  private time = 0;
  private lift = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.mesh = new WireMesh({
      columns: COLS,
      rows: DEPTH,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      glsl,
      uniforms: {
        uSpecHist: { value: this.history.texture },
        uAge: { value: 0 },
        uGain: { value: 1 },
        uHue: { value: 0 },
        uLift: { value: 0 },
      },
    });
    this.blur = new TiltShift({ focusY: 0.5, band: 0.1, maxBlur: 26 });
    this.scene.add(this.mesh.lines);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.blur.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.lift += (a.bass * 0.8 - this.lift) * Math.min(dt * 3, 1);
    const u = this.mesh.uniforms;
    u.uTime.value = this.time;
    u.uHue.value = (this.time * 0.015) % 1;
    u.uLift.value = this.lift;

    // Frontal, leicht von oben; der Grat schwingt sanft
    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.07) * 1.6, 2.8 + Math.sin(t * 0.05) * 0.25, 10.5);
    this.camera.lookAt(0, 0.6, 0);
    this.mesh.lines.rotation.y = Math.sin(t * 0.04) * 0.12;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    const u = this.mesh.uniforms;
    const lines = this.mesh.lines;
    // Drei Durchgänge: Grat, Echo oben (älter), Echo unten (noch älter)
    const passes = [
      { y: 0, age: 0, gain: 1 },
      { y: 4.2, age: 0.25, gain: 0.28 },
      { y: -3.8, age: 0.5, gain: 0.24 },
    ];
    this.blur.render(renderer, target, (rt) => {
      renderer.setRenderTarget(rt);
      renderer.clear();
      for (const p of passes) {
        lines.position.y = p.y;
        u.uAge.value = p.age;
        u.uGain.value = p.gain;
        renderOver(renderer, rt, this.scene, this.camera);
      }
    });
    lines.position.y = 0;
  }

  dispose() {
    this.history.dispose();
    this.mesh.dispose();
    this.blur.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('prism-ridge').meta,
  create: () => new PrismRidge(),
};
export default definition;
