import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { AudioField } from '../../engine/field/AudioField';
import { LineSet } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { tint } from '../../shared/glsl';

const SPIKES = 360;
const RINGS = 6;
const SPOKES = 144;

const shared = `
const float TAU = 6.2831853;
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
${tint}
`;

const spikeGlsl = shared + `
uniform float uAmp;
void decode(float line, out float ang, out float ring) {
  float i = floor(line * ${SPIKES * RINGS - 1}.0 + 0.5);
  ring = floor(i / ${SPIKES}.0);
  ang = mod(i, ${SPIKES}.0) / ${SPIKES}.0 * TAU;
}
float height(float ang, float ring) {
  // Gespiegelt: Bass vorne/hinten, Höhen links/rechts
  float band = abs(fract(ang / TAU + 0.25) * 2.0 - 1.0);
  return field(vec2(band, ring / ${RINGS}.0 * 0.6)).r * uAmp;
}
vec3 linePos(float line, float t) {
  float ang, ring;
  decode(line, ang, ring);
  float r = 1.15 + ring * 0.11;
  return vec3(cos(ang) * r, t * height(ang, ring), sin(ang) * r);
}
float lineIntensity(float line, float t) {
  float ang, ring;
  decode(line, ang, ring);
  return (0.9 - ring * 0.13) * (0.35 + t * 0.9) * step(0.004, height(ang, ring));
}
vec3 lineColor(float line, float t) {
  float ang, ring;
  decode(line, ang, ring);
  return tint(hsv(ang / TAU, 0.9, 1.0));
}
`;

const spokeGlsl = shared + `
uniform float uPulse;
vec3 linePos(float line, float t) {
  float ang = line * TAU * ${(SPOKES - 1) / SPOKES};
  float r = mix(1.05, 3.6, t);
  return vec3(cos(ang) * r, 0.0, sin(ang) * r);
}
float lineIntensity(float line, float t) { return (0.22 + uPulse * 0.25) * (1.0 - t * 0.55); }
vec3 lineColor(float line, float t) { return tint(hsv(line, 0.85, 1.0)); }
`;

class SpectrumDisc implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  private renderer!: THREE.WebGLRenderer;
  private field!: AudioField;
  private spikes!: LineSet;
  private spokes!: LineSet;
  private time = 0;

  init(ctx: ModeContext) {
    this.renderer = ctx.renderer;
    this.field = new AudioField();
    this.spikes = new LineSet({
      lines: SPIKES * RINGS, points: 2, width: 1.5, field: this.field.texture, palette: ctx.palette, glsl: spikeGlsl,
      uniforms: { uAmp: { value: 1.4 }, uPaletteMix: ctx.paletteMix },
    });
    this.spokes = new LineSet({ lines: SPOKES, points: 2, width: 1.3, palette: ctx.palette, glsl: spokeGlsl, uniforms: { uPulse: { value: 0 }, uPaletteMix: ctx.paletteMix } });
    for (const s of [this.spikes, this.spokes]) {
      s.uniforms.uFocus.value = 7;
      s.uniforms.uDof.value = 0.6;
    }
    this.scene.add(this.spokes.mesh, this.spikes.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.spikes.uniforms.uRes.value.set(width, height);
    this.spokes.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.field.update(this.renderer, a);
    this.spikes.uniforms.uAmp.value = 1.2 + a.bass * 0.6;
    this.spokes.uniforms.uPulse.value = a.bassRaw;
    const t = this.time * 0.06;
    this.camera.position.set(Math.sin(t) * 6.4, 2.6 + Math.sin(this.time * 0.07) * 0.4, Math.cos(t) * 6.4);
    this.camera.lookAt(0, 0.35, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.field.dispose();
    this.spikes.dispose();
    this.spokes.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('spectrum-disc').meta,
  create: () => new SpectrumDisc(),
};
export default definition;
