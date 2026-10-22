<p align="center">
  <img src=".github/assets/readme/hero.webp" alt="Pulse: See what you hear." />
</p>

<p align="center">
  <a href="https://github.com/byGamsa/pulse-audio-visualizer/releases/latest"><img src="https://img.shields.io/badge/DOWNLOAD_FOR_WINDOWS-X64_SETUP_%E2%86%93-FF6A1F?style=for-the-badge&labelColor=140C08" alt="Download for Windows" /></a>
  &nbsp;
  <a href="#02-quick-start"><img src="https://img.shields.io/badge/BROWSER_%C2%B7_ANY_OS-RUN_FROM_SOURCE-352C27?style=for-the-badge&labelColor=140C08" alt="Run in the browser" /></a>
</p>

<p align="center">
  <a href="https://github.com/byGamsa/pulse-audio-visualizer/releases/latest"><img src="https://img.shields.io/github/v/release/byGamsa/pulse-audio-visualizer?style=flat-square&label=VERSION&labelColor=140C08&color=FF6A1F" alt="version" /></a>
  <a href="#01-features"><img src="https://img.shields.io/badge/MODES-60-352C27?style=flat-square&labelColor=140C08" alt="modes" /></a>
  <a href="#02-quick-start"><img src="https://img.shields.io/badge/PLATFORM-WINDOWS_%C2%B7_BROWSER-352C27?style=flat-square&labelColor=140C08" alt="platform" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/NODE-%E2%89%A5_22-352C27?style=flat-square&labelColor=140C08" alt="node" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/LICENSE-NON--COMMERCIAL-352C27?style=flat-square&labelColor=140C08" alt="license" /></a>
</p>

<br />

> *You hear it. But have you ever seen it?*

**Pulse turns whatever your computer plays into light, in real time.** Spotify, a YouTube video, a DJ set, your microphone or a file. Pulse listens and renders it across 60 modes, from organic fields and particle storms to retro terminals, line art and neon tunnels. It runs in any browser or as a native desktop app on Windows.

And it actually listens. A multi-resolution FFT with beat and BPM detection drives every frame, transitions land on the beat, and the now playing card picks up cover art from Spotify, browsers, Apple Music and VLC. An HDR pipeline with bloom, AgX tone mapping and film grain makes it feel like stage lighting, not a media player plugin.

Everything runs **100% locally**: no cloud, no telemetry, no account. **Your audio never leaves your machine.**

<p align="center">
  <img src=".github/assets/readme/stats.webp" alt="60 modes across six worlds, 10 palettes for every mode, 12 transitions cut on the beat, 0 bytes of your audio that leave your machine" />
</p>

<p align="center">
  <img src=".github/assets/readme/modes.webp" alt="Pick a world: Halo, Neon Tunnel, Liquid Silk, Nebula Galaxy, Aurora, Silk Ribbon, Phosphor Scope and Cosmic Tunnel, recorded in the app" />
</p>

<p align="center">
  <img src=".github/assets/readme/palettes.webp" alt="Same beat, new color: Standard, Synthwave, Aurora, Magma, Glacier, Cyber, Mono, Sunset, Toxic and Neon" />
</p>

## `/01/` Features

- **60 modes** in six categories: organic, particles, retro, ambient, line art and signature
- **HDR pipeline** with bloom, AgX tone mapping, chromatic aberration, film grain and vignette
- **12 transitions** between modes, optionally synced to the beat
- **Playlists, shuffle and single mode** with per-item duration, palette and transition, import and export as JSON
- **Audio analysis** with multi-resolution FFT, auto gain, beat and BPM detection
- **System audio without detours**: WASAPI loopback in the desktop app, any input or output device
- **Now playing** with cover art from the Windows media controls (Spotify, browsers, Apple Music, VLC …)
- **Palettes** that can be applied to every mode, and dynamic resolution for weaker GPUs

## `/02/` Quick start

```bash
git clone https://github.com/byGamsa/pulse-audio-visualizer.git
cd pulse-audio-visualizer
pnpm install
pnpm dev
```

The app now runs at http://localhost:1420 (see [requirements](#03-requirements) if something is missing). In the browser, system audio comes in via screen sharing, so tick "Share system audio". Without your own music, the built-in demo beat is enough.

For the desktop app:

```bash
pnpm tauri dev
```

## `/03/` Requirements

