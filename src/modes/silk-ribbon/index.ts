import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { AudioField } from '../../engine/field/AudioField';
import { LineSet } from '../../engine/field/primitives';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const THREADS = 1800;
const POINTS = 240;

// Hauptband (72 %) und zwei Echos
const glsl = `
uniform float uPhase;
uniform float uBass;
uniform float uTreble;
uniform float uTint;

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }

void group(float line, out float grp, out float s) {
  if (line < 0.72) { grp = 0.0; s = line / 0.72; }
  else if (line < 0.88) { grp = 1.0; s = (line - 0.72) / 0.16; }
  else { grp = 2.0; s = (line - 0.88) / 0.12; }
  s = s * 2.0 - 1.0;
}

vec3 linePos(float line, float t) {
  float grp, s;
  group(line, grp, s);
  // Diagonale Achse, sanft gewellt
  float x = mix(-2.7, 2.7, t);
  vec3 base = vec3(x, -x * 0.42 + sin(t * 3.1 + uPhase * 0.7) * 0.28, sin(t * 2.2 - uPhase * 0.5) * 0.6);
  base += vec3(0.15, -0.38, -0.7) * grp;

  // Frisches Audio links, wandert nach rechts
  vec4 f = field(vec2(s * 0.5 + 0.5, t));
  float twist = t * 4.0 + uPhase + f.g * 1.2 + grp * 1.3;
  float width = (0.2 + 0.09 * sin(t * 5.0 + uPhase * 0.8)) * (1.0 - grp * 0.25) * (0.8 + uBass * 0.45);
  vec3 across = vec3(0.0, cos(twist), sin(twist));
  vec3 normal = vec3(0.0, sin(twist), -cos(twist));

  float amp = (f.r * (0.22 + uBass * 0.25) + f.b * 0.22) * (0.35 + 0.65 * (1.0 - abs(s)));
  vec3 p = base + across * s * width + normal * amp;

  // Höhen lassen einzelne Fäden flirren und sich aus dem Band lösen
  float h = h11(line * 917.0);
  p.y += (h - 0.5) * uTreble * 0.09 * sin(t * 20.0 + uTime * 3.0 + h * 40.0);
  return p;
}

float lineIntensity(float line, float t) {
  float grp, s;
  group(line, grp, s);
  vec4 f = field(vec2(s * 0.5 + 0.5, t));
  float g = grp < 0.5 ? 1.0 : grp < 1.5 ? 0.5 : 0.3;
  float ends = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.82, t);
  float edge = 0.55 + 0.45 * smoothstep(1.0, 0.6, abs(s));
  return 0.036 * g * ends * edge * (0.55 + f.r * 1.6 + f.b * 0.8);
}

vec3 lineColor(float line, float t) {
  float grp, s;
  group(line, grp, s);
  vec4 f = field(vec2(s * 0.5 + 0.5, t));
  return mix(vec3(1.0, 0.97, 0.93), pal(0.35 + s * 0.2 + f.r * 0.3), uTint);
}
`;

class SilkRibbon implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  private renderer!: THREE.WebGLRenderer;
  private field!: AudioField;
  private lines!: LineSet;
  private phase = 0;
  private time = 0;

  init(ctx: ModeContext) {
    this.renderer = ctx.renderer;
    this.field = new AudioField();
    this.lines = new LineSet({
      lines: THREADS,
      points: POINTS,
      width: 0.9,
      field: this.field.texture,
      palette: ctx.palette,
      glsl,
      uniforms: {
        uPhase: { value: 0 },
        uBass: { value: 0 },
        uTreble: { value: 0 },
        uTint: { value: 0.85 },
      },
    });
    this.lines.uniforms.uFocus.value = 4.3;
    this.lines.uniforms.uDof.value = 3.5;
    this.scene.add(this.lines.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.lines.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.phase += a.dt * (0.18 + a.mid * 0.5);
    const u = this.lines.uniforms;
    u.uTime.value = this.time;
    u.uPhase.value = this.phase;
    u.uBass.value = a.bass;
    u.uTreble.value = a.treble;

    // Langsamer Kameraflug, damit das Band nie statisch wirkt
    this.camera.position.set(Math.sin(this.time * 0.05) * 0.7, 0.15 + Math.sin(this.time * 0.037) * 0.25, 4.3);
    this.camera.lookAt(0, 0, 0);
    this.field.update(this.renderer, a);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.field.dispose();
    this.lines.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('silk-ribbon').meta,
  create: () => new SilkRibbon(),
};
export default definition;
