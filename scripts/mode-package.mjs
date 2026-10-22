// Gemeinsam für build-mode.mjs und store-admin.mjs: Format und Signatur von .pulsemode-Dateien
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Muss zu signed_message() in src-tauri/src/modes.rs passen
export function signedMessage(files) {
  const lines = Object.keys(files)
    .sort()
    .map((name) => `${name}\t${createHash('sha256').update(files[name]).digest('hex')}\n`);
  return Buffer.from(`pulse-mode-v1\n${lines.join('')}`);
}

// Der öffentliche Schlüssel steht nur einmal im Repo, in modes.rs
function publicKey() {
  const rs = readFileSync(fileURLToPath(new URL('../src-tauri/src/modes.rs', import.meta.url)), 'utf8');
  const raw = Buffer.from(/MODE_PUBLIC_KEY: &str = "([^"]+)"/.exec(rs)[1], 'base64');
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]);
  return createPublicKey({ key: spki, format: 'der', type: 'spki' });
}

export function readPackage(path) {
  const bytes = readFileSync(path);
  const envelope = JSON.parse(bytes.toString('utf8'));
  const files = Object.fromEntries(Object.entries(envelope.files).map(([n, d]) => [n, Buffer.from(d, 'base64')]));
  if (!verify(null, signedMessage(files), publicKey(), Buffer.from(envelope.signature, 'base64'))) {
    throw new Error(`${path}: signature does not match MODE_PUBLIC_KEY`);
  }
  return { bytes, files, manifest: JSON.parse(files['manifest.json'].toString('utf8')) };
}
