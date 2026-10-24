import { useEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Engine } from '../engine/Engine';
import type { Track } from '../media/nowPlaying';
import { useSettings } from '../store/settings';
import { openLink, type SendToDisplay } from './link';

// Nur die Desktop-App kann Fenster auf andere Monitore legen
export const canUseDisplays = isTauri;

export interface MonitorInfo {
  id: string;
  width: number;
  height: number;
  primary: boolean;
  // Das Hauptfenster liegt auf diesem Monitor
  current: boolean;
}

export function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>('monitors');
}

// Hält das Ausgabefenster passend zu ui.displayMonitor; true, solange es rendert
export function useDisplayOutput(engine: Engine | null, track: Track | null): boolean {
  const monitor = useSettings((s) => s.ui.displayMonitor);
  const active = canUseDisplays() && engine !== null && monitor !== null;
  const send = useRef<SendToDisplay | null>(null);
  const trackRef = useRef(track);
  trackRef.current = track;

  // display_set öffnet, verschiebt oder schließt und ist idempotent
  useEffect(() => {
    if (!canUseDisplays()) return;
    invoke('display_set', { monitor }).catch(() => useSettings.getState().setUi({ displayMonitor: null }));
  }, [monitor]);

  // Z. B. per Esc im Ausgabefenster geschlossen
  useEffect(() => {
    if (!canUseDisplays()) return;
    const off = listen('display-closed', () => useSettings.getState().setUi({ displayMonitor: null }));
    return () => void off.then((f) => f());
  }, []);

  useEffect(() => {
    if (!engine || !active) return;
    const link = openLink((m) => {
      if (m.type === 'tick') engine.tick();
      else if (m.type === 'hello') {
        engine.syncRemote();
        link.send({ type: 'track', track: trackRef.current });
      } else if (m.type === 'next') engine.nextMode(m.direction);
      else if (m.type === 'stats') Object.assign(engine.stats, { renderScale: m.renderScale, width: m.width, height: m.height });
    });
    engine.setRemote(link.send);
    send.current = link.send;
    return () => {
      send.current = null;
      engine.setRemote(null);
      link.close();
    };
  }, [engine, active]);

  // Titelanzeige läuft im Ausgabefenster mit
  useEffect(() => {
    send.current?.({ type: 'track', track });
  }, [track, active]);

  return active;
}
