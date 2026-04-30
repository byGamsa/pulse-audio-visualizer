import { useEffect, useRef, useState } from 'react';
import { Engine } from './engine/Engine';
import { useSettings } from './store/settings';
import { StartScreen } from './ui/StartScreen';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(true);

  useEffect(() => {
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
      if (ev.target instanceof HTMLInputElement) return;
      switch (ev.key) {
        case 'ArrowRight': engine.nextMode(1); break;
        case 'ArrowLeft': engine.nextMode(-1); break;
        case 'f': case 'F': toggleFullscreen(); break;
        default: return;
      }
      ev.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, startOpen]);

  return (
    <div className="fixed inset-0">
      <div className="absolute inset-0 bg-pure-ink">
        <canvas ref={canvasRef} className="block size-full" />
      </div>
      {engine && startOpen && (
        <StartScreen
          engine={engine}
          canClose={sourceLabel !== null}
          onClose={() => setStartOpen(false)}
          onConnected={(label) => {
            setSourceLabel(label);
            setStartOpen(false);
          }}
        />
      )}
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}
