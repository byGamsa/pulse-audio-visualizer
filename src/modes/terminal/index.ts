import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import { getGlyphAtlas } from '../../engine/text/GlyphAtlas';
import { crtGlsl, textGlsl } from '../../engine/text/glsl';
import { TextGrid, textUniforms } from '../../engine/text/TextGrid';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import '@fontsource/vt323';
// Das Terminal tippt den echten Quellcode von Pulse ab
import featureBusSrc from '../../audio/FeatureBus.ts?raw';
import controllerSrc from '../../engine/PlaybackController.ts?raw';
import analysisSrc from '../../../src-tauri/src/audio/analysis.rs?raw';
import compositeSrc from '../../engine/CompositePass.ts?raw';
import { palette, tint } from '../../shared/glsl';

const ROWS = 36;
const MAX_COLS = 240;

// Farbklassen im A-Kanal der Zeichenmatrix
const C = { text: 0, keyword: 1, comment: 2, string: 3, dim: 4, bright: 5, bar: 6 } as const;

const FILES = [
  { name: 'src/audio/FeatureBus.ts', text: featureBusSrc },
  { name: 'src-tauri/src/audio/analysis.rs', text: analysisSrc },
  { name: 'src/engine/PlaybackController.ts', text: controllerSrc },
  { name: 'src/engine/CompositePass.ts', text: compositeSrc },
];

const KEYWORDS = new Set([
  'const', 'let', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'private', 'readonly', 'export',
  'import', 'from', 'new', 'this', 'interface', 'type', 'fn', 'pub', 'struct', 'impl', 'mut', 'use', 'match',
  'enum', 'mod', 'self', 'float', 'vec2', 'vec3', 'vec4', 'uniform', 'void', 'async', 'await', 'true', 'false',
]);

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uCellW;
uniform vec2 uBars;
uniform float uFlash;
${textGlsl}
${crtGlsl}

