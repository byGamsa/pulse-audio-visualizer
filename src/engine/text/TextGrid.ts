import * as THREE from 'three';
import type { GlyphAtlas } from './GlyphAtlas';

export interface CellStyle {
  // 0..1, darf über 1 gehen (wird auf 255 geklemmt)
  intensity?: number;
  // 0.25..3.9, darf in Nachbarzellen ragen
  scale?: number;
  // Frei interpretierbar, z. B. Paletten-Position oder Farbklasse (0..255)
  color?: number;
}

// R = Glyph, G = Helligkeit, B = Skalierung × 64, A = Farbe
export class TextGrid {
  readonly data: Uint8Array;
  readonly texture: THREE.DataTexture;

  constructor(
    readonly atlas: GlyphAtlas,
    readonly cols: number,
    readonly rows: number,
  ) {
    this.data = new Uint8Array(cols * rows * 4);
    this.texture = new THREE.DataTexture(this.data, cols, rows, THREE.RGBAFormat);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
  }

  clear() {
    this.data.fill(0);
  }

  put(x: number, y: number, ch: string, style: CellStyle = {}) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = (y * this.cols + x) * 4;
    this.data[i] = this.atlas.index(ch);
    this.data[i + 1] = Math.min(Math.max(Math.round((style.intensity ?? 1) * 255), 0), 255);
    this.data[i + 2] = Math.min(Math.max(Math.round((style.scale ?? 1) * 64), 1), 255);
    this.data[i + 3] = Math.min(Math.max(Math.round(style.color ?? 0), 0), 255);
  }

  write(x: number, y: number, text: string, style: CellStyle = {}) {
    let cx = x;
    for (const ch of text) this.put(cx++, y, ch, style);
    return cx;
  }

  writeClipped(x: number, y: number, text: string, maxWidth: number, style: CellStyle = {}) {
    this.write(x, y, [...text].slice(0, Math.max(maxWidth, 0)).join(''), style);
  }

  commit() {
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

// cellPx = Zellenhöhe auf dem Bildschirm
export function textUniforms(grid: TextGrid) {
  return {
    uText: { value: grid.texture },
    uAtlas: { value: grid.atlas.texture },
    uGrid: { value: new THREE.Vector2(grid.cols, grid.rows) },
    uAtlasRows: { value: grid.atlas.rows },
    uAtlasCellPx: { value: grid.atlas.cellPx },
    uCellPx: { value: 16 },
  };
}
