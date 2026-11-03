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

## Quickstart

```bash
npm install
npm test        # run the vitest suite once, fully offline
npm run build   # strict type-check (tsc --noEmit)
npm start       # runs the build check and exits
```

## Example

```ts
import {
  LookaheadScheduler,
  createEmptyPattern,
  createTrack,
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
```

## How it works

- `src/audio/types.ts` — the `Step` / `Pattern` / `Track` / `Waveform` model, `StepEvent`, the `AudioContextLike` structural interface, and small factories (`createEmptyStep`, `createEmptyPattern`, `createTrack`).
- `src/audio/note.ts` — `midiToFrequency(midi) = 440 * 2^((midi - 69) / 12)` and `noteNameToMidi("A4") = 69`.
- `src/audio/voice.ts` — `createVoice(...)` builds one note: an oscillator (waveform + frequency) into a gain node with a `0 → peak → 0` envelope, connected to the destination and started/stopped at exact audio times. `triggerNote(...)` is the MIDI-note convenience wrapper.
- `src/audio/scheduler.ts` — `LookaheadScheduler` keeps a `nextStepTime` on the audio clock; every 25 ms tick it schedules all steps falling within the next 0.1 s, triggering voices for non-muted tracks and emitting `onStep` events. Tempo is re-read per step, so tempo changes apply live.
- `tests/helpers/mock-audio-context.ts` — a `MockAudioContext` with a manually advanced `currentTime` and spy `createOscillator` / `createGain` factories, so the scheduler and voices are tested with `vi.useFakeTimers()` and zero real audio.

## Running tests

```bash
npm test
```

Sample output:

```
 ✓ tests/audio/note.test.ts (8 tests)
 ✓ tests/audio/voice.test.ts (5 tests)
 ✓ tests/audio/scheduler.test.ts (7 tests)

 Test Files  3 passed (3)
      Tests  20 passed (20)
```

The scheduler tests advance a mocked audio clock with fake timers and assert exact step times (at 120 BPM: steps land at 0.050 s, 0.175 s, 0.300 s, …), note frequencies (A4 → 440 Hz), and that muted tracks and rests trigger nothing.

<!-- builder:roadmap:start -->
## Status

**In active development:** 1 of 4 milestones done.

## Roadmap

- [x] **Audio engine + lookahead scheduler with tests**: Pure TypeScript core: Step/Pattern model, note-to-frequency (A4=440 equal temperament), oscillator voice factory, and a lookahead scheduler (setInterval scheduling ahead on AudioContext.currentTime). Runnable now: vitest suite green with a mocked AudioContext proving step timing and note triggering; `npm test` is the day-1 artifact.
- [ ] **React step grid UI and live playback**: Vite + React grid (4 instrument tracks x 16 steps) with click-to-toggle cells, per-track waveform select (square/triangle/sawtooth/sine), tempo slider, play/stop, and a requestAnimationFrame-driven playhead highlight synced to the scheduler. Component tests with @testing-library/react verify toggling, waveform change, and transport state.
- [ ] **Offline WAV export and chiptune presets**: Render the pattern through OfflineAudioContext, encode 16-bit PCM WAV with a pure, byte-exact encoder (unit-tested against known header/RIFF bytes), and wire a download button. Add 3 built-in presets (bassline, arp, drums via noise buffer) and a test that exports a preset and validates the WAV chunk sizes and sample count.
- [ ] **Polish, accessibility, README demo assets**: Keyboard shortcuts (space=play, 1-4=track mute), swing control, ARIA labels/focus management on the grid, production build check, committed demo.wav in /public generated by the export path, and a README with setup, architecture diagram, animated GIF of the playing grid, and the downloadable .wav demo link. Final full offline test + build run.
<!-- builder:roadmap:end -->
