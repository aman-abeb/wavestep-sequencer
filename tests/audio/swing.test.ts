import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loopDurationSeconds,
  renderLoopToWav,
  schedulePattern,
  stepDurationSeconds,
} from '../../src/audio/export';
import {
  DEFAULT_SWING,
  LookaheadScheduler,
  MAX_SWING,
  MIN_SWING,
  clampSwing,
  swingOffsetSeconds,
} from '../../src/audio/scheduler';
import {
  STEPS_PER_PATTERN,
  createEmptyPattern,
  createTrack,
  type StepEvent,
  type Track,
} from '../../src/audio/types';
import { WAV_HEADER_BYTES } from '../../src/audio/wav';
import { MockAudioContext } from '../helpers/mock-audio-context';
import {
  MockOfflineAudioContext,
  createMockOfflineContextFactory,
} from '../helpers/mock-offline-context';

/** Builds a 16-step track from a note-per-step array (`null` = rest). */
function makeTrack(
  notes: (number | null)[],
  overrides: Partial<Pick<Track, 'name' | 'waveform' | 'volume' | 'muted'>> = {},
): Track {
  const pattern = createEmptyPattern();
  notes.forEach((note, index) => {
    pattern[index] = { note, velocity: 1 };
  });
  return createTrack({ id: 'lead', name: 'Lead', waveform: 'square', pattern, ...overrides });
}

function restPattern(): (number | null)[] {
  return Array.from({ length: STEPS_PER_PATTERN }, () => null);
}

describe('clampSwing / swingOffsetSeconds', () => {
  it('clamps the swing fraction into 0..0.75 and maps non-finite input to the default', () => {
    expect(MIN_SWING).toBe(0);
    expect(MAX_SWING).toBe(0.75);
    expect(DEFAULT_SWING).toBe(0);
    expect(clampSwing(-0.5)).toBe(0);
    expect(clampSwing(1)).toBe(MAX_SWING);
    expect(clampSwing(0.3)).toBeCloseTo(0.3, 10);
    expect(clampSwing(Number.NaN)).toBe(DEFAULT_SWING);
    expect(clampSwing(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SWING);
  });

  it('delays only odd steps, by swing * stepDuration', () => {
    const step = stepDurationSeconds(120); // 0.125 s at 120 BPM
    expect(swingOffsetSeconds(0, step, 0.5)).toBe(0);
    expect(swingOffsetSeconds(2, step, 0.5)).toBe(0);
    expect(swingOffsetSeconds(14, step, 0.5)).toBe(0);
    expect(swingOffsetSeconds(1, step, 0.5)).toBeCloseTo(0.0625, 10);
    expect(swingOffsetSeconds(15, step, MAX_SWING)).toBeCloseTo(0.09375, 10);
    expect(swingOffsetSeconds(7, step, 0)).toBe(0);
  });
});

describe('LookaheadScheduler swing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeSwingScheduler(
    context: MockAudioContext,
    tracks: Track[],
    events: StepEvent[],
    getSwing: () => number,
  ): LookaheadScheduler {
    return new LookaheadScheduler({
      context,
      getTracks: () => tracks,
      getTempo: () => 120,
      getSwing,
      onStep: (event) => events.push(event),
      lookahead: 0.1,
      tickMs: 25,
      startOffset: 0.05,
    });
  }

  it('keeps even steps on the grid and delays odd steps by swing * stepDuration', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    const scheduler = makeSwingScheduler(ctx, [], events, () => 0.5);

    scheduler.start(); // step 0 at 0.05 — even step, no swing offset
    expect(events.map((event) => event.stepIndex)).toEqual([0]);
    expect(events[0]!.time).toBeCloseTo(0.05, 10);

    ctx.advance(0.3); // currentTime = 0.3, horizon = 0.4
    vi.advanceTimersByTime(25);
    expect(events.map((event) => event.stepIndex)).toEqual([0, 1, 2]);
    expect(events[1]!.time).toBeCloseTo(0.175 + 0.0625, 10); // odd step delayed by 0.5 * 0.125
    expect(events[2]!.time).toBeCloseTo(0.3, 10); // even step stays on the grid

    scheduler.stop();
  });

  it('triggers note voices at the swung time of odd steps', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    const notes = restPattern();
    notes[1] = 69; // A4 on step 1
    const scheduler = makeSwingScheduler(ctx, [makeTrack(notes)], events, () => 0.5);

    scheduler.start();
    ctx.advance(0.3);
    vi.advanceTimersByTime(25);

    expect(ctx.oscillators).toHaveLength(1);
    const startTime = Number(ctx.oscillators[0]!.start.mock.calls[0]?.[0]);
    expect(startTime).toBeCloseTo(0.2375, 10); // 0.175 + 0.5 * 0.125
    expect(ctx.oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(440, startTime);

    scheduler.stop();
  });

  it('re-reads swing on every tick so changes apply live', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    let swing = 0;
    const scheduler = makeSwingScheduler(ctx, [], events, () => swing);

    scheduler.start(); // step 0 at 0.05
    swing = 0.5;
    ctx.advance(0.3); // horizon 0.4: steps 1 (swung 0.2375) and 2 (0.3)
    vi.advanceTimersByTime(25);
    expect(events.map((event) => event.stepIndex)).toEqual([0, 1, 2]);
    expect(events[1]!.time).toBeCloseTo(0.2375, 10);

    swing = 0;
    ctx.advance(0.2); // currentTime = 0.5, horizon 0.6: steps 3 (0.425) and 4 (0.55)
    vi.advanceTimersByTime(25);
    expect(events.map((event) => event.stepIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(events[3]!.time).toBeCloseTo(0.425, 10);
    expect(events[4]!.time).toBeCloseTo(0.55, 10);

    scheduler.stop();
  });

  it('defaults to straight timing when no getSwing is provided', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    const scheduler = new LookaheadScheduler({
      context: ctx,
      getTracks: () => [],
      getTempo: () => 120,
      onStep: (event) => events.push(event),
      lookahead: 0.1,
      tickMs: 25,
      startOffset: 0.05,
    });

    scheduler.start();
    ctx.advance(0.3);
    vi.advanceTimersByTime(25);

    expect(events.map((event) => event.stepIndex)).toEqual([0, 1, 2]);
    expect(events[0]!.time).toBeCloseTo(0.05, 10);
    expect(events[1]!.time).toBeCloseTo(0.175, 10);
    expect(events[2]!.time).toBeCloseTo(0.3, 10);

    scheduler.stop();
  });
});

