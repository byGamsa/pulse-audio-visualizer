import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { hasNativeAudio } from '../audio/NativeAudioSource';
import type { AudioSourceKind } from '../audio/types';

export interface Track {
  title: string;
  artist: string;
  album: string;
  // Lesbarer Name der abspielenden App, z. B. „Spotify“
  app: string;
  playing: boolean;
  artwork: string | null;
}

interface NativeTrack {
  title: string;
  artist: string;
  album: string;
  app: string;
  playing: boolean;
  artwork: string | null;
}

// App-IDs wie „Spotify.exe“ lesbar machen
function prettyApp(id: string): string {
  const known: [RegExp, string][] = [
    [/spotify/i, 'Spotify'],
    [/brave/i, 'Brave'],
    [/chrome/i, 'Chrome'],
    [/msedge|edge/i, 'Edge'],
    [/firefox/i, 'Firefox'],
    [/applemusic|itunes/i, 'Apple Music'],
    [/zunemusic|mediaplayer/i, 'Media Player'],
    [/vlc/i, 'VLC'],
    [/tidal/i, 'Tidal'],
    [/deezer/i, 'Deezer'],
    [/soundcloud/i, 'SoundCloud'],
  ];
  for (const [re, name] of known) if (re.test(id)) return name;
  return id.replace(/\.exe$/i, '').split(/[!._]/)[0];
}

// „Künstler - Titel.mp3“ → { artist, title }
function fromFileName(name: string): Pick<Track, 'title' | 'artist'> {
  const base = name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ').trim();
  const parts = base.split(/\s+[-–—]\s+/);
  return parts.length >= 2 ? { artist: parts[0], title: parts.slice(1).join(' – ') } : { artist: '', title: base };
}

const POLL_MS = 1500;

// Desktop: Windows-Mediensteuerung, Browser: Datei oder Demo
export function useNowPlaying(sourceKind: AudioSourceKind | null, sourceLabel: string | null): Track | null {
  const [native, setNative] = useState<Track | null>(null);

  useEffect(() => {
    if (!hasNativeAudio()) return;
    let alive = true;
    const poll = async () => {
      try {
        const t = await invoke<NativeTrack | null>('now_playing');
        if (!alive) return;
        setNative((prev) => {
          if (!t) return null;
          const next: Track = { ...t, app: prettyApp(t.app), artwork: t.artwork ?? null };
          // Nur bei Änderung neu setzen
          return prev && prev.title === next.title && prev.artist === next.artist && prev.playing === next.playing && prev.artwork === next.artwork ? prev : next;
        });
      } catch {
        if (alive) setNative(null);
      }
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (native) return native;
  if (sourceKind === 'demo') return { title: 'Demo-Beat', artist: 'Pulse', album: '124 BPM', app: 'Pulse', playing: true, artwork: null };
  if (sourceKind === 'file' && sourceLabel) return { ...fromFileName(sourceLabel), album: '', app: 'Datei', playing: true, artwork: null };
  return null;
}

// Schlüssel, an dem ein Liedwechsel erkannt wird
export function trackKey(t: Track | null) {
  return t ? `${t.artist}\u0001${t.title}` : '';
}
