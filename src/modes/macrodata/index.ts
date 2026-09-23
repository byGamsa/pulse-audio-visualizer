import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import { getGlyphAtlas } from '../../engine/text/GlyphAtlas';
import { crtGlsl, textGlsl } from '../../engine/text/glsl';
import { TextGrid, textUniforms } from '../../engine/text/TextGrid';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import '@fontsource/ibm-plex-mono/500.css';
import { palette, tint } from '../../shared/glsl';

const ROWS = 48;
const BINS = 5;
// Alle 3 Zellen eine Ziffer, Platz für Vergrößerung
const STEP = 3;

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uCellW;
uniform vec4 uHeader;
uniform vec2 uLines;
uniform vec4 uBins[${BINS}];
uniform float uBinFill[${BINS}];
uniform float uBinFlash[${BINS}];
uniform vec3 uLogo;
uniform float uTime;
${textGlsl}
${crtGlsl}

float outline(vec2 p, vec4 r, float t) {
  bool outer = p.x > r.x - t && p.x < r.z + t && p.y > r.y - t && p.y < r.w + t;
  bool inner = p.x > r.x + t && p.x < r.z - t && p.y > r.y + t && p.y < r.w - t;
  return outer && !inner ? 1.0 : 0.0;
}
float fill(vec2 p, vec4 r) { return p.x > r.x && p.x < r.z && p.y > r.y && p.y < r.w ? 1.0 : 0.0; }
float hline(float y, float at, float t) { return smoothstep(t, t * 0.4, abs(y - at)); }

