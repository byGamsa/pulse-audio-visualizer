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
      description: 'A glowing cell under the microscope. Cilia beat with the highs, kicks make it bud.' },
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
    { id: 'phosphor-scope', name: 'Phosphor Scope', category: 'retro', gpuCost: 1,
      description: 'Analoges XY-Oszilloskop mit Nachleuchten. Stereo zeichnet Lissajous-Figuren.' },
    () => import('../modes/phosphor-scope').then((m) => m.default),
  ),
  mode(
    { id: 'particle-vortex', name: 'Particle Vortex', category: 'particles', gpuCost: 2, vivid: 0.25,
      description: '12,000 comet trails spiral into a glowing funnel. Kicks pull the vortex tight.' },
    () => import('../modes/particle-vortex').then((m) => m.default),
  ),
  mode(
    { id: 'neon-waves', name: 'Neon Waves', category: 'lineart', gpuCost: 2, vivid: 0.25,
      description: 'Dutzende Leuchtlinien formen eine wogende Fläche; vorn das Jetzt, hinten die letzten Sekunden.' },
    () => import('../modes/neon-waves').then((m) => m.default),
  ),
  mode(
    { id: 'silk-light', name: 'Silk Light', category: 'lineart', gpuCost: 1, vivid: 0.3,
      description: 'Ein Bündel weicher Lichtstränge mit wanderndem Farbton; der Bass spreizt es auf.' },
    () => import('../modes/silk-light').then((m) => m.default),
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
    { id: 'dot-vortex', name: 'Dot Vortex', category: 'particles', gpuCost: 2, vivid: 0.3,
      description: 'Ein gewundener Tunnel aus Punkt-Ringen in Regenbogenfarben, vorn verformt vom Klang.' },
    () => import('../modes/dot-vortex').then((m) => m.default),
  ),
  mode(
    { id: 'plasma-core', name: 'Plasma Core', category: 'experimental', gpuCost: 2, vivid: 0.25,
      description: 'A plasma sphere full of swirling filaments. The corona flares, kicks throw lightning.' },
    () => import('../modes/plasma-core').then((m) => m.default),
  ),
  mode(
    { id: 'neon-stage', name: 'Neon Stage', category: 'experimental', gpuCost: 1, vivid: 0.25,
      description: 'Feine Regenbogen-Spektrumlinien mit Lichtvorhängen auf einem Spiegelboden.' },
    () => import('../modes/neon-stage').then((m) => m.default),
  ),
  mode(
    { id: 'rorschach', name: 'Rorschach', category: 'lineart', gpuCost: 1,
      description: 'Gespiegelte Wellenform-Linien hinterlassen Tintenschlieren; Insekten, Masken, Flügel. Kippt im Takt.' },
    () => import('../modes/rorschach').then((m) => m.default),
  ),
  mode(
    { id: 'mercury-pool', name: 'Mercury Pool', category: 'organic', gpuCost: 2,
      description: 'Ein Becken aus Quecksilber; jeder Kick lässt einen Chromtropfen hineinfallen.' },
    () => import('../modes/mercury-pool').then((m) => m.default),
  ),
  mode(
    { id: 'liquid-pearl', name: 'Liquid Pearl', category: 'organic', gpuCost: 2, vivid: 0.15,
      description: 'Iridescent pearls made of dots drift around each other. The bass bends them.' },
    () => import('../modes/liquid-pearl').then((m) => m.default),
  ),
  mode(
    { id: 'crystal', name: 'Crystal', category: 'experimental', gpuCost: 2,
      description: 'Ein geschliffener Kristall mit Lichtbrechung und Dispersion; Kicks geben ihm Schwung.' },
    () => import('../modes/crystal').then((m) => m.default),
  ),
  mode(
    { id: 'bar-grid', name: 'Bar Grid', category: 'retro', gpuCost: 1, vivid: 0.4,
      description: 'Ein 3D-Raster aus Leuchtsäulen: quer die Frequenz, nach hinten die Zeit.' },
    () => import('../modes/bar-grid').then((m) => m.default),
  ),
  mode(
    { id: 'spectrum-disc', name: 'Spectrum Disc', category: 'lineart', gpuCost: 1, vivid: 0.35,
      description: 'Eine Regenbogen-Scheibe, auf deren Ring Spektrum-Nadeln wachsen und nach außen laufen.' },
    () => import('../modes/spectrum-disc').then((m) => m.default),
  ),
  mode(
    { id: 'laser-weave', name: 'Laser Weave', category: 'experimental', gpuCost: 1, vivid: 0.3,
      description: 'Laserbündel kreuzen sich wie in einer Langzeitbelichtung, jedes Bündel ein Frequenzband.' },
    () => import('../modes/laser-weave').then((m) => m.default),
  ),
  mode(
    { id: 'oil-paint', name: 'Oil Paint', category: 'organic', gpuCost: 2, vivid: 0.4,
      description: 'Dicke, glänzende Farbstriche spritzen auf jeden Beat aus der Mitte und zerfließen.' },
    () => import('../modes/oil-paint').then((m) => m.default),
  ),
  mode(
    { id: 'cosmic-tunnel', name: 'Cosmic Tunnel', category: 'ambient', gpuCost: 2, vivid: 0.2,
      description: 'Flug durch eine gekrümmte Sternenröhre mit spiralförmigen Nebeln und Spektrum-Bögen.' },
    () => import('../modes/cosmic-tunnel').then((m) => m.default),
  ),
  mode(
    { id: 'neon-lasers', name: 'Neon Lasers', category: 'experimental', gpuCost: 1, vivid: 0.4,
      description: 'Neonstrahlen kreuzen sich über das ganze Bild; wo sie sich treffen, glüht es weiß.' },
    () => import('../modes/neon-lasers').then((m) => m.default),
  ),
  mode(
    { id: 'tesla-waves', name: 'Tesla Waves', category: 'experimental', gpuCost: 1, vivid: 0.35,
      description: 'Knisternde elektrische Entladungen mit weitem Neonschein, mal als Bahnen, mal als Kaleidoskop.' },
    () => import('../modes/tesla-waves').then((m) => m.default),
  ),
  mode(
    { id: 'red-lattice', name: 'Red Lattice', category: 'lineart', gpuCost: 2, vivid: 0.3,
      description: 'Ein rot glühendes Dreiecksnetz in mehreren Ebenen; jede Kante hängt an einem Frequenzband.' },
    () => import('../modes/red-lattice').then((m) => m.default),
  ),
  mode(
    { id: 'aurora-horizon', name: 'Aurora Horizon', category: 'ambient', gpuCost: 1,
      description: 'Lichtvorhänge in Rosa und Blau über einem spiegelnden Horizont, jede Spalte ein Band.' },
    () => import('../modes/aurora-horizon').then((m) => m.default),
  ),
  mode(
    { id: 'energy-tendrils', name: 'Energy Tendrils', category: 'particles', gpuCost: 2, vivid: 0.3,
      description: 'Hunderte Energiefäden schießen aus einem Kern; vorbeiziehende verschwimmen zu Schlieren.' },
    () => import('../modes/energy-tendrils').then((m) => m.default),
  ),
  mode(
    { id: 'neon-arches', name: 'Neon Arches', category: 'retro', gpuCost: 1, vivid: 0.3,
      description: 'Flug durch einen Tunnel aus Neonbögen über spiegelndem Boden; Kicks treiben das Tempo.' },
    () => import('../modes/neon-arches').then((m) => m.default),
  ),
  mode(
    { id: 'saber-stage', name: 'Saber Stage', category: 'experimental', gpuCost: 1, vivid: 0.45,
      description: 'Bühne im Stil von Beat Saber: Lichtringe, Laserfächer und taktgenau geschnittene Würfel.' },
    () => import('../modes/saber-stage').then((m) => m.default),
  ),
  mode(
    { id: 'macrodata', name: 'Macrodata', category: 'retro', gpuCost: 1,
      description: 'Ein Zahlenraster auf alter Röhre; wo die Musik hinzieht, blähen sich die Ziffern auf.' },
    () => import('../modes/macrodata').then((m) => m.default),
  ),
  mode(
    { id: 'terminal', name: 'Terminal', category: 'retro', gpuCost: 1,
      description: 'Ein Coding-Terminal tippt den echten Quellcode von Pulse, im Tempo der Musik.' },
    () => import('../modes/terminal').then((m) => m.default),
  ),
  mode(
    { id: 'text-tetris', name: 'Text Tetris', category: 'retro', gpuCost: 1,
      description: 'Tetris im Textmodus wie 1984. Spielt sich selbst, die Steine fallen im Takt.' },
    () => import('../modes/text-tetris').then((m) => m.default),
  ),
  mode(
    { id: 'vfd-hifi', name: 'VFD Hi-Fi', category: 'retro', gpuCost: 1,
      description: 'Vakuum-Fluoreszenz-Display einer alten Stereoanlage: 32-Band-Analyzer und VU-Meter.' },
    () => import('../modes/vfd-hifi').then((m) => m.default),
  ),
  mode(
    { id: 'spectrum-mirror', name: 'Spectrum Mirror', category: 'retro', gpuCost: 1, vivid: 0.3,
      description: 'Gespiegelte Regenbogen-LED-Säulen mit Echo-Ebenen, die in die Tiefe laufen.' },
    () => import('../modes/spectrum-mirror').then((m) => m.default),
  ),
  mode(
    { id: 'led-tubes', name: 'LED Tubes', category: 'retro', gpuCost: 1, vivid: 0.25,
      description: 'Zehn Glasröhren mit LED-Säulen auf dem Schreibtisch, eine pro Frequenzband.' },
    () => import('../modes/led-tubes').then((m) => m.default),
  ),
  mode(
    { id: 'arcade', name: '8-Bit Arcade', category: 'retro', gpuCost: 1,
      description: 'Pixel-Aliens marschieren im Takt, jede Spalte hüpft mit ihrem Band. Das Schiff feuert auf Beats.' },
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
      description: 'Weiche, fließende Mesh-Gradients. Ruhig und nur sanft audio-reaktiv.' },
    () => import('../modes/liquid-gradient').then((m) => m.default),
  ),
];

export function findMode(id: string): RegistryEntry {
  return MODES.find((m) => m.meta.id === id) ?? MODES[0];
}
