import { useEffect, useRef } from 'react';
import { RemoteAudioSource } from '../audio/RemoteAudioSource';
import { Engine } from '../engine/Engine';
import { useSettings } from '../store/settings';
import { isModeId, isPaletteId, readEmbedParams } from './params';
import { PROTOCOL, isProtocolMessage, type EmbedMessage, type HostMessage } from './protocol';

// Eingebettet auf einer fremden Seite: nichts wird gespeichert
const NO_STORAGE = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// Die Gastseite kennt den Origin der Einbettung, die Einbettung den der Gastseite nicht
function announce() {
  if (window.parent !== window) window.parent.postMessage({ pulse: PROTOCOL, type: 'ready' } satisfies EmbedMessage, '*');
}

// Nur die Visuals, ohne Oberfläche; Audio und Steuerung kommen von der Gastseite
export function EmbedApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const params = readEmbedParams();
    useSettings.persist.setOptions({ storage: NO_STORAGE });
    const s = useSettings.getState();
    s.reset();
    s.setVisual({ paletteId: params.paletteId, renderScale: params.renderScale });
    if (params.sensitivity !== null) s.setAudio({ sensitivity: params.sensitivity });
    s.setPlayback({ mode: params.playback, hold: false, ...(params.shuffleDuration !== null && { shuffleDuration: params.shuffleDuration }) });
    s.setUi({ showHud: false });

    const engine = new Engine(canvasRef.current!);
    const source = new RemoteAudioSource();
    engine.setSource(source);
    engine.start();
    void engine.setMode(params.modeId ?? s.playback.modeId, 0);
    if (import.meta.env.DEV) Object.assign(window, { __pulse: engine });

    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !isProtocolMessage(e.data)) return;
      const m = e.data as HostMessage;
      if (m.type === 'hello') announce();
      else if (m.type === 'frame' && m.frame instanceof Float32Array) source.push(m.frame);
      else if (m.type === 'mode' && isModeId(m.id)) engine.playback.select(m.id);
      else if (m.type === 'palette' && isPaletteId(m.id)) useSettings.getState().setVisual({ paletteId: m.id });
    };
    window.addEventListener('message', onMessage);
    announce();

    return () => {
      window.removeEventListener('message', onMessage);
      engine.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-pure-ink">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
