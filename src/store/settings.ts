import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModeCategory } from '../engine/types';
import type { TransitionChoice } from '../engine/transitions';

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

// Woher der nächste Modus kommt
export type PlaybackMode =
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'shuffle'; categories: ModeCategory[] }
  | { kind: 'single' };

export interface PlaybackSettings {
  // Der gerade laufende Modus (wird von der Engine gesetzt)
  modeId: string;
  mode: PlaybackMode;
  // Sekunden pro Modus im Shuffle über alle Modi
  shuffleDuration: number;
  transitionDuration: number;
  // Übergang für Shuffle, Single und Playlists ohne eigene Wahl
  transition: TransitionChoice;
  // Wechsel auf den nächsten Beat verschieben (max. 4 s)
  beatSync: boolean;
  // Timer angehalten
  hold: boolean;
}

// Titelanzeige: dauerhaft, nur kurz bei Liedwechsel oder gar nicht
export type NowPlayingMode = 'always' | 'change' | 'off';

export interface UiSettings {
  showHud: boolean;
  panelOpen: boolean;
  playbackOpen: boolean;
  nowPlaying: NowPlayingMode;
  // Desktop: beim Start und alle 6 h nach neuen Versionen sehen
  autoUpdate: boolean;
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
    paletteId: 'standard',
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
    mode: { kind: 'shuffle', categories: [] } as PlaybackMode,
    shuffleDuration: 120,
    transitionDuration: 2.5,
    transition: 'auto' as TransitionChoice,
    beatSync: true,
    hold: false,
  } satisfies PlaybackSettings,
  ui: {
    showHud: true,
    panelOpen: false,
    playbackOpen: false,
    nowPlaying: 'change' as NowPlayingMode,
    autoUpdate: true,
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
      version: 2,
      // v1 kannte nur „autoSwitch“; alles Übrige ergänzt merge() mit Defaults
      migrate: (persisted) => {
        const p = (persisted ?? {}) as { playback?: Record<string, unknown> };
        if (p.playback) delete p.playback.autoSwitch;
        return p as unknown as SettingsState;
      },
      // Neue Felder bekommen ihre Defaults
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          audio: { ...current.audio, ...p.audio },
          visual: { ...current.visual, ...p.visual },
          playback: { ...current.playback, ...p.playback },
          ui: { ...current.ui, ...p.ui },
        };
      },
    },
  ),
);
