import { vi } from 'vitest';
import type { AudioContextLike } from '../../src/audio/types';

/** A spied stand-in for `AudioParam`. */
export function createMockAudioParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

/** A spied stand-in for `OscillatorNode`. */
export function createMockOscillator() {
  return {
    type: 'sine' as OscillatorType,
    frequency: createMockAudioParam(),
    detune: createMockAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

/** A spied stand-in for `GainNode`. */
export function createMockGain() {
  return {
    gain: createMockAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

/** A stand-in for `AudioBuffer` with per-channel `Float32Array` storage. */
export interface MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

/** Creates a {@link MockAudioBuffer} backed by fresh `Float32Array` channels. */
export function createMockAudioBuffer(
  numberOfChannels: number,
  length: number,
  sampleRate: number,
): MockAudioBuffer {
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  return {
    numberOfChannels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData(channel: number): Float32Array {
      const data = channels[channel];
      if (!data) {
        throw new Error(`Channel ${channel} out of range 0..${numberOfChannels - 1}`);
      }
      return data;
    },
  };
}

/** A spied stand-in for `AudioBufferSourceNode`. */
export function createMockBufferSource() {
  return {
    buffer: null as MockAudioBuffer | null,
    loop: false,
    playbackRate: createMockAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

export type MockOscillator = ReturnType<typeof createMockOscillator>;
export type MockGain = ReturnType<typeof createMockGain>;
export type MockBufferSource = ReturnType<typeof createMockBufferSource>;

/**
 * Minimal mock of `AudioContext` for offline tests: a manually advanced
 * `currentTime` plus spy node factories that record every scheduled call.
 */
export class MockAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate = 44100;
  readonly destination: AudioNode;
  readonly oscillators: MockOscillator[] = [];
  readonly gains: MockGain[] = [];
  readonly buffers: MockAudioBuffer[] = [];
  readonly bufferSources: MockBufferSource[] = [];

  constructor() {
    this.destination = { connect: vi.fn() } as unknown as AudioNode;
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

  /** Advances the mock audio clock by `seconds` and returns the new time. */
  advance(seconds: number): number {
    this.currentTime += seconds;
    return this.currentTime;
  }
}
