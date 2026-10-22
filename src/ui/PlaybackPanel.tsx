import { useRef, useState } from 'react';
import { AudioLines, Copy, Download, GripVertical, Plus, Trash2, Upload, X } from 'lucide-react';
import type { Engine } from '../engine/Engine';
import { useModes } from '../engine/ModeRegistry';
import { PALETTES } from '../engine/palette';
import type { ModeCategory } from '../engine/types';
import { TRANSITION_CHOICES, TRANSITION_LABEL, type TransitionChoice } from '../engine/transitions';
import { exportPlaylist, usePlaylists, type Playlist } from '../store/playlists';
import { useSettings, type PlaybackMode } from '../store/settings';
import { Group, Slider, Switch } from './controls';
import { CATEGORY_LABEL, modeArt } from './modeArt';
import { ICON, cn, fmtDuration, select, ui } from './ui';

const KINDS: { kind: PlaybackMode['kind']; label: string }[] = [
  { kind: 'playlist', label: 'Playlist' },
  { kind: 'shuffle', label: 'Shuffle' },
  { kind: 'single', label: 'Single' },
];

const DURATIONS = [30, 60, 90, 120, 180, 300, 600];

export function PlaybackPanel({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const playback = useSettings((s) => s.playback);
  const setPlayback = useSettings((s) => s.setPlayback);
  const playlists = usePlaylists((s) => s.playlists);

  const setKind = (kind: PlaybackMode['kind']) => {
    if (kind === playback.mode.kind) return;
    if (kind === 'playlist') {
      const first = playlists[0] ?? null;
      const id = first ? first.id : usePlaylists.getState().create();
      setPlayback({ mode: { kind: 'playlist', playlistId: id } });
    } else if (kind === 'shuffle') {
      setPlayback({ mode: { kind: 'shuffle', categories: [] } });
    } else {
      setPlayback({ mode: { kind: 'single' } });
    }
  };

  return (
    <aside
      className={cn(
        'absolute top-72 bottom-16 left-16 flex w-[420px] animate-slide-in flex-col max-sm:right-16 max-sm:w-auto',
        ui.surface,
        'bg-deep-anvil/92!',
      )}
      aria-label="Playback"
    >
      <header className="flex items-center justify-between pt-12 pr-12 pl-16">
        <h2 className="text-[13px] font-medium">Playback</h2>
        <button className={cn(ui.btn, ui.btnIcon)} onClick={onClose} title="Close (P)">
          <X {...ICON} />
        </button>
      </header>
      <nav className="flex gap-4 border-b border-white/8 px-16 py-12" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            role="tab"
            aria-selected={playback.mode.kind === k.kind}
            className={cn(ui.chip, playback.mode.kind === k.kind && ui.chipOn)}
            onClick={() => setKind(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-16 pt-8 pb-16 [scrollbar-width:thin]">
        {playback.mode.kind === 'playlist' && <PlaylistView engine={engine} activeId={playback.mode.playlistId} />}
        {playback.mode.kind === 'shuffle' && <ShuffleView categories={playback.mode.categories} />}
        {playback.mode.kind === 'single' && <SingleView engine={engine} />}

        <Group title="Transitions">
          <SelectRow
            label={playback.mode.kind === 'playlist' ? 'Transition (default)' : 'Transition'}
            value={playback.transition}
            options={TRANSITION_CHOICES.map((c) => ({ value: c, label: TRANSITION_LABEL[c] }))}
            onChange={(v) => setPlayback({ transition: v as TransitionChoice })}
          />
          <Slider
            label="Blend time"
            value={playback.transitionDuration}
            min={0}
            max={10}
            step={0.1}
            format={(v) => (v === 0 ? 'Hard cut' : `${v.toFixed(1)} s`)}
            onChange={(v) => setPlayback({ transitionDuration: v })}
          />
          <Switch label="Switch on the beat" value={playback.beatSync} onChange={(v) => setPlayback({ beatSync: v })} />
          <Switch label="Hold the current mode" value={playback.hold} onChange={(v) => setPlayback({ hold: v })} />
        </Group>
      </div>
    </aside>
  );
}

function PlaylistView({ engine, activeId }: { engine: Engine; activeId: string }) {
  const playlists = usePlaylists((s) => s.playlists);
  const store = usePlaylists.getState();
  const setPlayback = useSettings((s) => s.setPlayback);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const active = playlists.find((p) => p.id === activeId);

  const activate = (id: string) => setPlayback({ mode: { kind: 'playlist', playlistId: id } });

  return (
    <>
      <Group title="Playlists">
        <div className="flex flex-col gap-[2px]">
          {playlists.map((p) => (
            <button
              key={p.id}
              className={cn(
                'flex w-full items-center gap-12 rounded-md px-8 py-[6px] text-left transition-colors hover:bg-white/6',
                p.id === activeId && 'bg-white/6',
              )}
              onClick={() => activate(p.id)}
            >
              <PlaylistArt playlist={p} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-normal">{p.name}</span>
                <span className="block text-caption text-smoke">
                  {p.items.length} modes · {fmtDuration(totalDuration(p))}
                  {p.order === 'shuffle' && ' · shuffled'}
                </span>
              </span>
              {p.id === activeId && <AudioLines className="shrink-0 text-warm-cream/60" {...ICON} />}
            </button>
          ))}
        </div>
        <div className="mt-8 mb-12 flex gap-4">
          <button className={ui.btn} onClick={() => activate(store.create())}>
            <Plus {...ICON} /> New playlist
          </button>
          <button className={ui.btn} onClick={() => fileRef.current?.click()}>
            <Upload {...ICON} /> Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                activate(store.importJson(await file.text()));
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Import failed.');
              }
            }}
          />
        </div>
        {error && <p className="mb-12 text-caption text-smoke">{error}</p>}
      </Group>

      {active && <PlaylistEditor key={active.id} engine={engine} playlist={active} onActivate={activate} />}
    </>
  );
}

