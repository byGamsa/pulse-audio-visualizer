import { createClient } from '@supabase/supabase-js';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';

// Öffentliche Werte des Dendree-Projekts, lokal per .env.local überschreibbar
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://khzccudtycrkbbqiwxmi.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_xyXrACYEkN7WZEDwjU9cwA_u9xlZXIx';
const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'https://auth.dendree.de';

// Konto und Käufe gibt es nur in der Desktop-App
export const hasAccount = isTauri;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: 'pulse-account', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export type AccountStatus = 'loading' | 'signed-out' | 'waiting' | 'mfa' | 'signed-in';

interface AccountState {
  status: AccountStatus;
  email: string;
  error: string;
}

export const useAccount = create<AccountState>()(() => ({ status: 'loading', email: '', error: '' }));

const set = (patch: Partial<AccountState>) => useAccount.setState(patch);

// Der Browser-Durchlauf, auf den gerade gewartet wird
let pendingState = '';

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function settle() {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { session } = (await supabase.auth.getSession()).data;
  if (!session) return set({ status: 'signed-out', email: '' });
  // Staff und Admins brauchen den zweiten Faktor auch hier
  const needsCode = data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  set({ status: needsCode ? 'mfa' : 'signed-in', email: session.user.email ?? '', error: '' });
}

// Antwort der Seite auth.dendree.de/desktop über den Loopback-Server
export async function completeSignIn(query: string) {
  const params = new URLSearchParams(query);
  if (!pendingState || params.get('state') !== pendingState) return;
  pendingState = '';
  const tokenHash = params.get('token_hash');
  const { error } = tokenHash ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }) : { error: null };
  // Eine bestehende Sitzung bleibt bei einem Fehlschlag erhalten
  await settle();
  if (!tokenHash && params.get('error') !== 'cancelled') set({ error: 'The sign-in did not finish. Try again.' });
  if (error) set({ error: 'The sign-in link expired. Try again.' });
}

export async function signIn() {
  pendingState = randomState();
  set({ status: 'waiting', error: '' });
  try {
    await invoke('auth_begin', { authUrl: AUTH_URL, state: pendingState });
  } catch (err) {
    pendingState = '';
    set({ status: 'signed-out', error: String(err) });
  }
}

export function cancelSignIn() {
  pendingState = '';
  set({ status: 'signed-out', error: '' });
}

export async function verifyCode(code: string) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  const factorId = data?.totp[0]?.id;
  if (error || !factorId) return set({ error: 'No authenticator app is set up for this account.' });
  const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (result.error) return set({ error: 'That code is not right. Try the current one.' });
  await settle();
}

// Nur diese App abmelden, die Sitzung im Browser bleibt
export async function signOut() {
  await supabase.auth.signOut({ scope: 'local' });
  set({ status: 'signed-out', email: '', error: '' });
}

export async function accessToken(): Promise<string | null> {
  const { session } = (await supabase.auth.getSession()).data;
  return useAccount.getState().status === 'signed-in' ? (session?.access_token ?? null) : null;
}

let started = false;

export function startAccount() {
  if (started) return;
  started = true;
  if (isTauri()) void listen<string>('pulse-auth', (e) => void completeSignIn(e.payload));
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') set({ status: 'signed-out', email: '' });
  });
  void settle();
}

// Nur zum Testen im Dev-Server ohne Loopback: Token der Desktop-Seite direkt einlösen
export function devSignIn(tokenHash: string) {
  pendingState = randomState();
  return completeSignIn(new URLSearchParams({ token_hash: tokenHash, state: pendingState }).toString());
}
