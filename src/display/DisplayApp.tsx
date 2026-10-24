import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Engine } from '../engine/Engine';
import { SETTINGS_KEY, useSettings } from '../store/settings';
import type { Track } from '../media/nowPlaying';
import { NowPlaying } from '../ui/NowPlaying';
import { openLink } from './link';

// Ausgabefenster auf dem gewählten Monitor: rendert nur, gesteuert vom Hauptfenster
export function DisplayApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const nowPlaying = useSettings((s) => s.ui.nowPlaying);

  useEffect(() => {
    const engine = new Engine(canvasRef.current!, { follower: true });
    engine.start();
    if (import.meta.env.DEV) Object.assign(window, { __pulse: engine });
    const link = openLink((m) => {
      if (m.type === 'frame') engine.receive(m.features, m.palette);
      else if (m.type === 'mode') void engine.setMode(m.id, m.seconds, m.transition);
      else if (m.type === 'track') setTrack(m.track);
    });
    link.send({ type: 'hello' });
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      link.send({ type: 'tick' });
    };
    tick();
    const stats = window.setInterval(() => {
      const { renderScale, width, height } = engine.stats;
      link.send({ type: 'stats', renderScale, width, height });
    }, 500);

    // Einstellungen speichert nur das Hauptfenster, hier nur nachladen
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) void useSettings.persist.rehydrate();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') link.send({ type: 'next', direction: 1 });
      else if (e.key === 'ArrowLeft') link.send({ type: 'next', direction: -1 });
      else if (e.key === 'Escape' && isTauri()) void invoke('display_set', { monitor: null });
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      clearInterval(stats);
      link.close();
      engine.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 cursor-none bg-pure-ink">
      <canvas ref={canvasRef} className="block size-full" />
      <NowPlaying track={track} mode={nowPlaying} chromeVisible={false} />
    </div>
  );
}
