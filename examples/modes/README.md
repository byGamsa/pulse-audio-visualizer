# Mode packages

Modes that are not built into Pulse ship as packages and are installed at runtime. A package is a folder with three files:

| File | Content |
| --- | --- |
| `mode.js` | The mode as an IIFE bundle. `three` and `@pulse/sdk` are provided by the app, not bundled. |
| `manifest.json` | `id`, `name`, `version`, `sdk`, `author`, `category`, `description`, `gpuCost`, optional `vivid` and `palette` |
| `thumb.webp` | Preview image |

## Writing a mode

A source folder holds `index.ts`, `manifest.json` and `thumb.webp`. The folder name must match the `id`. `index.ts` imports building blocks from `@pulse/sdk` (see `src/sdk/index.ts`) and default-exports `defineMode({ create })`. Every mode must respect the selected palette through `tint()`.

```bash
node scripts/build-mode.mjs examples/modes/test-signal
```

The package lands in `.mode-packages/<id>/`. The dev server (`pnpm dev`) serves that folder as installed modes. After a rebuild, run `await __syncModes()` in the console and reload the page.

With a signing key (`node scripts/mode-key.mjs`, stored in `~/.pulse/mode-signing.key`), the script also writes `.mode-packages/<id>-<version>.pulsemode`. That is the file the desktop app installs. In `pnpm tauri dev`, run `await __installModeFile('<path>')` in the console.

## Desktop installation

`src-tauri/src/modes.rs` checks every package before it is installed and again on every start: only the files above, SHA-256 hashes signed with Ed25519 against `MODE_PUBLIC_KEY`, a valid `id` and a matching `sdk`. Installed packages live in the app data folder (`modes/<id>/`), so app updates leave them alone. The app loads them through the `pulsemode://` protocol. The web app has no installable modes.

## Compatibility

`SDK_VERSION` in `src/sdk/index.ts` and `manifest.sdk` must match. Additions to the SDK keep the version. Removing or changing an export needs a new version.
