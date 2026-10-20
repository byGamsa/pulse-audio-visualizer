import * as THREE from 'three';

export interface Palette {
  id: string;
  name: string;
  // Farbverlauf als sRGB-Hex, gleichmäßig verteilt
  stops: string[];
}

export const PALETTES: Palette[] = [
  { id: 'synth', name: 'Synthwave', stops: ['#2b0a5c', '#7b2cff', '#ff3ea5', '#ff9b5c', '#ffe8b0'] },
  { id: 'aurora', name: 'Aurora', stops: ['#03122b', '#0b6e6e', '#2df5a0', '#a6ff6b', '#d4a6ff'] },
  { id: 'magma', name: 'Magma', stops: ['#0a0208', '#5c0b2e', '#d1361f', '#ff8a1f', '#ffe39a'] },
  { id: 'ice', name: 'Glacier', stops: ['#020814', '#0b3a6e', '#1f9bff', '#8ae6ff', '#ffffff'] },
  { id: 'cyber', name: 'Cyber', stops: ['#001014', '#00b3c7', '#00ffd0', '#ff00a8', '#fff066'] },
  { id: 'mono', name: 'Mono', stops: ['#08080a', '#4a4a55', '#b8b8c8', '#ffffff'] },
  { id: 'sunset', name: 'Sunset', stops: ['#1a0533', '#6a1b6e', '#e8445a', '#ffa64d', '#fff2c4'] },
  { id: 'toxic', name: 'Toxic', stops: ['#050a02', '#1f4d0b', '#7dff1f', '#e4ff6b', '#ffffff'] },
  // Voller Regenbogen wie bei Prism Ridge; tint() verteilt die Farbtöne der Modi über den ganzen Bogen
  {
    id: 'neon',
    name: 'Neon',
    // Dunkler Einstieg für Hintergründe, ab 0.38 der ganze Bogen von Rot bis Violett
    stops: ['#0c0322', '#3a0a6e', '#c01aa8', '#ff2e3b', '#ffd21a', '#3dff4a', '#1fe3ff', '#5a3dff', '#ff2bd6'],
  },
];

// Keine feste Palette: jeder Modus zeigt seine eigenen Originalfarben
export const STANDARD_PALETTE = 'standard';

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

const LUT_SIZE = 256;

// OKLab: gleichmäßige Helligkeit im Verlauf
type Vec3 = [number, number, number];

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function hexToLinear(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255)) as Vec3;
}
function linearToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToLinear([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function buildLut(p: Palette): Uint8Array {
  const labs = p.stops.map((h) => linearToOklab(hexToLinear(h)));
  const out = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = (i / (LUT_SIZE - 1)) * (labs.length - 1);
    const k = Math.min(Math.floor(t), labs.length - 2);
    const f = t - k;
    const lab = labs[k].map((v, j) => v + (labs[k + 1][j] - v) * f) as Vec3;
    const rgb = oklabToLinear(lab);
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(Math.min(Math.max(linearToSrgb(rgb[c]), 0), 1) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

// Blendet bei Wechseln weich zur neuen Palette über
export class PaletteTexture {
  readonly texture: THREE.DataTexture;
  private readonly data: Uint8Array;
  private from: Uint8Array;
  private to: Uint8Array;
  private progress = 1;
  private currentId = '';

  constructor(id: string) {
    this.to = buildLut(getPalette(id));
    this.from = this.to;
    this.data = new Uint8Array(this.to);
    this.currentId = id;
    this.texture = new THREE.DataTexture(this.data, LUT_SIZE, 1, THREE.RGBAFormat);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  set(id: string) {
    if (id === this.currentId) return;
    this.currentId = id;
    this.from = new Uint8Array(this.data);
    this.to = buildLut(getPalette(id));
    this.progress = 0;
  }

  update(dt: number) {
    if (this.progress >= 1) return;
    this.progress = Math.min(this.progress + dt / 1.2, 1);
    const t = this.progress * this.progress * (3 - 2 * this.progress);
    for (let i = 0; i < this.data.length; i++) this.data[i] = this.from[i] + (this.to[i] - this.from[i]) * t;
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
