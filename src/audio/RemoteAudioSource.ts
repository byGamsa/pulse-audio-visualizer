import { BAND_COUNT, FRAME_FLOATS, WAVE_SIZE, type AudioSource } from './types';

const SILENT_DB = -200;
// Pausierte Musik schickt keine Frames mehr, dann nicht am letzten Bild hängen bleiben
const STALE_MS = 250;

// Fertige Frames von der Gastseite einer Einbettung
export class RemoteAudioSource implements AudioSource {
  readonly kind = 'remote';
  readonly label = 'Embedded audio';
  private latest: Float32Array = new Float32Array(FRAME_FLOATS).fill(SILENT_DB);
  private receivedAt = 0;

  push(frame: Float32Array) {
    if (frame.length !== FRAME_FLOATS) return;
    // Stille liefert der Analyser als -Infinity
    for (let i = 0; i < BAND_COUNT; i++) if (!Number.isFinite(frame[i])) frame[i] = SILENT_DB;
    this.latest = frame;
    this.receivedAt = performance.now();
  }

  private get stale() {
    return performance.now() - this.receivedAt > STALE_MS;
  }

  readBandsDb(out: Float32Array) {
    if (this.stale) out.fill(SILENT_DB);
    else out.set(this.latest.subarray(0, BAND_COUNT));
  }

  readWaveform(left: Float32Array, right: Float32Array) {
    if (this.stale) {
      left.fill(0);
      right.fill(0);
      return;
    }
    left.set(this.latest.subarray(BAND_COUNT, BAND_COUNT + WAVE_SIZE));
    right.set(this.latest.subarray(BAND_COUNT + WAVE_SIZE, BAND_COUNT + 2 * WAVE_SIZE));
  }

  readKick() {
    return this.stale ? 0 : this.latest[FRAME_FLOATS - 1];
  }

  dispose() {}
}
