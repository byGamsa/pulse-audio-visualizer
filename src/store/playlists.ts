import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MODES } from '../engine/ModeRegistry';
import { isTransitionChoice, type TransitionChoice } from '../engine/transitions';

export interface PlaylistItem {
  // Eindeutig pro Playlist, Modi dürfen doppelt vorkommen
  id: string;
  modeId: string;
  // Sekunden; fehlt = Standarddauer der Playlist
  duration?: number;
  // Eigene Palette für dieses Item; fehlt = globale Palette
  paletteId?: string;
}

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
  // Sekunden pro Item, wenn das Item nichts anderes sagt
  defaultDuration: number;
  order: 'sequential' | 'shuffle';
  // Übergang zwischen den Items; fehlt = globale Einstellung
  transition?: TransitionChoice;
}

interface PlaylistState {
  playlists: Playlist[];
  create: (name?: string) => string;
  duplicate: (id: string) => string | null;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<Omit<Playlist, 'id' | 'items'>>) => void;
  addItem: (id: string, modeId: string) => void;
  updateItem: (id: string, itemId: string, patch: Partial<Omit<PlaylistItem, 'id'>>) => void;
  removeItem: (id: string, itemId: string) => void;
  moveItem: (id: string, from: number, to: number) => void;
  importJson: (json: string) => string;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

const item = (modeId: string, duration?: number): PlaylistItem => ({ id: uid(), modeId, duration });

const SEED: Playlist[] = [
  {
    id: 'late-night',
    name: 'Late Night',
    defaultDuration: 180,
    order: 'sequential',
    items: [item('aurora'), item('silk-ribbon'), item('liquid-gradient'), item('dot-matrix')],
  },
  {
    id: 'peak-time',
    name: 'Peak Time',
    defaultDuration: 90,
    order: 'shuffle',
    items: [item('neon-tunnel'), item('halo'), item('nebula-galaxy'), item('dot-matrix', 60)],
  },
  {
    id: 'neon-rave',
    name: 'Neon Rave',
    defaultDuration: 60,
    order: 'shuffle',
    transition: 'random',
    items: ['lightfall', 'prism-ridge', 'gyroscope', 'infinity', 'warp-ring', 'neon-lasers', 'laser-weave', 'saber-stage', 'neon-tunnel', 'polar-arcs'].map((m) => item(m)),
  },
  {
    id: 'club-peak',
    name: 'Club Peak',
    defaultDuration: 45,
    order: 'shuffle',
    transition: 'random',
    items: ['sepia-nova', 'twin-vortex', 'warp-ring', 'tesla-waves', 'energy-tendrils', 'lightspeed', 'plasma-core', 'halo', 'chroma-urchin'].map((m) => item(m)),
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    defaultDuration: 120,
    order: 'sequential',
    items: ['horizon-grid', 'nebula-galaxy', 'plasma-core', 'cosmic-tunnel', 'polar-arcs', 'low-tide', 'particle-vortex', 'dot-vortex'].map((m) => item(m)),
  },
  {
    id: 'organic-flow',
    name: 'Organic Flow',
    defaultDuration: 120,
    order: 'shuffle',
    items: ['liquid-pearl', 'moire-moon', 'chroma-urchin', 'ferrofluid', 'jellyfish', 'mycelium', 'organism', 'mercury-pool', 'lava-lamp', 'oil-paint', 'ink-bloom'].map((m) => item(m)),
  },
  {
    id: 'wireframe',
    name: 'Wireframe',
    defaultDuration: 90,
    order: 'shuffle',
    items: ['horizon-grid', 'ripple-field', 'prism-ridge', 'red-lattice', 'neon-waves', 'silk-ribbon', 'spectrum-disc', 'dot-matrix'].map((m) => item(m)),
  },
  {
    id: 'chill',
    name: 'Chill',
    defaultDuration: 180,
    order: 'sequential',
    transition: 'crossfade',
    items: ['aurora', 'spore-field', 'liquid-gradient', 'midnight-ocean', 'aurora-horizon', 'silk-light', 'liquid-silk', 'low-tide'].map((m) => item(m)),
  },
  {
    id: 'retro-arcade',
    name: 'Retro Arcade',
    defaultDuration: 90,
    order: 'sequential',
    items: ['outrun', 'arcade', 'text-tetris', 'vfd-hifi', 'phosphor-scope', 'macrodata', 'terminal', 'led-tubes', 'spectrum-mirror', 'bar-grid', 'neon-arches'].map((m) => item(m)),
  },
  {
    id: 'showcase',
    name: 'Showcase',
    defaultDuration: 40,
    order: 'sequential',
    items: ['horizon-grid', 'ripple-field', 'spore-field', 'prism-ridge', 'infinity', 'gyroscope', 'chroma-urchin', 'sepia-nova', 'moire-moon', 'liquid-pearl', 'low-tide', 'warp-ring', 'polar-arcs', 'lightfall', 'twin-vortex', 'plasma-core'].map((m) => item(m)),
  },
];

