// Öffentliche Schnittstelle für installierbare Modi. Nur additiv ändern, sonst SDK_VERSION erhöhen
export const SDK_VERSION = 1;

export { fullscreenVert, hash, simplex2, simplex3, hue, tint, palette } from '../shared/glsl';
export { studioGlsl } from '../shared/studio';
export { FullscreenPass, getNoiseTexture, renderOver } from '../engine/fullscreen';
export { AudioField, fieldGlsl } from '../engine/field/AudioField';
export { Motes, type MotesOptions } from '../engine/field/Motes';
export { PointSphere, type PointSphereOptions } from '../engine/field/PointSphere';
export { SpectrumHistory, spectrumHistoryGlsl } from '../engine/field/SpectrumHistory';
export { Starfield } from '../engine/field/Starfield';
export { Streaks, type StreaksOptions } from '../engine/field/Streaks';
export { TiltShift } from '../engine/field/TiltShift';
export { WaveHistory } from '../engine/field/WaveHistory';
export { WireMesh, type WireMeshOptions } from '../engine/field/WireMesh';
export { LineSet, DotGrid, type LineSetOptions, type DotGridOptions } from '../engine/field/primitives';
export { DEFAULT_CHARSET, getGlyphAtlas, type GlyphAtlas } from '../engine/text/GlyphAtlas';
export { TextGrid, textUniforms, type CellStyle } from '../engine/text/TextGrid';
export { textGlsl, crtGlsl } from '../engine/text/glsl';
export { BAND_COUNT, WAVE_SIZE, MIN_FREQ, MAX_FREQ, bandFrequency, bandEdge, type AudioFeatures } from '../audio/types';
export type { ModeCategory, ModeContext, VisualMode } from '../engine/types';

export interface PackageMode {
  create(): import('../engine/types').VisualMode;
}

// Default-Export eines Pakets, die Metadaten stehen im Manifest
export function defineMode(mode: PackageMode): PackageMode {
  return mode;
}
