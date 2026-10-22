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

## Compatibility

`SDK_VERSION` in `src/sdk/index.ts` and `manifest.sdk` must match. Additions to the SDK keep the version. Removing or changing an export needs a new version.