void main() {
  vec2 uv = crtCurve(vUv, 0.06);
  if (crtOutside(uv)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 px = vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y);
  vec2 g = vec2(px.x / uCellW, px.y / uCellPx);
  vec2 t = textAt(g);
  float cls = floor(t.y * 255.0 + 0.5);

  vec3 phosphor = tint(vec3(0.35, 1.0, 0.5));
  vec3 tone = phosphor;
  if (cls == 1.0) tone = tint(vec3(0.75, 1.0, 0.55));       // Schlüsselwörter
  else if (cls == 2.0) tone = phosphor * 0.45;        // Kommentare
  else if (cls == 3.0) tone = tint(vec3(0.95, 0.85, 0.4));  // Strings: Bernstein
  else if (cls == 4.0) tone = phosphor * 0.55;
  else if (cls == 5.0) tone = tint(vec3(0.85, 1.0, 0.85)) * 1.4;

  // Statuszeilen oben und unten invertiert (heller Balken, dunkle Schrift)
  float row = floor(g.y);
  bool bar = row == uBars.x || row == uBars.y;
  vec3 bg = tint(vec3(0.01, 0.025, 0.015));
  vec3 col = bar ? mix(phosphor * 0.75, bg, t.x) : bg + tone * t.x * 1.2;
  col += phosphor * uFlash * 0.04;
  col = crtFinish(col, uv, gl_FragCoord.xy, uRes.y / 3.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Line {
  text: string;
  cls: number[];
}

function highlight(line: string): number[] {
  const cls = new Array<number>(line.length).fill(C.text);
  const comment = line.search(/\/\/|#\[|\/\*|^\s*\*/);
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    if (comment >= 0 && i >= comment) {
      cls[i] = C.comment;
      continue;
    }
    const ch = line[i];
    if (inString) {
      cls[i] = C.string;
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      cls[i] = C.string;
    }
  }
  for (const m of line.matchAll(/[A-Za-z_]+/g)) {
    if (KEYWORDS.has(m[0]) && cls[m.index!] === C.text) for (let k = 0; k < m[0].length; k++) cls[m.index! + k] = C.keyword;
  }
  return cls;
}

class Terminal implements VisualMode {
  private pass!: FullscreenPass;
  private grid!: TextGrid;
  private cols = 120;
  private time = 0;
  private flash = 0;

  // Editor
  private fileIndex = 0;
  private sourceLines: string[] = [];
  private sourceLine = 0;
  private typed = 0;
  private screen: Line[] = [];
  private current = '';

  // Hexdump und Log
  private hex: string[] = [];
  private hexClock = 0;
  private log: { text: string; cls: number }[] = [];
  private beats = 0;

  async init(ctx: ModeContext) {
    const atlas = await getGlyphAtlas('VT323');
    this.grid = new TextGrid(atlas, MAX_COLS, ROWS);
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      ...textUniforms(this.grid),
      uCellW: { value: 10 },
      uBars: { value: new THREE.Vector2(0, ROWS - 1) },
      uFlash: { value: 0 },
    });
    this.openFile(0);
    this.pushLog('pulse v0.1.0 - audio engine ready', C.bright);
    this.pushLog('fft: 8192 + 2048, 128 bands, 30 Hz - 16 kHz', C.dim);
  }

  private openFile(i: number) {
    this.fileIndex = i % FILES.length;
    this.sourceLines = FILES[this.fileIndex].text.split('\n').map((l) => l.replace(/\t/g, '  ').replace(/\r/g, ''));
    this.sourceLine = 0;
    this.current = '';
    this.screen.push({ text: `── open ${FILES[this.fileIndex].name} ──`, cls: [] });
  }

  private pushLog(text: string, cls: number = C.text) {
    this.log.push({ text, cls });
    if (this.log.length > 60) this.log.shift();
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
    const cellH = height / ROWS;
    const cellW = cellH * this.grid.atlas.cellAspect;
    this.cols = Math.min(Math.floor(width / cellW), MAX_COLS);
    this.pass.uniforms.uCellPx.value = cellH;
    this.pass.uniforms.uCellW.value = cellW;
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.flash *= Math.exp(-dt * 6);

    // Tippen: je lauter, desto schneller; Beats lösen kleine Bursts aus
    this.typed += dt * (32 + a.energy * 320) + (a.beat ? 10 : 0);
    while (this.typed >= 1) {
      this.typed -= 1;
      this.typeChar();
    }

    if (a.beat) {
      this.beats++;
      this.flash = 1;
      const ts = new Date().toISOString().slice(11, 23);
      this.pushLog(`[${ts}] beat #${this.beats}  bpm=${a.bpm.toFixed(1)}  kick=${a.bassRaw.toFixed(2)}`);
      if (this.beats % 16 === 0) this.pushLog(`[${ts}] cargo build --release ok (${(0.8 + Math.random()).toFixed(2)}s)`, C.bright);
    }

    // Hexdump der Wellenform, 12× pro Sekunde
    this.hexClock += dt;
    if (this.hexClock > 1 / 12) {
      this.hexClock = 0;
      this.hex = [];
      for (let r = 0; r < 12; r++) {
        const bytes: number[] = [];
        for (let k = 0; k < 8; k++) bytes.push(Math.round((a.waveL[(r * 8 + k) * 4] * 0.5 + 0.5) * 255) & 255);
        const hexs = bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = bytes.map((b) => (b > 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
        this.hex.push(`${(r * 8).toString(16).padStart(4, '0')}  ${hexs}  ${ascii}`);
      }
    }

    this.draw(a);
  }

  private typeChar() {
    const src = this.sourceLines[this.sourceLine];
    if (src === undefined) {
      this.screen.push({ text: '', cls: [] });
      this.openFile(this.fileIndex + 1);
      return;
    }
    if (this.current.length < src.length) {
      this.current += src[this.current.length];
      // Einrückung sofort, Leerraum tippt niemand Zeichen für Zeichen
      while (this.current.length < src.length && /^\s*$/.test(this.current) && src[this.current.length] === ' ') {
        this.current += ' ';
      }
      return;
    }
    this.screen.push({ text: this.current, cls: highlight(this.current) });
    if (this.screen.length > 200) this.screen.splice(0, this.screen.length - 200);
    this.current = '';
    this.sourceLine++;
  }

  private draw(a: AudioFeatures) {
    const g = this.grid;
    const W = this.cols;
    g.clear();

    // Statuszeile oben
    const clock = new Date().toTimeString().slice(0, 8);
    g.write(1, 0, ` pulse@studio: ~/pulse-audio-visualizer  [main]`, { color: C.text });
    const right = `${a.bpm.toFixed(0)} BPM  ${clock} `;
    g.write(W - right.length - 1, 0, right);

    const split = Math.floor(W * 0.6);
    const top = 1;
    const bottom = ROWS - 2;
    this.box(0, top, split - 1, bottom, ` ${FILES[this.fileIndex].name} `);
    const fftBottom = top + Math.floor((bottom - top) * 0.42);
    const hexBottom = fftBottom + 14;
    this.box(split, top, W - 1, fftBottom, ' fft ', this.flash);
    this.box(split, fftBottom + 1, W - 1, Math.min(hexBottom, bottom - 4), ' hexdump wave[L] ');
    this.box(split, Math.min(hexBottom, bottom - 4) + 1, W - 1, bottom, ' log ');

    // Editor mit Zeilennummern
    const editorRows = bottom - top - 1;
    const lines = [...this.screen, { text: this.current, cls: highlight(this.current) }];
    const visible = lines.slice(-editorRows);
    const firstNumber = this.sourceLine - visible.length + 2;
    visible.forEach((l, i) => {
      const y = top + 1 + i;
      const n = firstNumber + i;
      if (n > 0 && !l.text.startsWith('──')) g.write(2, y, String(n).padStart(4, ' '), { color: C.dim, intensity: 0.7 });
      const maxW = split - 9;
      [...l.text].slice(0, maxW).forEach((ch, k) => g.put(8 + k, y, ch, { color: l.cls[k] ?? (l.text.startsWith('──') ? C.bright : C.text) }));
      if (i === visible.length - 1 && Math.floor(this.time * 2.5) % 2 === 0) {
        g.put(8 + Math.min(l.text.length, maxW), y, '█', { color: C.bright });
      }
    });

    // ASCII-Spektrum aus Blockzeichen
    const blocks = ' ▁▂▃▄▅▆▇█';
    const fftH = fftBottom - top - 1;
    const fftW = W - split - 3;
    for (let x = 0; x < fftW; x++) {
      const band = Math.floor((x / fftW) * 108);
      const v = Math.min(a.spectrum[band], 1) * fftH;
      for (let y = 0; y < fftH; y++) {
        const level = v - y;
        if (level <= 0) break;
        const ch = level >= 1 ? '█' : blocks[Math.max(1, Math.floor(level * 8))];
        g.put(split + 1 + x, fftBottom - 1 - y, ch, { color: y > fftH * 0.75 ? C.bright : C.text, intensity: 0.85 });
      }
    }

    // Hexdump
    const hexTop = fftBottom + 2;
    this.hex.forEach((l, i) => {
      if (hexTop + i < Math.min(hexBottom, bottom - 4)) g.writeClipped(split + 2, hexTop + i, l, fftW, { color: i % 2 ? C.dim : C.text });
    });

    // Log, neueste Zeile unten
    const logTop = Math.min(hexBottom, bottom - 4) + 2;
    const logRows = bottom - logTop;
    this.log.slice(-logRows).forEach((l, i) => g.writeClipped(split + 2, logTop + i, l.text, fftW, { color: l.cls }));

    // Statuszeile unten im tmux-Stil
    const meter = (v: number) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor(v * 8))];
    g.write(1, ROWS - 1, ` [0] 0:editor* 1:fft 2:log   bass ${meter(a.bass)}${meter(a.bassRaw)} mid ${meter(a.mid)} hi ${meter(a.treble)} `);
    const pos = `ln ${this.sourceLine + 1}  utf-8 `;
    g.write(W - pos.length - 1, ROWS - 1, pos);
    g.commit();

    this.pass.uniforms.uFlash.value = this.flash;
  }

  private box(x0: number, y0: number, x1: number, y1: number, title: string, glow = 0) {
    const g = this.grid;
    const style = { color: glow > 0.3 ? C.bright : C.dim };
    for (let x = x0 + 1; x < x1; x++) {
      g.put(x, y0, '─', style);
      g.put(x, y1, '─', style);
    }
    for (let y = y0 + 1; y < y1; y++) {
      g.put(x0, y, '│', style);
      g.put(x1, y, '│', style);
    }
    g.put(x0, y0, '┌', style);
    g.put(x1, y0, '┐', style);
    g.put(x0, y1, '└', style);
    g.put(x1, y1, '┘', style);
    g.write(x0 + 2, y0, title, { color: C.bright });
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
  meta: findMode('terminal').meta,
  create: () => new Terminal(),
};
export default definition;
