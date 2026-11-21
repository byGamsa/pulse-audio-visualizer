// Nachrichten zwischen Gastseite (embed.js) und eingebetteter App, per postMessage
export const PROTOCOL = 'pulse-embed';

export type HostMessage =
  // Fragt nach, ob die Einbettung schon bereit ist, falls „ready“ vor connect() kam
  | { pulse: typeof PROTOCOL; type: 'hello' }
  // Ein Frame im Layout von FRAME_FLOATS, ca. 60 Hz
  | { pulse: typeof PROTOCOL; type: 'frame'; frame: Float32Array }
  | { pulse: typeof PROTOCOL; type: 'mode'; id: string }
  | { pulse: typeof PROTOCOL; type: 'palette'; id: string };

export type EmbedMessage = { pulse: typeof PROTOCOL; type: 'ready' };

export function isProtocolMessage(data: unknown): data is { pulse: typeof PROTOCOL; type: string } {
  return typeof data === 'object' && data !== null && (data as { pulse?: unknown }).pulse === PROTOCOL;
}
