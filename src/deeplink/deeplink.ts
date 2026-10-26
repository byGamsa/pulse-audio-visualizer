import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';

// pulse://install/<id> (Store), pulse://redeem?code=…&consent=1 (Code eintragen), pulse://mode/<id> (abspielen)
// consent: auf der Website wurde dem Erlöschen des Widerrufsrechts schon ausdrücklich zugestimmt
export type DeepLink = { kind: 'install' | 'mode'; id: string } | { kind: 'redeem'; code: string; consent: boolean };

export function parseDeepLink(url: string): DeepLink | null {
  const match = /^pulse:\/\/([a-z]+)\/?([^?#]*)\??([^#]*)/i.exec(url.trim());
  if (!match) return null;
  const [, action, rest, query] = match;
  const id = rest.replace(/\/+$/, '');
  switch (action.toLowerCase()) {
    case 'install':
    case 'mode':
      return /^[a-z0-9-]{2,48}$/.test(id) ? { kind: action.toLowerCase() as 'install' | 'mode', id } : null;
    case 'redeem': {
      const params = new URLSearchParams(query);
      const code = params.get('code')?.trim().toUpperCase() ?? '';
      return /^[A-Z0-9-]{8,64}$/.test(code) ? { kind: 'redeem', code, consent: params.get('consent') === '1' } : null;
    }
    default:
      return null;
  }
}

interface DeepLinkState {
  // Wartet, bis die Oberfläche bereit ist (Startbildschirm geschlossen)
  pending: DeepLink | null;
}

export const useDeepLink = create<DeepLinkState>()(() => ({ pending: null }));

export function takeDeepLink(): DeepLink | null {
  const link = useDeepLink.getState().pending;
  useDeepLink.setState({ pending: null });
  return link;
}

function receive(urls: string[] | null) {
  const link = urls?.map(parseDeepLink).find((l) => l !== null);
  if (link) useDeepLink.setState({ pending: link });
}

let started = false;

export async function startDeepLinks() {
  if (started || !isTauri()) return;
  started = true;
  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  // Kaltstart per Link, danach kommen Links der laufenden Instanz über onOpenUrl
  receive(await getCurrent());
  await onOpenUrl(receive);
}