function PlaylistEditor({ engine, playlist, onActivate }: { engine: Engine; playlist: Playlist; onActivate: (id: string) => void }) {
  const store = usePlaylists.getState();
  const playlists = usePlaylists((s) => s.playlists);
  const modeId = useSettings((s) => s.playback.modeId);
  const [adding, setAdding] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const modes = useModes();

  const download = () => {
    const blob = new Blob([exportPlaylist(playlist)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlist.name.replace(/[^\w\- ]+/g, '').trim() || 'playlist'}.pulse.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    store.remove(playlist.id);
    const rest = playlists.filter((p) => p.id !== playlist.id);
    if (rest[0]) onActivate(rest[0].id);
    else useSettings.getState().setPlayback({ mode: { kind: 'shuffle', categories: [] } });
  };

  return (
    <Group title="Edit">
      <input
        className="mb-12 h-40 w-full rounded-xl border border-transparent bg-white/6 px-12 text-body font-normal outline-none transition-colors placeholder:text-smoke/60 focus:border-ember-coral/40"
        value={playlist.name}
        placeholder="Playlist name"
        onChange={(e) => store.update(playlist.id, { name: e.target.value })}
      />

      <div className="mb-16 flex gap-4">
        <button
          className={cn(ui.chip, playlist.order === 'sequential' && ui.chipOn)}
          onClick={() => store.update(playlist.id, { order: 'sequential' })}
        >
          In order
        </button>
        <button
          className={cn(ui.chip, playlist.order === 'shuffle' && ui.chipOn)}
          onClick={() => store.update(playlist.id, { order: 'shuffle' })}
        >
          Shuffled
        </button>
      </div>

      <SelectRow
        label="Transition"
        value={playlist.transition ?? ''}
        options={[
          { value: '', label: 'Default' },
          ...TRANSITION_CHOICES.map((c) => ({ value: c, label: TRANSITION_LABEL[c] })),
        ]}
        onChange={(v) => store.update(playlist.id, { transition: (v || undefined) as TransitionChoice | undefined })}
      />

      <Slider
        label="Time per mode"
        value={playlist.defaultDuration}
        min={15}
        max={600}
        step={15}
        format={fmtDuration}
        onChange={(v) => store.update(playlist.id, { defaultDuration: v })}
      />

      <ol className="mb-8 flex flex-col gap-[2px]" onDragEnd={() => { setDragFrom(null); setDragOver(null); }}>
        {playlist.items.map((item, i) => {
          const meta = modes.find((m) => m.id === item.modeId);
          return (
            <li
              key={item.id}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) store.moveItem(playlist.id, dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              className={cn(
                'group flex items-center gap-8 rounded-md border-t border-transparent py-4 pr-4 pl-[2px] transition-colors hover:bg-white/6',
                item.modeId === modeId && 'bg-white/6',
                dragOver === i && dragFrom !== i && 'border-warm-cream/60',
                dragFrom === i && 'opacity-40',
              )}
            >
              <GripVertical className="shrink-0 cursor-grab text-smoke/50 active:cursor-grabbing" size={14} strokeWidth={1.5} />
              <button
                className="flex min-w-0 flex-1 items-center gap-8 text-left"
                onClick={() => engine.playback.select(item.modeId)}
                title="Play now"
              >
                <span className={cn(ui.art, 'size-32')} style={modeArt(item.modeId)} />
                <span className="truncate text-[13px] font-normal">{meta?.name ?? item.modeId}</span>
              </button>
              <select
                className={cn(select, 'w-[76px] shrink-0')}
                value={item.duration ?? ''}
                title="Duration"
                onChange={(e) =>
                  store.updateItem(playlist.id, item.id, { duration: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <option value="">{fmtDuration(playlist.defaultDuration)}</option>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{fmtDuration(d)}</option>
                ))}
              </select>
              <select
                className={cn(select, 'w-[76px] shrink-0')}
                value={item.paletteId ?? ''}
                title="Palette"
                onChange={(e) => store.updateItem(playlist.id, item.id, { paletteId: e.target.value || undefined })}
              >
                <option value="">Global</option>
                {PALETTES.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                className={cn(ui.btn, ui.btnIcon, 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                onClick={() => store.removeItem(playlist.id, item.id)}
                title="Remove"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
      </ol>

      {playlist.items.length === 0 && !adding && (
        <p className="mb-8 text-caption text-smoke">Still empty. Add modes to start the playlist.</p>
      )}

      {adding ? (
        <div className="mb-12 rounded-xl border border-white/8 p-8">
          <div className="mb-8 flex items-center justify-between px-4">
            <span className="text-caption text-smoke">Add a mode</span>
            <button className={cn(ui.btn, ui.btnIcon)} onClick={() => setAdding(false)} title="Done">
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-[2px]">
            {modes.map((m) => (
              <button
                key={m.id}
                className="flex items-center gap-8 rounded-md p-4 text-left transition-colors hover:bg-white/6"
                onClick={() => store.addItem(playlist.id, m.id)}
              >
                <span className={cn(ui.art, 'size-24')} style={modeArt(m.id)} />
                <span className="truncate text-caption font-normal">{m.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button className={cn(ui.btn, 'mb-12')} onClick={() => setAdding(true)}>
          <Plus {...ICON} /> Add a mode
        </button>
      )}

      <div className="flex flex-wrap gap-4 border-t border-white/8 pt-12">
        <button className={ui.btn} onClick={() => { const id = store.duplicate(playlist.id); if (id) onActivate(id); }}>
          <Copy {...ICON} /> Duplicate
        </button>
        <button className={ui.btn} onClick={download}>
          <Download {...ICON} /> Export
        </button>
        <button className={cn(ui.btn, confirmDelete && ui.btnActive)} onClick={remove} onBlur={() => setConfirmDelete(false)}>
          <Trash2 {...ICON} /> {confirmDelete ? 'Really delete?' : 'Delete'}
        </button>
      </div>
    </Group>
  );
}

function totalDuration(p: Playlist) {
  return p.items.reduce((sum, i) => sum + (i.duration ?? p.defaultDuration), 0);
}

// Collage aus den ersten vier Covern
function PlaylistArt({ playlist }: { playlist: Playlist }) {
  const ids = playlist.items.slice(0, 4).map((i) => i.modeId);
  return (
    <span className="grid size-40 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-md border border-white/8 bg-white/6">
      {ids.map((id, i) => (
        <span key={i} className={cn(ids.length === 1 && 'col-span-2 row-span-2')} style={modeArt(id)} />
      ))}
    </span>
  );
}

function ShuffleView({ categories }: { categories: ModeCategory[] }) {
  const duration = useSettings((s) => s.playback.shuffleDuration);
  const setPlayback = useSettings((s) => s.setPlayback);
  const modes = useModes();
  const all = [...new Set(modes.map((m) => m.category))];
  const pool = modes.filter((m) => categories.length === 0 || categories.includes(m.category));

  const toggle = (c: ModeCategory) => {
    const next = categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c];
    setPlayback({ mode: { kind: 'shuffle', categories: next } });
  };

  return (
    <Group title="Shuffle through all modes">
      <Slider label="Time per mode" value={duration} min={15} max={600} step={15} format={fmtDuration} onChange={(v) => setPlayback({ shuffleDuration: v })} />
      <p className="mb-8 text-[13px] font-normal">Categories</p>
      <div className="mb-8 flex flex-wrap gap-4">
        <button className={cn(ui.chip, categories.length === 0 && ui.chipOn)} onClick={() => setPlayback({ mode: { kind: 'shuffle', categories: [] } })}>
          All
        </button>
        {all.map((c) => (
          <button key={c} className={cn(ui.chip, categories.includes(c) && ui.chipOn)} onClick={() => toggle(c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <p className="mb-12 text-caption text-smoke">
        {pool.length} modes in the pool. Each plays once before anything repeats.
      </p>
    </Group>
  );
}

function SingleView({ engine }: { engine: Engine }) {
  const modeId = useSettings((s) => s.playback.modeId);
  const modes = useModes();
  return (
    <Group title="One mode, for good">
      <p className="mb-12 text-caption text-smoke">No timer. The mode stays until you change it.</p>
      <div className="mb-12 flex flex-col gap-[2px]">
        {modes.map((m) => (
          <button
            key={m.id}
            className={cn(
              'flex w-full items-center gap-12 rounded-md p-[6px] text-left transition-colors hover:bg-white/6',
              m.id === modeId && 'bg-white/6',
            )}
            onClick={() => engine.playback.select(m.id)}
          >
            <span className={cn(ui.art, 'size-32')} style={modeArt(m.id)} />
            <span className="flex-1 truncate text-[13px] font-normal">{m.name}</span>
            {m.id === modeId && <AudioLines className="shrink-0 text-warm-cream/60" {...ICON} />}
          </button>
        ))}
      </div>
    </Group>
  );
}

function SelectRow({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="mb-16 flex items-center justify-between gap-12 text-[13px] font-normal">
      <span>{label}</span>
      <select className={cn(select, 'w-[150px]')} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