void main() {
  vec2 uv = crtCurve(vUv, 0.07);
  if (crtOutside(uv)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 px = vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y);
  float t = max(uRes.y / 540.0, 1.0);

  float ink = textAt(vec2(px.x / uCellW, px.y / uCellPx)).x;
  ink = max(ink, outline(px, uHeader, 1.4 * t));
  ink = max(ink, hline(px.y, uLines.x, 1.2 * t) + hline(px.y, uLines.x + 5.0 * t, 1.2 * t));
  ink = max(ink, hline(px.y, uLines.y, 1.2 * t) + hline(px.y, uLines.y + 5.0 * t, 1.2 * t));

  for (int i = 0; i < ${BINS}; i++) {
    vec4 b = uBins[i];
    float mid = mix(b.y, b.w, 0.5);
    vec4 top = vec4(b.x, b.y, b.z, mid - 3.0 * t);
    vec4 bot = vec4(b.x, mid + 3.0 * t, b.z, b.w);
    ink = max(ink, outline(px, top, 1.2 * t) + outline(px, bot, 1.2 * t));
    vec4 bar = vec4(bot.x + 2.0 * t, bot.y + 2.0 * t, mix(bot.x + 2.0 * t, bot.z - 2.0 * t, uBinFill[i]), bot.w - 2.0 * t);
    ink = max(ink, fill(px, bar) * (0.35 + uBinFlash[i] * 0.65));
    ink = max(ink, fill(px, top) * uBinFlash[i] * 0.5);
  }

  // Eigenes Logo: Erdkugel aus Breiten- und Längengraden
  vec2 lp = (px - uLogo.xy) / uLogo.z;
  float e = length(lp * vec2(0.62, 1.0));
  float ring = smoothstep(0.06, 0.0, abs(e - 1.0));
  float meridians = smoothstep(0.05, 0.0, abs(abs(lp.x) - 0.75 * sqrt(max(1.0 - lp.y * lp.y, 0.0)))) * step(e, 1.0);
  float lat = smoothstep(0.05, 0.0, abs(abs(lp.y) - 0.45)) * step(e, 1.0);
  float spin = smoothstep(0.05, 0.0, abs(lp.x - sin(uTime * 0.6) * 1.2 * sqrt(max(1.0 - lp.y * lp.y, 0.0)))) * step(e, 1.0);
  ink = max(ink, max(ring, max(meridians, max(lat, spin * 0.6))));

  vec3 bg = tint(mix(vec3(0.012, 0.035, 0.06), vec3(0.025, 0.06, 0.09), uv.y));
  vec3 glyph = tint(vec3(0.55, 0.92, 1.0));
  vec3 col = bg + glyph * ink * 1.35;
  col = crtFinish(col, uv, gl_FragCoord.xy, uRes.y / 3.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Digit {
  x: number;
  y: number;
  value: number;
  phase: number;
  scale: number;
}

class Macrodata implements VisualMode {
  private pass!: FullscreenPass;
  private grid!: TextGrid;
  private digits: Digit[] = [];
  private readonly bins = Array.from({ length: BINS }, () => new THREE.Vector4());
  private readonly binFill = new Float32Array(BINS);
  private readonly binFlash = new Float32Array(BINS);
  private readonly clusters = [new THREE.Vector2(0.65, 0.4), new THREE.Vector2(0.3, 0.6)];
  private layout = { cols: 0, cellW: 1, cellH: 1, headerRow: 0, binRows: [0, 0], footerRow: 0, gridTop: 0, gridBottom: 0 };
  private refined = 0;
  private time = 0;
  private frames = 0;
  private aspect = 1;

  async init(ctx: ModeContext) {
    const atlas = await getGlyphAtlas('"IBM Plex Mono"');
    // Großzügig anlegen, resize nutzt einen Ausschnitt
    this.grid = new TextGrid(atlas, 220, ROWS);
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      ...textUniforms(this.grid),
      uCellW: { value: 10 },
      uHeader: { value: new THREE.Vector4() },
      uLines: { value: new THREE.Vector2() },
      uBins: { value: this.bins },
      uBinFill: { value: this.binFill },
      uBinFlash: { value: this.binFlash },
      uLogo: { value: new THREE.Vector3() },
      uTime: { value: 0 },
    });
  }

  resize(width: number, height: number) {
    this.aspect = width / height;
    this.pass.resize(width, height);
    const cellH = height / ROWS;
    const cellW = cellH * this.grid.atlas.cellAspect;
    const cols = Math.min(Math.floor(width / cellW), this.grid.cols);
    const u = this.pass.uniforms;
    u.uCellPx.value = cellH;
    u.uCellW.value = cellW;

    const mx = width * 0.07;
    u.uHeader.value.set(mx, height * 0.06, width - mx, height * 0.14);
    u.uLines.value.set(height * 0.175, height * 0.8);
    u.uLogo.value.set(width - mx - height * 0.085, height * 0.1, height * 0.032);
    const binW = (width - mx * 2) / BINS;
    for (let i = 0; i < BINS; i++) {
      const x0 = mx + i * binW + binW * 0.08;
      this.bins[i].set(x0, height * 0.835, x0 + binW * 0.84, height * 0.92);
    }

    this.layout = {
      cols,
      cellW,
      cellH,
      headerRow: Math.round((height * 0.1) / cellH - 0.5),
      binRows: [Math.round((height * 0.855) / cellH - 0.5), Math.round((height * 0.9) / cellH - 0.5)],
      footerRow: Math.round((height * 0.955) / cellH - 0.5),
      gridTop: Math.ceil((height * 0.22) / cellH),
      gridBottom: Math.floor((height * 0.76) / cellH),
    };

    // Ziffern-Raster neu anlegen
    this.digits = [];
    for (let y = this.layout.gridTop + 1; y < this.layout.gridBottom; y += STEP) {
      for (let x = 2; x < cols - 1; x += STEP) {
        this.digits.push({ x, y, value: Math.floor(Math.random() * 10), phase: Math.random() * 10, scale: 1.5 });
      }
    }
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.frames++;
    const { cols, gridTop, gridBottom } = this.layout;

    // Harte Kicks lassen einen Cluster springen
    this.clusters.forEach((c, i) => {
      c.x += Math.sin(this.time * (0.07 + i * 0.05) + i) * dt * 0.03;
      c.y += Math.cos(this.time * (0.05 + i * 0.04) + i * 2) * dt * 0.03;
      c.x = THREE.MathUtils.clamp(c.x, 0.15, 0.85);
      c.y = THREE.MathUtils.clamp(c.y, 0.15, 0.85);
    });
    if (a.beat && a.bassRaw > 0.7 && Math.random() < 0.3) {
      this.clusters[Math.floor(Math.random() * 2)].set(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7);
    }

    const g = this.grid;
    g.clear();
    const strength = [0.6 + a.bass * 2.2 + a.bassRaw * 0.6, 0.4 + a.mid * 2.0];
    for (const d of this.digits) {
      const nx = d.x / cols;
      const ny = (d.y - gridTop) / Math.max(gridBottom - gridTop, 1);
      let target = 1.45 + 0.07 * Math.sin(this.time * 1.7 + d.phase);
      this.clusters.forEach((c, i) => {
        const dx = (nx - c.x) * this.aspect;
        const dy = ny - c.y;
        target += strength[i] * Math.exp(-(dx * dx + dy * dy) / 0.012);
      });
      d.scale += (Math.min(target, 3.2) - d.scale) * Math.min(dt * 10, 1);
      // Gelegentlich springt eine Ziffer um, große Ziffern häufiger
      if (Math.random() < dt * (0.05 + (d.scale - 1.4) * 0.6)) d.value = Math.floor(Math.random() * 10);
      g.put(d.x, d.y, String(d.value), { scale: d.scale, intensity: 0.85 + (d.scale - 1.45) * 0.1 });
    }

    // „Verfeinern“: jeder Bin sammelt die Energie seines Frequenzbereichs
    for (let i = 0; i < BINS; i++) {
      let sum = 0;
      for (let k = 0; k < 20; k++) sum += a.spectrum[i * 20 + k];
      this.binFill[i] += (sum / 20) * dt * 0.06;
      this.binFlash[i] *= Math.exp(-dt * 2);
      if (this.binFill[i] >= 1) {
        this.binFill[i] = 0;
        this.binFlash[i] = 1;
        this.refined++;
      }
    }

    const { headerRow, binRows, footerRow } = this.layout;
    const left = Math.round(cols * 0.07) + 2;
    g.write(left, headerRow, 'Pulse Refinement', { scale: 1.25 });
    const pct = Math.round((this.binFill.reduce((s, v) => s + v, 0) / BINS) * 100);
    const status = `${pct}% Complete`;
    g.write(Math.round(cols * 0.93) - status.length - 9, headerRow, status, { scale: 1.25 });

    for (let i = 0; i < BINS; i++) {
      const b = this.bins[i];
      const cx = Math.round((b.x + b.z) / 2 / this.layout.cellW);
      g.write(cx - 1, binRows[0], `0${i + 1}`, { scale: 1.1 });
      g.write(Math.round(b.x / this.layout.cellW) + 1, binRows[1], `${Math.round(this.binFill[i] * 100)}%`, { intensity: 0.9 });
    }
    const hex = (n: number) => n.toString(16).toUpperCase().padStart(6, '0');
    const footer = `0x${hex(this.frames * 37)} : 0x${hex(this.refined * 4099 + Math.round(a.bpm * 100))}`;
    g.write(Math.round(cols / 2 - footer.length / 2), footerRow, footer, { intensity: 0.8 });
    g.commit();

    this.pass.uniforms.uTime.value = this.time;
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
  meta: findMode('macrodata').meta,
  create: () => new Macrodata(),
};
export default definition;
