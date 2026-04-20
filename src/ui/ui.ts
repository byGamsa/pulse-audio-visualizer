export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export const ICON = { size: 16, strokeWidth: 1.5 } as const;

export const ui = {
  btn: 'inline-flex h-32 items-center gap-8 whitespace-nowrap rounded-md border border-transparent px-12 text-[13px] font-normal transition-colors hover:bg-white/8 [&_svg]:shrink-0',
  btnOutlined: 'border-white/20',
  // ! nötig, sonst gewinnt px-12 aus btn
  btnIcon: 'w-32 justify-center px-0!',
  btnActive: 'border-white/12 bg-white/6',
  chip: 'inline-flex h-[30px] items-center gap-4 rounded-md border border-white/12 px-12 text-[13px] font-normal transition-colors hover:bg-white/6',
  chipOn: 'border-warm-cream/60 bg-white/6',
  create:
    'inline-flex h-40 items-center justify-center gap-8 rounded-full bg-linear-to-b from-[#fd5a9f] via-ember-coral to-[#f2397f] px-20 text-body-sm font-medium text-bone shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_24px_-8px_rgba(253,66,156,0.6)] transition hover:brightness-110 active:translate-y-px disabled:cursor-wait disabled:saturate-50',
  surface: 'rounded-xl border border-white/8 bg-deep-anvil/80 backdrop-blur-xl',
  tag: 'inline-block rounded-md bg-white/6 px-8 text-[11px] font-normal text-smoke',
  wordmark: 'text-[13px] font-medium uppercase tracking-[0.16em]',
  kbd: 'inline-grid h-20 min-w-20 place-items-center rounded-md border border-white/12 px-4 text-[11px] font-normal text-warm-cream',
  art: 'shrink-0 rounded-md border border-white/8',
};

// 45 → „45 s“, 180 → „3:00“
export function fmtDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const select =
  'h-[28px] cursor-pointer rounded-md border border-white/12 bg-transparent px-8 text-caption font-normal text-warm-cream outline-none hover:bg-white/6 [&>option]:bg-deep-anvil';
