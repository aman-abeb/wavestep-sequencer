import { midiToFrequency } from './note';
import { STEPS_PER_PATTERN, type AudioContextLike, type Track } from './types';
import { DEFAULT_RELEASE, createStepVoice } from './voice';
import { encodeWavPcm16 } from './wav';

/** Sample rate used for WAV export unless overridden, in Hz. */
export const DEFAULT_EXPORT_SAMPLE_RATE = 44100;

/** Tempo (BPM) assumed when the provided tempo is not a positive finite number. */
export const FALLBACK_EXPORT_TEMPO_BPM = 120;

/** Minimal structural subset of `AudioBuffer` returned by offline rendering. */
export interface AudioBufferLike {
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

/**
 * Minimal structural subset of `OfflineAudioContext` used by the exporter.
 * A real `OfflineAudioContext` satisfies it; tests substitute a mock.
 */
export interface OfflineAudioContextLike extends AudioContextLike {
  readonly sampleRate: number;
  startRendering(): Promise<AudioBufferLike>;
}

/**
 * Builds an offline audio context. Injectable so tests can substitute a mock
 * instead of a real `OfflineAudioContext`.
 */
export type OfflineAudioContextFactory = (
  numberOfChannels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContextLike;

/** Duration of one 16th-note step in seconds at `tempoBpm`. */
export function stepDurationSeconds(tempoBpm: number): number {
  const bpm = Number.isFinite(tempoBpm) && tempoBpm > 0 ? tempoBpm : FALLBACK_EXPORT_TEMPO_BPM;
  return 60 / bpm / 4;
}

/**
 * Duration of one full 16-step loop in seconds at `tempoBpm`, including the
 * release tail of the last scheduled note so it is not cut off.
 */
export function loopDurationSeconds(tempoBpm: number): number {
  return STEPS_PER_PATTERN * stepDurationSeconds(tempoBpm) + DEFAULT_RELEASE;
}

/** Options for {@link schedulePattern}. */
export interface SchedulePatternOptions {
  /** Audio context (or mock) on which the notes are scheduled. */
  context: AudioContextLike;
  /** Tracks to schedule; muted tracks and rests are skipped. */
  tracks: readonly Track[];
  /** Tempo in BPM; each step is a 16th note. */
  tempoBpm: number;
  /** AudioContext time at which step 0 starts; defaults to 0. */
  startTime?: number;
}

/**
 * Schedules every active step of every unmuted track on `context`, one voice
 * per note, at exact 16th-note times (`startTime + stepIndex * stepDuration`).
 * Tracks with the `'noise'` waveform render looping noise buffer sources
 * instead of oscillators. Returns the number of voices scheduled.
 */
export function schedulePattern(options: SchedulePatternOptions): number {
  const { context, tracks, tempoBpm } = options;
  const startTime = options.startTime ?? 0;
  const stepDuration = stepDurationSeconds(tempoBpm);
  let voices = 0;
  for (let stepIndex = 0; stepIndex < STEPS_PER_PATTERN; stepIndex += 1) {
    const time = startTime + stepIndex * stepDuration;
    for (const track of tracks) {
      if (track.muted) continue;
      const step = track.pattern[stepIndex];
      if (!step || step.note === null) continue;
      createStepVoice({
        context,
        destination: context.destination,
        waveform: track.waveform,
        frequency: midiToFrequency(step.note),
        startTime: time,
        duration: stepDuration,
        velocity: step.velocity * track.volume,
      });
      voices += 1;
    }
  }
  return voices;
}

/** Options for {@link renderLoopToWav}. */
export interface RenderLoopToWavOptions {
  /** Tracks of the loop to render. */
  tracks: readonly Track[];
  /** Tempo in BPM; the loop is exactly 16 steps long. */
  tempoBpm: number;
  /** Sample rate of the rendered WAV in Hz; defaults to {@link DEFAULT_EXPORT_SAMPLE_RATE}. */
  sampleRate?: number;
  /** AudioContext time at which step 0 starts inside the render; defaults to 0. */
  startTime?: number;
  /** Offline context factory; defaults to a real `OfflineAudioContext`. */
  contextFactory?: OfflineAudioContextFactory;
}

/**
 * Renders one full loop of `tracks` through an `OfflineAudioContext` sized to
 * the whole loop (plus the release tail), then encodes the rendered channel
 * data with {@link encodeWavPcm16} and returns the 16-bit PCM WAV bytes,
 * ready to be wrapped in a `Blob` and downloaded.
 */
export async function renderLoopToWav(options: RenderLoopToWavOptions): Promise<Uint8Array> {
  const sampleRate = options.sampleRate ?? DEFAULT_EXPORT_SAMPLE_RATE;
  const length = Math.max(1, Math.ceil(loopDurationSeconds(options.tempoBpm) * sampleRate));
  const factory = options.contextFactory ?? defaultOfflineContextFactory;
  const context = factory(1, length, sampleRate);
  schedulePattern({
    context,
    tracks: options.tracks,
    tempoBpm: options.tempoBpm,
    startTime: options.startTime ?? 0,
  });
  const rendered = await context.startRendering();
  const samples = rendered.getChannelData(0);
  return encodeWavPcm16(samples, { sampleRate: rendered.sampleRate || sampleRate, channels: 1 });
}

/** Creates a real `OfflineAudioContext` (browser only; never called in tests). */
function defaultOfflineContextFactory(
  numberOfChannels: number,
  length: number,
  sampleRate: number,
): OfflineAudioContextLike {
  return new OfflineAudioContext(numberOfChannels, length, sampleRate);
}
