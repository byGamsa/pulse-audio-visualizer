import { allModes } from '../engine/ModeRegistry';
import { PALETTES, STANDARD_PALETTE } from '../engine/palette';
import type { ModeCategory } from '../engine/types';
import type { PlaybackMode } from '../store/settings';

export interface EmbedParams {
  modeId: string | null;
  playback: PlaybackMode;
  shuffleDuration: number | null;
  paletteId: string;
  renderScale: number;
  sensitivity: number | null;
}

const QUALITY: Record<string, number> = { low: 0.5, medium: 0.75, high: 1 };
const CATEGORIES: ModeCategory[] = ['organic', 'particles', 'retro', 'ambient', 'lineart', 'experimental'];

export const isEmbed = () => new URLSearchParams(location.search).has('embed');

export const isModeId = (id: string) => allModes().some((m) => m.meta.id === id);
export const isPaletteId = (id: string) => id === STANDARD_PALETTE || PALETTES.some((p) => p.id === id);

function number(value: string | null, min: number, max: number): number | null {
  const n = value === null ? NaN : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : null;
}

// ?embed&mode=halo&palette=aurora&quality=low, oder ?embed&category=ambient,organic&duration=90
export function readEmbedParams(search = location.search): EmbedParams {
  const q = new URLSearchParams(search);
  const mode = q.get('mode');
  const modeId = mode && isModeId(mode) ? mode : null;
  const categories = (q.get('category') ?? '')
    .split(',')
    .filter((c): c is ModeCategory => CATEGORIES.includes(c as ModeCategory));
  const palette = q.get('palette');
  return {
    modeId,
    playback: modeId ? { kind: 'single' } : { kind: 'shuffle', categories },
    shuffleDuration: number(q.get('duration'), 10, 3600),
    paletteId: palette && isPaletteId(palette) ? palette : STANDARD_PALETTE,
    renderScale: QUALITY[q.get('quality') ?? ''] ?? 1,
    sensitivity: number(q.get('sensitivity'), 0.1, 4),
  };
}
