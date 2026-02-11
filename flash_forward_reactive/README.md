# Flash Forward Reactive

A new standalone project inspired by classic Flash-era showpieces (like Flash Forward winners), but built for modern live visuals + lighting control.

## What it does

- **Analyzes audio in real time** from microphone or uploaded music files.
- Computes feature signals: low/mid/high band energy, beat pulses, tempo estimate, spectral brightness, and mood tags.
- Generates a **reactive visual scene** on canvas in a nostalgic, high-energy style.
- Streams control frames to protocol bridges for:
  - **DMX (sACN/E1.31)**
  - **Art-Net**
  - **KiNET**
  - **ESP32 LED endpoints** over UDP JSON

## Why this architecture

The browser excels at immediate audio-reactive visuals and interaction, while Node.js handles UDP protocol output to lighting devices and controllers.

## Quick start

```bash
cd flash_forward_reactive
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables for protocol output

All outputs are disabled by default. Enable each output with the corresponding `*_ENABLED=1` variable.

```bash
DMX_ENABLED=1 DMX_HOST=192.168.1.50 DMX_PORT=5568 DMX_UNIVERSE=1 \
ARTNET_ENABLED=1 ARTNET_HOST=192.168.1.60 ARTNET_PORT=6454 ARTNET_UNIVERSE=0 \
KINET_ENABLED=1 KINET_HOST=192.168.1.70 KINET_PORT=6038 \
ESP32_ENABLED=1 ESP32_HOST=192.168.1.80 ESP32_PORT=4210 \
npm start
```

## Next upgrades to approach your full vision

1. Replace heuristic mood detection with ML embeddings (e.g. musicnn / essentia + classifier).
2. Add instrument separation (vocals, drums, bass, harmonic stems) and per-stem visual layers.
3. Build scene graph presets inspired by classic Flash motion design transitions.
4. Add timeline/keyframe authoring with live-reactive modulation.
5. Extend lighting mapper from 8 channels to full fixture patch + pixel mapping.
6. Add OSC + MIDI + SMPTE sync for show control.

This foundation is intentionally minimal but ready to evolve into a full audiovisual intelligence engine.
