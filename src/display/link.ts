import type { AudioFeatures } from '../audio/types';
import type { TransitionChoice } from '../engine/transitions';
import type { Track } from '../media/nowPlaying';

// Haupt- und Ausgabefenster teilen sich den Origin, ein BroadcastChannel genügt
const CHANNEL = 'pulse-display';

export type DisplayMessage =
  // Haupt → Ausgabe, jeden Frame
  | { type: 'frame'; features: AudioFeatures; palette: string | null }
  | { type: 'mode'; id: string; seconds: number; transition: TransitionChoice }
  // Haupt → Ausgabe, bei Liedwechsel
  | { type: 'track'; track: Track | null }
  // Ausgabe → Haupt: bereit, bitte aktuellen Modus schicken
  | { type: 'hello' }
  // Ausgabe → Haupt, jeden Frame: gibt den Takt vor, auch wenn das Hauptfenster minimiert ist
  | { type: 'tick' }
  | { type: 'next'; direction: 1 | -1 }
  // Ausgabe → Haupt, alle 0,5 s: tatsächliche Renderauflösung für das HUD
  | { type: 'stats'; renderScale: number; width: number; height: number };

export type SendToDisplay = (m: DisplayMessage) => void;

export const isDisplayWindow = () => location.hash === '#display';

export function openLink(onMessage: (m: DisplayMessage) => void) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<DisplayMessage>) => onMessage(e.data);
  return {
    send: ((m) => channel.postMessage(m)) as SendToDisplay,
    close: () => channel.close(),
  };
}
