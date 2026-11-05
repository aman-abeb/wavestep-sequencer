/** Number of steps in one pattern (one bar of 16th notes). */
export const STEPS_PER_PATTERN = 16;

/**
 * Waveforms supported by the sequencer voices: the four `OscillatorNode`
 * types plus `'noise'`, which plays a looping white-noise buffer source.
 */
export type Waveform = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'noise';

/** A single step in a pattern: a MIDI note (or a rest) plus a velocity. */
export interface Step {
  /** MIDI note number (0-127), or `null` for a rest. */
  note: number | null;
  /** Hit strength in the 0..1 range. */
  velocity: number;
}

/** A step pattern; conventionally {@link STEPS_PER_PATTERN} steps long. */
export type Pattern = Step[];

/** One instrument track of the sequencer grid. */
export interface Track {
  id: string;
  name: string;
  waveform: Waveform;
  /** Track volume in the 0..1 range, multiplied into every step velocity. */
  volume: number;
  muted: boolean;
  pattern: Pattern;
}

/** Emitted by the scheduler for every scheduled step. */
export interface StepEvent {
  /** Index of the scheduled step, 0..15. */
  stepIndex: number;
  /** AudioContext time at which the step starts, in seconds. */
  time: number;
  /** Duration of the step in seconds. */
  duration: number;
}

/**
 * Minimal structural subset of `AudioContext` used by the audio engine.
 * A real `AudioContext` satisfies it; tests substitute a mock.
 */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
}

/** Creates a resting step with a default velocity. */
export function createEmptyStep(): Step {
  return { note: null, velocity: 0.8 };
}

/** Creates a pattern of `steps` resting steps (16 by default). */
export function createEmptyPattern(steps: number = STEPS_PER_PATTERN): Pattern {
  return Array.from({ length: steps }, () => createEmptyStep());
}

/** Creates a track, filling in sensible defaults for anything omitted. */
export function createTrack(init: { id: string } & Partial<Omit<Track, 'id'>>): Track {
  return {
    id: init.id,
    name: init.name ?? init.id,
    waveform: init.waveform ?? 'square',
    volume: init.volume ?? 0.8,
    muted: init.muted ?? false,
    pattern: init.pattern ?? createEmptyPattern(),
  };
}
