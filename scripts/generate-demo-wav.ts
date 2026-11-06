/// <reference types="node" />
/**
 * Generates the committed demo asset `public/demo.wav` through the real
 * export path: a built-in preset is rendered by `renderLoopToWav` and encoded
 * by the byte-exact 16-bit PCM WAV encoder in `src/audio/wav.ts`.
 *
 * Node has no `OfflineAudioContext`, so the render runs on
 * `SynthOfflineContext`, a small deterministic software synthesizer that
 * satisfies the same `OfflineAudioContextLike` contract: it records every
 * scheduled voice and mixes oscillators / noise buffers into the sample
 * buffer when `startRendering()` is called. The demo preset has no noise
 * track, so the output WAV is byte-for-byte reproducible.
 *
 * Usage: `npm run demo:wav`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_EXPORT_SAMPLE_RATE,
  loopDurationSeconds,
  renderLoopToWav,
  type AudioBufferLike,
  type OfflineAudioContextLike,
} from '../src/audio/export';
import type { OscillatorWaveform } from '../src/audio/voice';
import { createStateFromPreset, getPreset } from '../src/state/presets';

/** Preset rendered into the demo WAV (noise-free, so the render is deterministic). */
export const DEMO_PRESET_ID = 'bassline';

/** Location of the generated demo WAV, relative to the project root. */
export const DEMO_WAV_RELATIVE_PATH = 'public/demo.wav';

/** Absolute path of the project root (the parent of this `scripts/` folder). */
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** One scheduled value on a param timeline: a step or a linear ramp. */
interface ParamEvent {
  time: number;
  value: number;
  ramp: boolean;
}

/**
 * Minimal `AudioParam` replacement that records `setValueAtTime` /
 * `linearRampToValueAtTime` calls and can evaluate the timeline at any time.
 */
class SynthAudioParam {
  private readonly events: ParamEvent[] = [];

  setValueAtTime(value: number, time: number): void {
    this.events.push({ time, value, ramp: false });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.events.push({ time, value, ramp: true });
  }

  /** Piecewise-linear evaluation of the recorded timeline at `time`. */
  valueAt(time: number): number {
    const events = this.events;
    const first = events[0];
    if (!first) return 0;
    if (time <= first.time) return first.value;
    for (let i = 1; i < events.length; i += 1) {
      const previous = events[i - 1]!;
      const current = events[i]!;
      if (time < current.time) {
        if (!current.ramp) return previous.value;
        const span = current.time - previous.time;
        const fraction = span > 0 ? (time - previous.time) / span : 1;
        return previous.value + (current.value - previous.value) * fraction;
      }
    }
    return events[events.length - 1]!.value;
  }
}

/** A node that can be followed by a gain node (oscillator or buffer source). */
abstract class SynthVoiceNode {
  gain: SynthGain | null = null;
  startTime = 0;
  stopTime = 0;

  connect(): void {
    // Wiring is implicit: createGain() attaches to the most recently created voice node.
  }

  start(time: number): void {
    this.startTime = time;
  }

  stop(time: number): void {
    this.stopTime = time;
  }
}

/** Oscillator stub: waveform type plus a recorded frequency timeline. */
class SynthOscillator extends SynthVoiceNode {
  type: OscillatorWaveform = 'sine';
  readonly frequency = new SynthAudioParam();
}

/** Buffer-source stub for noise voices. */
class SynthBufferSource extends SynthVoiceNode {
  buffer: SynthAudioBuffer | null = null;
  loop = false;
}

/** Gain stub: just the recorded gain envelope. */
class SynthGain {
  readonly gain = new SynthAudioParam();

  connect(): void {
    // Connects to the destination; actual mixing happens in startRendering().
  }
}

/** Mono `AudioBuffer` stub backed by a single `Float32Array`. */
class SynthAudioBuffer {
  private readonly data: Float32Array;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    if (channel !== 0) {
      throw new Error(`Only mono buffers are supported (channel ${channel})`);
    }
    return this.data;
  }
}

/**
 * Deterministic software-synth stand-in for `OfflineAudioContext`: records
 * every scheduled voice and renders them into a sample buffer on
 * `startRendering()`, so `renderLoopToWav` produces real audible PCM in Node.
 */
class SynthOfflineContext implements OfflineAudioContextLike {
  currentTime = 0;
  readonly destination: AudioNode = {} as unknown as AudioNode;
  private readonly oscillators: SynthOscillator[] = [];
  private readonly bufferSources: SynthBufferSource[] = [];
  private pendingVoice: SynthVoiceNode | null = null;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {}

  createOscillator(): OscillatorNode {
    const oscillator = new SynthOscillator();
    this.oscillators.push(oscillator);
    this.pendingVoice = oscillator;
    return oscillator as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new SynthBufferSource();
    this.bufferSources.push(source);
    this.pendingVoice = source;
    return source as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    const gain = new SynthGain();
    if (this.pendingVoice) {
      this.pendingVoice.gain = gain;
      this.pendingVoice = null;
    }
    return gain as unknown as GainNode;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return new SynthAudioBuffer(numberOfChannels, length, sampleRate) as unknown as AudioBuffer;
  }

