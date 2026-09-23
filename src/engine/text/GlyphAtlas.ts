import * as THREE from 'three';

const ATLAS_COLUMNS = 16;
// ASCII, Umlaute, Blockgrafik, Rahmen
export const DEFAULT_CHARSET =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
  'ÄÖÜäöüß°±·' +
  '▁▂▃▄▅▆▇█░▒▓▌▐▀■□▪' +
  '─│┌┐└┘├┤┬┴┼═║╔╗╚╝';

export interface GlyphAtlas {
  texture: THREE.CanvasTexture;
  // Index eines Zeichens im Atlas; unbekannte Zeichen → Leerzeichen (0)
  index(ch: string): number;
  // Breite / Höhe einer Zeichenzelle
  cellAspect: number;
  // Höhe einer Zelle im Atlas in Pixeln
  cellPx: number;
  rows: number;
}

const cache = new Map<string, Promise<GlyphAtlas>>();

// Index 0 ist immer das Leerzeichen
export function getGlyphAtlas(font: string, charset = DEFAULT_CHARSET): Promise<GlyphAtlas> {
  const key = `${font}|${charset}`;
  let p = cache.get(key);
  if (!p) {
    p = build(font, charset);
    cache.set(key, p);
  }
  return p;
}

async function build(font: string, charset: string): Promise<GlyphAtlas> {
  const size = 64;
  const css = `${size}px ${font}`;

  const chars = [...charset];
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = css;
  const cellW = Math.ceil(measure.measureText('M').width) + 4;
  const cellH = Math.ceil(size * 1.2);
  const rows = Math.ceil(chars.length / ATLAS_COLUMNS);

  const canvas = document.createElement('canvas');
  canvas.width = cellW * ATLAS_COLUMNS;
  canvas.height = cellH * rows;
  const g = canvas.getContext('2d')!;
  g.font = css;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lookup = new Map<string, number>();
  chars.forEach((ch, i) => {
    lookup.set(ch, i);
    const x = (i % ATLAS_COLUMNS) * cellW + cellW / 2;
    const y = Math.floor(i / ATLAS_COLUMNS) * cellH + cellH / 2;
    // Blockzeichen exakt füllen, damit sie nahtlos stoßen
    if (ch === '█') g.fillRect(x - cellW / 2, y - cellH / 2, cellW, cellH);
    else g.fillText(ch, x, y + size * 0.04);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return {
    texture,
    index: (ch) => lookup.get(ch) ?? 0,
    cellAspect: cellW / cellH,
    cellPx: cellH,
    rows,
  };
}
