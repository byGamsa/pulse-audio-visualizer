import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { AudioField } from '../../engine/field/AudioField';
import { DotGrid } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const COLUMNS = 384;
const ROWS = 240;

// g.x = quer (Mitte = Bass), g.y = Alter
const glsl = `
#define DOT_SIZE_FN
uniform float uBass;
uniform float uAmp;

float heightAt(vec2 g, vec4 f) {
  return f.r * uAmp * (0.6 + uBass * 0.5) + f.g * 0.12 + f.b * 0.35;
}

vec3 dotPos(vec2 g) {
  vec4 f = field(g);
  float y = heightAt(g, f);
  float z = 1.6 - g.y * 11.0;
  // Leichte Erdkrümmung zum Horizont hin
  y -= g.y * g.y * 0.9;
  return vec3((g.x - 0.5) * 8.0, y, z);
}

float dotIntensity(vec2 g) {
  vec4 f = field(g);
  float h = heightAt(g, f);
  float far = exp(-g.y * 1.6);
  float sides = smoothstep(0.0, 0.08, g.x) * smoothstep(1.0, 0.92, g.x);
  return (0.22 + h * 2.6) * far * sides;
}

float dotSize(vec2 g) {
  vec4 f = field(g);
  return 1.0 + heightAt(g, f) * 1.4;
}

vec3 dotColor(vec2 g) {
  vec4 f = field(g);
  return pal(0.2 + heightAt(g, f) * 0.9);
}
`;

class DotMatrix implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
  private renderer!: THREE.WebGLRenderer;
  private field!: AudioField;
  private dots!: DotGrid;
  private time = 0;

  init(ctx: ModeContext) {
    this.renderer = ctx.renderer;
    this.field = new AudioField();
    this.dots = new DotGrid({
      columns: COLUMNS,
      rows: ROWS,
      size: 3.2,
      field: this.field.texture,
      palette: ctx.palette,
      glsl,
      uniforms: { uBass: { value: 0 }, uAmp: { value: 0.9 } },
    });
    this.dots.uniforms.uFocus.value = 4.5;
    this.dots.uniforms.uDof.value = 2.2;
    this.scene.add(this.dots.points);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dots.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.field.update(this.renderer, a);
    const u = this.dots.uniforms;
    u.uTime.value = this.time;
    u.uBass.value = a.bass;

    // Tiefer, langsam pendelnder Kameraflug knapp über der Fläche
    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.07) * 1.2, 0.85 + Math.sin(t * 0.05) * 0.2 + a.bass * 0.05, 3.0);
    this.camera.lookAt(Math.sin(t * 0.07 + 0.6) * 0.4, 0.05, -4);
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
  meta: findMode('dot-matrix').meta,
  create: () => new DotMatrix(),
};
export default definition;
