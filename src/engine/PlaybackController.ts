import type { AudioFeatures } from '../audio/types';
import { usePlaylists } from '../store/playlists';
import { useSettings, type PlaybackMode } from '../store/settings';
import { MODES } from './ModeRegistry';
import type { TransitionChoice } from './transitions';

export interface PlaybackTarget {
  setMode(id: string, transitionSeconds?: number, transition?: TransitionChoice): Promise<void>;
  setPaletteOverride(id: string | null): void;
}

interface Entry {
  modeId: string;
  duration: number;
  paletteId?: string;
}

export interface PlaybackStatus {
  kind: PlaybackMode['kind'];
  // Playlist-Name, „Shuffle“ oder „Single“
  label: string;
  // z. B. „3 / 7“, null wenn nicht sinnvoll
  position: string | null;
  // 0..1 bis zum nächsten Wechsel, null ohne Timer
  progress: number | null;
  waitingForBeat: boolean;
  hold: boolean;
}

export class PlaybackController {
  private key = '';
  private index = -1;
  private elapsed = 0;
  private duration = 0;
  private waited = 0;
  private waiting = false;
  // Shuffle-Bag: Reihenfolge der noch nicht gespielten Indizes
  private bag: number[] = [];
  private history: number[] = [];

  constructor(private readonly target: PlaybackTarget) {}

  update(dt: number, audio: AudioFeatures) {
    const pb = useSettings.getState().playback;
    const key = JSON.stringify(pb.mode) + (pb.mode.kind === 'shuffle' ? pb.shuffleDuration : '');
    if (key !== this.key) {
      this.key = key;
      this.restart();
    }

    const entries = this.entries();
    if (pb.mode.kind === 'single' || pb.hold || entries.length === 0) {
      this.waiting = false;
      return;
    }
    // Dauer live nachziehen, falls sie im Editor geändert wurde
    const current = entries[this.index];
    if (current) this.duration = current.duration;

    this.elapsed += dt;
    if (this.elapsed < this.duration) return;
    if (entries.length < 2) {
      this.elapsed = 0;
      return;
    }
    if (pb.beatSync) {
      this.waiting = true;
      this.waited += dt;
      if (!audio.beat) return;
    }
    this.advance(1);
  }

  // Manuell vor/zurück (Pfeiltasten, Buttons)
  next(direction: 1 | -1) {
    const pb = useSettings.getState().playback;
    if (pb.mode.kind === 'single') {
      // Single bleibt Single, man blättert nur durch alle Modi
      const ids = MODES.map((m) => m.meta.id);
      const i = ids.indexOf(pb.modeId);
      void this.target.setMode(ids[(i + direction + ids.length) % ids.length]);
      return;
    }
    this.advance(direction);
  }

  // Ein Modus wurde explizit gewählt (Modus-Browser)
  select(modeId: string) {
    const pb = useSettings.getState().playback;
    const entries = this.entries();
    const i = entries.findIndex((e) => e.modeId === modeId);
    if (pb.mode.kind !== 'single' && i >= 0) {
      this.play(i);
      return;
    }
    // Nicht in der aktuellen Auswahl: auf diesem Modus festhalten
    if (pb.mode.kind !== 'single') useSettings.getState().setPlayback({ mode: { kind: 'single' } });
    this.target.setPaletteOverride(null);
    void this.target.setMode(modeId);
  }

  get status(): PlaybackStatus {
    const pb = useSettings.getState().playback;
    const entries = this.entries();
    const kind = pb.mode.kind;
    let label = 'Single';
    if (kind === 'shuffle') label = 'Shuffle';
    if (pb.mode.kind === 'playlist') {
      const id = pb.mode.playlistId;
      label = usePlaylists.getState().playlists.find((p) => p.id === id)?.name ?? 'Playlist';
    }
    const timed = kind !== 'single' && entries.length > 1;
    return {
      kind,
      label,
      position: kind === 'playlist' && this.index >= 0 ? `${this.index + 1} / ${entries.length}` : null,
      progress: timed && this.duration > 0 ? Math.min(this.elapsed / this.duration, 1) : null,
      waitingForBeat: this.waiting,
      hold: pb.hold,
    };
  }

  private entries(): Entry[] {
    const pb = useSettings.getState().playback;
    const mode = pb.mode;
    if (mode.kind === 'playlist') {
      const p = usePlaylists.getState().playlists.find((x) => x.id === mode.playlistId);
      if (!p) return [];
      return p.items
        .filter((i) => MODES.some((m) => m.meta.id === i.modeId))
        .map((i) => ({ modeId: i.modeId, duration: i.duration ?? p.defaultDuration, paletteId: i.paletteId }));
    }
    if (mode.kind === 'shuffle') {
      return MODES.filter((m) => mode.categories.length === 0 || mode.categories.includes(m.meta.category)).map(
        (m) => ({ modeId: m.meta.id, duration: pb.shuffleDuration }),
      );
    }
    return [];
  }

  private isShuffled(): boolean {
    const mode = useSettings.getState().playback.mode;
    if (mode.kind === 'shuffle') return true;
    if (mode.kind === 'playlist') {
      return usePlaylists.getState().playlists.find((p) => p.id === mode.playlistId)?.order === 'shuffle';
    }
    return false;
  }

  // Laufender Modus läuft weiter, wenn er dazugehört
  private restart() {
    this.bag = [];
    this.history = [];
    this.elapsed = 0;
    this.waited = 0;
    this.waiting = false;
    const pb = useSettings.getState().playback;
    const entries = this.entries();
    if (pb.mode.kind === 'single' || entries.length === 0) {
      this.index = -1;
      if (pb.mode.kind === 'single') this.target.setPaletteOverride(null);
      return;
    }
    const i = entries.findIndex((e) => e.modeId === pb.modeId);
    if (i >= 0) {
      this.index = i;
      this.duration = entries[i].duration;
      this.target.setPaletteOverride(entries[i].paletteId ?? null);
    } else {
      this.index = -1;
      this.advance(1);
    }
  }

  private advance(direction: 1 | -1) {
    const n = this.entries().length;
    if (n === 0) return;
    let next: number;
    if (this.isShuffled()) {
      if (direction < 0 && this.history.length > 0) {
        next = this.history.pop()!;
      } else {
        if (this.bag.length === 0) this.bag = this.shuffledBag(n);
        next = this.bag.shift()!;
        if (this.index >= 0) this.history.push(this.index);
        if (this.history.length > 50) this.history.shift();
      }
    } else {
      next = this.index < 0 ? 0 : (this.index + direction + n) % n;
    }
    this.play(next);
  }

  private shuffledBag(n: number): number[] {
    const bag = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  private play(i: number) {
    const entry = this.entries()[i];
    if (!entry) return;
    this.index = i;
    this.elapsed = 0;
    this.waited = 0;
    this.waiting = false;
    this.duration = entry.duration;
    this.target.setPaletteOverride(entry.paletteId ?? null);
    void this.target.setMode(entry.modeId, undefined, this.transitionChoice());
  }

  // Playlists dürfen einen eigenen Übergang haben, sonst gilt der globale
  private transitionChoice(): TransitionChoice {
    const pb = useSettings.getState().playback;
    if (pb.mode.kind === 'playlist') {
      const id = pb.mode.playlistId;
      const own = usePlaylists.getState().playlists.find((p) => p.id === id)?.transition;
      if (own) return own;
    }
    return pb.transition;
  }
}
