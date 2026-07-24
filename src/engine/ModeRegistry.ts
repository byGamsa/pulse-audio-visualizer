import type { ModeDefinition, ModeMeta } from './types';

interface RegistryEntry {
  meta: ModeMeta;
  load: () => Promise<ModeDefinition>;
}

const mode = (meta: ModeMeta, load: RegistryEntry['load']): RegistryEntry => ({ meta, load });

// Metadaten hier, damit die UI keine Shader laden muss
export const MODES: RegistryEntry[] = [
  mode(
    { id: 'halo', name: 'Halo', category: 'experimental', gpuCost: 1, vivid: 0.25,
      description: 'Radiales Spektrum als Lichtring, mit Schockwellen und Funkenregen auf Beats.' },
    () => import('../modes/halo').then((m) => m.default),
  ),
  mode(
    { id: 'silk-ribbon', name: 'Silk Ribbon', category: 'lineart', gpuCost: 2, vivid: 0.25,
      description: 'Ein Band aus 1 800 haarfeinen Fäden, das sich mit der Musik verdreht und flirrt.' },
    () => import('../modes/silk-ribbon').then((m) => m.default),
  ),
  mode(
    { id: 'nebula-galaxy', name: 'Nebula Galaxy', category: 'particles', gpuCost: 2, vivid: 0.25,
      description: '300 000 Sterne in Spiralarmen. Beats schicken Dichtewellen durch die Scheibe.' },
    () => import('../modes/nebula-galaxy').then((m) => m.default),
  ),
  mode(
    { id: 'neon-tunnel', name: 'Neon Tunnel', category: 'retro', gpuCost: 2, vivid: 0.4,
      description: 'Flug durch einen endlosen Tunnel aus Neonringen, die das Spektrum nachzeichnen.' },
    () => import('../modes/neon-tunnel').then((m) => m.default),
  ),
  mode(
    { id: 'dot-matrix', name: 'Dot Matrix', category: 'lineart', gpuCost: 2, vivid: 0.3,
      description: 'Ein Punktraster als Gelände aus den letzten Sekunden Spektrum, mit Bokeh im Vordergrund.' },
    () => import('../modes/dot-matrix').then((m) => m.default),
  ),
  mode(
    { id: 'aurora', name: 'Aurora', category: 'ambient', gpuCost: 2, vivid: 0.25,
      description: 'Nordlicht über einem stillen See. Die Mitten bewegen die Vorhänge.' },
    () => import('../modes/aurora').then((m) => m.default),
  ),
  mode(
    { id: 'liquid-silk', name: 'Liquid Silk', category: 'organic', gpuCost: 2, vivid: 0.2,
      description: 'Echte Flüssigkeitssimulation. Drei Strömungen für Bass, Mitten und Höhen rühren Farbe.' },
    () => import('../modes/liquid-silk').then((m) => m.default),
  ),
  mode(
    { id: 'ferrofluid', name: 'Ferrofluid', category: 'organic', gpuCost: 3, vivid: 0.2,
      description: 'Schwarz glänzende Magnetflüssigkeit; jede Stachelreihe folgt einem Frequenzband.' },
    () => import('../modes/ferrofluid').then((m) => m.default),
  ),
  mode(
    { id: 'organism', name: 'Organism', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'Ein durchscheinender Zellkörper, der atmet und sich bei harten Kicks teilt.' },
    () => import('../modes/organism').then((m) => m.default),
  ),
  mode(
    { id: 'jellyfish', name: 'Jellyfish', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'Biolumineszente Quallen in der Tiefsee; jeder Beat lässt eine von ihnen pumpen.' },
    () => import('../modes/jellyfish').then((m) => m.default),
  ),
  mode(
    { id: 'mycelium', name: 'Mycelium', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'Ein Pilzgeflecht wächst aus der Mitte. Jeder Stamm leuchtet mit seinem Frequenzband.' },
    () => import('../modes/mycelium').then((m) => m.default),
  ),
  mode(
    { id: 'midnight-ocean', name: 'Midnight Ocean', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'Nächtliche See unter Mondlicht. Der Bass treibt die Dünung, die Höhen glitzern.' },
    () => import('../modes/midnight-ocean').then((m) => m.default),
  ),
  mode(
    { id: 'lava-lamp', name: 'Lava Lamp', category: 'organic', gpuCost: 1, vivid: 0.15,
      description: 'Warme Wachsblasen steigen und sinken; die Musik heizt die Lampe auf.' },
    () => import('../modes/lava-lamp').then((m) => m.default),
  ),
  mode(
    { id: 'outrun', name: 'Outrun', category: 'retro', gpuCost: 1, vivid: 0.2,
      description: 'Synthwave-Highway mit Streifensonne. Die vordere Bergkette ist das Spektrum.' },
    () => import('../modes/outrun').then((m) => m.default),
  ),
  mode(
    { id: 'particle-vortex', name: 'Particle Vortex', category: 'particles', gpuCost: 2, vivid: 0.25,
      description: 'Ein Strudel aus 200 000 Partikeln in Rosenform. Kicks saugen ihn zusammen.' },
    () => import('../modes/particle-vortex').then((m) => m.default),
  ),
  mode(
    { id: 'neon-waves', name: 'Neon Waves', category: 'lineart', gpuCost: 2, vivid: 0.25,
      description: 'Dutzende Leuchtlinien formen eine wogende Fläche; vorn das Jetzt, hinten die letzten Sekunden.' },
    () => import('../modes/neon-waves').then((m) => m.default),
  ),
  mode(
    { id: 'waveform-weave', name: 'Waveform Weave', category: 'lineart', gpuCost: 1, vivid: 0.25,
      description: 'Die letzten Wellenformen schräg hintereinander, davor ein Kamm aus Spektrumlinien.' },
    () => import('../modes/waveform-weave').then((m) => m.default),
  ),
  mode(
    { id: 'lightspeed', name: 'Lightspeed', category: 'particles', gpuCost: 2, vivid: 0.25,
      description: 'Lichtstrahlen und Punktströme schießen auf dich zu; Beats geben Schub.' },
    () => import('../modes/lightspeed').then((m) => m.default),
  ),
  mode(
    { id: 'plasma-core', name: 'Plasma Core', category: 'experimental', gpuCost: 1, vivid: 0.2,
      description: 'Eine gleißende Energiekugel mit Wellenform-Saiten und Lichtbahnen am Boden.' },
    () => import('../modes/plasma-core').then((m) => m.default),
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
