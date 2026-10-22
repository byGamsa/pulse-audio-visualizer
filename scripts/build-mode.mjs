// Baut einen Modus-Ordner (index.ts, manifest.json, thumb.webp) zu einem installierbaren Paket
// node scripts/build-mode.mjs <ordner> [--out <ziel>]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const SDK_VERSION = 1;
const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
let outRoot = resolve(root, '.mode-packages');
const dirs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outRoot = resolve(args[++i]);
  else dirs.push(args[i]);
}

if (dirs.length === 0) {
  console.error('usage: node scripts/build-mode.mjs <mode-dir> [--out <dir>]');
  process.exit(1);
}

for (const dir of dirs.map((d) => resolve(d))) {
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  if (!/^[a-z0-9-]{2,48}$/.test(manifest.id ?? '')) throw new Error(`${dir}: invalid id`);
  if (manifest.id !== basename(dir)) throw new Error(`${dir}: folder name must match id "${manifest.id}"`);
  if (manifest.sdk !== SDK_VERSION) throw new Error(`${dir}: sdk must be ${SDK_VERSION}`);

  const out = resolve(outRoot, manifest.id);
  mkdirSync(out, { recursive: true });
  await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
      outDir: out,
      emptyOutDir: true,
      target: 'es2022',
      minify: true,
      lib: {
        entry: resolve(dir, 'index.ts'),
        formats: ['iife'],
        name: `__PULSE_MODES__.m_${manifest.id.replace(/-/g, '_')}`,
        fileName: () => 'mode.js',
      },
      rollupOptions: {
        // three und das SDK stellt die App bereit, nicht das Paket
        external: ['three', '@pulse/sdk'],
        output: { extend: true, exports: 'default', globals: { three: '__PULSE_SDK__.three', '@pulse/sdk': '__PULSE_SDK__.sdk' } },
      },
    },
  });
  writeFileSync(resolve(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (existsSync(resolve(dir, 'thumb.webp'))) copyFileSync(resolve(dir, 'thumb.webp'), resolve(out, 'thumb.webp'));
  else console.warn(`${manifest.id}: no thumb.webp`);
  console.log(`${manifest.id} ${manifest.version} -> ${out}`);
}
