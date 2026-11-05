import { vi } from 'vitest';
import type {
  AudioBufferLike,
  OfflineAudioContextFactory,
  OfflineAudioContextLike,
} from '../../src/audio/export';
import {
  createMockAudioBuffer,
  createMockBufferSource,
  createMockGain,
  createMockOscillator,
  type MockAudioBuffer,
  type MockBufferSource,
  type MockGain,
  type MockOscillator,
} from './mock-audio-context';

/** One scheduled voice recorded by {@link MockOfflineAudioContext}. */
export interface ScheduledMockVoice {
  oscillator: MockOscillator;
  gain: MockGain;
  startTime: number;
  stopTime: number;
}

/** One scheduled noise voice recorded by {@link MockOfflineAudioContext}. */
export interface ScheduledMockNoiseVoice {
  source: MockBufferSource;
  gain: MockGain | undefined;
  startTime: number;
  stopTime: number;
}

/** Deterministic default fill for the rendered buffer: -0.75, -0.25, 0.25, 0.75, … */
const FILL_PATTERN: readonly number[] = [-0.75, -0.25, 0.25, 0.75];

/** Default sample generator: cycles through {@link FILL_PATTERN}. */
export function defaultMockFill(index: number): number {
  return FILL_PATTERN[index % FILL_PATTERN.length]!;
}

/** Options for constructing a {@link MockOfflineAudioContext}. */
export interface MockOfflineAudioContextOptions {
  channels?: number;
  length?: number;
  sampleRate?: number;
  /** Exact rendered samples; overrides `fill`. */
  samples?: Float32Array;
  /** Deterministic sample generator used when `samples` is not given. */
  fill?: (index: number, length: number) => number;
}

/**
 * Mock of `OfflineAudioContext` for offline tests: records every scheduled
 * voice (oscillator or buffer source + gain + exact start/stop times) and
 * resolves `startRendering()` to a deterministic `Float32Array` buffer.
 */
export class MockOfflineAudioContext implements OfflineAudioContextLike {
  currentTime = 0;
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly destination: AudioNode;
  readonly oscillators: MockOscillator[] = [];
  readonly gains: MockGain[] = [];
  readonly buffers: MockAudioBuffer[] = [];
  readonly bufferSources: MockBufferSource[] = [];
  readonly renderedSamples: Float32Array;
  startRenderingCalls = 0;

  constructor(options: MockOfflineAudioContextOptions = {}) {
    this.numberOfChannels = options.channels ?? 1;
    this.sampleRate = options.sampleRate ?? 44100;
    this.length = options.length ?? this.sampleRate;
    this.destination = { connect: vi.fn() } as unknown as AudioNode;
    const fill = options.fill ?? defaultMockFill;
    const samples = new Float32Array(this.length);
    for (let i = 0; i < this.length; i += 1) {
      samples[i] = fill(i, this.length);
    }
    this.renderedSamples = options.samples ?? samples;
  }

  createOscillator(): OscillatorNode {
    const oscillator = createMockOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    const gain = createMockGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    const buffer = createMockAudioBuffer(numberOfChannels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = createMockBufferSource();
    this.bufferSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  /** Every oscillator voice scheduled so far, with the exact start/stop times passed to the oscillator. */
  get scheduledVoices(): ScheduledMockVoice[] {
    return this.oscillators.map((oscillator, index) => ({
      oscillator,
      gain: this.gains[index]!,
      startTime: Number(oscillator.start.mock.calls[0]?.[0] ?? 0),
      stopTime: Number(oscillator.stop.mock.calls[0]?.[0] ?? 0),
    }));
  }

  /** Every noise voice scheduled so far, with the exact start/stop times passed to the buffer source. */
  get scheduledNoiseVoices(): ScheduledMockNoiseVoice[] {
    return this.bufferSources.map((source) => {
      const gain = source.connect.mock.calls
        .map((call) => call[0] as MockGain)
        .find((node) => this.gains.includes(node));
      return {
        source,
        gain,
        startTime: Number(source.start.mock.calls[0]?.[0] ?? 0),
        stopTime: Number(source.stop.mock.calls[0]?.[0] ?? 0),
      };
    });
  }

  /** Resolves to the deterministic rendered buffer, like a real offline render. */
  async startRendering(): Promise<AudioBufferLike> {
    this.startRenderingCalls += 1;
    const samples = this.renderedSamples;
    const sampleRate = this.sampleRate;
    const numberOfChannels = this.numberOfChannels;
    return {
      length: samples.length,
      sampleRate,
      numberOfChannels,
      getChannelData(channel: number): Float32Array {
        if (channel < 0 || channel >= numberOfChannels) {
          throw new Error(`Channel ${channel} out of range 0..${numberOfChannels - 1}`);
        }
        return samples;
      },
    };
  }
}

/** Result of {@link createMockOfflineContextFactory}. */
export interface MockOfflineContextFactory {
  factory: OfflineAudioContextFactory;
  contexts: MockOfflineAudioContext[];
}

/**
 * Builds an {@link OfflineAudioContextFactory} that creates
 * {@link MockOfflineAudioContext}s and records them in `contexts` so tests
 * can inspect what was scheduled and rendered.
 */
export function createMockOfflineContextFactory(
  options: Omit<MockOfflineAudioContextOptions, 'channels' | 'length' | 'sampleRate'> = {},
): MockOfflineContextFactory {
  const contexts: MockOfflineAudioContext[] = [];
  const factory: OfflineAudioContextFactory = (numberOfChannels, length, sampleRate) => {
    const context = new MockOfflineAudioContext({
      ...options,
      channels: numberOfChannels,
      length,
      sampleRate,
    });
    contexts.push(context);
    return context;
  };
  return { factory, contexts };
}
