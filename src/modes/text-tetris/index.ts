import type * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import { getGlyphAtlas } from '../../engine/text/GlyphAtlas';
import { crtGlsl, textGlsl } from '../../engine/text/glsl';
import { TextGrid, textUniforms } from '../../engine/text/TextGrid';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import '@fontsource/vt323';
import { palette, tint } from '../../shared/glsl';

const ROWS = 26;
const BW = 10;
const BH = 20;

type Shape = number[][];
const PIECES: Shape[] = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[1, 1, 0], [0, 1, 1]],
];

function rotate(s: Shape): Shape {
  return s[0].map((_, x) => s.map((row) => row[x]).reverse());
}

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uCellW;
uniform float uOffsetX;
uniform float uFlash;
${textGlsl}
${crtGlsl}
void main() {
  vec2 uv = crtCurve(vUv, 0.08);
  if (crtOutside(uv)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 px = vec2(uv.x * uRes.x - uOffsetX, (1.0 - uv.y) * uRes.y);
  vec2 t = textAt(vec2(px.x / uCellW, px.y / uCellPx));
  float cls = floor(t.y * 255.0 + 0.5);
  vec3 green = tint(vec3(0.55, 1.0, 0.45));
  vec3 tone = cls == 1.0 ? green * 1.6 : cls == 2.0 ? green * 0.6 : green;
  vec3 col = tint(vec3(0.012, 0.02, 0.012)) + tone * t.x * 1.15 + green * uFlash * 0.05;
  col = crtFinish(col, uv, gl_FragCoord.xy, uRes.y / 3.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Piece {
  shape: Shape;
  x: number;
  y: number;
}

// Elektronika 60 (1984), eine kleine KI spielt selbst
class TextTetris implements VisualMode {
  private pass!: FullscreenPass;
  private grid!: TextGrid;
  private cols = 80;
  private board: number[][] = [];
  private piece!: Piece;
  private nextShape!: Shape;
  private target = { x: 0, rot: 0 };
  private rotations = 0;
  private gravityClock = 0;
  private moveClock = 0;
  private clearing: number[] = [];
  private clearTimer = 0;
  private lines = 0;
  private score = 0;
  private flash = 0;
  private time = 0;

  async init(ctx: ModeContext) {
    const atlas = await getGlyphAtlas('VT323');
    this.grid = new TextGrid(atlas, 200, ROWS);
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      ...textUniforms(this.grid),
      uCellW: { value: 10 },
      uOffsetX: { value: 0 },
      uFlash: { value: 0 },
    });
    this.reset();
  }

  private reset() {
    this.board = Array.from({ length: BH }, () => new Array<number>(BW).fill(0));
    this.lines = 0;
    this.score = 0;
    this.nextShape = this.randomShape();
    this.spawn();
  }

  private randomShape() {
    return PIECES[Math.floor(Math.random() * PIECES.length)];
  }

  private collides(shape: Shape, x: number, y: number, board = this.board) {
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const bx = x + c, by = y + r;
        if (bx < 0 || bx >= BW || by >= BH) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    return false;
  }

  private spawn() {
    const shape = this.nextShape;
    this.nextShape = this.randomShape();
    this.piece = { shape, x: Math.floor((BW - shape[0].length) / 2), y: -1 };
    if (this.collides(shape, this.piece.x, 0)) {
      this.flash = 1;
      this.reset();
      return;
    }
    this.planMove();
  }

  // Niedrig bauen, keine Löcher, glatte Oberfläche
  private planMove() {
    let best = -Infinity;
    let shape = this.piece.shape;
    for (let rot = 0; rot < 4; rot++) {
      for (let x = -2; x < BW; x++) {
        if (this.collides(shape, x, 0)) continue;
        let y = 0;
        while (!this.collides(shape, x, y + 1)) y++;
        const b = this.board.map((row) => [...row]);
        shape.forEach((row, r) => row.forEach((v, c) => { if (v && y + r >= 0) b[y + r][x + c] = 1; }));
        const full = b.filter((row) => row.every(Boolean)).length;
        const heights = Array.from({ length: BW }, (_, c) => {
          const top = b.findIndex((row) => row[c]);
          return top < 0 ? 0 : BH - top;
        });
        let holes = 0;
        for (let c = 0; c < BW; c++) {
          let seen = false;
          for (let r = 0; r < BH; r++) {
            if (b[r][c]) seen = true;
            else if (seen) holes++;
          }
        }
        const bump = heights.slice(1).reduce((s, h, i) => s + Math.abs(h - heights[i]), 0);
        const score = -0.51 * heights.reduce((s, h) => s + h, 0) + 0.76 * full - 0.36 * holes - 0.18 * bump;
        if (score > best) {
          best = score;
          this.target = { x, rot };
        }
      }
      shape = rotate(shape);
    }
    this.rotations = 0;
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
    const cellH = height / ROWS;
    const cellW = cellH * this.grid.atlas.cellAspect * 1.15;
    this.cols = Math.min(Math.floor(width / cellW), this.grid.cols);
    this.pass.uniforms.uCellPx.value = cellH;
    this.pass.uniforms.uCellW.value = cellW;
    this.pass.uniforms.uOffsetX.value = (width - this.cols * cellW) / 2;
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.flash *= Math.exp(-dt * 5);

    if (this.clearing.length) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        this.board = this.board.filter((_, r) => !this.clearing.includes(r));
        while (this.board.length < BH) this.board.unshift(new Array<number>(BW).fill(0));
        this.clearing = [];
        this.spawn();
      }
    } else {
      // Zur Zielposition steuern: erst drehen, dann schieben
      this.moveClock += dt;
      if (this.moveClock > 0.07) {
        this.moveClock = 0;
        const p = this.piece;
        if (this.rotations < this.target.rot) {
          const r = rotate(p.shape);
          if (!this.collides(r, p.x, p.y)) p.shape = r;
          this.rotations++;
        } else if (p.x !== this.target.x) {
          const nx = p.x + Math.sign(this.target.x - p.x);
          if (!this.collides(p.shape, nx, p.y)) p.x = nx;
        }
      }
      // Schwerkraft im Takt: eine Zeile pro Sechzehntel
      const interval = 60 / Math.max(a.bpm, 60) / 4;
      this.gravityClock += dt;
      const aligned = this.rotations >= this.target.rot && this.piece.x === this.target.x;
      if (a.beat && a.bassRaw > 0.6 && aligned) this.hardDrop();
      else if (this.gravityClock >= interval) {
        this.gravityClock = 0;
        this.step();
      }
    }
    this.draw(a);
  }

  private step() {
    const p = this.piece;
    if (!this.collides(p.shape, p.x, p.y + 1)) {
      p.y++;
      return;
    }
    this.lock();
  }

  private hardDrop() {
    const p = this.piece;
    let d = 0;
    while (!this.collides(p.shape, p.x, p.y + 1)) {
      p.y++;
      d++;
    }
    this.score += d * 2;
    this.lock();
  }

  private lock() {
    const p = this.piece;
    p.shape.forEach((row, r) => row.forEach((v, c) => {
      if (v && p.y + r >= 0) this.board[p.y + r][p.x + c] = 1;
    }));
    const full = this.board.map((row, r) => (row.every(Boolean) ? r : -1)).filter((r) => r >= 0);
    if (full.length) {
      this.clearing = full;
      this.clearTimer = 0.35;
      this.lines += full.length;
      this.score += [0, 100, 300, 700, 1500][full.length];
      this.flash = 1;
    } else {
      this.spawn();
    }
  }

  private draw(a: AudioFeatures) {
    const g = this.grid;
    g.clear();
    const bx = Math.floor(this.cols / 2) - BW - 2;
    const by = 2;
    const blink = this.clearTimer > 0 && Math.floor(this.time * 16) % 2 === 0;

    for (let r = 0; r < BH; r++) {
      g.write(bx, by + r, '<!', { color: 2 });
      for (let c = 0; c < BW; c++) {
        let filled = this.board[r][c] === 1;
        const p = this.piece;
        const pr = r - p.y, pc = c - p.x;
        const inPiece = !this.clearing.length && pr >= 0 && pc >= 0 && pr < p.shape.length && pc < p.shape[0].length && p.shape[pr][pc] === 1;
        if (inPiece) filled = true;
        const clearing = this.clearing.includes(r);
        if (filled && !(clearing && blink)) {
          g.write(bx + 2 + c * 2, by + r, '[]', { color: clearing || inPiece ? 1 : 0, intensity: 0.8 + a.bass * 0.2 });
        } else {
          g.write(bx + 2 + c * 2, by + r, ' .', { color: 2, intensity: 0.5 });
        }
      }
      g.write(bx + 2 + BW * 2, by + r, '!>', { color: 2 });
    }
    g.write(bx, by + BH, '<!' + '='.repeat(BW * 2) + '!>', { color: 2 });
    g.write(bx + 2, by + BH + 1, '\\/'.repeat(BW), { color: 2 });

    // Infos links, Hilfe rechts – wie im Original
    const lx = bx - 20;
    g.write(lx, by, 'VOLLE REIHEN:', { color: 0 });
    g.write(lx + 14, by, String(this.lines));
    g.write(lx, by + 1, 'LEVEL:');
    g.write(lx + 14, by + 1, String(1 + Math.floor(this.lines / 10)));
    g.write(lx, by + 2, 'PUNKTE:');
    g.write(lx + 14, by + 2, String(this.score));
    g.write(lx, by + 4, 'BPM:');
    g.write(lx + 14, by + 4, a.bpm.toFixed(0));
    g.write(lx, by + 7, 'NAECHSTER:', { color: 2 });
    this.nextShape.forEach((row, r) => row.forEach((v, c) => { if (v) g.write(lx + 2 + c * 2, by + 9 + r, '[]'); }));

    const rx = bx + BW * 2 + 6;
    const help = ['7: LINKS   9: RECHTS', '     8: DREHEN', '4: SCHNELLER', '5: NAECHSTEN ZEIGEN', '1: TEXT LOESCHEN', 'LEERTASTE: FALLEN LASSEN'];
    help.forEach((l, i) => g.write(rx, by + i, l, { color: 2 }));
    g.write(rx, by + 9, 'DIE MUSIK SPIELT FUER DICH.', { color: 2, intensity: 0.7 });
    g.commit();
    this.pass.uniforms.uFlash.value = this.flash;
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
  meta: findMode('text-tetris').meta,
  create: () => new TextTetris(),
};
export default definition;
