import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { BAND_COUNT, WAVE_SIZE, type AudioSource, type AudioSourceKind } from './types';

// Muss zu FRAME_FLOATS in src-tauri/src/audio/analysis.rs passen
const FRAME_FLOATS = BAND_COUNT + 2 * WAVE_SIZE + 1;

export interface NativeDevice {
  name: string;
  kind: 'output' | 'input';
  isDefault: boolean;
}

interface CaptureInfo {
  name: string;
  sampleRate: number;
  channels: number;
  loopback: boolean;
  // Kennung dieser Aufnahme; beim Aufräumen wird nur genau sie gestoppt
  id: number;
}

export const hasNativeAudio = isTauri;

// Nach einem WebView-Reload läuft die alte Aufnahme in Rust weiter
export function stopStaleNativeCapture() {
  if (hasNativeAudio()) void invoke('audio_stop').catch(() => {});
}

export function listNativeDevices(): Promise<NativeDevice[]> {
  return invoke<NativeDevice[]>('audio_devices');
}

// Fertige Frames aus Rust (WASAPI), ca. 120 Hz
class NativeAudioSource implements AudioSource {
  private latest = new Float32Array(FRAME_FLOATS).fill(-200);
  private disposed = false;

  constructor(
    readonly kind: AudioSourceKind,
    readonly label: string,
    channel: Channel<ArrayBuffer>,
    private readonly captureId: number,
  ) {
    channel.onmessage = (buf) => {
      if (this.disposed || buf.byteLength !== FRAME_FLOATS * 4) return;
      this.latest = new Float32Array(buf);
    };
  }

  readBandsDb(out: Float32Array) {
    out.set(this.latest.subarray(0, BAND_COUNT));
  }

  readWaveform(left: Float32Array, right: Float32Array) {
    left.set(this.latest.subarray(BAND_COUNT, BAND_COUNT + WAVE_SIZE));
    right.set(this.latest.subarray(BAND_COUNT + WAVE_SIZE, BAND_COUNT + 2 * WAVE_SIZE));
  }

  readKick() {
    return this.latest[FRAME_FLOATS - 1];
  }

  dispose() {
    this.disposed = true;
    // Nur die eigene Aufnahme stoppen
    void invoke('audio_stop', { id: this.captureId });
  }
}

export async function createNativeSource(device: string | undefined, loopback: boolean): Promise<AudioSource> {
  const channel = new Channel<ArrayBuffer>();
  const info = await invoke<CaptureInfo>('audio_start', { device: device ?? null, loopback, onFrame: channel });
  const label = loopback ? `Systemaudio · ${info.name}` : info.name;
  return new NativeAudioSource(loopback ? 'display' : 'mic', label, channel, info.id);
}
