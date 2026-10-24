import { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, X } from 'lucide-react';
import { useSettings, type NowPlayingMode } from '../store/settings';
import { PALETTES, STANDARD_PALETTE } from '../engine/palette';
import { ICON, cn, ui } from './ui';
import { Group, Slider, Switch } from './controls';
import { canUpdate, useUpdater, type UpdateStatus } from '../update/updater';
import { canUseDisplays, listMonitors, type MonitorInfo } from '../display/output';

// Standard = Originalfarben, Vorschau als bunte Streifen
const STANDARD_ENTRY = {
  id: STANDARD_PALETTE,
  name: 'Standard',
  stops: ['#ff3a5c 0 20%', '#ffb23a 20% 40%', '#3aff9a 40% 60%', '#3a9aff 60% 80%', '#b23aff 80%'],
};

type Tab = 'audio' | 'look' | 'performance' | 'about';

const NOW_PLAYING_OPTIONS: { value: NowPlayingMode; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'change', label: 'On track change' },
  { value: 'off', label: 'Off' },
];

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'look', label: 'Look' },
  { id: 'performance', label: 'Performance' },
  { id: 'about', label: 'About' },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('audio');
  const reset = useSettings((s) => s.reset);
  const updateReady = useUpdater((s) => s.status.kind === 'available');

  return (
    <aside
      className={cn(
        'absolute top-72 right-16 bottom-16 flex w-[340px] animate-slide-in flex-col max-sm:left-16 max-sm:w-auto',
        ui.surface,
        'bg-deep-anvil/92!',
      )}
      aria-label="Settings"
    >
      <header className="flex items-center justify-between pt-12 pr-12 pl-16">
        <h2 className="text-[13px] font-medium">Settings</h2>
        <button className={cn(ui.btn, ui.btnIcon)} onClick={onClose} title="Close (S)">
          <X {...ICON} />
        </button>
      </header>
      <nav className="flex gap-4 border-b border-white/8 px-16 py-12" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={cn(ui.chip, tab === t.id && ui.chipOn)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'about' && updateReady && <i className="size-[6px] rounded-full bg-ember-coral" aria-label="Update available" />}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto px-16 pt-8 pb-16 [scrollbar-width:thin]">
        {tab === 'audio' && <AudioTab />}
        {tab === 'look' && <LookTab />}
        {tab === 'performance' && <PerformanceTab />}
        {tab === 'about' && <AboutTab />}
      </div>
      <footer className="flex items-center justify-between border-t border-white/8 px-16 py-12">
        <small className="text-caption text-smoke">Changes apply instantly</small>
        <button className={ui.btn} onClick={reset}>
          <RotateCcw size={14} strokeWidth={1.5} /> Reset
        </button>
      </footer>
    </aside>
  );
}

function AudioTab() {
  const audio = useSettings((s) => s.audio);
  const set = useSettings((s) => s.setAudio);
  return (
    <>
      <Group title="Levels">
        <Slider label="Sensitivity" value={audio.sensitivity} min={0.2} max={3} step={0.05} format={times} onChange={(v) => set({ sensitivity: v })} />
        <Switch label="Auto-Gain" value={audio.autoGain} onChange={(v) => set({ autoGain: v })} />
        <Slider label="Beat threshold" value={audio.beatThreshold} min={0.5} max={3} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set({ beatThreshold: v })} />
      </Group>
      <Group title="Smoothing">
        <Slider label="Attack" value={audio.attack * 1000} min={1} max={200} step={1} format={ms} onChange={(v) => set({ attack: v / 1000 })} />
        <Slider label="Release" value={audio.release * 1000} min={20} max={1500} step={10} format={ms} onChange={(v) => set({ release: v / 1000 })} />
      </Group>
      <Group title="Frequency bands">
        <Slider label="Bass up to" value={audio.bassCutoff} min={60} max={500} step={10} format={hz} onChange={(v) => set({ bassCutoff: v })} />
        <Slider label="Highs from" value={audio.trebleCutoff} min={1500} max={10000} step={100} format={hz} onChange={(v) => set({ trebleCutoff: v })} />
        <Slider label="Bass" value={audio.bassGain} min={0} max={2.5} step={0.05} format={times} onChange={(v) => set({ bassGain: v })} />
        <Slider label="Mids" value={audio.midGain} min={0} max={2.5} step={0.05} format={times} onChange={(v) => set({ midGain: v })} />
        <Slider label="Highs" value={audio.trebleGain} min={0} max={2.5} step={0.05} format={times} onChange={(v) => set({ trebleGain: v })} />
      </Group>
    </>
  );
}