| Tool | Version | Used for |
|---|---|---|
| [Node.js](https://nodejs.org) | 22 or newer | Frontend |
| [pnpm](https://pnpm.io) | 10 or newer | Package management |
| [Rust](https://rustup.rs) | stable | Desktop app only |
| MSVC Build Tools | current | Desktop app on Windows only |

On Windows, install Rust with `winget install Rustlang.Rustup`. The build tools come with the Visual Studio Installer (workload "Desktop development with C++"). WebView2 already ships with Windows 11.

## `/04/` Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Vite dev server with hot reload |
| `pnpm build` | Type check and production build into `dist/` |
| `pnpm preview` | Serve the build locally |
| `pnpm typecheck` | Type check only |
| `pnpm tauri dev` | Desktop app in development mode |
| `pnpm tauri build` | Build the desktop installers |

Run the Rust tests with:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## `/05/` Building

### Web

```bash
pnpm build
```

The output in `dist/` can be served by any static web server.

### Desktop

```bash
pnpm tauri build
```

The installers end up in `src-tauri/target/release/bundle/` (`nsis/*.exe` and `msi/*.msi`). Prebuilt installers are available under [Releases](https://github.com/byGamsa/pulse-audio-visualizer/releases).

## `/06/` Controls

| Key | Action |
|---|---|
| `←` `→` | Previous / next mode |
| `M` | All modes |
| `P` | Playback and playlists |
| `Space` | Hold the current mode |
| `S` | Settings |
| `F` | Fullscreen |
| `H` | Toggle HUD |
| `Esc` | Close open panels |

## `/07/` Project structure

```
src/
  audio/      Audio sources (Web Audio, native) and FeatureBus
  engine/     Render loop, transitions, palettes, mode registry
    field/    Shared audio field, lines and dot grids
    text/     Glyph atlas and text grid for the retro modes
  modes/      One folder per mode
  media/      Now playing
  store/      Settings and playlists (zustand)
  ui/         React interface
  dev/        Dev server only tools
src-tauri/    Desktop shell in Rust (capture, analysis, media controls)
public/thumbs Mode thumbnails
```

## `/08/` Adding a new mode

1. Create `src/modes/<id>/index.ts` that default-exports a `ModeDefinition`
2. Register the mode in `src/engine/ModeRegistry.ts` with name, category, description and `gpuCost`
3. Add a fallback cover in `src/ui/modeArt.ts`
4. With the dev server and the demo beat running, call `await __captureThumbnails(['<id>'])` in the console; the thumbnail lands in `public/thumbs`

A mode receives the `AudioFeatures` every frame and draws into an HDR target (RGBA16F, linear). Bloom, tone mapping and transitions are handled by the engine.

## `/09/` Contributing

Contributions are welcome. Nobody can push to `main` directly, every change goes through a pull request.

1. Fork and clone the repository
2. Create a branch from `main`, e.g. `feat/new-mode` or `fix/beat-detection`
3. Commit using [Conventional Commits](https://www.conventionalcommits.org):
   - `feat: …` new feature
   - `fix: …` bug fix
   - `chore: …` maintenance, dependencies, tooling
   - `refactor: …`, `docs: …`, `test: …`
4. Check locally before pushing:
   ```bash
   pnpm typecheck
   pnpm build
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
5. Open a pull request against `main` and fill in the template. For visible changes, please attach a screenshot or a short video
6. CI has to pass and a maintainer has to approve the PR. PRs are squash merged

See [CONTRIBUTING.md](CONTRIBUTING.md) for details. Please report bugs and ideas as an [issue](https://github.com/byGamsa/pulse-audio-visualizer/issues).

### Rules for `main`

- Changes only via pull request, at least one approval from the code owner
- CI (type check, build, Rust tests) must pass
- The branch must be up to date and all review comments resolved
- Linear history, no force pushes, the branch cannot be deleted

## `/10/` Versioning

Releases follow [Semantic Versioning](https://semver.org). Every version gets a `vX.Y.Z` tag and a GitHub release with changelog and, from v0.3.0 on, Windows installers.

## `/11/` License

Pulse is free for personal and other non-commercial use under the [Pulse Non-Commercial License](LICENSE). Commercial use, such as selling it, bundling it into a paid product or using it at paid events, requires written permission. Open an issue to ask for a commercial license.

<br />

<p align="center">
  <a href="https://github.com/byGamsa/pulse-audio-visualizer/releases/latest"><img src=".github/assets/readme/cta.webp" alt="Ready to see what you hear? Download for Windows" /></a>
</p>

<p align="center">
  <img src=".github/assets/readme/footer.webp" alt="Music you only hear is an empty frame." />
</p>
