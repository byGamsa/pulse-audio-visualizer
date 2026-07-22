import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { DotGrid, LineSet } from '../../engine/field/primitives';
import { WaveHistory } from '../../engine/field/WaveHistory';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette } from '../../shared/glsl';

const STRINGS = 10;
const RAYS = 36;

const bgFrag = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBass;
uniform float uFlash;
${palette}
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  // Strahlenkranz: viele schmale Strahlen mit zufälliger Länge
  float k = floor(a / 6.2831 * 140.0);
  float ray = pow(max(0.0, 1.0 - abs(fract(a / 6.2831 * 140.0) - 0.5) * 2.0), 6.0);
  float len = 0.2 + h11(k) * 0.9;
  vec3 col = pal(0.35 + h11(k + 3.0) * 0.5) * ray * exp(-r / len * 2.5) * 0.08;
  col += pal(0.5) * exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * 1.2) * 0.06;
  float orb = smoothstep(0.042, 0.034, r);
  col += vec3(0.85, 0.95, 1.0) * orb * (2.0 + uBass * 2.5);
  col += pal(0.55) * exp(-r * 14.0) * (0.25 + uBass * 0.6 + uFlash * 0.5);
  col += mix(pal(0.6), vec3(1.0), 0.6) * exp(-r * r / 0.0005) * 1.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

const stringGlsl = `
uniform float uAmp;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
vec3 linePos(float line, float t) {
  float x = mix(-5.5, 5.5, t);
  float row = (floor(line * ${STRINGS - 1}.0 + 0.5) * 3.0 + 0.5) / 32.0;
  float w = field(vec2(t, row)).r;
  // Größte Auslenkung neben der Kugel
  float env = exp(-x * x * 0.08) * (0.25 + 0.75 * smoothstep(0.0, 1.2, abs(x)));
  float y = 0.35 + w * env * uAmp * (0.4 + h11(line * 9.0) * 0.6) + (line - 0.5) * 0.05;
  return vec3(x, y, -0.4 - line * 0.6);
}
float lineIntensity(float line, float t) { return 0.9 * smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.9, t); }
vec3 lineColor(float line, float t) { return pal(0.3 + h11(line * 5.0) * 0.6); }
`;

const rayGlsl = `
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
vec3 rayDir(float line) {
  float a = (line - 0.5) * 2.6 + (h11(line * 7.0) - 0.5) * 0.08;
  return normalize(vec3(sin(a), -0.32 - h11(line * 3.0) * 0.25, cos(a) * 0.3 + 0.9));
}
vec3 linePos(float line, float t) {
  vec3 origin = vec3(0.0, 0.35, -6.0);
  return origin + rayDir(line) * t * 12.0;
}
float lineIntensity(float line, float t) { return 0.12 * smoothstep(0.0, 0.1, t) * (1.0 - t * 0.5); }
vec3 lineColor(float line, float t) { return pal(0.3 + h11(line * 11.0) * 0.6); }
`;

const nodeGlsl = `
#define DOT_SIZE_FN
uniform float uTravel;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
vec3 rayDir(float line) {
  float a = (line - 0.5) * 2.6 + (h11(line * 7.0) - 0.5) * 0.08;
  return normalize(vec3(sin(a), -0.32 - h11(line * 3.0) * 0.25, cos(a) * 0.3 + 0.9));
}
vec3 dotPos(vec2 g) {
  // Gleiche Normierung wie das LineSet der Bahnen
  float line = floor(g.x * ${RAYS}.0) / ${RAYS - 1}.0;
  float t = fract(uTravel * (0.05 + h11(g.x * 31.0 + g.y) * 0.05) + g.y + h11(g.x * 17.0));
  return vec3(0.0, 0.35, -6.0) + rayDir(line) * t * 12.0;
}
float dotIntensity(vec2 g) { return 0.9 * step(0.4, h11(g.x * 91.0 + g.y * 7.0)); }
float dotSize(vec2 g) { return 2.0 + h11(g.x * 53.0 + g.y * 3.0) * 4.0; }
vec3 dotColor(vec2 g) { return mix(pal(0.35 + h11(g.x * 13.0) * 0.4), vec3(1.0), 0.1); }
`;

class PlasmaCore implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 60);
  private history!: WaveHistory;
  private strings!: LineSet;
  private rays!: LineSet;
  private nodes!: DotGrid;
  private bg!: FullscreenPass;
  private time = 0;
  private travel = 0;
  private flash = 0;

  init(ctx: ModeContext) {
    this.history = new WaveHistory(32, 40, 5);
    this.bg = new FullscreenPass(bgFrag, {
      uTime: { value: 0 }, uBass: { value: 0 }, uFlash: { value: 0 }, uPalette: { value: ctx.palette },
    });
    this.strings = new LineSet({
      lines: STRINGS, points: 512, width: 1.5, field: this.history.texture, palette: ctx.palette,
      glsl: stringGlsl, uniforms: { uAmp: { value: 0.6 } },
    });
    this.strings.uniforms.uFocus.value = 5;
    this.strings.uniforms.uDof.value = 1.2;
    this.rays = new LineSet({ lines: RAYS, points: 16, width: 1.4, palette: ctx.palette, glsl: rayGlsl });
    this.rays.uniforms.uDof.value = 0;
    this.nodes = new DotGrid({
      columns: RAYS, rows: 3, size: 3, palette: ctx.palette, glsl: nodeGlsl, uniforms: { uTravel: { value: 0 } },
    });
    this.nodes.uniforms.uFocus.value = 5;
    this.nodes.uniforms.uDof.value = 1.5;
    this.scene.add(this.rays.mesh, this.nodes.points, this.strings.mesh);
    this.camera.position.set(0, 0.35, 5);
    this.camera.lookAt(0, 0.1, 0);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    for (const s of [this.strings, this.rays, this.nodes]) s.uniforms.uRes.value.set(width, height);
    this.bg.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.travel += a.dt * (1 + a.energy * 4);
    if (a.beat) this.flash = 1;
    this.flash *= Math.exp(-a.dt * 5);
    this.history.update(a);
    this.strings.uniforms.uAmp.value = 0.5 + a.energy * 1.4;
    this.nodes.uniforms.uTravel.value = this.travel;
    const u = this.bg.uniforms;
    u.uTime.value = this.time;
    u.uBass.value = a.bass;
    u.uFlash.value = this.flash;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.bg.render(renderer, target);
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.strings.dispose();
    this.rays.dispose();
    this.nodes.dispose();
    this.bg.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('plasma-core').meta,
  create: () => new PlasmaCore(),
};
export default definition;
