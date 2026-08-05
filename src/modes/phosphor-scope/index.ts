import * as THREE from 'three';
import { WAVE_SIZE, type AudioFeatures } from '../../audio/types';
import { LineSet } from '../../engine/field/primitives';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import { hash, palette, tint } from '../../shared/glsl';

// Nachleuchtdauer in Sekunden
const PERSISTENCE = 0.22;
// Delay für Mono-Signale in Samples
const DELAY = 14;

// Stereo: XY, Mono: Delay-Embedding x = s(t), y = s(t − τ)
const beamGlsl = `
${tint}
uniform float uStereo;
uniform float uScale;
uniform float uBright;
uniform vec3 uTint;

vec2 lr(float t) { return field(vec2(t, 0.5)).rg; }

vec3 linePos(float line, float t) {
  vec2 s = lr(t);
  float m = (s.x + s.y) * 0.5;
  vec2 d = lr(t - ${(DELAY / WAVE_SIZE).toFixed(5)});
  float md = (d.x + d.y) * 0.5;
  vec2 xy = mix(vec2(m, md), s, uStereo);
  return vec3(xy * uScale, 0.0);
}

// Langsamer Strahl leuchtet heller
float lineIntensity(float line, float t) {
  float speed = length(linePos(line, t + ${(1 / WAVE_SIZE).toFixed(5)}) - linePos(line, t));
  return uBright / (1.0 + speed * 140.0);
}

vec3 lineColor(float line, float t) { return tint(uTint); }
`;

const fadeFrag = `
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform float uDecay;
void main() { gl_FragColor = vec4(texture(uPrev, vUv).rgb * uDecay, 1.0); }
`;

const crtFrag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform sampler2D uScreen;
uniform vec3 uTint;
uniform float uTime;
${hash}

void main() {
  // Leichte Wölbung des Röhrenglases
  vec2 c = vUv - 0.5;
  vec2 uv = vUv + c * dot(c, c) * 0.09;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  vec3 col = texture(uScreen, uv).rgb;

  // Raster: 10 × 8 Teilungen mit Ticks auf den Mittelachsen
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 g = (uv - 0.5) * aspect * 8.0;
  vec2 fw = fwidth(g);
  vec2 gl = smoothstep(fw * 1.2, vec2(0.0), abs(fract(g + 0.5) - 0.5));
  float grid = max(gl.x, gl.y) * 0.05;
  vec2 tick = smoothstep(fw * 1.2, vec2(0.0), abs(fract(g * 5.0 + 0.5) - 0.5) / 5.0);
  float axes = (smoothstep(0.06, 0.0, abs(g.y)) * tick.x + smoothstep(0.06, 0.0, abs(g.x)) * tick.y) * 0.08;
  col += tint(uTint) * (grid + axes);

  // Scanlines, Vignette, ein Hauch Rauschen
  col *= 0.9 + 0.1 * sin(uv.y * uRes.y * 3.14159);
  col *= smoothstep(0.85, 0.25, length(c * vec2(1.0, 1.15)));
  col += tint(uTint) * (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

class PhosphorScope implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, -1, 1);
  private readonly waveData = new Float32Array(WAVE_SIZE * 2);
  private waveTex!: THREE.DataTexture;
  private beam!: LineSet;
  private fade!: FullscreenPass;
  private crt!: FullscreenPass;
  private screens: THREE.WebGLRenderTarget[] = [];
  private stereo = 0;
  private peak = 0.2;
  private time = 0;
  private dt = 1 / 60;
  private readonly tint = new THREE.Color(0.35, 1.0, 0.5);

  init(ctx: ModeContext) {
    this.waveTex = new THREE.DataTexture(this.waveData, WAVE_SIZE, 1, THREE.RGFormat, THREE.FloatType);
    this.waveTex.needsUpdate = true;
    this.beam = new LineSet({
      lines: 1,
      points: WAVE_SIZE,
      width: 2.2,
      field: this.waveTex,
      palette: ctx.palette,
      glsl: beamGlsl,
      uniforms: {
        uStereo: { value: 0 },
        uScale: { value: 0.4 },
        uBright: { value: 1.2 },
        uTint: { value: this.tint },
        uPaletteMix: ctx.paletteMix,
      },
    });
    this.beam.uniforms.uDof.value = 0;
    this.scene.add(this.beam.mesh);
    this.fade = new FullscreenPass(fadeFrag, { uPrev: { value: null }, uDecay: { value: 0.9 } });
    this.crt = new FullscreenPass(crtFrag, {
      uScreen: { value: null },
      uTint: { value: this.tint },
      uTime: { value: 0 },
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
    });
  }

  resize(width: number, height: number) {
    for (const s of this.screens) s.dispose();
    this.screens = [0, 1].map(
      () => new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false }),
    );
    const aspect = width / height;
    this.camera.left = -aspect / 2;
    this.camera.right = aspect / 2;
    this.camera.updateProjectionMatrix();
    this.beam.uniforms.uRes.value.set(width, height);
    this.crt.resize(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.dt = a.dt;
    let side = 0, mid = 0, max = 0;
    for (let i = 0; i < WAVE_SIZE; i++) {
      const l = a.waveL[i], r = a.waveR[i];
      this.waveData[i * 2] = l;
      this.waveData[i * 2 + 1] = r;
      side += (l - r) ** 2;
      mid += (l + r) ** 2;
      max = Math.max(max, Math.abs(l), Math.abs(r));
    }
    this.waveTex.needsUpdate = true;

    // Stereobreite entscheidet zwischen XY und Phasenraum
    const width = Math.sqrt(side / (mid + 1e-6));
    const target = Math.min(Math.max((width - 0.03) / 0.1, 0), 1);
    this.stereo += (target - this.stereo) * Math.min(a.dt * 2, 1);
    // Eigenes Auto-Gain, damit die Figur den Schirm füllt
    this.peak = Math.max(max, this.peak * Math.exp(-a.dt / 1.5), 0.02);

    const u = this.beam.uniforms;
    u.uStereo.value = this.stereo;
    u.uScale.value = 0.42 / this.peak;
    u.uBright.value = 0.9 + a.energy * 1.2;
    this.crt.uniforms.uTime.value = this.time;
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    const [prev, cur] = this.screens;
    // 1) Altes Bild abklingen lassen
    this.fade.uniforms.uPrev.value = prev.texture;
    this.fade.uniforms.uDecay.value = Math.exp(-this.dt / PERSISTENCE);
    this.fade.render(renderer, cur);
    // 2) Neuen Strahl additiv darüber
    renderer.setRenderTarget(cur);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
    // 3) Röhre: Wölbung, Raster, Scanlines
    this.crt.uniforms.uScreen.value = cur.texture;
    this.crt.render(renderer, target);
    this.screens = [cur, prev];
  }

  dispose() {
    for (const s of this.screens) s.dispose();
    this.waveTex.dispose();
    this.beam.dispose();
    this.fade.dispose();
    this.crt.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('phosphor-scope').meta,
  create: () => new PhosphorScope(),
};
export default definition;
