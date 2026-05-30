import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TransitionChoice } from '../engine/transitions';

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
    }),
    { name: 'pulse-playlists', version: 1 },
  ),
);
