import { useEffect, useRef, useState } from 'react';
import { Engine } from './engine/Engine';
import { stopStaleNativeCapture } from './audio/NativeAudioSource';
import { useSettings } from './store/settings';
import { Hud } from './ui/Hud';
import { PlayerBar, TopBar } from './ui/Chrome';
import { ModeBrowser } from './ui/ModeBrowser';
import { PlaybackPanel } from './ui/PlaybackPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { StartScreen } from './ui/StartScreen';
import { useIdle } from './ui/useIdle';
import { NowPlaying } from './ui/NowPlaying';
import { useNowPlaying } from './media/nowPlaying';
import type { AudioSourceKind } from './audio/types';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<AudioSourceKind | null>(null);
  const [startOpen, setStartOpen] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const ui = useSettings((s) => s.ui);
  const setUi = useSettings((s) => s.setUi);
  const idle = useIdle(3000);
  const track = useNowPlaying(sourceKind, sourceLabel);

  useEffect(() => {
    stopStaleNativeCapture();
    const e = new Engine(canvasRef.current!);
    e.start();
    void e.setMode(useSettings.getState().playback.modeId, 0);
    setEngine(e);
    // Zum Debuggen in der Konsole: __pulse.setMode('aurora')
    if (import.meta.env.DEV) Object.assign(window, { __pulse: e });
    return () => e.dispose();
  }, []);

  useEffect(() => {
    if (!engine || startOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLSelectElement) return;
      if (ev.target instanceof HTMLInputElement && ev.target.type !== 'range' && ev.target.type !== 'checkbox') return;
      const s = useSettings.getState();
      switch (ev.key) {
        case 'ArrowRight': engine.nextMode(1); break;
        case 'ArrowLeft': engine.nextMode(-1); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'h': case 'H': s.setUi({ showHud: !s.ui.showHud }); break;
        case 's': case 'S': s.setUi({ panelOpen: !s.ui.panelOpen }); break;
        case 'm': case 'M': setBrowserOpen((o) => !o); break;
        case 'p': case 'P': s.setUi({ playbackOpen: !s.ui.playbackOpen }); break;
        case ' ': s.setPlayback({ hold: !s.playback.hold }); break;
        case 'Escape': setBrowserOpen(false); s.setUi({ panelOpen: false, playbackOpen: false }); break;
        default: return;
      }
      ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, startOpen]);

  const chromeIdle = idle && !ui.panelOpen && !ui.playbackOpen && !browserOpen && !startOpen;

  return (
    <div className="group/app fixed inset-0 data-[idle=true]:cursor-none" data-idle={chromeIdle}>
      <div className="absolute inset-0 bg-pure-ink">
        <canvas ref={canvasRef} className="block size-full" />
      </div>
      {engine && startOpen && (
        <StartScreen
          engine={engine}
          canClose={sourceLabel !== null}
          onClose={() => setStartOpen(false)}
          onConnected={(label, kind) => {
            setSourceLabel(label);
            setSourceKind(kind);
            setStartOpen(false);
          }}
        />
      )}
      {engine && !startOpen && (
        <>
          {ui.showHud && <Hud engine={engine} />}
          <NowPlaying track={track} mode={ui.nowPlaying} chromeVisible={!chromeIdle} />
          <TopBar
            sourceLabel={sourceLabel}
            settingsOpen={ui.panelOpen}
            onPickSource={() => setStartOpen(true)}
            onToggleSettings={() => setUi({ panelOpen: !ui.panelOpen })}
            onToggleFullscreen={toggleFullscreen}
          />
          {browserOpen && <ModeBrowser engine={engine} onClose={() => setBrowserOpen(false)} />}
          <PlayerBar
            engine={engine}
            browserOpen={browserOpen}
            playbackOpen={ui.playbackOpen}
            onToggleBrowser={() => setBrowserOpen((o) => !o)}
            onTogglePlayback={() => setUi({ playbackOpen: !ui.playbackOpen })}
          />
          {ui.playbackOpen && <PlaybackPanel engine={engine} onClose={() => setUi({ playbackOpen: false })} />}
          {ui.panelOpen && <SettingsPanel onClose={() => setUi({ panelOpen: false })} />}
        </>
      )}
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}
