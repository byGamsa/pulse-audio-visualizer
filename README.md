# Pulse

Real-time audio visualizer with HDR rendering, bloom and seamless mode transitions. Runs in the browser and as a desktop app.

## Getting started

```bash
pnpm install
pnpm dev          # Browser: http://localhost:1420
pnpm tauri dev    # Desktop app
```

The desktop app needs Rust once (`winget install Rustlang.Rustup`, then reopen the terminal) and the MSVC Build Tools; WebView2 already ships with Windows 11.

In the desktop app, "System audio" records directly via WASAPI loopback without a sharing dialog, and any input or output device can be selected. The now playing card (Settings → Look) shows the current track with cover art.

## Building

```bash
pnpm build          # Web, output in dist/
pnpm tauri build    # Installers in src-tauri/target/release/bundle/
```

## Controls

| Key | Action |
|---|---|
| `←` `→` | Previous / next mode |
| `M` | All modes |
| `P` | Playback and playlists |
| `Space` | Hold the current mode |
| `S` | Settings |
| `F` | Fullscreen |
| `H` | Toggle HUD |

Audio sources: system audio, audio file, microphone/line in and a built-in demo beat.

## Structure

- `src/audio/`: audio sources (Web Audio, native) and `FeatureBus`
- `src/engine/`: render loop, transitions, palettes, mode registry, playlists
- `src/modes/<id>/`: one folder per mode
- `src/ui/`: React interface
- `src-tauri/`: desktop shell in Rust

## License

MIT
