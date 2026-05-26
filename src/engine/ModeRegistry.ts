import type { ModeDefinition, ModeMeta } from './types';

interface RegistryEntry {
  meta: ModeMeta;
  load: () => Promise<ModeDefinition>;
}

const mode = (meta: ModeMeta, load: RegistryEntry['load']): RegistryEntry => ({ meta, load });

// Metadaten hier, damit die UI keine Shader laden muss
export const MODES: RegistryEntry[] = [
  mode(
    { id: 'halo', name: 'Halo', category: 'experimental', gpuCost: 1,
      description: 'Radiales Spektrum als Lichtring, mit Schockwellen und Funkenregen auf Beats.' },
    () => import('../modes/halo').then((m) => m.default),
  ),
  mode(
    { id: 'silk-ribbon', name: 'Silk Ribbon', category: 'lineart', gpuCost: 2,
      description: 'Ein Band aus 1 800 haarfeinen Fäden, das sich mit der Musik verdreht und flirrt.' },
    () => import('../modes/silk-ribbon').then((m) => m.default),
  ),
  mode(
    { id: 'nebula-galaxy', name: 'Nebula Galaxy', category: 'particles', gpuCost: 2,
      description: '300 000 Sterne in Spiralarmen. Beats schicken Dichtewellen durch die Scheibe.' },
    () => import('../modes/nebula-galaxy').then((m) => m.default),
  ),
  mode(
    { id: 'neon-tunnel', name: 'Neon Tunnel', category: 'retro', gpuCost: 2,
      description: 'Flug durch einen endlosen Tunnel aus Neonringen, die das Spektrum nachzeichnen.' },
    () => import('../modes/neon-tunnel').then((m) => m.default),
  ),
  mode(
    { id: 'dot-matrix', name: 'Dot Matrix', category: 'lineart', gpuCost: 2,
      description: 'Ein Punktraster als Gelände aus den letzten Sekunden Spektrum, mit Bokeh im Vordergrund.' },
    () => import('../modes/dot-matrix').then((m) => m.default),
  ),
  mode(
    { id: 'aurora', name: 'Aurora', category: 'ambient', gpuCost: 2,
      description: 'Nordlicht über einem stillen See. Die Mitten bewegen die Vorhänge.' },
    () => import('../modes/aurora').then((m) => m.default),
  ),
  mode(
    { id: 'liquid-silk', name: 'Liquid Silk', category: 'organic', gpuCost: 2,
      description: 'Echte Flüssigkeitssimulation. Drei Strömungen für Bass, Mitten und Höhen rühren Farbe.' },
    () => import('../modes/liquid-silk').then((m) => m.default),
  ),
  mode(
    { id: 'ferrofluid', name: 'Ferrofluid', category: 'organic', gpuCost: 3,
      description: 'Schwarz glänzende Magnetflüssigkeit; jede Stachelreihe folgt einem Frequenzband.' },
    () => import('../modes/ferrofluid').then((m) => m.default),
  ),
  mode(
    { id: 'liquid-gradient', name: 'Liquid Gradient', category: 'ambient', gpuCost: 1,
      description: 'Weiche, fließende Mesh-Gradients. Ruhig und nur sanft audio-reaktiv.' },
    () => import('../modes/liquid-gradient').then((m) => m.default),
  ),
];

export function findMode(id: string): RegistryEntry {
  return MODES.find((m) => m.meta.id === id) ?? MODES[0];
}
