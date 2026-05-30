import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, ListMusic, Maximize2, Pin, SlidersHorizontal } from 'lucide-react';
import type { Engine } from '../engine/Engine';
import { useSettings } from '../store/settings';
import { CATEGORY_LABEL, modeArt } from './modeArt';
import { ICON, cn, ui } from './ui';

// Blendet ein Element aus, sobald <App> data-idle setzt
export const hideWhenIdle =
  'transition duration-700 group-data-[idle=true]/app:pointer-events-none group-data-[idle=true]/app:opacity-0';

interface TopBarProps {
  sourceLabel: string | null;
  settingsOpen: boolean;
  onPickSource: () => void;
  onToggleSettings: () => void;
  onToggleFullscreen: () => void;
}

export function TopBar({ sourceLabel, settingsOpen, onPickSource, onToggleSettings, onToggleFullscreen }: TopBarProps) {
  return (
    <header
      className={cn(
        'absolute inset-x-0 top-0 flex h-64 items-center justify-between bg-linear-to-b from-studio-black/55 to-transparent px-24',
        hideWhenIdle,
        'group-data-[idle=true]/app:-translate-y-8',
      )}
    >
      <span className={ui.wordmark}>Pulse</span>
      <div className="flex items-center gap-4">
        <button className={ui.btn} onClick={onPickSource} title="Audioquelle wechseln">
          <span
            className={cn(
              'size-[6px] rounded-full',
              sourceLabel ? 'bg-warm-cream shadow-[0_0_0_3px_rgb(247_244_239/0.12)]' : 'bg-smoke/50',
            )}
          />
          <span className="max-w-[220px] truncate">{sourceLabel ?? 'Keine Quelle'}</span>
        </button>
        <button
          className={cn(ui.btn, ui.btnOutlined, settingsOpen && ui.btnActive)}
          onClick={onToggleSettings}
          title="Einstellungen (S)"
        >
          <SlidersHorizontal {...ICON} /> Einstellungen
        </button>
        <button className={cn(ui.btn, ui.btnIcon)} onClick={onToggleFullscreen} title="Vollbild (F)">
          <Maximize2 {...ICON} />
        </button>
      </div>
    </header>
  );
}

interface PlayerProps {
  engine: Engine;
  browserOpen: boolean;
  playbackOpen: boolean;
  onToggleBrowser: () => void;
  onTogglePlayback: () => void;
}

export function PlayerBar({ engine, browserOpen, playbackOpen, onToggleBrowser, onTogglePlayback }: PlayerProps) {
  const modeId = useSettings((s) => s.playback.modeId);
  const hold = useSettings((s) => s.playback.hold);
  const setPlayback = useSettings((s) => s.setPlayback);
  const meta = engine.modes.find((m) => m.id === modeId) ?? engine.modes[0];
  const progressRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState(() => engine.playback.status);

  useEffect(() => {
    const id = window.setInterval(() => setStatus(engine.playback.status), 250);
    return () => clearInterval(id);
  }, [engine]);

  // Direkt am DOM statt per React-State
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = engine.playback.status.progress;
      const el = progressRef.current;
      if (!el) return;
      el.style.opacity = p === null ? '0' : '1';
      el.style.transform = `scaleX(${p ?? 0})`;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div
      className={cn(
        'absolute bottom-24 left-1/2 flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 items-center gap-12 p-8',
        ui.surface,
        hideWhenIdle,
        'group-data-[idle=true]/app:translate-y-8',
      )}
    >
      <span className={cn(ui.art, 'size-[44px]')} style={modeArt(meta.id)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-sm leading-[1.3] font-normal">{meta.name}</span>
        <span className="truncate text-caption text-smoke" title={meta.description}>
          {status.label}
          {status.position && ` · ${status.position}`}
          {status.hold ? ' · gehalten' : status.waitingForBeat ? ' · wartet auf den Beat' : ` · ${CATEGORY_LABEL[meta.category]}`}
        </span>
      </div>
      <div className="flex items-center gap-[2px]">
        <button className={cn(ui.btn, ui.btnIcon)} onClick={() => engine.nextMode(-1)} title="Vorheriger Modus (←)">
          <ChevronLeft {...ICON} />
        </button>
        <button className={cn(ui.btn, ui.btnIcon)} onClick={() => engine.nextMode(1)} title="Nächster Modus (→)">
          <ChevronRight {...ICON} />
        </button>
        <button
          className={cn(ui.btn, ui.btnIcon, hold && ui.btnActive)}
          onClick={() => setPlayback({ hold: !hold })}
          title={hold ? 'Timer freigeben (Leertaste)' : 'Aktuellen Modus halten (Leertaste)'}
          aria-pressed={hold}
        >
          <Pin {...ICON} />
        </button>
        <button
          className={cn(ui.btn, ui.btnIcon, browserOpen && ui.btnActive)}
          onClick={onToggleBrowser}
          title="Alle Modi (M)"
        >
          <LayoutGrid {...ICON} />
        </button>
        <button
          className={cn(ui.btn, ui.btnIcon, playbackOpen && ui.btnActive)}
          onClick={onTogglePlayback}
          title="Wiedergabe & Playlists (P)"
        >
          <ListMusic {...ICON} />
        </button>
      </div>
      <span className="absolute inset-x-12 -bottom-px h-px overflow-hidden">
        <i ref={progressRef} className="block h-full origin-left bg-warm-cream/40" />
      </span>
    </div>
  );
}
