import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { TiltShift } from '../../engine/field/TiltShift';
import { WireMesh } from '../../engine/field/WireMesh';
import { DotGrid } from '../../engine/field/primitives';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { palette, simplex2, tint } from '../../shared/glsl';

const ROWS = 120;
const COLS = 150;
const DEPTH = 96;

// Eine wehende Punktfläche, ganz nah vor der Linse; vorn zerfließt alles zu Bokeh
const surface = `
${spectrumHistoryGlsl(ROWS)}
uniform float uSwell;
uniform float uFlow;

vec3 surfacePos(vec2 g) {
  vec2 xz = vec2((g.x - 0.5) * 22.0, mix(-18.0, 2.5, g.y));
  float n = snoise(xz * 0.13 + vec2(uFlow * 0.35, -uFlow * 0.6)) * 1.2
          + snoise(xz * 0.31 + vec2(-uFlow * 0.5, uFlow * 0.3)) * 0.45;
  // x = Frequenz von der Mitte nach außen, Tiefe = Alter
  float band = abs(g.x - 0.5) * 1.6;
  float age = 1.0 - g.y;
  float s = specAt(band, age);
  float y = n * (0.6 + uSwell) + s * 1.6 - 0.6;
  return vec3(xz.x, y, xz.y);
}

vec3 sporeColor(float lift) {
  return tint(mix(vec3(0.28, 0.75, 0.48), vec3(0.75, 1.0, 0.82), clamp(lift, 0.0, 1.0)));
}
`;

const dotsGlsl = `
${surface}
#define DOT_SIZE_FN
vec3 dotPos(vec2 g) { return surfacePos(g); }
float dotSize(vec2 g) { return 1.0 + max(surfacePos(g).y, 0.0) * 0.5; }
float dotIntensity(vec2 g) {
  vec3 p = surfacePos(g);
  float far = smoothstep(-18.0, -9.0, p.z);
  return (0.9 + max(p.y, 0.0) * 1.2) * far;
}
vec3 dotColor(vec2 g) { return sporeColor(surfacePos(g).y * 0.6); }
`;

const wireGlsl = `
${surface}
vec3 wirePos(vec2 g) { return surfacePos(g); }
vec3 wireColor(vec2 g, vec3 p) {
  float far = smoothstep(-18.0, -8.0, p.z) * smoothstep(3.0, 0.0, p.z);
  return sporeColor(p.y * 0.6) * 0.014 * far;
}
`;

const backdrop = `
precision highp float;
in vec2 vUv;
uniform float uGlow;
${palette}
${simplex2}
${tint}
void main() {
  // Tiefes Grün, oben heller Dunst
  vec3 col = mix(vec3(0.0015, 0.007, 0.004), vec3(0.006, 0.022, 0.012), smoothstep(0.1, 0.95, vUv.y));
  col += vec3(0.003, 0.012, 0.007) * uGlow * smoothstep(0.3, 0.8, vUv.y);
  gl_FragColor = vec4(tint(col), 1.0);
}
`;

class SporeField implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.05, 80);
  private history!: SpectrumHistory;
  private dots!: DotGrid;
  private wire!: WireMesh;
  private bg!: FullscreenPass;
  private blur!: TiltShift;
  private time = 0;
  private flow = 0;
  private swell = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    const shared = {
      uSpecHist: { value: this.history.texture },
      uSwell: { value: 0 },
      uFlow: { value: 0 },
      uPaletteMix: ctx.paletteMix,
    };
    this.dots = new DotGrid({
      columns: COLS,
      rows: DEPTH,
      size: 46,
      palette: ctx.palette,
      glsl: `${simplex2}\n${tint}\n${dotsGlsl}`,
      uniforms: shared,
    });
    this.dots.uniforms.uFocus.value = 8.5;
    this.dots.uniforms.uDof.value = 7;
    this.wire = new WireMesh({
      columns: COLS,
      rows: DEPTH,
      palette: ctx.palette,
      paletteMix: ctx.paletteMix,
      diagonals: false,
      glsl: wireGlsl,
      uniforms: shared,
    });
    this.bg = new FullscreenPass(backdrop, { uGlow: { value: 0 }, uPalette: { value: ctx.palette }, uPaletteMix: ctx.paletteMix });
    this.blur = new TiltShift({ focusY: 0.6, band: 0.1, maxBlur: 22 });
    this.scene.add(this.wire.lines, this.dots.points);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dots.uniforms.uRes.value.set(width, height);
    this.bg.resize(width, height);
    this.blur.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.flow += dt * (0.25 + a.energy * 0.6);
    this.swell += (a.bass * 0.9 - this.swell) * Math.min(dt * 2.5, 1);

    // Uniform-Objekte teilen sich DotGrid und WireMesh
    const u = this.dots.uniforms;
    u.uTime.value = this.time;
    u.uSwell.value = this.swell;
    u.uFlow.value = this.flow;
    this.bg.uniforms.uGlow.value = a.energy;

    // Knapp über der Fläche, leicht schwankend wie aus der Hand
    const t = this.time;
    this.camera.position.set(Math.sin(t * 0.06) * 2.2, 1.5 + Math.sin(t * 0.09) * 0.25, 4.2);
    this.camera.lookAt(Math.sin(t * 0.06 + 0.5) * 1.2, -0.2, -6);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.blur.render(renderer, target, (rt) => {
      this.bg.render(renderer, rt);
      renderOver(renderer, rt, this.scene, this.camera);
    });
  }

  dispose() {
    this.history.dispose();
    this.dots.dispose();
    this.wire.dispose();
    this.bg.dispose();
    this.blur.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('spore-field').meta,
  create: () => new SporeField(),
};
export default definition;
