# Pulse

Real-time audio visualizer in the browser with HDR rendering, bloom and smooth mode transitions.

## Getting started

```bash
pnpm install
pnpm dev
```

The app now runs at http://localhost:5173.

## Audio sources

- **System audio** via screen sharing, tick "Share system audio" (Chrome/Edge)
- **File**: MP3, WAV, FLAC or OGG
- **Microphone** or line in
- **Demo**: built-in house loop at 124 BPM

## Controls

| Key | Action |
|---|---|
| `←` `→` | Previous / next mode |
| `S` | Settings |
| `F` | Fullscreen |
| `H` | Toggle HUD |

## Structure

- `src/audio/`: audio sources and `FeatureBus` (bands, smoothing, auto gain, beat/BPM)
- `src/engine/`: render loop, HDR targets, transitions, post FX, palettes, mode registry
- `src/modes/<id>/`: one folder per mode
- `src/ui/`: React interface

## License

MIT
