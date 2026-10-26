import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import * as THREE from 'three';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModeCategory, ModeDefinition, ModeMeta } from './types';

// Muss zu SDK_VERSION in src/sdk passen, hier als Zahl, damit das SDK erst beim Laden kommt
const SDK_VERSION = 1;
const CATEGORIES: readonly ModeCategory[] = ['organic', 'particles', 'retro', 'ambient', 'lineart', 'experimental'];

export interface ModeManifest {
  id: string;
  name: string;
  version: string;
  sdk: number;
  author: string;
  category: ModeCategory;
  description: string;
  gpuCost: 1 | 2 | 3;
  vivid?: number;
  palette?: string;
}

export interface InstalledMode {
  manifest: ModeManifest;
  // Ordner des Pakets mit mode.js und thumb.webp
  baseUrl: string;
}

// Woher installierte Pakete kommen: Dev-Server, später der App-Datenordner
export interface PackageSource {
  list(): Promise<InstalledMode[]>;
}

export function parseManifest(raw: unknown): ModeManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string' && v.length > 0;
  if (!str(m.id) || !/^[a-z0-9-]{2,48}$/.test(m.id as string)) return null;
  if (!str(m.name) || !str(m.version) || !str(m.author) || !str(m.description)) return null;
  if (m.sdk !== SDK_VERSION) return null;
  if (!CATEGORIES.includes(m.category as ModeCategory)) return null;
  if (m.gpuCost !== 1 && m.gpuCost !== 2 && m.gpuCost !== 3) return null;
  if (m.vivid !== undefined && typeof m.vivid !== 'number') return null;
  if (m.palette !== undefined && typeof m.palette !== 'string') return null;
  return {
    id: m.id as string,
    name: m.name as string,
    version: m.version as string,
    sdk: m.sdk,
    author: m.author as string,
    category: m.category as ModeCategory,
    description: m.description as string,
    gpuCost: m.gpuCost,
    vivid: m.vivid as number | undefined,
    palette: m.palette as string | undefined,
  };
}

export function packageMeta(p: InstalledMode): ModeMeta {
  const { id, name, category, description, gpuCost, vivid, palette, version, author } = p.manifest;
  return { id, name, category, description, gpuCost, vivid, palette, package: { version, author } };
}

interface InstalledState {
  modes: InstalledMode[];
  setModes: (modes: InstalledMode[]) => void;
}

export const INSTALLED_KEY = 'pulse-installed-modes';

// Gecacht, damit Playlists und der letzte Modus beim Start sofort bekannt sind
export const useInstalledModes = create<InstalledState>()(
  persist((set) => ({ modes: [], setModes: (modes) => set({ modes }) }), { name: INSTALLED_KEY, version: 1 }),
);

let active: { source: PackageSource | null; builtinIds: ReadonlySet<string> } | null = null;

// Ohne Quelle (Web-App) gibt es keine installierten Modi
export async function syncInstalledModes(source: PackageSource | null, builtinIds: ReadonlySet<string>) {
  active = { source, builtinIds };
  const modes = source ? (await source.list()).filter((m) => !builtinIds.has(m.manifest.id)) : [];
  useInstalledModes.getState().setModes(modes);
}

function refresh() {
  return active ? syncInstalledModes(active.source, active.builtinIds) : Promise.resolve();
}

function toInstalled(raw: unknown[], baseUrl: (id: string) => string): InstalledMode[] {
  return raw.flatMap((r) => {
    const manifest = parseManifest(r);
    return manifest ? [{ manifest, baseUrl: baseUrl(manifest.id) }] : [];
  });
}

// Nur Desktop: Rust prüft die Signatur, speichert im App-Datenordner und liefert per pulsemode:// aus
export const canInstallModes = isTauri();

export const tauriPackageSource: PackageSource = {
  async list() {
    return toInstalled(await invoke<unknown[]>('modes_list'), (id) => convertFileSrc(id, 'pulsemode'));
  },
};

// Inhalt einer .pulsemode-Datei
export async function installPackage(data: ArrayBuffer | Uint8Array): Promise<ModeManifest> {
  const manifest = parseManifest(await invoke('modes_install', data));
  await refresh();
  if (!manifest) throw new Error('This package needs a newer version of Pulse');
  return manifest;
}

export async function installPackageFile(path: string) {
  await invoke('modes_install_file', { path });
  await refresh();
}

export async function uninstallPackage(id: string) {
  await invoke('modes_uninstall', { id });
  await refresh();
}

// Nur im Dev-Server: gebaute Pakete aus .mode-packages (node scripts/build-mode.mjs)
export const devPackageSource: PackageSource = {
  async list() {
    const res = await fetch('/__modes/index.json');
    if (!res.ok) return [];
    return toInstalled((await res.json()) as unknown[], (id) => `/__modes/${id}`);
  },
};

type ModeGlobals = { __PULSE_SDK__?: unknown; __PULSE_MODES__?: Record<string, unknown> };

let sdkReady: Promise<void> | null = null;

function exposeSdk() {
  sdkReady ??= import('../sdk').then((sdk) => {
    (globalThis as ModeGlobals).__PULSE_SDK__ = { version: sdk.SDK_VERSION, three: THREE, sdk };
  });
  return sdkReady;
}

// Pakete sind IIFE-Bundles, die sich unter __PULSE_MODES__[key] eintragen
export function packageKey(id: string) {
  return `m_${id.replace(/-/g, '_')}`;
}

export async function loadPackage(p: InstalledMode): Promise<ModeDefinition> {
  await exposeSdk();
  const key = packageKey(p.manifest.id);
  const g = globalThis as ModeGlobals;
  if (g.__PULSE_MODES__) delete g.__PULSE_MODES__[key];
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${p.baseUrl}/mode.js?v=${encodeURIComponent(p.manifest.version)}`;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Mode package ${p.manifest.id} failed to load`));
    };
    document.head.appendChild(script);
  });
  const mod = g.__PULSE_MODES__?.[key] as { create?: unknown } | undefined;
  if (typeof mod?.create !== 'function') throw new Error(`Mode package ${p.manifest.id} has no create()`);
  return { meta: packageMeta(p), create: mod.create as ModeDefinition['create'] };
}