  async startRendering(): Promise<AudioBufferLike> {
    const samples = new Float32Array(this.length);
    for (const oscillator of this.oscillators) {
      renderOscillatorVoice(samples, oscillator, this.sampleRate);
    }
    for (const source of this.bufferSources) {
      renderNoiseVoice(samples, source, this.sampleRate);
    }
    return {
      length: this.length,
      sampleRate: this.sampleRate,
      numberOfChannels: this.numberOfChannels,
      getChannelData: (channel: number): Float32Array => {
        if (channel !== 0) {
          throw new Error(`Only mono renders are supported (channel ${channel})`);
        }
        return samples;
      },
    };
  }
}

/** Per-cycle sample of each oscillator waveform at phase fraction `frac` in [0, 1). */
const WAVEFORM_SAMPLERS: Record<OscillatorWaveform, (frac: number) => number> = {
  sine: (frac) => Math.sin(2 * Math.PI * frac),
  square: (frac) => (frac < 0.5 ? 1 : -1),
  sawtooth: (frac) => 2 * frac - 1,
  triangle: (frac) => 1 - 4 * Math.abs(frac - 0.5),
};

/** Mixes one scheduled oscillator voice into `samples`, envelope included. */
function renderOscillatorVoice(
  samples: Float32Array,
  oscillator: SynthOscillator,
  sampleRate: number,
): void {
  const gain = oscillator.gain;
  if (!gain) return;
  const start = Math.max(0, Math.floor(oscillator.startTime * sampleRate));
  const stop = Math.min(samples.length, Math.ceil(oscillator.stopTime * sampleRate));
  const sampler = WAVEFORM_SAMPLERS[oscillator.type];
  let phase = 0;
  for (let i = start; i < stop; i += 1) {
    const time = i / sampleRate;
    phase += oscillator.frequency.valueAt(time) / sampleRate;
    const frac = phase - Math.floor(phase);
    samples[i] = (samples[i] ?? 0) + sampler(frac) * gain.gain.valueAt(time);
  }
}

/** Mixes one scheduled noise voice (looping buffer source) into `samples`. */
function renderNoiseVoice(
  samples: Float32Array,
  source: SynthBufferSource,
  sampleRate: number,
): void {
  const gain = source.gain;
  const buffer = source.buffer;
  if (!gain || !buffer) return;
  const data = buffer.getChannelData(0);
  const start = Math.max(0, Math.floor(source.startTime * sampleRate));
  const stop = Math.min(samples.length, Math.ceil(source.stopTime * sampleRate));
  for (let i = start; i < stop; i += 1) {
    const time = i / sampleRate;
    const offset = Math.floor((time - source.startTime) * sampleRate);
    const index = source.loop
      ? ((offset % data.length) + data.length) % data.length
      : Math.min(offset, data.length - 1);
    samples[i] = (samples[i] ?? 0) + (data[index] ?? 0) * gain.gain.valueAt(time);
  }
}

/**
 * Renders a built-in preset through the real export path — `renderLoopToWav`
 * plus the pure WAV encoder — on the deterministic synth context, and returns
 * the 16-bit PCM WAV bytes.
 */
export async function generateDemoWavBytes(presetId: string = DEMO_PRESET_ID): Promise<Uint8Array> {
  const preset = getPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown demo preset: ${JSON.stringify(presetId)}`);
  }
  const state = createStateFromPreset(preset);
  return renderLoopToWav({
    tracks: state.tracks,
    tempoBpm: state.tempoBpm,
    contextFactory: (numberOfChannels, length, sampleRate) =>
      new SynthOfflineContext(numberOfChannels, length, sampleRate),
  });
}

/** Renders the demo preset and writes the WAV bytes to `public/demo.wav`. */
export async function main(): Promise<void> {
  const preset = getPreset(DEMO_PRESET_ID);
  if (!preset) {
    throw new Error(`Missing demo preset: ${DEMO_PRESET_ID}`);
  }
  const bytes = await generateDemoWavBytes();
  const outPath = join(projectRoot, DEMO_WAV_RELATIVE_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes);
  const seconds = loopDurationSeconds(preset.state.tempoBpm);
  console.log(
    `Wrote ${DEMO_WAV_RELATIVE_PATH}: ${bytes.length} bytes, ${seconds.toFixed(3)} s ` +
      `of 16-bit PCM mono @ ${DEFAULT_EXPORT_SAMPLE_RATE} Hz ` +
      `(preset "${preset.name}", ${preset.state.tempoBpm} BPM)`,
  );
}

/* Run main() only when executed directly (`npm run demo:wav`), not when imported by tests. */
const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
