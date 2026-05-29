import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { DotGrid } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

// Fünf Blütenblätter modulieren den Radius
const glsl = `
#define DOT_SIZE_FN
uniform float uSpin;
uniform float uSuck;
uniform float uPetal;
uniform float uTreble;
uniform float uFlash;

const float TAU = 6.2831853;
float h21(vec2 p, float k) { return fract(sin(dot(p, vec2(127.1, 311.7)) + k * 74.7) * 43758.5453); }

struct P { vec3 pos; float r0; float glitter; };

P particle(vec2 g) {
  float h1 = h21(g, 1.0), h2 = h21(g, 2.0), h3 = h21(g, 3.0), h4 = h21(g, 4.0);
  P p;
  p.r0 = 0.12 + pow(h2, 0.7) * 2.3;
  float theta = h1 * TAU;
  // Partikel bündeln sich in fünf Armen, leicht gestreut
  theta = floor(theta / TAU * 5.0) / 5.0 * TAU + (h4 - 0.5) * (0.5 + 0.4 / p.r0);
  theta += log(p.r0) * 1.6 + uSpin / pow(0.25 + p.r0, 1.25);
  float r = p.r0 * (1.0 + 0.16 * sin(5.0 * theta + uPetal));
  // Bass saugt das Innere ein und lässt es zurückfedern
  r *= 1.0 - uSuck * 0.28 * exp(-p.r0 * 0.6);
  float y = -0.6 / (r + 0.3) + 0.35 + (h3 - 0.5) * (0.04 + 0.05 * r);
  p.pos = vec3(cos(theta) * r, y, sin(theta) * r);
  p.glitter = h21(g, 5.0) > 0.975 ? 1.0 : 0.0;
  return p;
}

vec3 dotPos(vec2 g) { return particle(g).pos; }

float dotIntensity(vec2 g) {
  P p = particle(g);
  float core = exp(-p.r0 * 1.3) * (1.6 + uFlash * 2.5);
  float tw = p.glitter * (1.5 + 3.0 * uTreble) * (0.5 + 0.5 * sin(uTime * (6.0 + 14.0 * h21(g, 6.0)) + h21(g, 7.0) * 60.0));
  float edge = smoothstep(2.5, 1.6, p.r0);
  return (0.55 + core * 1.3 + tw) * edge;
}

float dotSize(vec2 g) { return particle(g).glitter > 0.5 ? 2.2 : 1.0; }

vec3 dotColor(vec2 g) {
  P p = particle(g);
  vec3 c = pal(clamp(0.28 + 0.52 * exp(-p.r0 * 0.9), 0.0, 1.0));
  return mix(c, vec3(1.0, 0.97, 0.94), p.glitter * 0.7 + 0.15);
}
`;

class ParticleVortex implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
  private dots!: DotGrid;
  private spin = 0;
  private petal = 0;
  private suck = 0;
  private suckVel = 0;
  private flash = 0;
  private time = 0;

  init(ctx: ModeContext) {
    this.dots = new DotGrid({
      columns: 520,
      rows: 400,
      size: 2.2,
      palette: ctx.palette,
      glsl,
      uniforms: {
        uSpin: { value: 0 },
        uSuck: { value: 0 },
        uPetal: { value: 0 },
        uTreble: { value: 0 },
        uFlash: { value: 0 },
      },
    });
    this.dots.uniforms.uFocus.value = 4.2;
    this.dots.uniforms.uDof.value = 1.6;
    this.scene.add(this.dots.points);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dots.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.spin += dt * (0.5 + a.mid * 1.8);
    this.petal += dt * (0.3 + a.treble * 1.2);
    // Feder-Dämpfer
    if (a.beat) {
      this.suckVel += 3 + a.bassRaw * 5;
      this.flash = 1;
    }
    this.suckVel += (-this.suck * 60 - this.suckVel * 9) * dt;
    this.suck += this.suckVel * dt;
    this.flash *= Math.exp(-dt * 5);

    const u = this.dots.uniforms;
    u.uTime.value = this.time;
    u.uSpin.value = this.spin;
    u.uSuck.value = this.suck + a.bass * 0.3;
    u.uPetal.value = this.petal;
    u.uTreble.value = a.treble;
    u.uFlash.value = this.flash;

    const t = this.time * 0.05;
    this.camera.position.set(Math.cos(t) * 3.2, 2.7 + Math.sin(this.time * 0.07) * 0.3, Math.sin(t) * 3.2);
    this.camera.lookAt(0, -0.35, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.dots.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('particle-vortex').meta,
  create: () => new ParticleVortex(),
};
export default definition;
