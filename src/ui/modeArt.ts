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
  'nebula-galaxy':
    'radial-gradient(circle at 50% 50%, #f7e3c8 0%, #d4622a 10%, transparent 26%), ' +
    'conic-gradient(from 30deg at 50% 50%, transparent, rgba(138,42,58,0.7), transparent 30%, rgba(138,42,58,0.6), transparent 62%, rgba(138,42,58,0.7), transparent), #0b0910',
  'neon-tunnel':
    'radial-gradient(circle at 50% 50%, transparent 0 10%, #fd8fc0 11% 12.5%, transparent 14% 24%, rgba(253,143,192,0.7) 25% 26.5%, transparent 28% 42%, rgba(253,143,192,0.4) 43% 45%, transparent 47%), #120a14',
  aurora:
    'linear-gradient(180deg, transparent 55%, #0b0c10 56%), ' +
    'radial-gradient(ellipse 70% 45% at 40% 35%, rgba(120,220,170,0.75), transparent 70%), ' +
    'linear-gradient(180deg, #0a0f18, #101622)',
  'liquid-silk':
    'radial-gradient(ellipse 60% 40% at 30% 60%, #fd6fa8 0%, transparent 70%), ' +
    'radial-gradient(ellipse 50% 60% at 70% 35%, #6a5cff 0%, transparent 70%), ' +
    'radial-gradient(ellipse 40% 30% at 60% 80%, #ffb36b 0%, transparent 70%), #0d0a14',
  ferrofluid:
    'radial-gradient(circle at 38% 34%, #f7f4ef 0 3%, transparent 9%), ' +
    'radial-gradient(circle at 50% 52%, #1d1d22 0 30%, #050506 31% 34%, transparent 35%), ' +
    'conic-gradient(from 0deg at 50% 52%, #2a2a30, #0b0b0d, #2a2a30, #0b0b0d, #2a2a30, #0b0b0d, #2a2a30, #0b0b0d, #2a2a30), #0b0b0d',
  outrun:
    'linear-gradient(180deg, transparent 58%, #12061a 58%), ' +
    'radial-gradient(circle at 50% 50%, #ffd36b 0%, #ff4f9a 22%, transparent 23%), ' +
    'linear-gradient(180deg, #1a0633 0%, #6a1b6e 55%, #e8445a 58%)',
  'particle-vortex':
    'radial-gradient(circle at 50% 50%, #f7f4ef 0%, transparent 12%), ' +
    'conic-gradient(from 0deg at 50% 50%, transparent, rgba(247,244,239,0.5), transparent 20%, rgba(247,244,239,0.4), transparent 40%, rgba(247,244,239,0.5), transparent 60%, rgba(247,244,239,0.4), transparent 80%, rgba(247,244,239,0.5)), #0b0a10',
  organism:
    'radial-gradient(circle at 42% 40%, rgba(255,255,255,0.7) 0 4%, transparent 10%), ' +
    'radial-gradient(circle at 50% 52%, #ff9ec4 0%, #c2366e 32%, rgba(90,20,60,0.9) 46%, transparent 50%), ' +
    'radial-gradient(circle at 72% 30%, #ff9ec4 0 7%, transparent 9%), #12070e',
  'lava-lamp':
    'radial-gradient(circle at 38% 30%, #ffb36b 0 12%, transparent 13%), ' +
    'radial-gradient(circle at 62% 68%, #ff6a3d 0 16%, transparent 17%), ' +
    'radial-gradient(circle at 46% 55%, #ff8a4d 0 7%, transparent 8%), ' +
    'linear-gradient(180deg, #2a0a1c, #6a1a2a)',
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
