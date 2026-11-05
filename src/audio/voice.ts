import { midiToFrequency } from './note';
import type { AudioContextLike, Waveform } from './types';

/** Peak gain of a single voice at velocity 1; keeps 4 tracks from clipping. */
export const MAX_VOICE_GAIN = 0.25;

/** Default envelope attack time in seconds. */
export const DEFAULT_ATTACK = 0.005;

/** Default envelope release time in seconds. */
export const DEFAULT_RELEASE = 0.06;

/** Default length of the generated white-noise buffer, in seconds. */
export const DEFAULT_NOISE_SECONDS = 1;

/** Oscillator waveforms: every {@link Waveform} except the buffer-source `'noise'`. */
export type OscillatorWaveform = Exclude<Waveform, 'noise'>;

/** Parameters for {@link createVoice}. */
export interface VoiceOptions {
  /** Audio context (or mock) that owns the nodes. */
  context: AudioContextLike;
  /** Node the voice is connected to, usually `context.destination`. */
  destination: AudioNode;
  /** Oscillator waveform. */
  waveform: OscillatorWaveform;
  /** Oscillator frequency in Hz. */
  frequency: number;
  /** AudioContext time at which the note starts, in seconds. */
  startTime: number;
  /** Length of the held portion of the note, in seconds. */
  duration: number;
  /** Hit strength; clamped to 0..1 and scaled by {@link MAX_VOICE_GAIN}. */
  velocity: number;
  /** Attack time in seconds. Defaults to {@link DEFAULT_ATTACK}. */
  attack?: number;
  /** Release time in seconds, added after `duration`. Defaults to {@link DEFAULT_RELEASE}. */
  release?: number;
}

/** A scheduled oscillator voice: the created nodes plus the exact start/stop times. */
export interface ScheduledVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  startTime: number;
  stopTime: number;
}

/** Parameters for {@link createNoiseVoice}. */
export interface NoiseVoiceOptions {
  /** Audio context (or mock) that owns the nodes. */
  context: AudioContextLike;
  /** Node the voice is connected to, usually `context.destination`. */
  destination: AudioNode;
  /** AudioContext time at which the noise hit starts, in seconds. */
  startTime: number;
  /** Length of the held portion of the hit, in seconds. */
  duration: number;
  /** Hit strength; clamped to 0..1 and scaled by {@link MAX_VOICE_GAIN}. */
  velocity: number;
  /** Attack time in seconds. Defaults to {@link DEFAULT_ATTACK}. */
  attack?: number;
  /** Release time in seconds, added after `duration`. Defaults to {@link DEFAULT_RELEASE}. */
  release?: number;
  /** Length of the generated noise buffer in seconds. Defaults to {@link DEFAULT_NOISE_SECONDS}. */
  noiseSeconds?: number;
  /**
   * Random source in [0, 1) used to fill the noise buffer; defaults to
   * `Math.random`. Injectable so tests can be deterministic.
   */
  random?: () => number;
}

/** A scheduled noise voice: buffer source, gain, noise buffer and exact start/stop times. */
export interface ScheduledNoiseVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  buffer: AudioBuffer;
  startTime: number;
  stopTime: number;
}

/** Parameters for {@link createStepVoice}: one step of one track. */
export interface StepVoiceOptions {
  /** Audio context (or mock) that owns the nodes. */
  context: AudioContextLike;
  /** Node the voice is connected to, usually `context.destination`. */
  destination: AudioNode;
  /** Track waveform; `'noise'` renders a buffer source instead of an oscillator. */
  waveform: Waveform;
  /** Oscillator frequency in Hz (ignored for `'noise'`). */
  frequency: number;
  /** AudioContext time at which the step starts, in seconds. */
  startTime: number;
  /** Length of the held portion of the step, in seconds. */
  duration: number;
  /** Hit strength; clamped to 0..1 and scaled by {@link MAX_VOICE_GAIN}. */
  velocity: number;
  /** Attack time in seconds. Defaults to {@link DEFAULT_ATTACK}. */
  attack?: number;
  /** Release time in seconds, added after `duration`. Defaults to {@link DEFAULT_RELEASE}. */
  release?: number;
  /** Random source for noise voices; see {@link NoiseVoiceOptions.random}. */
  random?: () => number;
}

