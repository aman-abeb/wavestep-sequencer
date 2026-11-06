# WaveStep

<!-- builder:badges:start -->
[![CI](https://github.com/aman-abeb/wavestep-sequencer/actions/workflows/ci.yml/badge.svg)](https://github.com/aman-abeb/wavestep-sequencer/actions/workflows/ci.yml) ![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/react-61DAFB?logo=react&logoColor=black) ![Vite](https://img.shields.io/badge/vite-646CFF?logo=vite&logoColor=white) ![License: MIT](https://img.shields.io/badge/license-MIT-green)
<!-- builder:badges:end -->


A browser step sequencer for chiptune loops: a 4-track × 16-step grid, Web Audio oscillators with per-track waveforms, and offline 16-bit WAV export. No accounts, no API keys, no network — everything runs locally in the browser.

> **Day-1 milestone:** the pure TypeScript audio core (note math, oscillator voices, lookahead scheduler) with a fully offline, mocked-`AudioContext` vitest suite. The React grid lands in Day 2.

## Features

- **Pure audio core** (`src/audio/`) — no DOM required at runtime, fully unit-testable
- **Equal-temperament note mapping** — `midiToFrequency` with A4 = 440 Hz, plus `noteNameToMidi` (`"C#4"` → 61)
- **Oscillator voice factory** — `createVoice` wires `OscillatorNode → GainNode → destination` with an attack/hold/release envelope scaled by velocity
- **Lookahead scheduler** — a `setInterval` every 25 ms schedules 16th-note steps 0.1 s ahead on `AudioContext.currentTime`, so timing stays sample-accurate even if the main thread stalls
- **Offline WAV export** — `renderLoopToWav` renders the current loop through an `OfflineAudioContext` and the pure `encodeWavPcm16` encoder emits a byte-exact 16-bit PCM `.wav`; the **Export WAV** button downloads it as `wavestep-loop.wav`

## Quickstart

```bash
npm install
npm test        # run the vitest suite once, fully offline
npm run dev     # open the playable sequencer in the browser
npm run build   # strict type-check (tsc --noEmit) + production bundle
```

## Example

```ts
import {
  LookaheadScheduler,
  createEmptyPattern,
  createTrack,
  renderLoopToWav,
} from './src/audio/index';

const bass = createTrack({ id: 'bass', name: 'Bass', waveform: 'square' });
const pattern = createEmptyPattern();
pattern[0] = { note: 33, velocity: 1 };   // A1
pattern[4] = { note: 33, velocity: 0.9 };
bass.pattern = pattern;

const scheduler = new LookaheadScheduler({
  context: audioContext, // a real AudioContext in the browser
  getTracks: () => [bass],
  getTempo: () => 120,   // BPM; a 16th note at 120 BPM lasts 0.125 s
  onStep: ({ stepIndex, time }) => console.log(`step ${stepIndex} @ ${time.toFixed(3)}s`),
});
scheduler.start(); // ... scheduler.stop() later

// Offline-render the same loop to 16-bit PCM WAV bytes (browser only):
const wavBytes = await renderLoopToWav({ tracks: [bass], tempoBpm: 120 });
// wrap in a Blob and trigger a download — see the Export WAV button in src/App.tsx
```

## How it works

- `src/audio/types.ts` — the `Step` / `Pattern` / `Track` / `Waveform` model, `StepEvent`, the `AudioContextLike` structural interface, and small factories (`createEmptyStep`, `createEmptyPattern`, `createTrack`).
- `src/audio/note.ts` — `midiToFrequency(midi) = 440 * 2^((midi - 69) / 12)` and `noteNameToMidi("A4") = 69`.
- `src/audio/voice.ts` — `createVoice(...)` builds one note: an oscillator (waveform + frequency) into a gain node with a `0 → peak → 0` envelope, connected to the destination and started/stopped at exact audio times. `triggerNote(...)` is the MIDI-note convenience wrapper.
- `src/audio/scheduler.ts` — `LookaheadScheduler` keeps a `nextStepTime` on the audio clock; every 25 ms tick it schedules all steps falling within the next 0.1 s, triggering voices for non-muted tracks and emitting `onStep` events. Tempo is re-read per step, so tempo changes apply live.
- `src/audio/wav.ts` — pure, byte-exact 16-bit PCM WAV encoder: `encodeWavPcm16` writes the canonical 44-byte RIFF/WAVE header plus little-endian int16 samples, and `floatToInt16` maps the -1..1 range to -32768..32767.
- `src/audio/export.ts` — `schedulePattern` places every active step of every unmuted track on an offline context at exact 16th-note times; `renderLoopToWav` sizes an `OfflineAudioContext` to the full loop (plus the release tail), awaits `startRendering()`, and returns WAV bytes. The **Export WAV** button in `src/App.tsx` wraps the bytes in an `audio/wav` Blob and downloads `wavestep-loop.wav`.
- `tests/helpers/mock-audio-context.ts` — a `MockAudioContext` with a manually advanced `currentTime` and spy `createOscillator` / `createGain` factories, so the scheduler and voices are tested with `vi.useFakeTimers()` and zero real audio.
- `tests/helpers/mock-offline-context.ts` — a `MockOfflineAudioContext` that records every scheduled voice with its start/stop times and resolves `startRendering()` to a deterministic `Float32Array`, so the export path is tested with zero real audio.

## Running tests

```bash
npm test
```

Sample output:

```
 ✓ tests/audio/note.test.ts (8 tests)
 ✓ tests/audio/voice.test.ts (5 tests)
 ✓ tests/audio/scheduler.test.ts (7 tests)
 ✓ tests/audio/wav.test.ts (7 tests)
 ✓ tests/audio/export.test.ts (8 tests)
 ✓ tests/state/pattern.test.ts (8 tests)
 ✓ tests/ui/step-grid.test.tsx (8 tests)
 ✓ tests/ui/app.test.tsx (2 tests)

 Test Files  8 passed (8)
      Tests  53 passed (53)
```

The scheduler tests advance a mocked audio clock with fake timers and assert exact step times (at 120 BPM: steps land at 0.050 s, 0.175 s, 0.300 s, …), note frequencies (A4 → 440 Hz), and that muted tracks and rests trigger nothing. The export tests render a known pattern through a mock `OfflineAudioContext` and assert the scheduled note count and per-step times, the WAV byte length (`44 + sampleCount * 2`), the RIFF/WAVE/fmt /data header fields, and the little-endian int16 conversion of the rendered samples.

<!-- builder:roadmap:start -->
## Status

**Complete.** WaveStep is a finished browser chiptune step sequencer featuring a 4x16 playable grid, Web Audio oscillators with per-track waveforms, offline 16-bit WAV export, and keyboard shortcuts. The project ships with a full offline test suite (102 tests), production build, README with architecture docs, and a demo WAV asset in /public.

## Roadmap

- [x] **Audio engine + lookahead scheduler with tests**: Pure TypeScript core: Step/Pattern model, note-to-frequency (A4=440 equal temperament), oscillator voice factory, and a lookahead scheduler (setInterval scheduling ahead on AudioContext.currentTime). Runnable now: vitest suite green with a mocked AudioContext proving step timing and note triggering; `npm test` is the day-1 artifact.
- [x] **React step grid UI and live playback**: Vite + React grid (4 instrument tracks x 16 steps) with click-to-toggle cells, per-track waveform select (square/triangle/sawtooth/sine), tempo slider, play/stop, and a requestAnimationFrame-driven playhead highlight synced to the scheduler. Component tests with @testing-library/react verify toggling, waveform change, and transport state.
- [x] **Offline WAV export and chiptune presets**: Render the pattern through OfflineAudioContext, encode 16-bit PCM WAV with a pure, byte-exact encoder (unit-tested against known header/RIFF bytes), and wire a download button. Add 3 built-in presets (bassline, arp, drums via noise buffer) and a test that exports a preset and validates the WAV chunk sizes and sample count.
- [x] **Polish, accessibility, README demo assets**: Keyboard shortcuts (space=play, 1-4=track mute), swing control, ARIA labels/focus management on the grid, production build check, committed demo.wav in /public generated by the export path, and a README with setup, architecture diagram, animated GIF of the playing grid, and the downloadable .wav demo link. Final full offline test + build run.
<!-- builder:roadmap:end -->
