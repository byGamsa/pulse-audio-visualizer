import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';

// Nur die Desktop-App aktualisiert sich selbst, die Web-App ist immer aktuell
export const canUpdate = isTauri;

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  // error: der letzte Installationsversuch ist gescheitert
  | { kind: 'available'; version: string; error?: string }
  // progress 0..1, null solange die Größe unbekannt ist
  | { kind: 'downloading'; version: string; progress: number | null }
  | { kind: 'restarting'; version: string }
  | { kind: 'error'; message: string };

interface UpdaterState {
  // Desktop: Version aus tauri.conf.json, Web: aus package.json (vite.config.ts)
  version: string;
  status: UpdateStatus;
  // „Später“ blendet den Hinweis bis zum nächsten Start aus
  dismissed: boolean;
  check: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

// Das Update-Objekt gehört nicht in den Store (nicht serialisierbar)
let pending: Update | null = null;

export const useUpdater = create<UpdaterState>()((set, get) => ({
  version: __APP_VERSION__,
  status: { kind: 'idle' },
  dismissed: false,

  check: async (manual = false) => {
    if (!canUpdate()) return;
    const busy = get().status.kind;
    if (busy === 'checking' || busy === 'downloading' || busy === 'restarting') return;
    set({ status: { kind: 'checking' }, dismissed: manual ? false : get().dismissed });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      pending = update;
      set({
        status: update ? { kind: 'available', version: update.version } : { kind: 'current' },
      });
    } catch (e) {
      // Automatische Prüfung (z. B. offline) stört nicht, nur die manuelle meldet Fehler
      set({ status: manual ? { kind: 'error', message: errorText(e) } : { kind: 'idle' } });
    }
  },

  install: async () => {
    const update = pending;
    if (!update) return;
    const version = update.version;
    let total = 0;
    let loaded = 0;
    set({ status: { kind: 'downloading', version, progress: null } });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        else if (event.event === 'Progress') {
          loaded += event.data.chunkLength;
          set({ status: { kind: 'downloading', version, progress: total ? Math.min(1, loaded / total) : null } });
        }
      });
      // Unter Windows beendet der Installer die App schon vorher
      set({ status: { kind: 'restarting', version } });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      set({ status: { kind: 'available', version, error: errorText(e) } });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

if (canUpdate()) {
  void import('@tauri-apps/api/app').then(({ getVersion }) => getVersion()).then((version) => useUpdater.setState({ version }));
}

// Beim Start kurz warten, damit die Prüfung den Start nicht ausbremst, danach alle 6 h
export function startUpdateChecks() {
  if (!canUpdate()) return () => {};
  const check = () => void useUpdater.getState().check();
  const first = window.setTimeout(check, 5000);
  const every = window.setInterval(check, 6 * 60 * 60 * 1000);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
