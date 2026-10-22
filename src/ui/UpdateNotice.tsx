import { Download, LoaderCircle, X } from 'lucide-react';
import { useUpdater } from '../update/updater';
import { ICON, cn, ui } from './ui';

// Hinweis oben in der Mitte, sobald eine neue Version bereitliegt.
// Bei offenen Einstellungen übernimmt der Tab „About“ (sonst überlappen beide).
export function UpdateNotice({ hidden }: { hidden: boolean }) {
  const status = useUpdater((s) => s.status);
  const dismissed = useUpdater((s) => s.dismissed);
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);
  const version = useUpdater((s) => s.version);

  const working = status.kind === 'downloading' || status.kind === 'restarting';
  if (hidden || (!(status.kind === 'available' && !dismissed) && !working)) return null;

  let detail = `You have ${version}. Pulse restarts once it is installed.`;
  if (status.kind === 'available' && status.error) detail = `Update failed: ${status.error}`;
  if (status.kind === 'downloading') {
    detail = status.progress === null ? 'Downloading…' : `Downloading… ${Math.round(status.progress * 100)} %`;
  }
  if (status.kind === 'restarting') detail = 'Installing and restarting…';

  return (
    <div
      className={cn(
        'absolute top-72 left-1/2 z-10 flex w-[min(460px,calc(100vw-32px))] -translate-x-1/2 animate-rise items-center gap-12 py-12 pr-12 pl-16',
        ui.surface,
        'bg-deep-anvil/92!',
      )}
      role="status"
      aria-live="polite"
    >
      <span className="grid size-[36px] shrink-0 place-items-center rounded-full border border-white/12">
        {working ? <LoaderCircle {...ICON} className="animate-spin" /> : <Download {...ICON} />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[13px] font-medium">Pulse {status.version} is available</strong>
        <small className={cn('line-clamp-2 text-caption', status.kind === 'available' && status.error ? 'text-ember-coral' : 'text-smoke')}>
          {detail}
        </small>
        {status.kind === 'downloading' && (
          <span className="mt-8 block h-[2px] overflow-hidden rounded-full bg-white/10">
            <span
              className={cn('block h-full bg-warm-cream transition-[width]', status.progress === null && 'w-1/3 animate-pulse')}
              style={status.progress === null ? undefined : { width: `${status.progress * 100}%` }}
            />
          </span>
        )}
      </span>
      {status.kind === 'available' && (
        <>
          <button className={cn(ui.create, 'h-32 px-16 text-[13px]')} onClick={() => void install()}>
            {status.error ? 'Try again' : 'Update'}
          </button>
          <button className={cn(ui.btn, ui.btnIcon)} onClick={dismiss} title="Later">
            <X {...ICON} />
          </button>
        </>
      )}
    </div>
  );
}
