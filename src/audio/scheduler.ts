import { midiToFrequency } from './note';
import { createStepVoice } from './voice';
import {
  STEPS_PER_PATTERN,
  type AudioContextLike,
  type StepEvent,
  type Track,
} from './types';

/** How far ahead of `AudioContext.currentTime` steps are scheduled, in seconds. */
export const DEFAULT_LOOKAHEAD_SECONDS = 0.1;

/** How often the scheduler wakes up to schedule upcoming steps, in milliseconds. */
export const DEFAULT_TICK_MS = 25;

/** Delay before the first step after `start()`, in seconds. */
export const DEFAULT_START_OFFSET_SECONDS = 0.05;

/** Lower tempo clamp, in BPM. */
export const MIN_TEMPO_BPM = 30;

/** Upper tempo clamp, in BPM. */
export const MAX_TEMPO_BPM = 300;

/** Tempo used when the provided tempo is not a finite number, in BPM. */
export const FALLBACK_TEMPO_BPM = 120;

/** Lowest swing fraction: straight 16th notes with no delay. */
export const MIN_SWING = 0;

/** Highest swing fraction: odd 16th steps delayed by up to 75% of a step. */
export const MAX_SWING = 0.75;

/** Default swing fraction: straight timing. */
export const DEFAULT_SWING = 0;

/**
 * Clamps a swing fraction into [{@link MIN_SWING}, {@link MAX_SWING}];
 * non-finite input falls back to {@link DEFAULT_SWING}.
 */
export function clampSwing(swing: number): number {
  if (!Number.isFinite(swing)) return DEFAULT_SWING;
  return Math.min(MAX_SWING, Math.max(MIN_SWING, swing));
}

/**
 * Timing offset that swing applies to one step: odd (off-beat) 16th steps are
 * delayed by `swing * stepDuration` seconds while even steps stay on the grid.
 * Shared by the live scheduler and the offline WAV exporter so live playback
 * and exported renders stay sample-consistent.
 */
export function swingOffsetSeconds(stepIndex: number, stepDuration: number, swing: number): number {
  return stepIndex % 2 === 1 ? clampSwing(swing) * stepDuration : 0;
}

/** Options for constructing a {@link LookaheadScheduler}. */
export interface LookaheadSchedulerOptions {
  /** Audio context (or mock) whose clock drives scheduling. */
  context: AudioContextLike;
  /** Returns the tracks to play; read on every scheduled step so edits apply live. */
  getTracks: () => readonly Track[];
  /** Returns the current tempo in BPM; read on every scheduled step. */
  getTempo: () => number;
  /**
   * Returns the current swing fraction (0..0.75, clamped with
   * {@link clampSwing}); read on every tick. Odd 16th steps are delayed by
   * `swing * stepDuration` on the audio clock. Defaults to 0 (straight timing).
   */
  getSwing?: () => number;
  /**
   * Called for every scheduled step. Note that steps are scheduled ahead of
   * time, so `event.time` is the future audio time at which the step sounds.
   */
  onStep?: (event: StepEvent) => void;
  /** Lookahead horizon in seconds. Defaults to {@link DEFAULT_LOOKAHEAD_SECONDS}. */
  lookahead?: number;
  /** Tick interval in milliseconds. Defaults to {@link DEFAULT_TICK_MS}. */
  tickMs?: number;
  /** Offset added to the clock when starting. Defaults to {@link DEFAULT_START_OFFSET_SECONDS}. */
  startOffset?: number;
}

/**
 * Lookahead step scheduler for a 16-step loop.
 *
 * A `setInterval` timer (default every 25 ms) schedules every step whose
 * start time falls within the lookahead horizon (default 0.1 s) on
 * `AudioContext.currentTime`. Because notes are placed on the audio clock
 * ahead of time, playback stays sample-accurate even if the main thread
 * stalls between ticks. Each step is a 16th note, so its duration is
 * `60 / bpm / 4` seconds, re-read from `getTempo()` on every step.
 *
 * Swing: odd (off-beat) steps are delayed by `swing * stepDuration` via
 * {@link swingOffsetSeconds}, re-read from `getSwing()` on every tick, so
 * swing changes apply live just like tempo changes.
 */
export class LookaheadScheduler {
  private readonly context: AudioContextLike;
  private readonly getTracks: () => readonly Track[];
  private readonly getTempo: () => number;
  private readonly getSwing: () => number;
  private readonly onStep: ((event: StepEvent) => void) | undefined;
  private readonly lookahead: number;
  private readonly tickMs: number;
  private readonly startOffset: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stepIndex = 0;
  private nextStepTimeValue = 0;

  constructor(options: LookaheadSchedulerOptions) {
    this.context = options.context;
    this.getTracks = options.getTracks;
    this.getTempo = options.getTempo;
    this.getSwing = options.getSwing ?? (() => DEFAULT_SWING);
    this.onStep = options.onStep;
    this.lookahead = options.lookahead ?? DEFAULT_LOOKAHEAD_SECONDS;
    this.tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.startOffset = options.startOffset ?? DEFAULT_START_OFFSET_SECONDS;
  }

  /** Whether the scheduler is currently running. */
  get playing(): boolean {
    return this.timer !== null;
  }

  /** Index of the step that will be scheduled next (0..15). */
  get currentStep(): number {
    return this.stepIndex;
  }

  /** AudioContext time at which the next step will start, in seconds. */
  get nextStepTime(): number {
    return this.nextStepTimeValue;
  }

  /** Duration of one 16th-note step in seconds at the current tempo. */
  stepDuration(): number {
    const raw = this.getTempo();
    const bpm = Number.isFinite(raw)
      ? Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, raw))
      : FALLBACK_TEMPO_BPM;
    return 60 / bpm / 4;
  }

  /**
   * Starts the scheduler and schedules the first step immediately.
   * No-op if already running.
   */
  start(): void {
    if (this.timer !== null) return;
    this.stepIndex = 0;
    this.nextStepTimeValue = this.context.currentTime + this.startOffset;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.tick();
  }

  /**
   * Stops the scheduler. Notes already placed on the audio clock keep
   * playing until their scheduled stop times.
   */
  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const horizon = this.context.currentTime + this.lookahead;
    const swing = clampSwing(this.getSwing());
    for (;;) {
      const duration = this.stepDuration();
      const time = this.nextStepTimeValue + swingOffsetSeconds(this.stepIndex, duration, swing);
      if (time >= horizon) break;
      this.scheduleStep(this.stepIndex, time);
      this.nextStepTimeValue += duration;
      this.stepIndex = (this.stepIndex + 1) % STEPS_PER_PATTERN;
    }
  }

  private scheduleStep(stepIndex: number, time: number): void {
    const duration = this.stepDuration();
    for (const track of this.getTracks()) {
      if (track.muted) continue;
      const step = track.pattern[stepIndex];
      if (!step || step.note === null) continue;
      createStepVoice({
        context: this.context,
        destination: this.context.destination,
        waveform: track.waveform,
        frequency: midiToFrequency(step.note),
        startTime: time,
        duration,
        velocity: step.velocity * track.volume,
      });
    }
    this.onStep?.({ stepIndex, time, duration });
  }
}
