import { useEffect, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';
import { trackKey, type Track } from '../media/nowPlaying';
import type { NowPlayingMode } from '../store/settings';
import { cn } from './ui';

// So lange bleibt die Anzeige im Modus „Bei Liedwechsel“ stehen
const SHOW_MS = 7000;

interface Props {
  track: Track | null;
  mode: NowPlayingMode;
  // Bedienelemente sichtbar: Karte rückt über die Player-Leiste
  chromeVisible: boolean;
}

export function NowPlaying({ track, mode, chromeVisible }: Props) {
  const key = trackKey(track);
  const [shown, setShown] = useState<Track | null>(track);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef(0);

  useEffect(() => {
    clearTimeout(hideTimer.current);
    if (mode === 'off' || !track) {
      setVisible(false);
      return;
    }
    // Erst ausblenden, dann die neue Karte zeigen
    setVisible(false);
    const swap = window.setTimeout(() => {
      setShown(track);
      setVisible(true);
      if (mode === 'change') hideTimer.current = window.setTimeout(() => setVisible(false), SHOW_MS);
    }, shown ? 450 : 0);
    return () => clearTimeout(swap);
    // shown absichtlich nicht als Abhängigkeit
  }, [key, mode]);

  // Cover oder Status ändern sich ohne Titelwechsel
  useEffect(() => {
    if (track && trackKey(track) === trackKey(shown)) setShown(track);
  }, [track?.artwork, track?.playing]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!shown || mode === 'off') return null;
  const sub = [shown.artist, shown.album].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-32 flex max-w-[min(620px,calc(100vw-64px))] items-end gap-20 transition-all duration-700 ease-out',
        chromeVisible ? 'bottom-[104px]' : 'bottom-40',
        visible ? 'translate-y-0 opacity-100 blur-none' : 'translate-y-12 opacity-0 blur-sm',
      )}
      aria-live="polite"
    >
      <div className="absolute -inset-x-64 -inset-y-48 -z-10 bg-[radial-gradient(ellipse_at_20%_70%,rgb(0_0_0/0.55),transparent_65%)]" />

      <div className="relative size-[96px] shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-xl">
        {shown.artwork ? (
          <img src={shown.artwork} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_30%_25%,#d4622a,#8a2a3a_55%,#1a0a0e)]">
            <Music2 size={28} strokeWidth={1.25} className="text-warm-cream/80" />
          </div>
        )}
      </div>

      <div className="min-w-0 pb-4">
        <div className="mb-8 flex items-center gap-8 text-[11px] font-normal uppercase tracking-[0.16em] text-warm-cream/60">
          <Bars playing={shown.playing} />
          <span>{shown.playing ? 'Now playing' : 'Paused'}</span>
          {shown.app && <span className="text-warm-cream/40">· {shown.app}</span>}
        </div>
        <div className="line-clamp-2 font-editorial-new text-[clamp(28px,3.2vw,44px)] leading-[1.02] font-normal tracking-[-0.02em] text-warm-cream italic [text-shadow:0_2px_24px_rgb(0_0_0/0.5)]">
          {shown.title}
        </div>
        {sub && <div className="mt-8 truncate text-body-sm text-warm-cream/70">{sub}</div>}
      </div>
    </div>
  );
}

function Bars({ playing }: { playing: boolean }) {
  return (
    <span className="flex h-[10px] items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <i
          key={i}
          className={cn('block w-[2px] rounded-full bg-warm-cream/70', playing ? 'animate-eq' : 'h-[3px]')}
          style={{ animationDelay: `${i * 0.18}s`, height: playing ? undefined : '3px' }}
        />
      ))}
    </span>
  );
}
