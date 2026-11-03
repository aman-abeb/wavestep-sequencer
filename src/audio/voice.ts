import { midiToFrequency } from './note';
import type { AudioContextLike, Waveform } from './types';

/** Peak gain of a single voice at velocity 1; keeps 4 tracks from clipping. */
export const MAX_VOICE_GAIN = 0.25;

/** Default envelope attack time in seconds. */
export const DEFAULT_ATTACK = 0.005;

/** Default envelope release time in seconds. */
export const DEFAULT_RELEASE = 0.06;

/** Parameters for {@link createVoice}. */
export interface VoiceOptions {
  /** Audio context (or mock) that owns the nodes. */
  context: AudioContextLike;
  /** Node the voice is connected to, usually `context.destination`. */
  destination: AudioNode;
  /** Oscillator waveform. */
  waveform: Waveform;
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

/** A scheduled voice: the created nodes plus the exact start/stop times. */
export interface ScheduledVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  startTime: number;
  stopTime: number;
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
  const stopTime = startTime + duration + release;

  const oscillator = context.createOscillator();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  const gain = context.createGain();
  const envelope = gain.gain;
  envelope.setValueAtTime(0, startTime);
  envelope.linearRampToValueAtTime(peak, startTime + attack);
  envelope.setValueAtTime(peak, startTime + duration);
  envelope.linearRampToValueAtTime(0, stopTime);

  oscillator.connect(gain);
  gain.connect(destination);

  oscillator.start(startTime);
  oscillator.stop(stopTime);

  return { oscillator, gain, startTime, stopTime };
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
