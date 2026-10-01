import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import { getGlyphAtlas } from '../../engine/text/GlyphAtlas';
import { textGlsl } from '../../engine/text/glsl';
import { TextGrid, textUniforms } from '../../engine/text/TextGrid';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import '@fontsource/vt323';
import { palette, tint } from '../../shared/glsl';

const BARS = 32;
const SEGMENTS = 20;
const VU_SEGMENTS = 44;
const ROWS = 40;

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uCellW;
uniform float uBars[${BARS}];
uniform float uPeaks[${BARS}];
uniform vec4 uVu;
uniform float uBeat;
${textGlsl}

// Makros, weil tint() erst zur Laufzeit feststeht
#define TEAL tint(vec3(0.32, 1.0, 0.86))
#define AMBER tint(vec3(1.0, 0.55, 0.18))

// Ein Segment: abgerundetes Rechteck mit weichem Rand
float seg(vec2 p, vec2 size) {
  vec2 d = abs(p) - size * 0.5 + 0.06 * size.y;
  return smoothstep(0.08 * size.y, -0.08 * size.y, length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.06 * size.y);
}

void main() {
  vec2 uv = vUv;
  vec2 px = vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y);
  vec2 q = vec2(uv.x, 1.0 - uv.y);
  vec3 col = tint(vec3(0.008, 0.016, 0.016));

  // 32 Säulen × 20 Segmente, unbeleuchtete glimmen schwach
  vec2 a0 = vec2(0.08, 0.17), a1 = vec2(0.92, 0.68);
  if (q.x > a0.x && q.x < a1.x && q.y > a0.y && q.y < a1.y) {
    vec2 f = (q - a0) / (a1 - a0);
    float bi = floor(f.x * ${BARS}.0);
    float si = floor((1.0 - f.y) * ${SEGMENTS}.0);
    vec2 cell = vec2(fract(f.x * ${BARS}.0), fract((1.0 - f.y) * ${SEGMENTS}.0)) - 0.5;
    vec2 cellPx = (a1 - a0) * uRes / vec2(${BARS}.0, ${SEGMENTS}.0);
    float m = seg(cell * cellPx, cellPx * vec2(0.78, 0.62));
    int b = int(bi);
    float level = uBars[b] * ${SEGMENTS}.0;
    float peak = floor(uPeaks[b] * ${SEGMENTS}.0 - 0.001);
    bool lit = si < level;
    bool isPeak = si == peak && peak > 0.0;
    vec3 c = si >= ${SEGMENTS - 3}.0 ? AMBER : TEAL;
    col += c * m * (lit ? 1.25 : isPeak ? 1.0 : 0.045);
  }

  // Zwei VU-Leisten L/R
  for (int ch = 0; ch < 2; ch++) {
    float y0 = ch == 0 ? 0.78 : 0.86;
    vec2 b0 = vec2(0.12, y0), b1 = vec2(0.88, y0 + 0.045);
    if (q.x > b0.x && q.x < b1.x && q.y > b0.y && q.y < b1.y) {
      vec2 f = (q - b0) / (b1 - b0);
      float si = floor(f.x * ${VU_SEGMENTS}.0);
      vec2 cell = vec2(fract(f.x * ${VU_SEGMENTS}.0), f.y) - 0.5;
      vec2 cellPx = (b1 - b0) * uRes / vec2(${VU_SEGMENTS}.0, 1.0);
      float m = seg(cell * cellPx, cellPx * vec2(0.62, 0.8));
      float level = (ch == 0 ? uVu.x : uVu.y) * ${VU_SEGMENTS}.0;
      float peak = floor((ch == 0 ? uVu.z : uVu.w) * ${VU_SEGMENTS}.0 - 0.001);
      bool lit = si < level;
      vec3 c = si >= ${VU_SEGMENTS - 7}.0 ? AMBER : TEAL;
      col += c * m * (lit ? 1.2 : si == peak ? 1.0 : 0.04);
    }
  }

  // Beschriftung
  float txt = textAt(vec2(px.x / uCellW, px.y / uCellPx)).x;
  col += TEAL * txt * 0.9;

  // Beat-Anzeige: ein runder Punkt oben rechts
  vec2 led = (q - vec2(0.9, 0.085)) * vec2(uRes.x / uRes.y, 1.0);
  col += AMBER * smoothstep(0.012, 0.008, length(led)) * (0.08 + uBeat * 1.4);

  // Steuergitter und Heizdrähte
  vec2 mesh = abs(fract(px / max(uRes.y / 260.0, 2.0)) - 0.5);
  col *= 0.86 + 0.14 * smoothstep(0.0, 0.25, min(mesh.x, mesh.y));
  for (int i = 1; i <= 3; i++) {
    float wy = float(i) / 4.0;
    col += TEAL * 0.012 * smoothstep(1.5, 0.0, abs(px.y - wy * uRes.y));
  }
  // Rauchglas-Verlauf
  col *= 0.75 + 0.35 * smoothstep(1.2, 0.0, length((uv - 0.5) * vec2(1.6, 1.0)));
  gl_FragColor = vec4(col, 1.0);
}
`;

const FREQ_LABELS = ['31', '63', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'];

class VfdHifi implements VisualMode {
  private pass!: FullscreenPass;
  private grid!: TextGrid;
  private readonly bars = new Float32Array(BARS);
  private readonly peaks = new Float32Array(BARS);
  private readonly peakHold = new Float32Array(BARS);
  private vu = [0, 0, 0, 0];
  private vuHold = [0, 0];
  private beat = 0;
  private cols = 100;

  async init(ctx: ModeContext) {
    const atlas = await getGlyphAtlas('VT323');
    this.grid = new TextGrid(atlas, 220, ROWS);
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      ...textUniforms(this.grid),
      uCellW: { value: 10 },
      uBars: { value: this.bars },
      uPeaks: { value: this.peaks },
      uVu: { value: this.vu },
      uBeat: { value: 0 },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
    const cellH = height / ROWS;
    const cellW = cellH * this.grid.atlas.cellAspect;
    this.cols = Math.min(Math.floor(width / cellW), this.grid.cols);
    this.pass.uniforms.uCellPx.value = cellH;
    this.pass.uniforms.uCellW.value = cellW;
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    // Logarithmische Oktav-Bänder auf 32 Säulen verteilen
    for (let i = 0; i < BARS; i++) {
      const from = Math.floor((i / BARS) * 112);
      const to = Math.floor(((i + 1) / BARS) * 112);
      let v = 0;
      for (let k = from; k <= to; k++) v = Math.max(v, a.spectrum[k]);
      // Segmentanzeigen fallen träge ab, steigen aber sofort
      this.bars[i] = v > this.bars[i] ? v : this.bars[i] - dt * 1.4;
      this.bars[i] = Math.min(Math.max(this.bars[i], 0), 1);
      // Peak-Hold: 0.8 s halten, dann langsam fallen
      if (this.bars[i] >= this.peaks[i]) {
        this.peaks[i] = this.bars[i];
        this.peakHold[i] = 0.8;
      } else if ((this.peakHold[i] -= dt) < 0) {
        this.peaks[i] = Math.max(this.peaks[i] - dt * 0.5, 0);
      }
    }

    // VU in dB: −40 dB … +3 dB auf 0..1
    const rms = (w: Float32Array) => Math.sqrt(w.reduce((s, x) => s + x * x, 0) / w.length);
    [a.waveL, a.waveR].forEach((w, ch) => {
      const db = 20 * Math.log10(rms(w) * 2.2 + 1e-6);
      const level = Math.min(Math.max((db + 40) / 43, 0), 1);
      this.vu[ch] = level > this.vu[ch] ? level : this.vu[ch] - dt * 1.2;
      if (this.vu[ch] >= this.vu[ch + 2]) {
        this.vu[ch + 2] = this.vu[ch];
        this.vuHold[ch] = 1;
      } else if ((this.vuHold[ch] -= dt) < 0) {
        this.vu[ch + 2] = Math.max(this.vu[ch + 2] - dt * 0.4, 0);
      }
    });
    this.beat = a.beat ? 1 : this.beat * Math.exp(-dt * 8);

    this.drawLabels(a);
    this.pass.uniforms.uBeat.value = this.beat;
  }

  private drawLabels(a: AudioFeatures) {
    const g = this.grid;
    const W = this.cols;
    const col = (x: number) => Math.round(x * W);
    const row = (y: number) => Math.round(y * ROWS - 0.5);
    g.clear();
    g.write(col(0.08), row(0.085), 'SPECTRUM ANALYZER', { intensity: 0.95 });
    g.write(col(0.36), row(0.085), '32 BAND  ·  PEAK HOLD  ·  -40 dB', { intensity: 0.55 });
    const bpm = `${a.bpm.toFixed(0)} BPM`;
    g.write(col(0.86) - bpm.length, row(0.085), bpm, { intensity: 0.95, scale: 1.3 });
    FREQ_LABELS.forEach((l, i) => {
      const x = 0.08 + (0.84 * (i + 0.5)) / FREQ_LABELS.length;
      g.write(col(x) - Math.floor(l.length / 2), row(0.71), l, { intensity: 0.6 });
    });
    g.write(col(0.08), row(0.8), 'L', { intensity: 0.9, scale: 1.3 });
    g.write(col(0.08), row(0.88), 'R', { intensity: 0.9, scale: 1.3 });
    const scale = [['-40', 0], ['-30', 0.23], ['-20', 0.47], ['-10', 0.7], ['-5', 0.81], ['0', 0.93], ['+3', 1]] as const;
    for (const [label, p] of scale) g.write(col(0.12 + p * 0.76) - 1, row(0.755), label, { intensity: 0.5 });
    g.write(col(0.08), row(0.95), 'PULSE  STEREO  DIGITAL', { intensity: 0.4 });
    g.commit();
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.pass.render(renderer, target);
  }

  dispose() {
    this.pass.dispose();
    this.grid.dispose();
  }
}

const definition: ModeDefinition = {
  meta: findMode('vfd-hifi').meta,
  create: () => new VfdHifi(),
};
export default definition;
