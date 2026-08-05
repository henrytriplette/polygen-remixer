# 🎵 Remix Studio

A browser-based sampler / beat machine that sits between a DJ sampler and a
drum machine. Drop in a single audio sample, reshape it, layer synthesized
drums and a bassline, run it through effects, and hear the result live — no
page reloads, everything driven by the Web Audio API.

Built with Vue 3 + TypeScript + Vite. Zero runtime audio dependencies: the drum
kit and synth are generated with oscillators and noise, so the app ships with a
full instrument set and no binary sample files.

## Run

```bash
npm install
npm run dev
```

Then open the printed local URL. Drag an audio file onto the top bar (or click
Upload) to begin.

## What's implemented

- **Upload & analysis** — decode any audio file, then use a Web Worker to estimate BPM
  (onset-envelope autocorrelation), musical key (chroma + Krumhansl profiles),
  transients (spectral-flux onsets), duration and loudness.
- **Sample editor** — canvas waveform with bar markers and a live playhead,
  pitch (rotary knob, ±12 semitones), time-stretch (0.5–2×), reverse, and
  slice modes (Auto / Manual-even / Random-glitch). Slices are re-sequenced
  across the loop so the sample plays in time.
- **16-step sequencer** — Kick / Snare / Hat / Clap lanes with per-step
  velocity (right-click), probability (double-click) and accent (shift-click).
  A drum library of 808/909/House/Trap/etc. voices you can audition and assign.
- **Piano roll** — click to place bass/melody notes over a two-octave grid,
  played by a subtractive synth (saw/square/sine/triangle).
- **Effects rack** — per-channel insert chain you can add to, remove and
  reorder live: EQ, Filter (with XY pad), Reverb, Delay, Distortion, Chorus,
  Compressor, Bit Crusher, Phaser, Flanger.
- **Mixer** — Sample / Beat / Bass / FX strips with volume, pan, mute, solo and
  animated peak meters.
- **Transport** — play/stop, loop, metronome, BPM, bar-length. Spacebar plays.
- **Smart Remix panel** — one-click algorithmic transforms (generate pattern,
  generate bassline, lo-fi, house, DnB, trap, darker, more energetic). Each is
  non-destructive and undoable.
- **Performance mode** — 8 large pads (slices + drums) with keyboard triggers
  (1-4 / Q-W-E-R). A/S/D/F audition the drum lanes.
- **Export** — render the live mixer, insert effects and limiter to WAV via an
  OfflineAudioContext; save/load a self-contained `.remix.json` project file
  with the active sample embedded.
- **Undo / redo** across edits.

## Architecture

Timing-critical audio lives in framework-agnostic modules under `src/audio/`
(engine, scheduler, drums, synth, effects, analysis, sample player, WAV export).
A single reactive store (`src/store.ts`) bridges UI state to the engine; the
engine's look-ahead scheduler reads the store on each 16th-note step. Vue
components in `src/components/` are thin views over that store.

## Honest limitations

- BPM / key detection are lightweight estimates, not production-grade MIR.
- Time-stretch uses playback-rate (so pitch tracks speed) rather than a phase
  vocoder — solid and glitch-free, but not formant-preserving.
- The Smart Remix panel is rule-based, not a trained model.
- MP3 export isn't wired up yet (WAV + project JSON are). The Export button
  produces a WAV.
