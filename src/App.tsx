import { useEffect, useRef } from 'react';
import { Engine } from './engine/Engine';
import { useSettings } from './store/settings';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const e = new Engine(canvasRef.current!);
    e.start();
    void e.setMode(useSettings.getState().playback.modeId, 0);
    // Zum Debuggen in der Konsole: __pulse.setMode('aurora')
    if (import.meta.env.DEV) Object.assign(window, { __pulse: e });
    return () => e.dispose();
  }, []);

  return (
    <div className="fixed inset-0 bg-pure-ink">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