describe('schedulePattern swing', () => {
  it('applies the same odd-step delay as the live scheduler', () => {
    const context = new MockOfflineAudioContext();
    const notes = restPattern();
    notes[0] = 69;
    notes[1] = 69;
    notes[2] = 69;

    const voices = schedulePattern({
      context,
      tracks: [makeTrack(notes)],
      tempoBpm: 120,
      swing: 0.5,
    });

    expect(voices).toBe(3);
    const starts = context.scheduledVoices.map((voice) => voice.startTime);
    expect(starts[0]).toBeCloseTo(0, 10);
    expect(starts[1]).toBeCloseTo(0.125 + 0.0625, 10); // odd step delayed by 0.5 * 0.125
    expect(starts[2]).toBeCloseTo(0.25, 10); // even step on the grid
  });

  it('defaults to straight timing when swing is omitted', () => {
    const context = new MockOfflineAudioContext();
    const notes = restPattern();
    notes[1] = 69;

    schedulePattern({ context, tracks: [makeTrack(notes)], tempoBpm: 120 });

    const starts = context.scheduledVoices.map((voice) => voice.startTime);
    expect(starts).toHaveLength(1);
    expect(starts[0]).toBeCloseTo(0.125, 10);
  });
});

describe('renderLoopToWav swing', () => {
  it('passes swing through to the offline schedule so the WAV matches live playback', async () => {
    const { factory, contexts } = createMockOfflineContextFactory();
    const notes = restPattern();
    notes[1] = 69; // A4 on the odd step 1

    const bytes = await renderLoopToWav({
      tracks: [makeTrack(notes)],
      tempoBpm: 120,
      sampleRate: 8000,
      swing: MAX_SWING,
      contextFactory: factory,
    });

    const context = contexts[0]!;
    const starts = context.scheduledVoices.map((voice) => voice.startTime);
    expect(starts).toHaveLength(1);
    expect(starts[0]).toBeCloseTo(0.125 + MAX_SWING * 0.125, 10); // 0.21875
    const expectedLength = Math.ceil(loopDurationSeconds(120) * 8000);
    expect(bytes.length).toBe(WAV_HEADER_BYTES + expectedLength * 2);
  });
});
