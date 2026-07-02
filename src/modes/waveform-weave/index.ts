import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { LineSet } from '../../engine/field/primitives';
import { WaveHistory } from '../../engine/field/WaveHistory';
import { findMode } from '../../engine/ModeRegistry';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';

const WAVES = 28;
const BARS = 96;

const waveGlsl = `
uniform float uAmp;
vec3 linePos(float line, float t) {
  float row = (line * ${WAVES - 1}.0 + 0.5) / ${WAVES}.0;
  float x = mix(-6.0, 6.0, t);
  float w = field(vec2(t, row)).r;
  float env = smoothstep(0.0, 0.25, t) * smoothstep(1.0, 0.7, t);
  return vec3(x, w * env * uAmp * (1.0 - line * 0.4), -line * 7.0);
}
float lineIntensity(float line, float t) { return (0.42 - line * 0.25) * smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.9, t); }
vec3 lineColor(float line, float t) { return mix(vec3(1.0, 0.88, 0.78), pal(0.4 + line * 0.35), 0.8); }
`;

const barGlsl = `
uniform float uSpec[${BARS}];
vec3 linePos(float line, float t) {
  int i = int(floor(line * ${BARS - 1}.0 + 0.5));
  float x = mix(-2.8, 0.4, line);
  float h = uSpec[i] * 1.6;
  return vec3(x, mix(-h, h, t), 0.6);
}
float lineIntensity(float line, float t) { return 0.22; }
vec3 lineColor(float line, float t) { return mix(pal(0.62), vec3(1.0), 0.3); }
`;

class WaveformWeave implements VisualMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  private history!: WaveHistory;
  private waves!: LineSet;
  private bars!: LineSet;
  private readonly spec = new Float32Array(BARS);
  private time = 0;

  init(ctx: ModeContext) {
    this.history = new WaveHistory(WAVES, 24, 7);
    this.waves = new LineSet({
      lines: WAVES, points: 512, width: 1.7, field: this.history.texture, palette: ctx.palette,
      glsl: waveGlsl, uniforms: { uAmp: { value: 0.9 } },
    });
    this.waves.uniforms.uFocus.value = 7.5;
    this.waves.uniforms.uDof.value = 0.9;
    this.bars = new LineSet({
      lines: BARS, points: 2, width: 1.0, palette: ctx.palette, glsl: barGlsl, uniforms: { uSpec: { value: this.spec } },
    });
    this.bars.uniforms.uFocus.value = 7.5;
    this.bars.uniforms.uDof.value = 0.9;
    this.scene.add(this.waves.mesh, this.bars.mesh);
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.waves.uniforms.uRes.value.set(width, height);
    this.bars.uniforms.uRes.value.set(width, height);
  }

  update(a: AudioFeatures) {
    this.time += a.dt;
    this.history.update(a);
    for (let i = 0; i < BARS; i++) {
      const v = a.spectrum[Math.floor((i / BARS) * 110)];
      this.spec[i] = v > this.spec[i] ? v : Math.max(this.spec[i] - a.dt * 1.5, 0);
    }
    this.waves.uniforms.uAmp.value = 1.0 + a.energy * 1.6;
    const t = this.time * 0.04;
    this.camera.position.set(2.6 + Math.sin(t) * 0.6, 1.1 + Math.sin(t * 1.4) * 0.2, 5.6);
    this.camera.lookAt(-0.4, 0, -5);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.history.dispose();
    this.waves.dispose();
    this.bars.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('waveform-weave').meta,
  create: () => new WaveformWeave(),
};
export default definition;
