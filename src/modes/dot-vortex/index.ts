import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { AudioField } from '../../engine/field/AudioField';
import { DotGrid } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { tint } from '../../shared/glsl';

const glsl = `
${tint}
uniform float uTwist;
uniform float uHue;
uniform float uAmp;
const float TAU = 6.2831853;

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return tint(v * mix(vec3(1.0), k, s));
}

vec3 dotPos(vec2 g) {
  float depth = g.y;
  float z = 0.4 - depth * 14.0;
  vec4 f = field(vec2(abs(g.x * 2.0 - 1.0), depth));
  float r = 1.15 + f.r * uAmp + f.g * 0.25 + f.b * 0.35;
  float ang = g.x * TAU + depth * 2.2 + uTwist;
  vec2 bend = vec2(sin(z * 0.16 + uTwist * 0.5) * 0.9, cos(z * 0.13 + uTwist * 0.4) * 0.6) * depth;
  return vec3(cos(ang) * r + bend.x, sin(ang) * r + bend.y, z);
}

float dotIntensity(vec2 g) {
  vec4 f = field(vec2(abs(g.x * 2.0 - 1.0), g.y));
  return (1.4 + f.r * 2.5) * smoothstep(1.0, 0.7, g.y) * smoothstep(0.0, 0.03, g.y);
}

vec3 dotColor(vec2 g) { return hsv(fract(g.x + g.y * 0.35 + uHue), 0.85, 1.0); }
`;

class DotVortex implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);
  private renderer!: THREE.WebGLRenderer;
  private field!: AudioField;
  private dots!: DotGrid;
  private time = 0;
  private twist = 0;

  init(ctx: ModeContext) {
    this.renderer = ctx.renderer;
    this.field = new AudioField();
    this.dots = new DotGrid({
      columns: 360, rows: 90, size: 3.6, field: this.field.texture, palette: ctx.palette, glsl,
      uniforms: { uTwist: { value: 0 }, uHue: { value: 0 }, uAmp: { value: 0.6 }, uPaletteMix: ctx.paletteMix },
    });
    this.dots.uniforms.uFocus.value = 3.5;
    this.dots.uniforms.uDof.value = 1.8;
    this.scene.add(this.dots.points);
    this.camera.position.set(0, 0, 1.6);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dots.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.twist += a.dt * (0.15 + a.mid * 0.6);
    this.field.update(this.renderer, a);
    const u = this.dots.uniforms;
    u.uTime.value = this.time;
    u.uTwist.value = this.twist;
    u.uHue.value = this.time * 0.02;
    u.uAmp.value = 0.45 + a.bass * 0.6;
    this.camera.rotation.z = this.time * 0.05;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.field.dispose();
    this.dots.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('dot-vortex').meta,
  create: () => new DotVortex(),
};
export default definition;
