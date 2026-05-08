import type { CSSProperties } from 'react';
import type { ModeCategory } from '../engine/types';

// Fallback-Cover pro Modus
const ART: Record<string, string> = {
  halo:
    'radial-gradient(circle at 50% 50%, #f7f4ef 0 6%, transparent 7%), ' +
    'radial-gradient(circle at 50% 50%, transparent 0 30%, #f3c9a8 31% 33%, transparent 35%), ' +
    'radial-gradient(circle at 50% 50%, #5a2236 0%, #1a0f14 70%)',
  'liquid-gradient':
    'radial-gradient(circle at 25% 30%, #d4622a 0%, transparent 55%), ' +
    'radial-gradient(circle at 75% 70%, #8a2a3a 0%, transparent 60%), ' +
    'radial-gradient(circle at 70% 20%, #e8b48a 0%, transparent 40%), #1a0a0e',
  'silk-ribbon':
    'linear-gradient(150deg, transparent 38%, rgba(247,244,239,0.85) 47%, rgba(247,244,239,0.25) 52%, transparent 60%), ' +
    'linear-gradient(150deg, transparent 58%, rgba(247,244,239,0.25) 63%, transparent 68%), #0d0d0f',
  'dot-matrix':
    'radial-gradient(circle, rgba(247,244,239,0.75) 0.8px, transparent 1.3px) 0 0 / 5px 5px, ' +
    'linear-gradient(180deg, #0d0d0f 30%, #3a1d22 100%)',
  'neon-tunnel':
    'radial-gradient(circle at 50% 50%, transparent 0 10%, #fd8fc0 11% 12.5%, transparent 14% 24%, rgba(253,143,192,0.7) 25% 26.5%, transparent 28% 42%, rgba(253,143,192,0.4) 43% 45%, transparent 47%), #120a14',
  aurora:
    'linear-gradient(180deg, transparent 55%, #0b0c10 56%), ' +
    'radial-gradient(ellipse 70% 45% at 40% 35%, rgba(120,220,170,0.75), transparent 70%), ' +
    'linear-gradient(180deg, #0a0f18, #101622)',
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