function LookTab() {
  const visual = useSettings((s) => s.visual);
  const set = useSettings((s) => s.setVisual);
  const nowPlaying = useSettings((s) => s.ui.nowPlaying);
  const setUi = useSettings((s) => s.setUi);
  return (
    <>
      <Group title="Now playing">
        <div className="mb-16 flex gap-4">
          {NOW_PLAYING_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={cn(ui.chip, nowPlaying === o.value && ui.chipOn)}
              onClick={() => setUi({ nowPlaying: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Group>
      <Group title="Palette">
        <div className="mb-16 grid grid-cols-4 gap-8">
          {[STANDARD_ENTRY, ...PALETTES].map((p) => (
            <button
              key={p.id}
              className={cn(
                'group flex flex-col gap-[6px] text-left text-[11px] font-normal',
                visual.paletteId === p.id ? 'text-warm-cream' : 'text-smoke',
              )}
              onClick={() => set({ paletteId: p.id })}
            >
              <span
                className={cn(
                  'block h-[28px] rounded-md transition-shadow',
                  visual.paletteId === p.id
                    ? 'shadow-[0_0_0_1px_var(--color-deep-anvil),0_0_0_2px_var(--color-warm-cream)]'
                    : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] group-hover:shadow-[inset_0_0_0_1px_rgb(247_244_239/0.4)]',
                )}
                style={{ background: `linear-gradient(90deg, ${p.stops.join(', ')})` }}
              />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Glow">
        <Slider label="Bloom" value={visual.bloomIntensity} min={0} max={4} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set({ bloomIntensity: v })} />
        <Slider label="Threshold" value={visual.bloomThreshold} min={0} max={1.5} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set({ bloomThreshold: v })} />
        <Slider label="Radius" value={visual.bloomRadius} min={0.1} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set({ bloomRadius: v })} />
        <Slider label="Reacts to bass" value={visual.bloomReactive} min={0} max={2} step={0.05} format={percent(2)} onChange={(v) => set({ bloomReactive: v })} />
      </Group>
      <Group title="Lens">
        <Slider label="Chromatic aberration" value={visual.chromaticAberration} min={0} max={1.5} step={0.01} format={percent(1.5)} onChange={(v) => set({ chromaticAberration: v })} />
        <Slider label="Film grain" value={visual.grain} min={0} max={0.3} step={0.005} format={percent(0.3)} onChange={(v) => set({ grain: v })} />
        <Slider label="Vignette" value={visual.vignette} min={0} max={1} step={0.01} format={percent(1)} onChange={(v) => set({ vignette: v })} />
      </Group>
    </>
  );
}

function PerformanceTab() {
  const visual = useSettings((s) => s.visual);
  const ui = useSettings((s) => s.ui);
  const set = useSettings((s) => s.setVisual);
  const setUi = useSettings((s) => s.setUi);
  return (
    <>
      {canUseDisplays() && <OutputGroup />}
      <Group title="Rendering">
        <Slider label="Resolution" value={visual.renderScale * 100} min={40} max={100} step={5} format={(v) => `${v.toFixed(0)} %`} onChange={(v) => set({ renderScale: v / 100 })} />
        <Switch label="Dynamic resolution" value={visual.dynamicResolution} onChange={(v) => set({ dynamicResolution: v })} />
        <Switch label="Show HUD" value={ui.showHud} onChange={(v) => setUi({ showHud: v })} />
      </Group>
    </>
  );
}

// Visuals im Vollbild auf einem anderen Monitor, die Bedienung bleibt hier
function OutputGroup() {
  const selected = useSettings((s) => s.ui.displayMonitor);
  const setUi = useSettings((s) => s.setUi);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

  useEffect(() => {
    void listMonitors().then(setMonitors, () => setMonitors([]));
  }, [selected]);

  return (
    <Group title="Show visuals on">
      <div className="mb-16 flex flex-col items-start gap-4">
        <button className={cn(ui.chip, selected === null && ui.chipOn)} onClick={() => setUi({ displayMonitor: null })}>
          This window
        </button>
        {monitors.map((m, i) => (
          <button
            key={m.id}
            className={cn(ui.chip, selected === m.id && ui.chipOn)}
            onClick={() => setUi({ displayMonitor: m.id })}
            title={m.current ? 'The visuals will cover this window. Press Esc on that screen to return.' : undefined}
          >
            Monitor {i + 1}
            <span className="font-light text-smoke tabular-nums">
              {m.width}×{m.height}
              {m.primary && ' · primary'}
              {m.current && ' · this screen'}
            </span>
          </button>
        ))}
      </div>
    </Group>
  );
}

function AboutTab() {
  const status = useUpdater((s) => s.status);
  const check = useUpdater((s) => s.check);
  const install = useUpdater((s) => s.install);
  const version = useUpdater((s) => s.version);
  const autoUpdate = useSettings((s) => s.ui.autoUpdate);
  const setUi = useSettings((s) => s.setUi);
  const busy = status.kind === 'checking' || status.kind === 'downloading' || status.kind === 'restarting';
  return (
    <Group title="Version">
      <p className="mb-16 flex items-baseline justify-between text-[13px] font-normal">
        Pulse
        <span className="text-caption font-light text-smoke tabular-nums">{version}</span>
      </p>
      {canUpdate() ? (
        <>
          <p className="mb-12 text-caption text-smoke" aria-live="polite">
            {updateText(status)}
          </p>
          <div className="mb-16 flex gap-8">
            {status.kind === 'available' ? (
              <button className={cn(ui.create, 'h-32 px-16 text-[13px]')} onClick={() => void install()}>
                Update to {status.version}
              </button>
            ) : (
              <button className={cn(ui.btn, ui.btnOutlined)} disabled={busy} onClick={() => void check(true)}>
                <RefreshCw size={14} strokeWidth={1.5} className={cn(status.kind === 'checking' && 'animate-spin')} /> Check for updates
              </button>
            )}
          </div>
          <Switch label="Check automatically" value={autoUpdate} onChange={(v) => setUi({ autoUpdate: v })} />
        </>
      ) : (
        <p className="mb-16 text-caption text-smoke">The web app is always up to date.</p>
      )}
    </Group>
  );
}

function updateText(status: UpdateStatus) {
  switch (status.kind) {
    case 'checking': return 'Checking for updates…';
    case 'current': return 'You are on the latest version.';
    case 'available': return status.error ? `Update failed: ${status.error}` : `Version ${status.version} is ready to install.`;
    case 'downloading': return status.progress === null ? 'Downloading…' : `Downloading… ${Math.round(status.progress * 100)} %`;
    case 'restarting': return 'Installing and restarting…';
    case 'error': return `Could not check for updates: ${status.message}`;
    default: return 'Updates install in the background and Pulse restarts.';
  }
}

const times = (v: number) => `${v.toFixed(2)}×`;
const ms = (v: number) => `${v.toFixed(0)} ms`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v.toFixed(0)} Hz`);
const percent = (max: number) => (v: number) => `${Math.round((v / max) * 100)} %`;