/**
 * Creates and schedules a single chiptune voice: an oscillator (waveform +
 * frequency) wired into a gain node with a `0 -> peak -> hold -> 0`
 * envelope, connected to `destination`, started at `startTime` and stopped
 * at `startTime + duration + release` on the audio clock.
 */
export function createVoice(options: VoiceOptions): ScheduledVoice {
  const { context, destination, waveform, frequency, startTime, duration, velocity } = options;
  const attack = options.attack ?? DEFAULT_ATTACK;
  const release = options.release ?? DEFAULT_RELEASE;
  const peak = clamp01(velocity) * MAX_VOICE_GAIN;

  const oscillator = context.createOscillator();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  const gain = context.createGain();
  const stopTime = applyEnvelope(gain.gain, { startTime, duration, attack, release, peak });

  oscillator.connect(gain);
  gain.connect(destination);

  oscillator.start(startTime);
  oscillator.stop(stopTime);

  return { oscillator, gain, startTime, stopTime };
}

/**
 * Creates and schedules a white-noise voice (hi-hats, snares, percussion):
 * a looping `AudioBufferSourceNode` playing a freshly generated white-noise
 * buffer, wired through the same gain envelope as {@link createVoice} and
 * started/stopped at the same exact audio times.
 */
export function createNoiseVoice(options: NoiseVoiceOptions): ScheduledNoiseVoice {
  const { context, destination, startTime, duration, velocity } = options;
  const attack = options.attack ?? DEFAULT_ATTACK;
  const release = options.release ?? DEFAULT_RELEASE;
  const random = options.random ?? Math.random;
  const noiseSeconds = options.noiseSeconds ?? DEFAULT_NOISE_SECONDS;
  const peak = clamp01(velocity) * MAX_VOICE_GAIN;

  const length = Math.max(1, Math.ceil(noiseSeconds * context.sampleRate));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    channel[i] = random() * 2 - 1;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gain = context.createGain();
  const stopTime = applyEnvelope(gain.gain, { startTime, duration, attack, release, peak });

  source.connect(gain);
  gain.connect(destination);

  source.start(startTime);
  source.stop(stopTime);

  return { source, gain, buffer, startTime, stopTime };
}

/**
 * Schedules one step of one track, dispatching on the waveform: `'noise'`
 * renders a {@link createNoiseVoice buffer source}, every other waveform an
 * {@link createVoice oscillator}. Used by both the live scheduler and the
 * offline exporter so both support identical tracks.
 */
export function createStepVoice(options: StepVoiceOptions): ScheduledVoice | ScheduledNoiseVoice {
  const { waveform, frequency, ...rest } = options;
  if (waveform === 'noise') {
    return createNoiseVoice(rest);
  }
  return createVoice({ ...rest, waveform, frequency });
}

/** Parameters for {@link triggerNote}; identical to {@link VoiceOptions} but takes a MIDI note. */
export interface TriggerNoteOptions extends Omit<VoiceOptions, 'frequency'> {
  /** MIDI note number; converted with equal temperament (A4 = 440 Hz). */
  midi: number;
}

/** Convenience wrapper around {@link createVoice} that maps a MIDI note to a frequency. */
export function triggerNote(options: TriggerNoteOptions): ScheduledVoice {
  const { midi, ...rest } = options;
  return createVoice({ ...rest, frequency: midiToFrequency(midi) });
}

/** Shape of the shared attack/hold/release envelope. */
interface EnvelopeShape {
  startTime: number;
  duration: number;
  attack: number;
  release: number;
  peak: number;
}

/**
 * Programs `0 -> peak -> hold -> 0` on an `AudioParam` and returns the stop
 * time (`startTime + duration + release`).
 */
function applyEnvelope(param: AudioParam, shape: EnvelopeShape): number {
  const stopTime = shape.startTime + shape.duration + shape.release;
  param.setValueAtTime(0, shape.startTime);
  param.linearRampToValueAtTime(shape.peak, shape.startTime + shape.attack);
  param.setValueAtTime(shape.peak, shape.startTime + shape.duration);
  param.linearRampToValueAtTime(0, stopTime);
  return stopTime;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
