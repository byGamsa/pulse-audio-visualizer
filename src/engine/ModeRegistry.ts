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
      description: 'The spectrum as a ring of light. Beats send out shockwaves and showers of sparks.' },
    () => import('../modes/halo').then((m) => m.default),
  ),
  mode(
    { id: 'silk-ribbon', name: 'Silk Ribbon', category: 'lineart', gpuCost: 2, vivid: 0.25,
      description: 'A ribbon of 1,800 hair-thin threads that twists and shimmers with the music.' },
    () => import('../modes/silk-ribbon').then((m) => m.default),
  ),
  mode(
    { id: 'nebula-galaxy', name: 'Nebula Galaxy', category: 'particles', gpuCost: 2, vivid: 0.25,
      description: '300,000 stars in spiral arms. Every beat sends a density wave through the disc.' },
    () => import('../modes/nebula-galaxy').then((m) => m.default),
  ),
  mode(
    { id: 'neon-tunnel', name: 'Neon Tunnel', category: 'retro', gpuCost: 2, vivid: 0.4,
      description: 'Fly through an endless tunnel of neon rings that trace the spectrum.' },
    () => import('../modes/neon-tunnel').then((m) => m.default),
  ),
  mode(
    { id: 'dot-matrix', name: 'Dot Matrix', category: 'lineart', gpuCost: 2, vivid: 0.3,
      description: 'A field of dots shaped by the last few seconds of sound, with bokeh in the foreground.' },
    () => import('../modes/dot-matrix').then((m) => m.default),
  ),
  mode(
    { id: 'aurora', name: 'Aurora', category: 'ambient', gpuCost: 2, vivid: 0.25,
      description: 'Northern lights over a still lake. The mids move the curtains.' },
    () => import('../modes/aurora').then((m) => m.default),
  ),
  mode(
    { id: 'liquid-silk', name: 'Liquid Silk', category: 'organic', gpuCost: 2, vivid: 0.2,
      description: 'A real fluid simulation. Bass, mids and highs each stir their own current of color.' },
    () => import('../modes/liquid-silk').then((m) => m.default),
  ),
  mode(
    { id: 'ferrofluid', name: 'Ferrofluid', category: 'organic', gpuCost: 3, vivid: 0.2,
      description: 'Glossy black magnetic liquid. Every row of spikes follows its own frequency band.' },
    () => import('../modes/ferrofluid').then((m) => m.default),
  ),
  mode(
    { id: 'organism', name: 'Organism', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'A glowing cell under the microscope. Cilia beat with the highs, kicks make it bud.' },
    () => import('../modes/organism').then((m) => m.default),
  ),
  mode(
    { id: 'jellyfish', name: 'Jellyfish', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'Bioluminescent jellyfish in the deep sea. Every beat makes one of them pulse.' },
    () => import('../modes/jellyfish').then((m) => m.default),
  ),
  mode(
    { id: 'mycelium', name: 'Mycelium', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'A fungal network growing from the center. Each strand glows with its frequency band.' },
    () => import('../modes/mycelium').then((m) => m.default),
  ),
  mode(
    { id: 'midnight-ocean', name: 'Midnight Ocean', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'The sea at night under moonlight. Bass drives the swell, highs make it glitter.' },
    () => import('../modes/midnight-ocean').then((m) => m.default),
  ),
  mode(
    { id: 'lava-lamp', name: 'Lava Lamp', category: 'organic', gpuCost: 1, vivid: 0.15,
      description: 'Inside a lava lamp: glowing wax drifts through violet liquid as the music heats it up.' },
    () => import('../modes/lava-lamp').then((m) => m.default),
  ),
  mode(
    { id: 'outrun', name: 'Outrun', category: 'retro', gpuCost: 1, vivid: 0.2,
      description: 'A synthwave highway under a striped sun. The front mountain range is the spectrum.' },
    () => import('../modes/outrun').then((m) => m.default),
  ),
  mode(
    { id: 'phosphor-scope', name: 'Phosphor Scope', category: 'retro', gpuCost: 1,
      description: 'An analog XY oscilloscope with afterglow. Stereo draws Lissajous figures.' },
    () => import('../modes/phosphor-scope').then((m) => m.default),
  ),
  mode(
    { id: 'particle-vortex', name: 'Particle Vortex', category: 'particles', gpuCost: 2, vivid: 0.25,
      description: '12,000 comet trails spiral into a glowing funnel. Kicks pull the vortex tight.' },
    () => import('../modes/particle-vortex').then((m) => m.default),
  ),
  mode(
    { id: 'neon-waves', name: 'Neon Waves', category: 'lineart', gpuCost: 2, vivid: 0.25,
      description: 'Dozens of light lines form a rolling surface: now in front, the last seconds behind.' },
    () => import('../modes/neon-waves').then((m) => m.default),
  ),
  mode(
    { id: 'silk-light', name: 'Silk Light', category: 'lineart', gpuCost: 1, vivid: 0.3,
      description: 'A bundle of soft light strands with drifting hues. The bass fans it open.' },
    () => import('../modes/silk-light').then((m) => m.default),
  ),
  mode(
    { id: 'lightspeed', name: 'Lightspeed', category: 'particles', gpuCost: 2, vivid: 0.25,
      description: 'Beams and streams of light rush toward you. Every beat is a boost.' },
    () => import('../modes/lightspeed').then((m) => m.default),
  ),
  mode(
    { id: 'dot-vortex', name: 'Dot Vortex', category: 'particles', gpuCost: 2, vivid: 0.3,
      description: 'A winding tunnel of rainbow dot rings, bent by the sound up front.' },
    () => import('../modes/dot-vortex').then((m) => m.default),
  ),
  mode(
    { id: 'plasma-core', name: 'Plasma Core', category: 'experimental', gpuCost: 2, vivid: 0.25,
      description: 'A plasma sphere full of swirling filaments. The corona flares, kicks throw lightning.' },
    () => import('../modes/plasma-core').then((m) => m.default),
  ),
  mode(
    { id: 'neon-stage', name: 'Neon Stage', category: 'experimental', gpuCost: 1, vivid: 0.25,
      description: 'Fine rainbow spectrum lines and light curtains over a mirror floor.' },
    () => import('../modes/neon-stage').then((m) => m.default),
  ),
  mode(
    { id: 'ink-bloom', name: 'Ink Bloom', category: 'organic', gpuCost: 1, vivid: 0.25,
      description: 'Glowing ink in dark water, mirrored like a Rorschach test. Each kick blooms a new color.' },
    () => import('../modes/ink-bloom').then((m) => m.default),
  ),
  mode(
    { id: 'mercury-pool', name: 'Mercury Pool', category: 'organic', gpuCost: 2,
      description: 'A pool of mercury. Every kick drops a chrome bead into it.' },
    () => import('../modes/mercury-pool').then((m) => m.default),
  ),
  mode(
    { id: 'liquid-pearl', name: 'Liquid Pearl', category: 'organic', gpuCost: 2, vivid: 0.15,
      description: 'Iridescent pearls made of dots drift around each other. The bass bends them.' },
    () => import('../modes/liquid-pearl').then((m) => m.default),
  ),
  mode(
    { id: 'crystal', name: 'Crystal', category: 'experimental', gpuCost: 2,
      description: 'A double-ended quartz crystal with a glowing phantom inside. Kicks set it spinning.' },
    () => import('../modes/crystal').then((m) => m.default),
  ),
  mode(
    { id: 'bar-grid', name: 'Bar Grid', category: 'retro', gpuCost: 1, vivid: 0.4,
      description: 'A 3D grid of light columns: frequency across, time going back.' },
    () => import('../modes/bar-grid').then((m) => m.default),
  ),
  mode(
    { id: 'spectrum-disc', name: 'Spectrum Disc', category: 'lineart', gpuCost: 1, vivid: 0.35,
      description: 'A rainbow disc where spectrum needles grow on the rim and race outward.' },
    () => import('../modes/spectrum-disc').then((m) => m.default),
  ),
  mode(
    { id: 'laser-weave', name: 'Laser Weave', category: 'experimental', gpuCost: 1, vivid: 0.3,
      description: 'Laser bundles cross like a long exposure, one bundle per frequency band.' },
    () => import('../modes/laser-weave').then((m) => m.default),
  ),
  mode(
    { id: 'oil-paint', name: 'Oil Paint', category: 'organic', gpuCost: 2, vivid: 0.4,
      description: 'Thick, glossy brushstrokes burst from the center on every beat and run.' },
    () => import('../modes/oil-paint').then((m) => m.default),
  ),
  mode(
    { id: 'cosmic-tunnel', name: 'Cosmic Tunnel', category: 'ambient', gpuCost: 2, vivid: 0.2,
      description: 'Fly through a curved tube of stars, spiral nebulae and spectrum arcs.' },
    () => import('../modes/cosmic-tunnel').then((m) => m.default),
  ),
  mode(
    { id: 'neon-lasers', name: 'Neon Lasers', category: 'experimental', gpuCost: 1, vivid: 0.4,
      description: 'Neon beams cross the whole frame. Where they meet, they burn white.' },
    () => import('../modes/neon-lasers').then((m) => m.default),
  ),
  mode(
    { id: 'tesla-waves', name: 'Tesla Waves', category: 'experimental', gpuCost: 1, vivid: 0.35,
      description: 'Crackling electric discharges with a wide neon glow, as paths or as a kaleidoscope.' },
    () => import('../modes/tesla-waves').then((m) => m.default),
  ),
  mode(
    { id: 'red-lattice', name: 'Red Lattice', category: 'lineart', gpuCost: 2, vivid: 0.3,
      description: 'A red-hot triangle mesh in layers. Every edge hangs on a frequency band.' },
    () => import('../modes/red-lattice').then((m) => m.default),
  ),
  mode(
    { id: 'aurora-horizon', name: 'Aurora Horizon', category: 'ambient', gpuCost: 1,
      description: 'Pink and blue light curtains over a mirrored horizon, one band per column.' },
    () => import('../modes/aurora-horizon').then((m) => m.default),
  ),
  mode(
    { id: 'energy-tendrils', name: 'Energy Tendrils', category: 'particles', gpuCost: 2, vivid: 0.3,
      description: 'Hundreds of energy tendrils shoot from a core and blur into streaks as they pass.' },
    () => import('../modes/energy-tendrils').then((m) => m.default),
  ),
  mode(
    { id: 'neon-arches', name: 'Neon Arches', category: 'retro', gpuCost: 1, vivid: 0.3,
      description: 'Fly through a tunnel of neon arches over a mirror floor. Kicks set the pace.' },
    () => import('../modes/neon-arches').then((m) => m.default),
  ),
  mode(
    { id: 'saber-stage', name: 'Saber Stage', category: 'experimental', gpuCost: 1, vivid: 0.45,
      description: 'A Beat Saber-style stage: light rings, laser fans and cubes sliced on the beat.' },
    () => import('../modes/saber-stage').then((m) => m.default),
  ),
  mode(
    { id: 'macrodata', name: 'Macrodata', category: 'retro', gpuCost: 1,
      description: 'A grid of numbers on an old CRT. Where the music pulls, the digits swell.' },
    () => import('../modes/macrodata').then((m) => m.default),
  ),
  mode(
    { id: 'terminal', name: 'Terminal', category: 'retro', gpuCost: 1,
      description: 'A coding terminal types the actual Pulse source code, in time with the music.' },
    () => import('../modes/terminal').then((m) => m.default),
  ),
  mode(
    { id: 'text-tetris', name: 'Text Tetris', category: 'retro', gpuCost: 1,
      description: 'Tetris in text mode, like 1984. It plays itself, the blocks fall on the beat.' },
    () => import('../modes/text-tetris').then((m) => m.default),
  ),
  mode(
    { id: 'vfd-hifi', name: 'VFD Hi-Fi', category: 'retro', gpuCost: 1,
      description: 'The vacuum fluorescent display of a vintage stereo: 32-band analyzer and VU meters.' },
    () => import('../modes/vfd-hifi').then((m) => m.default),
  ),
  mode(
    { id: 'spectrum-mirror', name: 'Spectrum Mirror', category: 'retro', gpuCost: 1, vivid: 0.3,
      description: 'Mirrored rainbow LED columns with echo layers running into the distance.' },
    () => import('../modes/spectrum-mirror').then((m) => m.default),
  ),
  mode(
    { id: 'led-tubes', name: 'LED Tubes', category: 'retro', gpuCost: 1, vivid: 0.25,
      description: 'Ten glass tubes with LED columns on a desk, one per frequency band.' },
    () => import('../modes/led-tubes').then((m) => m.default),
  ),
  mode(
    { id: 'arcade', name: '8-Bit Arcade', category: 'retro', gpuCost: 1,
      description: 'Pixel aliens march in time, every column hopping with its band. The ship fires on the beat.' },
    () => import('../modes/arcade').then((m) => m.default),
  ),
  mode(
    { id: 'horizon-grid', name: 'Horizon Grid', category: 'lineart', gpuCost: 2, vivid: 0.3,
      description: 'A wireframe planet with the spectrum rising from its center as a crater of spikes.' },
    () => import('../modes/horizon-grid').then((m) => m.default),
  ),
  mode(
    { id: 'ripple-field', name: 'Ripple Field', category: 'lineart', gpuCost: 2, vivid: 0.3,
      description: 'A spiky wire field seen from above. Every moment of the music rolls out as a ring.' },
    () => import('../modes/ripple-field').then((m) => m.default),
  ),
  mode(
    { id: 'spore-field', name: 'Spore Field', category: 'particles', gpuCost: 2, vivid: 0.2,
      description: 'A drifting sheet of glowing spores right in front of the lens, melting into bokeh.' },
    () => import('../modes/spore-field').then((m) => m.default),
  ),
  mode(
    { id: 'prism-ridge', name: 'Prism Ridge', category: 'lineart', gpuCost: 1, vivid: 0.3,
      description: 'A rainbow ridge of wire triangles, with blurred echoes of the last bars above and below.' },
    () => import('../modes/prism-ridge').then((m) => m.default),
  ),
  mode(
    { id: 'infinity', name: 'Infinity', category: 'lineart', gpuCost: 1, vivid: 0.3,
      description: 'A blazing band of light draws a figure eight. The bass inflates the loops.' },
    () => import('../modes/infinity').then((m) => m.default),
  ),
  mode(
    { id: 'gyroscope', name: 'Gyroscope', category: 'experimental', gpuCost: 1, vivid: 0.3,
      description: 'Three tilting rings of light threads around a glowing core. Every kick nudges one.' },
    () => import('../modes/gyroscope').then((m) => m.default),
  ),
  mode(
    { id: 'chroma-urchin', name: 'Chroma Urchin', category: 'organic', gpuCost: 2, vivid: 0.3,
      description: 'A sea urchin of hair-thin rainbow circles. Every spine dances with its band.' },
    () => import('../modes/chroma-urchin').then((m) => m.default),
  ),
  mode(
    { id: 'low-tide', name: 'Low Tide', category: 'organic', gpuCost: 2, vivid: 0.25,
      description: 'A glowing urchin half out of the night water, its reflection trembling below.' },
    () => import('../modes/low-tide').then((m) => m.default),
  ),
  mode(
    { id: 'sepia-nova', name: 'Sepia Nova', category: 'experimental', gpuCost: 2,
      description: 'A ball of 9,000 hairs bursts in sepia. Zoom streaks carry every kick outward.' },
    () => import('../modes/sepia-nova').then((m) => m.default),
  ),
  mode(
    { id: 'moire-moon', name: 'Moiré Moon', category: 'organic', gpuCost: 2, vivid: 0.2,
      description: 'A moon of 400,000 dots. The bass presses in craters with magenta rims.' },
    () => import('../modes/moire-moon').then((m) => m.default),
  ),
  mode(
    { id: 'lightfall', name: 'Lightfall', category: 'particles', gpuCost: 1, vivid: 0.35,
      description: 'A waterfall of 2,600 neon trails plunges down and fans out toward you.' },
    () => import('../modes/lightfall').then((m) => m.default),
  ),
  mode(
    { id: 'twin-vortex', name: 'Twin Vortex', category: 'particles', gpuCost: 2, vivid: 0.3,
      description: 'Light trails fall through the center and curl into two vortices left and right.' },
    () => import('../modes/twin-vortex').then((m) => m.default),
  ),
  mode(
    { id: 'warp-ring', name: 'Warp Ring', category: 'particles', gpuCost: 1, vivid: 0.2,
      description: 'A ring of white droplets. Every moment flies outward as an echo with a color fringe.' },
    () => import('../modes/warp-ring').then((m) => m.default),
  ),
  mode(
    { id: 'polar-arcs', name: 'Polar Arcs', category: 'lineart', gpuCost: 1, vivid: 0.3,
      description: 'Ten rings of glowing arcs tumble through space, one ring per frequency band.' },
    () => import('../modes/polar-arcs').then((m) => m.default),
  ),
  mode(
    { id: 'liquid-gradient', name: 'Liquid Gradient', category: 'ambient', gpuCost: 1,
      description: 'Soft, flowing mesh gradients. Calm, and only gently reactive.' },
    () => import('../modes/liquid-gradient').then((m) => m.default),
  ),
];

export function findMode(id: string): RegistryEntry {
  return MODES.find((m) => m.meta.id === id) ?? MODES[0];
}
