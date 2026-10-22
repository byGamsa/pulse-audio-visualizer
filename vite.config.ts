import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };

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

// Dev-Server: liefert gebaute Pakete aus .mode-packages als installierte Modi aus
function devModePackages(): Plugin {
  const dir = fileURLToPath(new URL('./.mode-packages', import.meta.url));
  const types: Record<string, string> = { js: 'text/javascript', json: 'application/json', webp: 'image/webp' };
  return {
    name: 'pulse-dev-mode-packages',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__modes/', (req, res) => {
        const path = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (path === 'index.json') {
          const ids = existsSync(dir) ? readdirSync(dir).filter((id) => existsSync(resolve(dir, id, 'manifest.json'))) : [];
          const list = ids.map((id) => JSON.parse(readFileSync(resolve(dir, id, 'manifest.json'), 'utf8')));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(list));
          return;
        }
        const match = /^([a-z0-9-]+)\/(mode\.js|manifest\.json|thumb\.webp)$/.exec(path);
        const file = match && resolve(dir, match[1], match[2]);
        if (!file || !existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('Content-Type', types[file.split('.').pop()!]);
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(file));
      });
    },
  };
}

// Tauri braucht einen festen Port
export default defineConfig({
  plugins: [react(), tailwindcss(), thumbnailSink(), devModePackages()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // three.js allein hat ~700 kB
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
});
