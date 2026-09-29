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
  'phosphor-scope':
    'radial-gradient(ellipse 34% 22% at 50% 50%, transparent 85%, rgba(110,255,150,0.85) 90%, transparent 97%), ' +
    'linear-gradient(rgba(110,255,150,0.08) 1px, transparent 1px) 0 0 / 8px 8px, ' +
    'linear-gradient(90deg, rgba(110,255,150,0.08) 1px, transparent 1px) 0 0 / 8px 8px, #050a06',
  'particle-vortex':
    'radial-gradient(circle at 50% 50%, #f7f4ef 0%, transparent 12%), ' +
    'conic-gradient(from 0deg at 50% 50%, transparent, rgba(247,244,239,0.5), transparent 20%, rgba(247,244,239,0.4), transparent 40%, rgba(247,244,239,0.5), transparent 60%, rgba(247,244,239,0.4), transparent 80%, rgba(247,244,239,0.5)), #0b0a10',
  organism:
    'radial-gradient(circle at 42% 40%, rgba(255,255,255,0.7) 0 4%, transparent 10%), ' +
    'radial-gradient(circle at 50% 52%, #ff9ec4 0%, #c2366e 32%, rgba(90,20,60,0.9) 46%, transparent 50%), ' +
    'radial-gradient(circle at 72% 30%, #ff9ec4 0 7%, transparent 9%), #12070e',
  jellyfish:
    'radial-gradient(ellipse 34% 22% at 50% 34%, rgba(170,140,255,0.9) 0%, rgba(120,80,220,0.5) 60%, transparent 100%), ' +
    'repeating-linear-gradient(90deg, transparent 0 7px, rgba(170,140,255,0.35) 7px 8px) 50% 100% / 46% 58% no-repeat, ' +
    'linear-gradient(180deg, #0d1430, #04050c)',
  mycelium:
    'repeating-conic-gradient(from 0deg at 50% 50%, rgba(247,244,239,0.45) 0deg 1.5deg, transparent 1.5deg 14deg), ' +
    'radial-gradient(circle at 50% 50%, #f7f4ef 0%, transparent 18%), ' +
    'radial-gradient(circle at 50% 50%, #1a2a1c, #070a08 70%)',
  'midnight-ocean':
    'radial-gradient(circle at 62% 26%, #f7f4ef 0 5%, rgba(247,244,239,0.2) 9%, transparent 16%), ' +
    'linear-gradient(180deg, #0a1020 0 52%, #070b16 52%), ' +
    'radial-gradient(ellipse 8% 40% at 62% 80%, rgba(247,244,239,0.5), transparent 70%)',
  'lava-lamp':
    'radial-gradient(circle at 38% 30%, #ffb36b 0 12%, transparent 13%), ' +
    'radial-gradient(circle at 62% 68%, #ff6a3d 0 16%, transparent 17%), ' +
    'radial-gradient(circle at 46% 55%, #ff8a4d 0 7%, transparent 8%), ' +
    'linear-gradient(180deg, #2a0a1c, #6a1a2a)',
  macrodata:
    'radial-gradient(circle, rgba(140,235,255,0.85) 1px, transparent 1.6px) 0 0 / 6px 6px, ' +
    'radial-gradient(circle at 62% 46%, rgba(140,235,255,0.4), transparent 30%), #071420',
  terminal:
    'repeating-linear-gradient(180deg, rgba(90,255,130,0.7) 0 2px, transparent 2px 6px) 6px 8px / 60% 70% no-repeat, ' +
    'linear-gradient(90deg, transparent 72%, rgba(90,255,130,0.25) 72% 73%, transparent 73%), #030a05',
  'text-tetris':
    'linear-gradient(90deg, rgba(140,255,110,0.85) 0 18%, transparent 18% 36%, rgba(140,255,110,0.85) 36% 54%, transparent 54%) 30% 75% / 40% 14% no-repeat, ' +
    'linear-gradient(90deg, rgba(140,255,110,0.85) 0 50%, transparent 50%) 40% 40% / 30% 14% no-repeat, #050a04',
  'neon-waves':
    'repeating-linear-gradient(160deg, transparent 0 4px, rgba(255,90,220,0.75) 4px 5px, transparent 5px 9px), ' +
    'linear-gradient(180deg, #1a0a3a, #0a0420)',
  'silk-light':
    'linear-gradient(160deg, transparent 40%, rgba(255,230,210,0.9) 48%, rgba(255,230,210,0.3) 54%, transparent 62%), ' +
    'linear-gradient(200deg, transparent 42%, rgba(255,220,200,0.5) 50%, transparent 58%), #1a1412',
  'waveform-weave':
    'repeating-linear-gradient(175deg, transparent 0 5px, rgba(255,235,220,0.4) 5px 6px), ' +
    'linear-gradient(90deg, transparent 25%, rgba(255,235,220,0.5) 25% 26%, transparent 26% 30%, rgba(255,235,220,0.5) 30% 31%, transparent 31%), #0a0908',
  lightspeed:
    'repeating-conic-gradient(from 0deg at 50% 50%, rgba(60,170,255,0.8) 0deg 2deg, transparent 2deg 9deg), ' +
    'radial-gradient(circle at 50% 50%, #02030a 0 12%, transparent 13%), #01020a',
  'dot-vortex':
    'radial-gradient(circle, rgba(0,0,0,0) 0 1px, #05030a 1.5px) 0 0 / 4px 4px, ' +
    'repeating-radial-gradient(circle at 50% 50%, #05030a 0 4px, transparent 4px 7px), ' +
    'conic-gradient(#ff4040, #ffd23c, #3cff5a, #3cc8ff, #8a5cff, #ff4fd8, #ff4040)',
  'plasma-core':
    'radial-gradient(circle at 50% 46%, #ffffff 0 7%, rgba(120,200,255,0.8) 10%, transparent 26%), ' +
    'linear-gradient(180deg, transparent 44%, rgba(120,255,160,0.6) 46%, transparent 48%), #02050c',
  'neon-stage':
    'linear-gradient(180deg, transparent 72%, #050508 72%), ' +
    'repeating-linear-gradient(90deg, transparent 0 2px, #050508 2px 4px), ' +
    'linear-gradient(90deg, #3cff7a, #2bd4ff, #ff4fd8, #ffd23c, #2bd4ff)',
  rorschach:
    'radial-gradient(ellipse 18% 30% at 38% 50%, #050606 0 60%, transparent 62%), ' +
    'radial-gradient(ellipse 18% 30% at 62% 50%, #050606 0 60%, transparent 62%), ' +
    'radial-gradient(ellipse 6% 22% at 50% 50%, #050606 0 70%, transparent 72%), #19e0b4',
  'mercury-pool':
    'radial-gradient(ellipse 50% 14% at 50% 64%, transparent 60%, rgba(255,255,255,0.7) 64%, transparent 70%), ' +
    'linear-gradient(180deg, #0a0a0c 0 45%, #6a6e78 50%, #1a1c20 60%, #4a4e58 80%, #0e0f12)',
  'soap-bubble':
    'radial-gradient(circle at 42% 38%, rgba(255,255,255,0.8) 0 4%, transparent 8%), ' +
    'radial-gradient(circle at 50% 50%, transparent 0 40%, rgba(255,120,200,0.5) 44%, rgba(120,220,255,0.5) 47%, rgba(255,230,120,0.4) 49%, transparent 52%), #0a090e',
  crystal:
    'conic-gradient(from 20deg at 50% 50%, #e8f0ff, #6a7aa0, #ffffff, #3a4a70, #ff9ad8, #a0f0ff, #ffffff, #4a5a80, #e8f0ff)',
  'bar-grid':
    'linear-gradient(90deg, rgba(0,0,0,0.85) 0 2px, transparent 2px) 0 0 / 6px 6px, ' +
    'linear-gradient(0deg, rgba(0,0,0,0.85) 0 2px, transparent 2px) 0 0 / 6px 6px, ' +
    'linear-gradient(135deg, #ffd23c, #ff5a2b, #ff4fd8, #8a5cff, #2bd4ff)',
  'spectrum-disc':
    'radial-gradient(circle at 50% 55%, #000 0 14%, transparent 15%), ' +
    'repeating-conic-gradient(from 0deg at 50% 55%, transparent 0 3deg, rgba(0,0,0,0.9) 3deg 6deg), ' +
    'conic-gradient(from 0deg at 50% 55%, #ff4040, #ffd23c, #3cff5a, #3cc8ff, #8a5cff, #ff4fd8, #ff4040)',
  'laser-weave':
    'linear-gradient(8deg, transparent 46%, rgba(255,80,60,0.9) 48%, transparent 50%), ' +
    'linear-gradient(-6deg, transparent 60%, rgba(255,120,80,0.7) 61%, transparent 62%), ' +
    'linear-gradient(84deg, transparent 30%, rgba(255,80,60,0.8) 31%, transparent 32%), #0a0303',
  'oil-paint':
    'radial-gradient(ellipse 18% 10% at 30% 32%, #e000ff 60%, transparent 75%), ' +
    'radial-gradient(ellipse 20% 9% at 58% 30%, #1030ff 60%, transparent 75%), ' +
    'radial-gradient(ellipse 7% 22% at 72% 45%, #00d010 60%, transparent 75%), ' +
    'radial-gradient(ellipse 22% 11% at 42% 72%, #ff0000 60%, transparent 75%), ' +
    'radial-gradient(ellipse 12% 14% at 80% 76%, #ffe800 60%, transparent 75%), #000',
  'cosmic-tunnel':
    'radial-gradient(circle at 46% 46%, #000 0 9%, transparent 16%), ' +
    'conic-gradient(from 40deg at 46% 46%, transparent 0 8%, rgba(220,40,200,0.85) 14%, transparent 26%, transparent 46%, rgba(220,40,200,0.7) 56%, transparent 70%), ' +
    'radial-gradient(circle at 50% 50%, #1a1420, #050408)',
  'neon-lasers':
    'linear-gradient(28deg, transparent 47%, rgba(255,60,255,0.95) 50%, transparent 53%), ' +
    'linear-gradient(-34deg, transparent 47%, rgba(170,70,255,0.9) 50%, transparent 53%), ' +
    'linear-gradient(82deg, transparent 37%, rgba(150,110,255,0.8) 40%, transparent 43%), ' +
    'linear-gradient(-80deg, transparent 57%, rgba(255,80,255,0.7) 60%, transparent 63%), #050008',
  'tesla-waves':
    'linear-gradient(180deg, transparent 18%, #e0b0ff 20%, transparent 22%, transparent 43%, #b0ffc8 45%, transparent 47%, ' +
    'transparent 68%, #b8c0ff 70%, transparent 72%, transparent 88%, #ffb0b4 90%, transparent 92%), ' +
    'linear-gradient(180deg, #2a1a40, #1a3028 45%, #22264a 70%, #3a1a22)',
  'red-lattice':
    'linear-gradient(32deg, transparent 49%, rgba(255,30,20,0.95) 50%, transparent 51%), ' +
    'linear-gradient(-58deg, transparent 39%, rgba(255,30,20,0.8) 40%, transparent 41%), ' +
    'linear-gradient(100deg, transparent 64%, rgba(255,30,20,0.7) 65%, transparent 66%), ' +
    'linear-gradient(-12deg, transparent 69%, rgba(255,30,20,0.4) 70%, transparent 71%), #070101',
  'aurora-horizon':
    'linear-gradient(180deg, transparent 72%, rgba(255,255,255,0.9) 74%, transparent 76%), ' +
    'linear-gradient(90deg, #ff62c8, #e0347a 30%, #d8b8ff 50%, #5ab0ff 70%, #2a48ff), #120624',
  'energy-tendrils':
    'radial-gradient(circle at 50% 50%, #c8f4ff 0 3%, rgba(60,140,255,0.8) 10%, transparent 32%), ' +
    'repeating-conic-gradient(from 0deg at 50% 50%, rgba(60,120,255,0.5) 0 2deg, transparent 2deg 11deg), #02030c',
  'neon-arches':
    'linear-gradient(180deg, transparent 70%, #3a1660 70%), ' +
    'repeating-radial-gradient(circle at 50% 62%, transparent 0 9%, rgba(255,110,230,0.9) 10%, transparent 11.5%), #12051e',
};

export const CATEGORY_LABEL: Record<ModeCategory, string> = {
  organic: 'Organisch',
  particles: 'Partikel',
  retro: 'Retro',
  ambient: 'Ambient',
  lineart: 'Line Art',
  experimental: 'Signature',
};

// Standbild aus public/thumbs, Verlauf als Fallback
export function modeArt(id: string): CSSProperties {
  const fallback = ART[id] ?? 'linear-gradient(135deg, #2a2a2e, #17171a)';
  return { background: `url(${import.meta.env.BASE_URL}thumbs/${id}.webp) center / cover no-repeat, ${fallback}` };
}
