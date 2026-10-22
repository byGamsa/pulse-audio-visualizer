import { useEffect, useRef, useState } from 'react';
import type { Engine, EngineStats } from '../engine/Engine';
import { BAND_COUNT } from '../audio/types';
import { hideWhenIdle } from './Chrome';
import { cn } from './ui';

export function Hud({ engine }: { engine: Engine }) {
  const [stats, setStats] = useState<EngineStats>({ ...engine.stats });
  const meterRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setStats({ ...engine.stats }), 250);
    return () => clearInterval(id);
  }, [engine]);

  // Mini-Spektrum direkt per Canvas 2D, ohne React-Rerender pro Frame
  useEffect(() => {
    const canvas = meterRef.current!;
    const g = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 200 * dpr;
    canvas.height = 28 * dpr;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const f = engine.bus.features;
      const w = canvas.width;
      const h = canvas.height;
      const bars = 64;
      const bw = w / bars;
      g.clearRect(0, 0, w, h);
      g.fillStyle = f.beat ? '#ffffff' : 'rgba(247, 244, 239, 0.7)';
      for (let i = 0; i < bars; i++) {
        const v = Math.min(Math.max(f.spectrum[(i * 2) % BAND_COUNT], f.spectrum[(i * 2 + 1) % BAND_COUNT]), 1);
        const bh = Math.max(v * h, dpr);
        g.fillRect(i * bw, h - bh, Math.max(bw - dpr, dpr), bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div
      className={cn(
        'pointer-events-none absolute top-72 left-24 grid grid-cols-[auto_auto] gap-x-16 gap-y-[2px] text-[11px] font-normal text-smoke tabular-nums [&_b]:font-normal [&_b]:text-warm-cream',
        hideWhenIdle,
      )}
    >
      <span><b className={stats.fps < 55 ? 'text-ember-coral!' : ''}>{stats.fps.toFixed(0)}</b> fps</span>
      <span><b>{stats.frameMs.toFixed(1)}</b> ms</span>
      <span><b>{stats.width}×{stats.height}</b></span>
      <span><b>{Math.round(stats.renderScale * 100)}</b> %</span>
      <span><b>{stats.bpm.toFixed(0)}</b> bpm</span>
      <span>energy <b>{Math.round(stats.energy * 100)}</b></span>
      <canvas ref={meterRef} className="col-span-full mt-8 h-[28px] w-[200px] opacity-80" />
    </div>
  );
}
