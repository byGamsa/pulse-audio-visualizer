import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { Starfield } from '../../engine/field/Starfield';
import { Streaks } from '../../engine/field/Streaks';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hue, palette, tint } from '../../shared/glsl';

const ROWS = 60;
const ARMS = 3;

// Kometenspuren strömen auf Spiralarmen in einen glühenden Trichter
const glsl = `
${spectrumHistoryGlsl(ROWS)}
uniform float uFlow;
uniform float uSuck;
uniform float uSpin;
uniform float uHue;
const float TAU = 6.2831853;
const float R_OUT = 3.4;
const float R_IN = 0.12;

float radiusAt(float s) { return mix(R_OUT, R_IN, pow(clamp(s, 0.0, 1.0), 0.75)); }

vec3 streakPath(vec4 seed, float s) {
  float r = radiusAt(s) * (1.0 - uSuck * 0.22 * (1.0 - s));
  // Drei Arme, ein Teil der Spuren streut frei dazwischen
  float arm = floor(seed.x * ${ARMS}.0);
  float free = step(0.72, seed.y);
  float spread = mix(0.35, 3.14159, free) * (seed.z - 0.5);
  float th = arm / ${ARMS}.0 * TAU + spread - log(r) * 2.1 + uSpin;
  // Trichter: je näher am Kern, desto tiefer
  float y = -0.55 / (r + 0.18) + 0.2 + (seed.w - 0.5) * 0.06 * r;
  return vec3(cos(th) * r, y, sin(th) * r);
}

vec2 streakSpan(vec4 seed) {
  float len = 0.02 + seed.w * 0.035;
  float speed = 0.035 + seed.z * 0.03;
  return vec2(fract(seed.y * 9.7 + seed.x * 3.1 + uFlow * speed) * (1.0 + len), len);
}

float streakWidth(vec4 seed, float s) {
  return (0.006 + seed.w * 0.01) * (0.5 + radiusAt(s) * 0.35);
}

vec3 streakColor(vec4 seed, float u, float s) {
  float r = radiusAt(s);
  float k = clamp(1.0 - r / R_OUT, 0.0, 1.0);
  // Außen Violett, Mitte Pink, innen Gold bis Weiß
  vec3 outer = hue2rgb(fract(uHue + 0.7));
  vec3 mid = hue2rgb(fract(uHue + 0.9));
  vec3 inner = vec3(1.0, 0.82, 0.55);
  vec3 c = mix(outer, mid, smoothstep(0.1, 0.55, k));
  c = mix(c, inner, smoothstep(0.55, 0.9, k));
  c = mix(c, vec3(1.0), smoothstep(0.9, 1.0, k) * 0.7);
  float e = specAt(1.0 - k, 0.0);
  float head = pow(u, 1.4);
  float fade = smoothstep(0.0, 0.06, s);
  return tint(c) * (0.08 + e * 0.5 + k * k * 0.6) * head * fade;
}
`;

const coreFrag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform vec2 uCore;
uniform float uGlow;
uniform float uHue;
${palette}
${tint}
${hue}
void main() {
  vec2 p = (vUv - uCore) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  vec3 col = vec3(1.0, 0.85, 0.6) * exp(-r * r * 900.0) * (1.2 + uGlow * 2.0);
  col += hue2rgb(fract(uHue + 0.9)) * exp(-r * 9.0) * (0.06 + uGlow * 0.12);
  col += hue2rgb(fract(uHue + 0.7)) * exp(-r * 2.2) * 0.012;
  gl_FragColor = vec4(tint(col), 1.0);
}
`;

class ParticleVortex implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.05, 100);
  private history!: SpectrumHistory;
  private streaks!: Streaks;
  private stars!: Starfield;
  private core!: FullscreenPass;
  private readonly probe = new THREE.Vector3();
  private height = 1080;
  private time = 0;
  private flow = 0;
  private spin = 0;
  private suck = 0;
  private suckVel = 0;
  private flash = 0;
  private hue = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.streaks = new Streaks({
      count: 12000,
      segments: 6,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      glsl,
      uniforms: {
        uSpecHist: { value: this.history.texture },
        uFlow: { value: 0 }, uSuck: { value: 0 }, uSpin: { value: 0 }, uHue: { value: 0 },
      },
    });
    this.core = new FullscreenPass(coreFrag, {
      uCore: { value: new THREE.Vector2(0.5, 0.5) }, uGlow: { value: 0 }, uHue: { value: 0 },
      uPalette: { value: ctx.palette }, uPaletteMix: ctx.paletteMix,
    });
    this.stars = new Starfield(2500, 80, 0.6);
    this.scene.add(this.stars.points, this.streaks.mesh);
  }

  resize(width: number, height: number) {
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.core.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    // Feder-Dämpfer: Kicks ziehen den Strudel zusammen
    if (a.beat) {
      this.suckVel += 2.5 + a.bassRaw * 4;
      this.flash = 1;
    }
    this.suckVel += (-this.suck * 40 - this.suckVel * 8) * dt;
    this.suck += this.suckVel * dt;
    this.flash *= Math.exp(-dt * 5);
    this.flow += dt * (1 + a.energy * 2.5 + this.flash * 2);
    this.spin += dt * (0.15 + a.mid * 0.4);
    this.hue = (this.hue + dt * 0.005) % 1;

    const u = this.streaks.uniforms;
    u.uTime.value = this.time;
    u.uFlow.value = this.flow;
    u.uSuck.value = this.suck + a.bass * 0.4;
    u.uSpin.value = this.spin;
    u.uHue.value = this.hue;

    const t = this.time * 0.04;
    this.camera.position.set(Math.cos(t) * 3.6, 2.9 + Math.sin(this.time * 0.07) * 0.3, Math.sin(t) * 3.6);
    this.camera.lookAt(0, -0.6, 0);
    this.camera.updateMatrixWorld();
    this.stars.update(this.time, this.height);

    // Kernleuchten dort, wo der Trichter endet
    this.probe.set(0, -1.6, 0).project(this.camera);
    const c = this.core.uniforms;
    c.uCore.value.set(this.probe.x * 0.5 + 0.5, this.probe.y * 0.5 + 0.5);
    c.uGlow.value = this.flash + a.bass * 0.5;
    c.uHue.value = this.hue;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.core.render(renderer, target);
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.streaks.dispose();
    this.stars.dispose();
    this.core.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('particle-vortex').meta,
  create: () => new ParticleVortex(),
};
export default definition;
