// Erzeugt den Ed25519-Schlüssel, mit dem Mode-Pakete signiert werden. Überschreibt nie einen vorhandenen
// node scripts/mode-key.mjs
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

const path = process.env.PULSE_MODE_KEY ?? resolve(homedir(), '.pulse', 'mode-signing.key');
if (existsSync(path)) {
  console.error(`${path} exists already`);
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
console.log(`private key: ${path}`);
console.log(`public key for MODE_PUBLIC_KEY in src-tauri/src/modes.rs: ${raw.toString('base64')}`);
