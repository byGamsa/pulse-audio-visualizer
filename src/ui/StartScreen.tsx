import { useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, FileAudio, Mic, MonitorSpeaker, X } from 'lucide-react';
import type { Engine } from '../engine/Engine';
import type { AudioSource, AudioSourceKind } from '../audio/types';
import {
  createDemoSource,
  createDisplaySource,
  createFileSource,
  createMicSource,
} from '../audio/WebAudioSource';
import { createNativeSource, hasNativeAudio, listNativeDevices, type NativeDevice } from '../audio/NativeAudioSource';
import { ICON, cn, select, ui } from './ui';

interface Props {
  engine: Engine;
  canClose: boolean;
  onClose: () => void;
  onConnected: (label: string, kind: AudioSourceKind) => void;
}

const SOURCES: { kind: AudioSourceKind; label: string; title: string; hint: string; Icon: typeof Mic }[] = [
  {
    kind: 'display',
    label: 'Systemaudio',
    title: 'Alles, was dein Rechner gerade abspielt',
    hint: 'Im Freigabe-Dialog „Systemaudio teilen“ aktivieren.',
    Icon: MonitorSpeaker,
  },
  {
    kind: 'file',
    label: 'Datei',
    title: 'Einen eigenen Track laden',
    hint: 'MP3, WAV, FLAC oder OGG, läuft in Schleife.',
    Icon: FileAudio,
  },
  {
    kind: 'mic',
    label: 'Mikrofon',
    title: 'Mikrofon oder Line-In',
    hint: 'Für Plattenspieler, Mischpult oder den Raum.',
    Icon: Mic,
  },
  {
    kind: 'demo',
    label: 'Demo',
    title: 'Eingebauter House-Loop, 124 BPM',
    hint: 'Zum Ausprobieren ohne eigene Musik.',
    Icon: AudioLines,
  },
];

const SHORTCUTS: [string[], string][] = [
  [['←', '→'], 'Modus wechseln'],
  [['M'], 'Alle Modi'],
  [['P'], 'Playlists'],
  [['Leertaste'], 'Modus halten'],
  [['S'], 'Einstellungen'],
  [['F'], 'Vollbild'],
  [['H'], 'HUD'],
];

export function StartScreen({ engine, canClose, onClose, onConnected }: Props) {
  const [kind, setKind] = useState<AudioSourceKind>('display');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = SOURCES.find((s) => s.kind === kind)!;

  // Desktop: WASAPI mit Geräteauswahl
  const native = hasNativeAudio();
  const [devices, setDevices] = useState<NativeDevice[]>([]);
  const [device, setDevice] = useState<Record<string, string>>({});
  useEffect(() => {
    if (native) listNativeDevices().then(setDevices).catch(() => setDevices([]));
  }, [native]);
  const deviceKind = kind === 'display' ? 'output' : kind === 'mic' ? 'input' : null;
  const deviceOptions = deviceKind ? devices.filter((d) => d.kind === deviceKind) : [];
  const hint = native && kind === 'display' ? 'Direkt per WASAPI-Loopback, ohne Freigabe-Dialog.' : selected.hint;

  const connect = async (factory: () => Promise<AudioSource>) => {
    setBusy(true);
    setError(null);
    try {
      const source = await factory();
      engine.setSource(source);
      onConnected(source.label, source.kind);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') setError('Freigabe abgebrochen.');
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    if (kind === 'file') fileRef.current?.click();
    else if (native && (kind === 'display' || kind === 'mic')) {
      void connect(() => createNativeSource(device[kind] || undefined, kind === 'display'));
    } else if (kind === 'display') void connect(createDisplaySource);
    else if (kind === 'mic') void connect(createMicSource);
    else void connect(createDemoSource);
  };

  return (
    <div
      className="absolute inset-0 flex animate-fade-in flex-col"
      style={{
        background:
          'radial-gradient(ellipse 80% 70% at 30% 20%, rgb(212 98 42 / 0.55) 0%, rgb(138 42 58 / 0.42) 40%, transparent 75%), rgb(16 16 18 / 0.82)',
      }}
    >
      <nav className="flex h-64 shrink-0 items-center justify-between px-24">
        <span className={ui.wordmark}>Pulse</span>
        {canClose && (
          <button className={ui.btn} onClick={onClose}>
            <X {...ICON} /> Schließen
          </button>
        )}
      </nav>

      <main className="flex flex-1 flex-col items-center justify-center px-16 pb-32 text-center">
        <p className="mb-20 text-[13px] font-normal text-warm-cream/60">Echtzeit-Audio-Visualizer</p>
        <h1 className="font-editorial-new text-[clamp(48px,8.5vw,112px)] leading-[0.95] font-normal tracking-[-0.026em] italic">
          Musik, <span className="not-italic">die man</span> sieht.
        </h1>
        <p className="mt-24 mb-40 max-w-[440px] text-body text-smoke">
          Pulse übersetzt jedes Signal in Licht, vom Kick bis zur letzten Hi-Hat. Wähle, was du hören willst.
        </p>

        <div className="w-full max-w-[680px] rounded-2xl border border-white/8 bg-deep-anvil/60 p-16 text-left shadow-xl backdrop-blur-xl">
          <div className="flex min-h-48 items-center gap-12 px-4 pt-4 pb-16">
            <span className="grid size-[36px] shrink-0 place-items-center rounded-full border border-white/12">
              <selected.Icon {...ICON} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-body font-normal">{selected.title}</strong>
              <small className="block text-[13px] text-smoke">{hint}</small>
            </span>
            {native && deviceOptions.length > 0 && (
              <select
                className={cn(select, 'max-w-[220px] shrink-0')}
                value={device[kind] ?? ''}
                onChange={(e) => setDevice((d) => ({ ...d, [kind]: e.target.value }))}
                title="Gerät"
              >
                <option value="">Standardgerät</option>
                {deviceOptions.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}{d.isDefault ? ' (Standard)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-wrap gap-4" role="radiogroup" aria-label="Audioquelle">
              {SOURCES.map((s) => (
                <button
                  key={s.kind}
                  role="radio"
                  aria-checked={kind === s.kind}
                  className={cn(ui.chip, kind === s.kind && ui.chipOn)}
                  onClick={() => setKind(s.kind)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button className={ui.create} disabled={busy} onClick={start}>
              Starten <ArrowRight size={16} strokeWidth={1.75} />
            </button>
          </div>
          {error && <p className="mx-4 mt-12 text-[13px] text-smoke">{error}</p>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void connect(() => createFileSource(file));
            e.target.value = '';
          }}
        />
      </main>

      <footer className="flex shrink-0 flex-wrap justify-center gap-x-40 gap-y-12 px-16 pt-24 pb-32 text-caption text-warm-cream/60">
        {SHORTCUTS.map(([keys, label]) => (
          <span key={label} className="inline-flex items-center gap-8">
            <span className="inline-flex gap-4">
              {keys.map((k) => <kbd key={k} className={ui.kbd}>{k}</kbd>)}
            </span>
            {label}
          </span>
        ))}
      </footer>
    </div>
  );
}
