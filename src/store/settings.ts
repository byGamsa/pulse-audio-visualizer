import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AudioSettings {
  // Verstärkung vor dem Auto-Gain
  sensitivity: number;
  autoGain: boolean;
  // Zeitkonstanten in Sekunden
  attack: number;
  release: number;
  bassCutoff: number;
  trebleCutoff: number;
  bassGain: number;
  midGain: number;
  trebleGain: number;
  // Höher = weniger, aber sicherere Beats
  beatThreshold: number;
}

export interface VisualSettings {
  paletteId: string;
  bloomIntensity: number;
  bloomThreshold: number;
  bloomRadius: number;
  // Bass moduliert die Bloom-Intensität
  bloomReactive: number;
  chromaticAberration: number;
  grain: number;
  vignette: number;
  // Interne Renderauflösung relativ zur Fenstergröße
  renderScale: number;
  dynamicResolution: boolean;
}

export interface PlaybackSettings {
  // Der gerade laufende Modus (wird von der Engine gesetzt)
  modeId: string;
  autoSwitch: boolean;
  // Sekunden bis zum nächsten Modus
  switchInterval: number;
  transitionDuration: number;
}

export interface UiSettings {
  showHud: boolean;
  panelOpen: boolean;
}

export interface SettingsState {
  audio: AudioSettings;
  visual: VisualSettings;
  playback: PlaybackSettings;
  ui: UiSettings;
  setAudio: (p: Partial<AudioSettings>) => void;
  setVisual: (p: Partial<VisualSettings>) => void;
  setPlayback: (p: Partial<PlaybackSettings>) => void;
  setUi: (p: Partial<UiSettings>) => void;
  reset: () => void;
}

const defaults = {
  audio: {
    sensitivity: 1,
    autoGain: true,
    attack: 0.025,
    release: 0.22,
    bassCutoff: 250,
    trebleCutoff: 4000,
    bassGain: 1,
    midGain: 1,
    trebleGain: 1,
    beatThreshold: 1.4,
  } satisfies AudioSettings,
  visual: {
    paletteId: 'synth',
    bloomIntensity: 0.9,
    bloomThreshold: 0.6,
    bloomRadius: 0.65,
    bloomReactive: 0.6,
    chromaticAberration: 0.25,
    grain: 0.05,
    vignette: 0.45,
    renderScale: 1,
    dynamicResolution: true,
  } satisfies VisualSettings,
  playback: {
    modeId: 'halo',
    autoSwitch: true,
    switchInterval: 120,
    transitionDuration: 2.5,
  } satisfies PlaybackSettings,
  ui: {
    showHud: true,
    panelOpen: false,
  } satisfies UiSettings,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setAudio: (p) => set((s) => ({ audio: { ...s.audio, ...p } })),
      setVisual: (p) => set((s) => ({ visual: { ...s.visual, ...p } })),
      setPlayback: (p) => set((s) => ({ playback: { ...s.playback, ...p } })),
      setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
      reset: () => set({ audio: defaults.audio, visual: defaults.visual }),
    }),
    {
      name: 'pulse-settings',
      version: 1,
    },
  ),
);
