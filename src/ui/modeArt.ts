import type { CSSProperties } from 'react';
import type { ModeCategory } from '../engine/types';

// Fallback-Cover pro Modus
const ART: Record<string, string> = {
  halo:
    'radial-gradient(circle at 50% 50%, #f7f4ef 0 6%, transparent 7%), ' +
    'radial-gradient(circle at 50% 50%, transparent 0 30%, #f3c9a8 31% 33%, transparent 35%), ' +
    'radial-gradient(circle at 50% 50%, #5a2236 0%, #1a0f14 70%)',
};

export const CATEGORY_LABEL: Record<ModeCategory, string> = {
  organic: 'Organisch',
  particles: 'Partikel',
  retro: 'Retro',
  ambient: 'Ambient',
  lineart: 'Line Art',
  experimental: 'Signature',
};

export function modeArt(id: string): CSSProperties {
  return { background: ART[id] ?? 'linear-gradient(135deg, #2a2a2e, #17171a)' };
}
