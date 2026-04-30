import { ChevronLeft, ChevronRight, Maximize2, SlidersHorizontal } from 'lucide-react';
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
}

export function PlayerBar({ engine }: PlayerProps) {
  const modeId = useSettings((s) => s.playback.modeId);
  const meta = engine.modes.find((m) => m.id === modeId) ?? engine.modes[0];
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
          {CATEGORY_LABEL[meta.category]}
        </span>
      </div>
      <div className="flex items-center gap-[2px]">
        <button className={cn(ui.btn, ui.btnIcon)} onClick={() => engine.nextMode(-1)} title="Vorheriger Modus (←)">
          <ChevronLeft {...ICON} />
        </button>
        <button className={cn(ui.btn, ui.btnIcon)} onClick={() => engine.nextMode(1)} title="Nächster Modus (→)">
          <ChevronRight {...ICON} />
        </button>
      </div>
    </div>
  );
}
