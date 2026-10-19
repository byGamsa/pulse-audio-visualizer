import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { SpectrumHistory, spectrumHistoryGlsl } from '../../engine/field/SpectrumHistory';
import { WaveHistory } from '../../engine/field/WaveHistory';
import { LineSet } from '../../engine/field/primitives';
import { FullscreenPass, renderOver } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hue, palette, simplex2, tint } from '../../shared/glsl';

const ROWS = 60;
const STRANDS = 72;
const POINTS = 900;

// Ein überbelichtetes Lichtband, das eine liegende Acht zieht
const glsl = `
${simplex2}
${tint}
${hue}
${spectrumHistoryGlsl(ROWS)}
uniform sampler2D uWave;
uniform float uWaveRow;
uniform float uSpin;
uniform float uTilt;
uniform float uSwell;
uniform float uHue;
const float TAU = 6.2831853;

vec2 lemniscate(float th) {
  float s = sin(th), c = cos(th);
  float d = 1.0 + s * s;
  return vec2(c, s * c) / d;
}

// Spitzen der Schleifen = Bass, Kreuzung = Höhen
float bandAt(float th) { return 1.0 - abs(cos(th)); }

vec3 linePos(float line, float t) {
  float th = t * TAU;
  vec2 p = lemniscate(th) * 3.4;
  vec2 q = lemniscate(th + 0.002) * 3.4;
  vec2 tng = normalize(q - p);
  vec2 nrm = vec2(-tng.y, tng.x);

  float band = bandAt(th);
  float e = specAt(band, 0.0);
  // Leicht verzögerte Spektren lassen die äußeren Fäden nachschwingen
  float spread = line - 0.5;
  float lag = specAt(band, abs(spread) * 0.5);
  float thick = 0.16 + pow(lag, 1.1) * 1.25 * (0.6 + uSwell);
  float wave = texture(uWave, vec2(fract(t * 2.0), uWaveRow)).r;
  float jitter = wave * 0.32 * (0.3 + e) + snoise(vec2(t * 55.0, line * 3.0 + uTime * 1.5)) * 0.05 * (0.4 + e);

  vec2 xy = p + nrm * (spread * thick + jitter * (0.4 + abs(spread)));
  // Die Kreuzung läuft in die Tiefe, damit die Acht räumlich wird
  float z = sin(th * 2.0) * 0.6 + spread * thick * 0.6;
  vec3 pos = vec3(xy, z);
  float cy = cos(uSpin), sy = sin(uSpin);
  pos.xz = mat2(cy, -sy, sy, cy) * pos.xz;
  float cx = cos(uTilt), sx = sin(uTilt);
  pos.yz = mat2(cx, -sx, sx, cx) * pos.yz;
  return pos;
}

float lineIntensity(float line, float t) {
  float spread = abs(line - 0.5) * 2.0;
  float e = specAt(bandAt(t * TAU), 0.0);
  // Kern gleißend, Ränder weich
  return (0.55 + e * 2.2) * (1.0 - spread * 0.7);
}

vec3 lineColor(float line, float t) {
  float spread = abs(line - 0.5) * 2.0;
  vec3 c = hue2rgb(fract(uHue + 0.36 + spread * 0.12 + sin(t * TAU * 2.0) * 0.04));
  return tint(mix(vec3(1.0), c, smoothstep(0.0, 0.6, spread) * 0.85 + 0.15));
}
`;

const backdrop = `
precision highp float;
in vec2 vUv;
uniform vec2 uRes;
uniform float uGlow;
uniform float uHue;
${palette}
${tint}
${hue}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 c = hue2rgb(fract(uHue + 0.38));
  vec3 col = c * 0.005 * exp(-dot(p, p) * 2.2) * (1.0 + uGlow * 2.0);
  col += vec3(0.0006, 0.002, 0.0016);
  gl_FragColor = vec4(tint(col), 1.0);
}
`;

class InfinityLoop implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private history!: SpectrumHistory;
  private wave!: WaveHistory;
  private lines!: LineSet;
  private bg!: FullscreenPass;
  private time = 0;
  private spin = 0;
  private swell = 0;

  init(ctx: ModeContext) {
    this.history = new SpectrumHistory(ROWS);
    this.wave = new WaveHistory(1, 60, 3);
    this.lines = new LineSet({
      lines: STRANDS,
      points: POINTS,
      width: 1.3,
      palette: ctx.palette,
      glsl,
      uniforms: {
        uSpecHist: { value: this.history.texture },
        uWave: { value: this.wave.texture },
        uWaveRow: { value: this.wave.rowCoord(0) },
        uSpin: { value: 0 },
        uTilt: { value: 0 },
        uSwell: { value: 0 },
        uHue: { value: 0 },
        uPaletteMix: ctx.paletteMix,
      },
    });
    this.lines.uniforms.uFocus.value = 9;
    this.lines.uniforms.uDof.value = 0.8;
    this.bg = new FullscreenPass(backdrop, {
      uGlow: { value: 0 },
      uHue: { value: 0 },
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
    });
    this.scene.add(this.lines.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.lines.uniforms.uRes.value.set(width, height);
    this.bg.resize(width, height);
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.history.update(a);
    this.wave.update(a);
    this.swell += (a.bass - this.swell) * Math.min(dt * 4, 1);
    this.spin += dt * (0.12 + a.energy * 0.25);

    const hueValue = (this.time * 0.01) % 1;
    const u = this.lines.uniforms;
    u.uTime.value = this.time;
    u.uSpin.value = Math.sin(this.spin) * 0.75;
    u.uTilt.value = 0.25 + Math.sin(this.time * 0.11) * 0.18;
    u.uSwell.value = this.swell;
    u.uHue.value = hueValue;
    this.bg.uniforms.uGlow.value = this.swell;
    this.bg.uniforms.uHue.value = hueValue;

    this.camera.position.set(0, 0, 9.5 - a.bass * 0.3);
    this.camera.lookAt(0, 0, 0);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.bg.render(renderer, target);
    renderOver(renderer, target, this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.wave.dispose();
    this.lines.dispose();
    this.bg.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('infinity').meta,
  create: () => new InfinityLoop(),
};
export default definition;
