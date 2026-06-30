import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { AudioField } from '../../engine/field/AudioField';
import { LineSet } from '../../engine/field/primitives';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette } from '../../shared/glsl';

const LINES = 64;
const POINTS = 320;

// Jede Linie ist ein Zeitschritt, vorn das Jetzt
const glsl = `
uniform float uAmp;
uniform float uPhase;

float surf(float line, float t) {
  vec4 f = field(vec2(t, line));
  float swell = sin(t * 4.2 + uPhase + line * 2.5) * 0.35 + sin(t * 1.7 - uPhase * 0.6 + line * 1.2) * 0.45;
  // Breite Dünung trägt die Form, das Spektrum gibt nur sanfte Zusatzhügel
  return swell * (1.0 + uAmp * 0.25) + f.g * 0.35 + f.r * uAmp * 0.35 + f.b * 0.35;
}

vec3 linePos(float line, float t) {
  float x = mix(-6.0, 6.0, t);
  float z = mix(2.2, -5.0, line);
  return vec3(x, surf(line, t), z);
}

float lineIntensity(float line, float t) {
  float ends = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.92, t);
  return (0.5 + field(vec2(t, line)).r * 0.6) * ends;
}

vec3 lineColor(float line, float t) {
  return pal(clamp(0.35 + t * 0.4 + line * 0.25, 0.0, 1.0));
}
`;

const bgFrag = `
precision highp float;
in vec2 vUv;
${palette}
void main() {
  vec3 col = mix(pal(0.05) * 0.05, pal(0.2) * 0.07, vUv.y);
  gl_FragColor = vec4(col, 1.0);
}
`;

class NeonWaves implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private renderer!: THREE.WebGLRenderer;
  private field!: AudioField;
  private lines!: LineSet;
  private bg!: FullscreenPass;
  private time = 0;
  private phase = 0;

  init(ctx: ModeContext) {
    this.renderer = ctx.renderer;
    this.field = new AudioField();
    this.bg = new FullscreenPass(bgFrag, { uPalette: { value: ctx.palette } });
    this.lines = new LineSet({
      lines: LINES,
      points: POINTS,
      width: 3.4,
      field: this.field.texture,
      palette: ctx.palette,
      glsl,
      uniforms: { uAmp: { value: 1 }, uPhase: { value: 0 } },
    });
    this.lines.uniforms.uFocus.value = 6.2;
    this.lines.uniforms.uDof.value = 4.5;
    this.scene.add(this.lines.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.lines.uniforms.uRes.value.set(width, height);
    this.bg.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.phase += a.dt * (0.35 + a.mid * 0.8);
    this.field.update(this.renderer, a);
    const u = this.lines.uniforms;
    u.uTime.value = this.time;
    u.uPhase.value = this.phase;
    u.uAmp.value = 0.8 + a.bass * 0.9;
    const t = this.time * 0.05;
    this.camera.position.set(Math.sin(t) * 0.8, 2.3 + Math.sin(t * 1.3) * 0.3, 6.2);
    this.camera.lookAt(0.4, -0.2, -1.2);
    // Leichte Neigung wie bei einer Kamerafahrt über die Fläche
    this.camera.rotateZ(-0.12);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.bg.render(renderer, target);
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.field.dispose();
    this.lines.dispose();
    this.bg.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('neon-waves').meta,
  create: () => new NeonWaves(),
};
export default definition;
