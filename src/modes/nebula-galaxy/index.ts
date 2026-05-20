import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { DotGrid } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const MAX_PULSES = 4;

// Sterne rein analytisch aus der Rasterposition, kein CPU-Update
const galaxyGlsl = `
#define DOT_SIZE_FN
uniform float uRot;
uniform float uTreble;
uniform float uFlash;
uniform float uPulse[${MAX_PULSES}];
uniform float uPulseAmp[${MAX_PULSES}];

const float TAU = 6.2831853;
float h21(vec2 p, float k) { return fract(sin(dot(p, vec2(127.1, 311.7)) + k * 74.7) * 43758.5453); }

struct Star { vec3 p; float r; float wave; float bright; float tone; };

Star star(vec2 g) {
  float h1 = h21(g, 1.0), h2 = h21(g, 2.0), h3 = h21(g, 3.0), h4 = h21(g, 4.0);
  float h5 = h21(g, 5.0), h6 = h21(g, 6.0);
  Star s;
  s.wave = 0.0;
#ifdef GAS
  bool bulge = h1 < 0.08;
#else
  bool bulge = h1 < 0.13;
#endif
  if (bulge) {
    float r = pow(h2, 2.2) * 0.75;
    float th = h3 * TAU + uRot * 1.6;
    float ph = acos(2.0 * h4 - 1.0);
    s.p = r * vec3(sin(ph) * cos(th), cos(ph) * 0.55, sin(ph) * sin(th));
    s.r = r;
    s.tone = 0.9 - r * 0.3;
  } else {
    float r = 0.2 + pow(h2, 0.85) * 3.2;
    float arm = floor(h3 * 3.0) * TAU / 3.0;
    // Logarithmische Spirale, Streuung nimmt nach innen zu
#ifdef GAS
    float scatter = (h4 + h5 - 1.0) * 0.4;
#else
    float scatter = (h4 + h5 + h21(g, 13.0) - 1.5) * (0.62 + 0.3 / r);
#endif
    // Differentielle Rotation: innen schneller als außen
    float ang = arm + log(r) * 2.3 + scatter + uRot / sqrt(0.35 + r);

    // Dichtewelle: Beats schieben einen Ring nach außen
    float wave = 0.0;
    for (int i = 0; i < ${MAX_PULSES}; i++) {
      float age = uPulse[i];
      if (age < 0.0) continue;
      float x = (r - age * 1.7) / 0.22;
      wave += exp(-x * x) * exp(-age * 0.9) * uPulseAmp[i];
    }
    r += wave * 0.12;
    float y = (h6 - 0.5) * 0.09 * (1.0 + 0.8 / (r + 0.3));
    s.p = vec3(cos(ang) * r, y, sin(ang) * r);
    s.r = r;
    s.wave = wave;
    s.tone = mix(0.85, 0.25, smoothstep(0.2, 3.0, r)) + (h4 - 0.5) * 0.25;
  }
  s.bright = h21(g, 7.0) > 0.985 ? 4.0 : 0.6 + h21(g, 8.0) * 0.7;
  return s;
}

vec3 dotPos(vec2 g) { return star(g).p; }

float dotIntensity(vec2 g) {
  Star s = star(g);
  float tw = 1.0 + uTreble * 0.8 * sin(uTime * (8.0 + 20.0 * h21(g, 9.0)) + h21(g, 10.0) * 100.0);
  float core = exp(-s.r * 2.5) * (1.0 + uFlash * 3.0);
#ifdef GAS
  return (0.006 + core * 0.04 + s.wave * 0.015) * (0.4 + 0.9 * h21(g, 11.0));
#else
  return s.bright * tw * (0.5 + core * 2.0 + s.wave * 2.5) * smoothstep(3.6, 2.4, s.r);
#endif
}

float dotSize(vec2 g) {
#ifdef GAS
  return 30.0 + h21(g, 12.0) * 50.0;
#else
  return h21(g, 7.0) > 0.985 ? 2.2 : 1.0;
#endif
}

vec3 dotColor(vec2 g) {
  Star s = star(g);
  vec3 c = pal(clamp(s.tone, 0.05, 0.98));
#ifndef GAS
  // Helle Sterne Richtung Weiß, damit die Palette nicht alles einfärbt
  c = mix(c, vec3(1.0, 0.96, 0.92), s.bright > 2.0 ? 0.6 : 0.2);
#endif
  return c;
}
`;

class NebulaGalaxy implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 60);
  private stars!: DotGrid;
  private gas!: DotGrid;
  private readonly pulse = new Float32Array(MAX_PULSES).fill(-1);
  private readonly pulseAmp = new Float32Array(MAX_PULSES);
  private pulseIndex = 0;
  private rot = 0;
  private time = 0;
  private flash = 0;

  init(ctx: ModeContext) {
    const shared = () => ({
      uRot: { value: 0 },
      uTreble: { value: 0 },
      uFlash: { value: 0 },
      uPulse: { value: this.pulse },
      uPulseAmp: { value: this.pulseAmp },
    });
    // Gas zuerst: liegt additiv unter den Sternen
    this.gas = new DotGrid({
      columns: 60, rows: 40, size: 6, palette: ctx.palette,
      glsl: '#define GAS\n' + galaxyGlsl, uniforms: shared(),
    });
    this.gas.uniforms.uDof.value = 0;
    this.stars = new DotGrid({
      columns: 640, rows: 480, size: 2.4, palette: ctx.palette,
      glsl: galaxyGlsl, uniforms: shared(),
    });
    this.stars.uniforms.uFocus.value = 5;
    this.stars.uniforms.uDof.value = 1.2;
    this.scene.add(this.gas.points, this.stars.points);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.stars.uniforms.uRes.value.set(width, height);
    this.gas.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.rot += a.dt * (0.06 + a.mid * 0.3);
    for (let i = 0; i < MAX_PULSES; i++) if (this.pulse[i] >= 0) this.pulse[i] = this.pulse[i] > 4 ? -1 : this.pulse[i] + a.dt;
    if (a.beat) {
      this.pulse[this.pulseIndex] = 0;
      this.pulseAmp[this.pulseIndex] = 0.4 + a.bassRaw;
      this.pulseIndex = (this.pulseIndex + 1) % MAX_PULSES;
      if (a.bassRaw > 0.75) this.flash = 1;
    }
    this.flash *= Math.exp(-a.dt * 4);

    for (const grid of [this.stars, this.gas]) {
      const u = grid.uniforms;
      u.uTime.value = this.time;
      u.uRot.value = this.rot;
      u.uTreble.value = a.treble;
      u.uFlash.value = this.flash;
    }

    // Schräger, langsam kreisender Blick auf die Scheibe
    const t = this.time * 0.03;
    const dist = 7.2 - a.bass * 0.2;
    this.camera.position.set(Math.cos(t) * dist * 0.8, 3.2 + Math.sin(this.time * 0.04) * 0.7, Math.sin(t) * dist * 0.8);
    this.camera.lookAt(0, -0.2, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stars.dispose();
    this.gas.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('nebula-galaxy').meta,
  create: () => new NebulaGalaxy(),
};
export default definition;
