import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev-Server: speichert Vorschaubilder in public/thumbs
function thumbnailSink(): Plugin {
  const dir = fileURLToPath(new URL('./public/thumbs', import.meta.url));
  return {
    name: 'pulse-thumbnail-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__thumbs/', (req, res) => {
        const id = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (req.method !== 'POST' || !/^[a-z0-9-]+$/.test(id)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync(dir, { recursive: true });
          writeFileSync(resolve(dir, `${id}.webp`), Buffer.concat(chunks));
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

// Tauri braucht einen festen Port
export default defineConfig({
  plugins: [react(), tailwindcss(), thumbnailSink()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  // three.js allein hat ~700 kB
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
});
