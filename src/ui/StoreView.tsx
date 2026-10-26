import { useEffect, useRef, useState } from 'react';
import { Check, Lock, Search } from 'lucide-react';
import { signIn, useAccount, type AccountStatus } from '../account/account';
import { installMode, loadCatalog, redeemCode, removeMode, useCatalog, type CatalogMode } from '../catalog/catalog';
import type { DeepLink } from '../deeplink/deeplink';
import { useInstalledModes } from '../engine/packages';
import type { ModeCategory } from '../engine/types';
import { CATEGORY_LABEL } from './modeArt';
import { cn, ui } from './ui';

const input =
  'h-32 rounded-md border border-transparent bg-white/6 px-12 text-[13px] font-normal outline-none transition-colors placeholder:text-smoke/60 focus:border-ember-coral/40';

export function StoreView({ link }: { link: DeepLink | null }) {
  const { status, modes, packs, owned, error, notice } = useCatalog();
  const focusId = link?.kind === 'install' ? link.id : null;
  const handled = useRef(false);
  const account = useAccount((s) => s.status);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ModeCategory | 'all'>('all');

  // Nach dem Anmelden zeigt der Katalog, was dem Konto gehört
  useEffect(() => void loadCatalog(), [account]);

  // pulse://install/<id>: Kostenloses oder Freigeschaltetes gleich installieren
  useEffect(() => {
    if (!focusId || status !== 'ready' || handled.current) return;
    handled.current = true;
    const mode = modes.find((m) => m.id === focusId);
    if (!mode) return void useCatalog.setState({ error: 'This mode is not in the store.' });
    const installed = useInstalledModes.getState().modes.some((p) => p.manifest.id === focusId);
    if (!installed && mode.available && (mode.free || owned.includes(mode.id))) void installMode(mode.id);
  }, [focusId, status, modes, owned]);

  const q = query.trim().toLowerCase();
  const categories = [...new Set(modes.flatMap((m) => (m.category ? [m.category] : [])))];
  const visible = modes.filter(
    (m) =>
      (filter === 'all' || m.category === filter) &&
      (!q || `${m.name} ${m.tagline} ${m.description} ${m.author}`.toLowerCase().includes(q)),
  );
  const visiblePacks = packs.filter((p) => !q || `${p.name} ${p.tagline} ${p.description}`.toLowerCase().includes(q));

  return (
    <>
      <div className="flex flex-col gap-8 px-8 pb-8">
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-12 -translate-y-1/2 text-smoke" size={14} strokeWidth={1.5} />
          <input
            className={cn(input, 'w-full pl-32')}
            placeholder="Search modes and packs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-4">
            <button className={cn(ui.chip, filter === 'all' && ui.chipOn)} onClick={() => setFilter('all')}>
              All
            </button>
            {categories.map((c) => (
              <button key={c} className={cn(ui.chip, filter === c && ui.chipOn)} onClick={() => setFilter(c)}>
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto [scrollbar-width:thin]">
        {status === 'loading' && <p className="p-8 text-caption text-smoke">Loading the store…</p>}
        {status === 'error' && !modes.length && (
          <p className="flex items-center gap-8 p-8 text-caption text-smoke">
            {error}
            <button className={ui.btn} onClick={() => void loadCatalog()}>
              Try again
            </button>
          </p>
        )}
        {status === 'ready' && !visible.length && !visiblePacks.length && (
          <p className="p-8 text-caption text-smoke">{q ? 'Nothing matches your search.' : 'No modes in the store yet.'}</p>
        )}
        {visiblePacks.map((p) => {
          const mine = p.free || p.modes.every((id) => owned.includes(id));
          return (
            <div key={p.id} className="flex items-center gap-12 rounded-md p-8">
              <span className="grid h-[54px] w-[96px] shrink-0 grid-cols-2 gap-[2px] overflow-hidden rounded-md">
                {p.modes.slice(0, 4).map((id) => (
                  <span
                    key={id}
                    className={cn('bg-white/6', p.modes.length === 1 && 'col-span-2 row-span-2')}
                    style={thumb(modes.find((m) => m.id === id)?.thumb)}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-8 text-body-sm font-normal">
                  {p.name} <span className={ui.tag}>{p.modes.length} modes</span>
                </span>
                <span className="block truncate text-caption text-smoke">{p.tagline || p.description}</span>
              </span>
              <span className="shrink-0 text-caption text-smoke">{mine ? 'Owned' : (p.price ?? 'Code')}</span>
            </div>
          );
        })}
        {visible.map((m) => (
          <StoreRow key={m.id} mode={m} owned={m.free || owned.includes(m.id)} focused={m.id === focusId} />
        ))}
      </div>

      <RedeemBar account={account} initialCode={link?.kind === 'redeem' ? link.code : ''} error={error && modes.length ? error : ''} notice={notice} />
    </>
  );
}

function thumb(url: string | undefined) {
  return url ? { background: `url(${url}) center / cover no-repeat` } : undefined;
}

function StoreRow({ mode, owned, focused }: { mode: CatalogMode; owned: boolean; focused: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [focused]);
  const installed = useInstalledModes((s) => s.modes.find((p) => p.manifest.id === mode.id)?.manifest.version);
  const busy = useCatalog((s) => s.busy.includes(mode.id));

  let action;
  if (busy) action = <span className="text-caption text-smoke">Working…</span>;
  else if (!mode.available) action = <span className={ui.tag}>Needs a newer Pulse</span>;
  else if (installed && installed !== mode.version && owned)
    action = (
      <button className={cn(ui.btn, ui.btnOutlined)} onClick={() => void installMode(mode.id)}>
        Update
      </button>
    );
  else if (installed)
    action = (
      <span className="flex items-center gap-8">
        <span className="flex items-center gap-4 text-caption text-smoke">
          <Check size={14} strokeWidth={1.5} /> Installed
        </span>
        <button className={ui.btn} onClick={() => void removeMode(mode.id)}>
          Remove
        </button>
      </span>
    );
  else if (owned)
    action = (
      <button className={cn(ui.btn, ui.btnOutlined)} onClick={() => void installMode(mode.id)}>
        {mode.free ? 'Get' : 'Install'}
      </button>
    );
  else
    action = (
      <span className="flex items-center gap-4 text-caption text-smoke" title="Unlock with a code below">
        <Lock size={12} strokeWidth={1.5} /> {mode.price ?? 'Code'}
      </span>
    );

  return (
    <div ref={ref} className={cn('flex items-center gap-12 rounded-md p-8', focused && 'bg-white/6')}>
      <span className={cn(ui.art, 'h-[54px] w-[96px] bg-white/6')} style={thumb(mode.thumb)} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-8 text-body-sm font-normal">
          {mode.name}
          {mode.category && <span className={ui.tag}>{CATEGORY_LABEL[mode.category]}</span>}
        </span>
        <span className="block truncate text-caption text-smoke">{mode.tagline || mode.description}</span>
      </span>
      <span className="shrink-0">{action}</span>
    </div>
  );
}

function RedeemBar({ account, initialCode, error, notice }: { account: AccountStatus; initialCode: string; error: string; notice: string }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-4 border-t border-white/8 px-8 pt-12 pb-4">
      {account === 'signed-in' ? (
        <form
          className="flex gap-8"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if (await redeemCode(code)) setCode('');
            setBusy(false);
          }}
        >
          <input
            className={cn(input, 'min-w-0 flex-1 font-mono uppercase tracking-[0.08em] placeholder:normal-case placeholder:tracking-normal')}
            placeholder="Have a code? PULSE-XXXX-…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className={cn(ui.btn, ui.btnOutlined)} disabled={busy || code.trim().length < 8}>
            {busy ? 'Unlocking…' : 'Redeem'}
          </button>
        </form>
      ) : account === 'waiting' || account === 'mfa' ? (
        <p className="py-8 text-caption text-smoke">
          {account === 'waiting'
            ? 'Continue in your browser. Pulse signs in as soon as you confirm there.'
            : 'Enter the code of your authenticator app under Settings, About.'}
        </p>
      ) : (
        <p className="flex items-center justify-between gap-8 text-caption text-smoke">
          Sign in to unlock modes with a code.
          <button className={cn(ui.btn, ui.btnOutlined)} onClick={() => void signIn()}>
            Sign in with Dendree
          </button>
        </p>
      )}
      {(error || notice) && (
        <p className={cn('pt-8 text-caption', error ? 'text-ember-coral' : 'text-warm-cream')} aria-live="polite">
          {error || notice}
        </p>
      )}
    </div>
  );
}
