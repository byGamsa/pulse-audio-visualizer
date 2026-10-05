import * as THREE from 'three';
import type { AudioFeatures } from '../../audio/types';
import { FullscreenPass } from '../../engine/fullscreen';
import { findMode } from '../../engine/ModeRegistry';
import { getGlyphAtlas } from '../../engine/text/GlyphAtlas';
import { textGlsl } from '../../engine/text/glsl';
import { TextGrid, textUniforms } from '../../engine/text/TextGrid';
import type { ModeContext, ModeDefinition, VisualMode } from '../../engine/types';
import '@fontsource/press-start-2p';
import { palette, tint } from '../../shared/glsl';

const COLS = 10;
const ROWS_OF_ALIENS = 5;
const ALIENS = COLS * ROWS_OF_ALIENS;
const MAX_LASERS = 6;
const MAX_BOOMS = 8;
const EQ_BARS = 64;
// Virtuelle Höhe, Breite folgt dem Seitenverhältnis
const VH = 180;
const TEXT_ROWS = 46;

const frag = `
precision highp float;
${palette}
${tint}
in vec2 vUv;
uniform vec2 uRes;
uniform float uVW;
uniform float uCellW;
uniform vec2 uFormation;
uniform float uFrame;
uniform float uAlive[${ALIENS}];
uniform float uJump[${COLS}];
uniform vec3 uShip;
uniform vec3 uLasers[${MAX_LASERS}];
uniform vec3 uBooms[${MAX_BOOMS}];
uniform float uEq[${EQ_BARS}];
uniform float uTime;
uniform float uFlash;
${textGlsl}

// 11 × 8 Pixel, zwei Phasen, Bit 10 = linkes Pixel
const int A0[8] = int[8](248, 508, 886, 1022, 508, 340, 650, 1025);
const int A1[8] = int[8](248, 508, 886, 1022, 508, 340, 340, 514);
const int B0[8] = int[8](32, 112, 508, 910, 1967, 2047, 774, 1539);
const int B1[8] = int[8](32, 112, 508, 910, 1967, 2047, 396, 774);
const int C0[8] = int[8](514, 260, 1022, 1787, 2047, 508, 594, 260);
const int C1[8] = int[8](514, 260, 1022, 1787, 2047, 508, 1105, 514);
const int SHIP[6] = int[6](32, 112, 112, 1022, 2047, 2047);

float bitAt(int row, int x) { return float((row >> (10 - x)) & 1); }

float alien(int type, int frame, ivec2 q) {
  if (q.x < 0 || q.x > 10 || q.y < 0 || q.y > 7) return 0.0;
  int r;
  if (type == 0) r = frame == 0 ? A0[q.y] : A1[q.y];
  else if (type == 1) r = frame == 0 ? B0[q.y] : B1[q.y];
  else r = frame == 0 ? C0[q.y] : C1[q.y];
  return bitAt(r, q.x);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  // Alles in virtuellen Pixeln rechnen, dann hart hochskalieren
  vec2 vp = floor(vec2(vUv.x * uVW, (1.0 - vUv.y) * ${VH}.0));
  vec3 col = vec3(0.0, 0.0, 0.02);

  // Sterne, langsam scrollend
  vec2 sp = vp + vec2(0.0, floor(uTime * 6.0));
  float s = hash(floor(sp / 3.0));
  if (s > 0.985 && mod(sp.x, 3.0) < 1.0 && mod(sp.y, 3.0) < 1.0) col += vec3(0.6, 0.7, 1.0) * (0.4 + 0.6 * step(0.5, fract(uTime * 0.7 + s * 9.0)));

  // Formation
  vec2 f = vp - uFormation;
  ivec2 slot = ivec2(floor(f / vec2(16.0, 13.0)));
  if (slot.x >= 0 && slot.x < ${COLS} && slot.y >= 0 && slot.y < ${ROWS_OF_ALIENS}) {
    int idx = slot.y * ${COLS} + slot.x;
    float jump = floor(uJump[slot.x] * 5.0);
    ivec2 q = ivec2(f - vec2(slot) * vec2(16.0, 13.0) - vec2(2.0, 2.0 - jump));
    int type = slot.y == 0 ? 2 : slot.y < 3 ? 1 : 0;
    float a = alien(type, int(uFrame), q) * uAlive[idx];
    vec3 ink = tint(type == 2 ? vec3(1.0, 0.35, 0.9) : type == 1 ? vec3(0.35, 0.9, 1.0) : vec3(0.5, 1.0, 0.4));
    col = mix(col, ink * (1.0 + uJump[slot.x] * 0.8), a);
  }

  // Explosionen: zerfallender Pixelring
  for (int i = 0; i < ${MAX_BOOMS}; i++) {
    vec3 b = uBooms[i];
    if (b.z < 0.0) continue;
    vec2 d = vp - b.xy;
    float r = length(d);
    float ring = step(abs(r - b.z * 24.0), 1.5) * step(0.5, hash(vp + floor(b.z * 20.0)));
    col += tint(vec3(1.0, 0.8, 0.3)) * ring * (1.0 - b.z) * 1.5;
  }

  // Laser
  for (int i = 0; i < ${MAX_LASERS}; i++) {
    vec3 l = uLasers[i];
    if (l.z < 0.5) continue;
    if (vp.x == floor(l.x) && vp.y > l.y - 5.0 && vp.y <= l.y) col = tint(vec3(1.0, 1.0, 0.6)) * 1.8;
  }

  // Schiff
  ivec2 sq = ivec2(vp - vec2(floor(uShip.x) - 5.0, ${VH}.0 - 34.0));
  if (sq.x >= 0 && sq.x <= 10 && sq.y >= 0 && sq.y < 6) col = mix(col, tint(vec3(0.4, 1.0, 0.6)) * 1.2, bitAt(SHIP[sq.y], sq.x));

  // Equalizer-Skyline am Boden
  float barW = uVW / ${EQ_BARS}.0;
  int bi = int(floor(vp.x / barW));
  float h = floor(uEq[clamp(bi, 0, ${EQ_BARS - 1})] * 24.0);
  float fromBottom = ${VH}.0 - 1.0 - vp.y;
  if (fromBottom < h && mod(vp.x, barW) < barW - 1.0 && mod(fromBottom, 2.0) < 1.0) {
    vec3 c = tint(fromBottom > 18.0 ? vec3(1.0, 0.25, 0.2) : fromBottom > 11.0 ? vec3(1.0, 0.85, 0.2) : vec3(0.3, 1.0, 0.35));
    col = c;
  }
  if (fromBottom == 26.0) col = tint(vec3(0.3, 1.0, 0.35)) * 0.6;

  // Text (Punktestand) im gleichen groben Raster
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  float txt = textAt(vec2(px.x / uCellW, px.y / uCellPx)).x;
  col = mix(col, vec3(1.0), step(0.5, txt));

  col += vec3(1.0) * uFlash * 0.08;
  // Leichte Scanlines im virtuellen Raster
  col *= 0.85 + 0.15 * step(0.5, fract(vUv.y * ${VH}.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

class Arcade implements VisualMode {
  private pass!: FullscreenPass;
  private grid!: TextGrid;
  private readonly alive = new Float32Array(ALIENS).fill(1);
  private readonly respawn = new Float32Array(ALIENS);
  private readonly jump = new Float32Array(COLS);
  private readonly lasers = Array.from({ length: MAX_LASERS }, () => new THREE.Vector3());
  private readonly booms = Array.from({ length: MAX_BOOMS }, () => new THREE.Vector3(0, 0, -1));
  private readonly eq = new Float32Array(EQ_BARS);
  private readonly formation = new THREE.Vector2();
  private readonly ship = new THREE.Vector3();
  private vw = 320;
  private dir = 1;
  private offset = 0;
  private frame = 0;
  private score = 0;
  private hiScore = 9990;
  private time = 0;
  private flash = 0;
  private textCols = 40;

  async init(ctx: ModeContext) {
    const atlas = await getGlyphAtlas('"Press Start 2P"');
    this.grid = new TextGrid(atlas, 120, TEXT_ROWS);
    this.pass = new FullscreenPass(frag, {
      uPalette: { value: ctx.palette },
      uPaletteMix: ctx.paletteMix,
      ...textUniforms(this.grid),
      uVW: { value: 320 },
      uCellW: { value: 10 },
      uFormation: { value: this.formation },
      uFrame: { value: 0 },
      uAlive: { value: this.alive },
      uJump: { value: this.jump },
      uShip: { value: this.ship },
      uLasers: { value: this.lasers },
      uBooms: { value: this.booms },
      uEq: { value: this.eq },
      uTime: { value: 0 },
      uFlash: { value: 0 },
    });
  }

  resize(width: number, height: number) {
    this.pass.resize(width, height);
    this.vw = Math.round(VH * (width / height));
    this.pass.uniforms.uVW.value = this.vw;
    const cellH = height / TEXT_ROWS;
    const cellW = cellH * this.grid.atlas.cellAspect;
    this.textCols = Math.min(Math.floor(width / cellW), this.grid.cols);
    this.pass.uniforms.uCellPx.value = cellH;
    this.pass.uniforms.uCellW.value = cellW;
    this.ship.x = this.vw / 2;
  }

  update(a: AudioFeatures) {
    const dt = a.dt;
    this.time += dt;
    this.flash *= Math.exp(-dt * 6);

    // Ein Schritt pro Beat, an den Rändern umkehren
    const formationW = COLS * 16;
    if (a.beat) {
      this.frame = 1 - this.frame;
      this.offset += this.dir * 4;
      const limit = (this.vw - formationW) / 2 - 6;
      if (Math.abs(this.offset) > limit) this.dir *= -1;
    }
    this.formation.set(Math.floor((this.vw - formationW) / 2 + this.offset), 30);

    // Jede Spalte hüpft mit „ihrem“ Frequenzband
    for (let c = 0; c < COLS; c++) {
      let v = 0;
      for (let k = 0; k < 10; k++) v += a.spectrum[c * 10 + k];
      this.jump[c] += (Math.min(v / 10, 1) - this.jump[c]) * Math.min(dt * 12, 1);
    }

    // Schiff fährt unter die lauteste Spalte und feuert auf Beats
    let loud = 0;
    for (let c = 1; c < COLS; c++) if (this.jump[c] > this.jump[loud]) loud = c;
    const targetX = this.formation.x + loud * 16 + 7;
    this.ship.x += (targetX - this.ship.x) * Math.min(dt * 4, 1);
    if (a.beat) {
      const free = this.lasers.find((l) => l.z < 0.5);
      if (free) free.set(Math.round(this.ship.x), VH - 35, 1);
    }

    // Laser bewegen und Treffer prüfen
    for (const l of this.lasers) {
      if (l.z < 0.5) continue;
      l.y -= dt * 220;
      if (l.y < 0) l.z = 0;
      const col = Math.floor((l.x - this.formation.x) / 16);
      const row = Math.floor((l.y - this.formation.y) / 13);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS_OF_ALIENS) {
        const idx = row * COLS + col;
        if (this.alive[idx] > 0.5) {
          this.alive[idx] = 0;
          this.respawn[idx] = 2 + Math.random() * 3;
          l.z = 0;
          this.score += [30, 20, 20, 10, 10][row];
          this.hiScore = Math.max(this.hiScore, this.score);
          const boom = this.booms.find((b) => b.z < 0) ?? this.booms[0];
          boom.set(this.formation.x + col * 16 + 7, this.formation.y + row * 13 + 6, 0);
          this.flash = 0.6;
        }
      }
    }
    for (const b of this.booms) if (b.z >= 0) b.z = b.z > 1 ? -1 : b.z + dt * 2.2;
    for (let i = 0; i < ALIENS; i++) {
      if (this.alive[i] < 0.5 && (this.respawn[i] -= dt) <= 0) this.alive[i] = 1;
    }

    for (let i = 0; i < EQ_BARS; i++) {
      const v = a.spectrum[Math.floor((i / EQ_BARS) * 112)];
      this.eq[i] = v > this.eq[i] ? v : Math.max(this.eq[i] - dt * 1.5, 0);
    }

    // Punktestand
    const g = this.grid;
    g.clear();
    g.write(2, 1, `SCORE ${String(this.score).padStart(6, '0')}`);
    const hi = `HI ${String(this.hiScore).padStart(6, '0')}`;
    g.write(this.textCols - hi.length - 2, 1, hi);
    const credit = `${a.bpm.toFixed(0)} BPM`;
    g.write(Math.floor(this.textCols / 2 - credit.length / 2), 1, credit, { intensity: 0.8 });
    g.commit();

    const u = this.pass.uniforms;
    u.uFrame.value = this.frame;
    u.uTime.value = this.time;
    u.uFlash.value = this.flash;
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
  meta: findMode('arcade').meta,
  create: () => new Arcade(),
};
export default definition;
