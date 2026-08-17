import type { Engine } from '../engine/Engine';

const WIDTH = 384;
const HEIGHT = 216;

// Nur im Dev-Server: await __captureThumbnails() in der Konsole
export async function captureThumbnails(engine: Engine, ids?: string[], settle = 3200) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const done: string[] = [];
  for (const id of ids ?? engine.modes.map((m) => m.id)) {
    await engine.setMode(id, 0);
    await new Promise((r) => setTimeout(r, settle));
    await new Promise((r) => requestAnimationFrame(r));
    const src = engine.canvas;
    // Mittig auf 16:9 zuschneiden
    const aspect = WIDTH / HEIGHT;
    let sw = src.width, sh = src.width / aspect;
    if (sh > src.height) { sh = src.height; sw = sh * aspect; }
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, WIDTH, HEIGHT);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.86));
    if (!blob) continue;
    await fetch(`/__thumbs/${id}`, { method: 'POST', body: blob });
    done.push(id);
  }
  return done;
}
