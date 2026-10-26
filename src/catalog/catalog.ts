import { create } from 'zustand';
import { SUPABASE_URL, accessToken, useAccount } from '../account/account';
import { SDK_VERSION, installPackage, uninstallPackage, useOwnership } from '../engine/packages';
import type { ModeCategory } from '../engine/types';

// Antworten der Edge Function pulse-catalog
export interface CatalogMode {
  id: string;
  name: string;
  tagline: string;
  description: string;
  author: string;
  price: string | null;
  free: boolean;
  category: ModeCategory | null;
  version: string | null;
  size: number | null;
  available: boolean;
  thumb: string;
}

export interface CatalogPack {
  id: string;
  name: string;
  tagline: string;
  description: string;
  author: string;
  price: string | null;
  free: boolean;
  modes: string[];
}

interface CatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  modes: CatalogMode[];
  packs: CatalogPack[];
  owned: string[];
  // Modi, die gerade geladen oder entfernt werden
  busy: string[];
  error: string;
  notice: string;
}

export const useCatalog = create<CatalogState>()(() => ({
  status: 'idle',
  modes: [],
  packs: [],
  owned: [],
  busy: [],
  error: '',
  notice: '',
}));

const set = (patch: Partial<CatalogState>) => useCatalog.setState(patch);

const MESSAGES: Record<string, string> = {
  sign_in_required: 'Sign in with your Dendree account first.',
  mfa_required: 'Confirm your sign-in with your authenticator app first.',
  not_owned: 'Unlock this mode with a code first.',
  update_pulse: 'This mode needs a newer version of Pulse.',
  invalid: 'This code is not valid.',
  used: 'This code has already been used.',
  rate_limited: 'Too many wrong codes. Try again in an hour.',
};

async function call<T>(name: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const query = body === undefined ? `?sdk=${SDK_VERSION}` : '';
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}${query}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('The store is not reachable. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(MESSAGES[data.error] ?? 'Something went wrong. Try again.');
  return data as T;
}

async function sha256(data: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const setBusy = (id: string, on: boolean) =>
  useCatalog.setState((s) => ({ busy: on ? [...s.busy, id] : s.busy.filter((b) => b !== id) }));

export async function loadCatalog() {
  set({ status: useCatalog.getState().modes.length ? 'ready' : 'loading', error: '' });
  try {
    const data = await call<{ modes: CatalogMode[]; packs: CatalogPack[]; owned: string[] }>('pulse-catalog');
    set({ status: 'ready', modes: data.modes, packs: data.packs, owned: data.owned });
    const account = useAccount.getState().status;
    const paid = data.modes.filter((m) => !m.free).map((m) => m.id);
    // Nur ein eindeutiger Kontostatus darf den Besitz-Cache überschreiben
    if (account === 'signed-in' || account === 'signed-out') useOwnership.getState().setOwnership({ owned: data.owned, paid });
    else useOwnership.getState().setOwnership({ paid });
  } catch (err) {
    set({ status: 'error', error: (err as Error).message });
  }
}

// Download über einen kurzlebigen Link, Rust prüft danach die Signatur
export async function installMode(id: string) {
  setBusy(id, true);
  set({ error: '', notice: '' });
  try {
    const link = await call<{ url: string; sha256: string }>('pulse-download', { mode: id, sdk: SDK_VERSION });
    const res = await fetch(link.url).catch(() => null);
    if (!res?.ok) throw new Error('The download failed. Try again.');
    const data = await res.arrayBuffer();
    if ((await sha256(data)) !== link.sha256) throw new Error('The download was damaged. Try again.');
    await installPackage(data);
  } catch (err) {
    set({ error: (err as Error).message });
  } finally {
    setBusy(id, false);
  }
}

export async function removeMode(id: string) {
  setBusy(id, true);
  try {
    await uninstallPackage(id);
  } catch (err) {
    set({ error: String(err) });
  } finally {
    setBusy(id, false);
  }
}

// Schaltet frei und installiert alle Modi des Produkts gleich mit
export async function redeemCode(code: string): Promise<boolean> {
  set({ error: '', notice: '' });
  try {
    const result = await call<{ product: { id: string; kind: string; name: string }; owned: string[] }>('pulse-redeem', { code });
    set({ owned: result.owned });
    useOwnership.getState().setOwnership({ owned: result.owned });
    const { packs, modes } = useCatalog.getState();
    const ids = result.product.kind === 'pack' ? (packs.find((p) => p.id === result.product.id)?.modes ?? []) : [result.product.id];
    for (const id of ids) {
      if (modes.some((m) => m.id === id && m.available)) await installMode(id);
    }
    set({ notice: `${result.product.name} is yours.` });
    return true;
  } catch (err) {
    set({ error: (err as Error).message });
    return false;
  }
}

let started = false;

// Besitz beim Start und bei jedem Kontowechsel neu laden, abgemeldet gilt nur Kostenloses
export function startCatalog() {
  if (started) return;
  started = true;
  let last = useAccount.getState().status;
  useAccount.subscribe((s) => {
    if (s.status === last) return;
    last = s.status;
    if (s.status === 'signed-out') useOwnership.getState().setOwnership({ owned: [] });
    if (s.status === 'signed-in' || s.status === 'signed-out') void loadCatalog();
  });
  // Erst laden, wenn die Anmeldung feststeht, sonst ersetzt ein anonymer Katalog kurz den Besitz-Cache
  if (last !== 'loading') void loadCatalog();
}
