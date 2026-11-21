import { BAND_COUNT, FRAME_FLOATS, WAVE_SIZE } from '../audio/types';
import { AnalysisGraph } from '../audio/WebAudioSource';
import { PROTOCOL, isProtocolMessage, type HostMessage } from './protocol';

// Läuft als embed.js auf der Gastseite: analysiert deren Musik und schickt die Frames ins iframe

export interface PulseConnection {
  setMode(id: string): void;
  setPalette(id: string): void;
  disconnect(): void;
}

type Control = Extract<HostMessage, { type: 'mode' | 'palette' }>;

// Ein Media-Element lässt sich nur einmal an einen AudioContext hängen
const mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

function mediaInput(el: HTMLMediaElement): AudioNode {
  let node = mediaSources.get(el);
  if (!node) {
    node = new AudioContext({ latencyHint: 'interactive' }).createMediaElementSource(el);
    node.connect(node.context.destination);
    mediaSources.set(el, node);
  }
  return node;
}

export function connect(audio: HTMLMediaElement | AudioNode | string, frame: HTMLIFrameElement | string): PulseConnection {
  const input = typeof audio === 'string' ? document.querySelector(audio) : audio;
  const iframe = typeof frame === 'string' ? document.querySelector(frame) : frame;
  if (!(iframe instanceof HTMLIFrameElement)) throw new Error('Pulse: iframe not found');
  if (!(input instanceof HTMLMediaElement) && !(input instanceof AudioNode)) throw new Error('Pulse: audio element not found');

  const node = input instanceof HTMLMediaElement ? mediaInput(input) : input;
  const ctx = node.context as AudioContext;
  const graph = new AnalysisGraph(ctx, node);
  const origin = new URL(iframe.src, location.href).origin;
  const controls = new Map<Control['type'], Control>();
  let ready = false;
  let raf = 0;

  const post = (m: HostMessage, transfer: Transferable[] = []) => iframe.contentWindow?.postMessage(m, origin, transfer);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!ready || ctx.state !== 'running') return;
    if (input instanceof HTMLMediaElement && input.paused) return;
    const f = new Float32Array(FRAME_FLOATS);
    graph.readBandsDb(f.subarray(0, BAND_COUNT));
    graph.readWaveform(f.subarray(BAND_COUNT, BAND_COUNT + WAVE_SIZE), f.subarray(BAND_COUNT + WAVE_SIZE, BAND_COUNT + 2 * WAVE_SIZE));
    f[FRAME_FLOATS - 1] = graph.readKick();
    post({ pulse: PROTOCOL, type: 'frame', frame: f }, [f.buffer]);
  };

  // Browser starten Audio erst nach einer Nutzeraktion
  const resume = () => {
    if (ctx.state === 'suspended') void ctx.resume();
  };

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow || e.origin !== origin || !isProtocolMessage(e.data) || e.data.type !== 'ready') return;
    // Auch nach einem Neuladen des iframes die letzte Auswahl wiederherstellen
    ready = true;
    for (const m of controls.values()) post(m);
  };

  const control = (m: Control) => {
    controls.set(m.type, m);
    if (ready) post(m);
  };

  const hello = () => post({ pulse: PROTOCOL, type: 'hello' });

  window.addEventListener('message', onMessage);
  iframe.addEventListener('load', hello);
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
  if (input instanceof HTMLMediaElement) input.addEventListener('play', resume);
  resume();
  hello();
  tick();

  return {
    setMode: (id) => control({ pulse: PROTOCOL, type: 'mode', id }),
    setPalette: (id) => control({ pulse: PROTOCOL, type: 'palette', id }),
    disconnect() {
      cancelAnimationFrame(raf);
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', hello);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      if (input instanceof HTMLMediaElement) input.removeEventListener('play', resume);
      graph.dispose();
    },
  };
}
