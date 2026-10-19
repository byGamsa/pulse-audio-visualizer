import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { Motes } from '../../engine/field/Motes';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { TiltShift } from '../../engine/field/TiltShift';
import { WireMesh } from '../../engine/field/WireMesh';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const ROWS = 150;
const COLS = 250;

// Ein stachliges Drahtfeld von oben; jeder Moment läuft als Ring nach außen
const glsl = `
${spectrumHistoryGlsl(ROWS)}
uniform float uHueA;
uniform float uHueB;
uniform float uKick;
const float SPEED = 7.5;
const float SIZE = 16.0;

float energyAt(float age) {
  // Bass trägt die Ringe, Mitten und Höhen füllen sie
  return specAt(0.04, age) * 0.55 + specAt(0.22, age) * 0.3 + specAt(0.5, age) * 0.25;
}

float heightAt(vec2 g, vec2 xz) {
  float r = length(xz);
  float age = r / (SPEED * ${(ROWS / 60).toFixed(3)});
  float e = energyAt(age);
  // Wellenkämme laufen mit der Historie nach außen
  float crest = 0.3 + 0.7 * pow(0.5 + 0.5 * sin((r - uTime * SPEED) * 2.1), 2.0);
  float rnd = hash12(floor(g * ${COLS}.0));
  float spike = 0.25 + 2.6 * pow(rnd, 3.5) + 0.2 * snoise(xz * 1.3 + uTime * 0.2);
  float h = pow(e, 1.25) * crest * spike * 2.2;
  // Mitte bleibt ein flacher Trichter
  h *= smoothstep(0.4, 2.2, r);
  h += uKick * exp(-r * 0.35) * rnd * 0.8;
  return max(h, 0.0);
}

vec3 wirePos(vec2 g) {
  vec2 xz = (g - 0.5) * SIZE * 2.0;
  return vec3(xz.x, heightAt(g, xz), xz.y);
}

vec3 wireColor(vec2 g, vec3 p) {
  float hn = clamp(p.y / 1.8, 0.0, 1.0);
  vec3 low = hue2rgb(uHueA) * 0.55 + 0.05;
  vec3 high = mix(hue2rgb(uHueB), vec3(1.0), 0.3);
  vec3 col = mix(low, high, smoothstep(0.05, 0.6, hn));
  float edge = smoothstep(SIZE, SIZE * 0.7, length(p.xz));
  float a = (0.05 + hn * 1.5) * edge;
  return tint(col) * a;
}
`;

class RippleField implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  private history!: SpectrumHistory;
  private mesh!: WireMesh;
  private motes!: Motes;
  private blur!: TiltShift;
  private height = 1080;
  private time = 0;
  private hue = 0.22;
  private kick = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.mesh = new WireMesh({
      columns: COLS,
      rows: COLS,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      glsl,
      uniforms: {
        uSpecHist: { value: this.history.texture },
        uHueA: { value: 0 },
        uHueB: { value: 0 },
        uKick: { value: 0 },
      },
    });
    this.motes = new Motes({
      count: 260,
      box: new THREE.Vector3(12, 3, 12),
      drift: new THREE.Vector3(0.05, 0.25, 0.02),
      size: 5,
      color: new THREE.Color(1, 0.97, 0.9),
      focus: 9,
      dof: 2.5,
    });
    this.motes.points.position.y = 2;
    this.blur = new TiltShift({ focusY: 0.48, band: 0.12, maxBlur: 16, radial: 0.6 });
    this.scene.add(this.mesh.lines, this.motes.points);
  }

  resize(width: number, height: number) {
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.blur.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    // Farben wandern langsam, Beats schieben etwas weiter
    this.hue += dt * 0.012 + (a.beat ? 0.004 : 0);
    this.kick = Math.max(this.kick * Math.exp(-dt * 5), a.beat ? 0.6 + a.bassRaw : 0);

    const u = this.mesh.uniforms;
    u.uTime.value = this.time;
    u.uHueA.value = this.hue % 1;
    u.uHueB.value = (this.hue + 0.62) % 1;
    u.uKick.value = this.kick;
    this.motes.update(this.time, this.height);

    // Steil von oben, die Kamera kreist langsam um die Mitte
    const t = this.time * 0.05;
    const r = 6.5;
    this.camera.position.set(Math.sin(t) * r, 9.5 + Math.sin(this.time * 0.08) * 0.6, Math.cos(t) * r);
    this.camera.lookAt(Math.sin(t + 2.6) * 1.2, 0, Math.cos(t + 2.6) * 1.2);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.blur.render(renderer, target, (rt) => {
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(this.scene, this.camera);
    });
  }

  dispose() {
    this.history.dispose();
    this.mesh.dispose();
    this.motes.dispose();
    this.blur.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('ripple-field').meta,
  create: () => new RippleField(),
};
export default definition;
