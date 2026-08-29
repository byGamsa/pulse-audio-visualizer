import type { ModeCategory } from './types';

// Reihenfolge = Index im Composite-Shader (uType)
export const TRANSITIONS = [
  'crossfade', 'dissolve', 'zoom', 'glitch', 'liquid', 'shatter',
  'focus', 'leak', 'singularity', 'melt', 'slitscan', 'stutter',
] as const;
export type TransitionType = (typeof TRANSITIONS)[number];
// Was in Einstellungen und Playlists gespeichert wird
export type TransitionChoice = TransitionType | 'auto' | 'random';

export const TRANSITION_LABEL: Record<TransitionChoice, string> = {
  auto: 'Automatisch',
  random: 'Zufällig',
  crossfade: 'Crossfade',
  dissolve: 'Noise Dissolve',
  zoom: 'Zoom Warp',
  glitch: 'Glitch Cut',
  liquid: 'Liquid Displace',
  shatter: 'Shatter',
  focus: 'Focus Pull',
  leak: 'Light Leak',
  singularity: 'Singularity',
  melt: 'Pixel Melt',
  slitscan: 'Slit Scan',
  stutter: 'Stutter Cut',
};

// Mehrere pro Kategorie, damit Automatisch variiert
const BY_CATEGORY: Record<ModeCategory, TransitionType[]> = {
  retro: ['glitch', 'stutter', 'melt'],
  organic: ['liquid', 'focus', 'dissolve'],
  particles: ['zoom', 'singularity', 'focus'],
  ambient: ['focus', 'dissolve', 'leak'],
  lineart: ['slitscan', 'focus', 'crossfade'],
  experimental: ['leak', 'shatter', 'singularity'],
};

export function resolveTransition(choice: TransitionChoice, target: ModeCategory): TransitionType {
  if (choice === 'auto') {
    const options = BY_CATEGORY[target];
    return options[Math.floor(Math.random() * options.length)];
  }
  if (choice === 'random') return TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
  return choice;
}

export const TRANSITION_CHOICES: TransitionChoice[] = ['auto', 'random', ...TRANSITIONS];

export function isTransitionChoice(v: unknown): v is TransitionChoice {
  return typeof v === 'string' && (TRANSITION_CHOICES as string[]).includes(v);
}
