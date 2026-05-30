import type { ReactNode } from 'react';
import { cn } from './ui';

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-white/8 pt-12 pb-4 not-first:border-t">
      <h3 className="mb-12 text-caption font-normal text-smoke">{title}</h3>
      {children}
    </section>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="mb-16 block">
      <span className="mb-8 flex items-baseline justify-between text-[13px] font-normal">
        {label}
        <span className="text-caption font-light text-smoke tabular-nums">{format(value)}</span>
      </span>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--p' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Switch({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-16 flex cursor-pointer items-center justify-between text-[13px] font-normal">
      <span>{label}</span>
      <input className="peer sr-only" type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <i
        className={cn(
          'relative h-16 w-[28px] shrink-0 rounded-full bg-white/14 transition-colors peer-checked:bg-warm-cream',
          'peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-warm-cream/60',
          'after:absolute after:top-[2px] after:left-[2px] after:size-12 after:rounded-full after:bg-smoke after:transition-all',
          'peer-checked:after:translate-x-12 peer-checked:after:bg-studio-black',
        )}
      />
    </label>
  );
}
