import { useState } from 'react';
import { AudioLines, X } from 'lucide-react';
import { hasAccount } from '../account/account';
import type { Engine } from '../engine/Engine';
import { useModes } from '../engine/ModeRegistry';
import type { ModeCategory } from '../engine/types';
import { useSettings } from '../store/settings';
import { CATEGORY_LABEL, modeArt } from './modeArt';
import { StoreView } from './StoreView';
import { ICON, cn, ui } from './ui';

export function ModeBrowser({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const [view, setView] = useState<'installed' | 'store'>('installed');
  const count = useModes().length;

  return (
    <>
      <div className="absolute inset-0 bg-pure-ink/35" onClick={onClose} />
      <div
        className={cn(
          'absolute bottom-[92px] left-1/2 flex h-[min(60vh,520px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 animate-rise flex-col p-8',
          ui.surface,
        )}
        role="dialog"
        aria-label="Modes"
      >
        <div className="flex items-center justify-between px-8 pt-8 pb-12">
          {hasAccount() ? (
            <div className="flex gap-4" role="tablist">
              <button
                role="tab"
                aria-selected={view === 'installed'}
                className={cn(ui.chip, view === 'installed' && ui.chipOn)}
                onClick={() => setView('installed')}
              >
                Modes <span className="font-light text-smoke">{count}</span>
              </button>
              <button
                role="tab"
                aria-selected={view === 'store'}
                className={cn(ui.chip, view === 'store' && ui.chipOn)}
                onClick={() => setView('store')}
              >
                Store
              </button>
            </div>
          ) : (
            <h2 className="text-[13px] font-medium">
              Modes <span className="ml-4 font-light text-smoke">{count}</span>
            </h2>
          )}
          <button className={cn(ui.btn, ui.btnIcon)} onClick={onClose} title="Close (M)">
            <X {...ICON} />
          </button>
        </div>
        {view === 'store' ? <StoreView /> : <InstalledList engine={engine} />}
      </div>
    </>
  );
}

function InstalledList({ engine }: { engine: Engine }) {
  const modeId = useSettings((s) => s.playback.modeId);
  const [filter, setFilter] = useState<ModeCategory | 'all'>('all');
  const modes = useModes();
  const categories = [...new Set(modes.map((m) => m.category))];
  const visible = filter === 'all' ? modes : modes.filter((m) => m.category === filter);

  return (
    <>
      <div className="flex flex-wrap gap-4 px-8 pb-8">
        <button className={cn(ui.chip, filter === 'all' && ui.chipOn)} onClick={() => setFilter('all')}>
          All
        </button>
        {categories.map((c) => (
          <button key={c} className={cn(ui.chip, filter === c && ui.chipOn)} onClick={() => setFilter(c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-[2px] overflow-y-auto [scrollbar-width:thin]">
        {visible.map((m) => (
          <button
            key={m.id}
            className={cn(
              'flex w-full items-center gap-12 rounded-md p-8 text-left transition-colors hover:bg-white/6',
              m.id === modeId && 'bg-white/6',
            )}
            onClick={() => engine.playback.select(m.id)}
          >
            <span className={cn(ui.art, 'h-[54px] w-[96px]')} style={modeArt(m.id)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-8 text-body-sm font-normal">
                {m.name} <span className={ui.tag}>{CATEGORY_LABEL[m.category]}</span>
              </span>
              <span className="block truncate text-caption text-smoke">{m.description}</span>
            </span>
            {m.id === modeId && <AudioLines className="shrink-0 text-warm-cream/60" {...ICON} />}
          </button>
        ))}
      </div>
    </>
  );
}
