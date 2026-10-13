# Contributing

Thanks for helping to improve Pulse. This is how a contribution works.

## Setup

```bash
pnpm install
pnpm dev          # Browser
pnpm tauri dev    # Desktop app
```

The desktop app needs Rust (stable) and, on Windows, the MSVC Build Tools, see the [README](README.md#requirements).

## Workflow

1. For larger changes, open an issue first and briefly discuss the idea
2. Fork the repository and create a branch from `main`:
   - `feat/<short-description>` for new features
   - `fix/<short-description>` for bug fixes
   - `chore/<short-description>` for maintenance
3. Keep commits small and self-contained, formatted as `type: description`, lowercase and without a trailing period, e.g. `feat: oil paint mode` or `fix: wait for fonts before building the glyph atlas`
4. Open a pull request against `main` and fill in the template

## Checks

CI checks every pull request. Run the same checks locally first:

```bash
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

A PR is only merged when all checks pass, all comments are resolved and a code owner has approved it. PRs are squash merged, so the history on `main` stays linear.

## Code style

- Strict TypeScript, no unused variables
- Comments only where the code does not explain itself, short and on a single line
- One mode per folder under `src/modes/<id>/`, metadata in `src/engine/ModeRegistry.ts`
- Expensive work belongs on the GPU; no allocations in the per-frame update loop

## New modes

See the [README](README.md#adding-a-new-mode). Please include a thumbnail at `public/thumbs/<id>.webp` and keep an eye on the FPS in the HUD on an average GPU.
