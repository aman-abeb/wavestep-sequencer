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

export type MockOscillator = ReturnType<typeof createMockOscillator>;
export type MockGain = ReturnType<typeof createMockGain>;

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

  /** Advances the mock audio clock by `seconds` and returns the new time. */
  advance(seconds: number): number {
    this.currentTime += seconds;
    return this.currentTime;
  }
}