function mapPlaylist(state: PlaylistState, id: string, fn: (p: Playlist) => Playlist) {
  return { playlists: state.playlists.map((p) => (p.id === id ? fn(p) : p)) };
}

export const usePlaylists = create<PlaylistState>()(
  persist(
    (set, get) => ({
      playlists: SEED,

      create: (name = 'Neue Playlist') => {
        const id = uid();
        set((s) => ({ playlists: [...s.playlists, { id, name, items: [], defaultDuration: 180, order: 'sequential' }] }));
        return id;
      },

      duplicate: (id) => {
        const src = get().playlists.find((p) => p.id === id);
        if (!src) return null;
        const copy: Playlist = {
          ...src,
          id: uid(),
          name: `${src.name} (Kopie)`,
          items: src.items.map((i) => ({ ...i, id: uid() })),
        };
        set((s) => ({ playlists: [...s.playlists, copy] }));
        return copy.id;
      },

      remove: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),

      update: (id, patch) => set((s) => mapPlaylist(s, id, (p) => ({ ...p, ...patch }))),

      addItem: (id, modeId) => set((s) => mapPlaylist(s, id, (p) => ({ ...p, items: [...p.items, item(modeId)] }))),

      updateItem: (id, itemId, patch) =>
        set((s) => mapPlaylist(s, id, (p) => ({
          ...p,
          items: p.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
        }))),

      removeItem: (id, itemId) =>
        set((s) => mapPlaylist(s, id, (p) => ({ ...p, items: p.items.filter((i) => i.id !== itemId) }))),

      moveItem: (id, from, to) =>
        set((s) => mapPlaylist(s, id, (p) => {
          const items = [...p.items];
          const [moved] = items.splice(from, 1);
          items.splice(Math.max(0, Math.min(to, items.length)), 0, moved);
          return { ...p, items };
        })),

      importJson: (json) => {
        const raw = JSON.parse(json) as Partial<Playlist>;
        if (!Array.isArray(raw.items)) throw new Error('Keine gültige Playlist-Datei.');
        const playlist: Playlist = {
          id: uid(),
          name: String(raw.name ?? 'Importiert'),
          defaultDuration: Number(raw.defaultDuration) > 0 ? Number(raw.defaultDuration) : 180,
          order: raw.order === 'shuffle' ? 'shuffle' : 'sequential',
          transition: isTransitionChoice(raw.transition) ? raw.transition : undefined,
          items: raw.items
            .filter((i): i is PlaylistItem => typeof i?.modeId === 'string')
            .map((i) => ({
              id: uid(),
              modeId: i.modeId,
              duration: Number(i.duration) > 0 ? Number(i.duration) : undefined,
              paletteId: typeof i.paletteId === 'string' ? i.paletteId : undefined,
            })),
        };
        set((s) => ({ playlists: [...s.playlists, playlist] }));
        return playlist.id;
      },
    }),
    {
      name: 'pulse-playlists',
      version: 3,
      // Neue Vorlagen ergänzen, Verweise auf entfernte Modi streichen
      migrate: (persisted, version) => {
        const state = persisted as { playlists?: Playlist[] };
        let playlists = state.playlists ?? [];
        if (version < 2) {
          const have = new Set(playlists.map((p) => p.id));
          playlists = [...playlists, ...SEED.filter((p) => !have.has(p.id))];
        }
        // Umbenannte und ersetzte Modi übernehmen statt verlieren
        const renamed: Record<string, string> = { rorschach: 'ink-bloom', 'soap-bubble': 'liquid-pearl' };
        const known = new Set(MODES.map((m) => m.meta.id));
        playlists = playlists.map((p) => ({
          ...p,
          items: p.items
            .map((i) => (renamed[i.modeId] ? { ...i, modeId: renamed[i.modeId] } : i))
            .filter((i) => known.has(i.modeId)),
        }));
        return { ...state, playlists } as PlaylistState;
      },
    },
  ),
);

// Ohne interne IDs
export function exportPlaylist(p: Playlist): string {
  return JSON.stringify(
    {
      name: p.name,
      defaultDuration: p.defaultDuration,
      order: p.order,
      transition: p.transition,
      items: p.items.map(({ modeId, duration, paletteId }) => ({ modeId, duration, paletteId })),
    },
    null,
    2,
  );
}
