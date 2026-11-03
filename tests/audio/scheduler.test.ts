import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { midiToFrequency } from '../../src/audio/note';
import { LookaheadScheduler } from '../../src/audio/scheduler';
import {
  STEPS_PER_PATTERN,
  createEmptyPattern,
  createTrack,
  type StepEvent,
  type Track,
} from '../../src/audio/types';
import { DEFAULT_ATTACK, MAX_VOICE_GAIN } from '../../src/audio/voice';
import { MockAudioContext } from '../helpers/mock-audio-context';

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

function makeScheduler(
  context: MockAudioContext,
  tracks: Track[],
  events: StepEvent[],
  tempo = 120,
): LookaheadScheduler {
  return new LookaheadScheduler({
    context,
    getTracks: () => tracks,
    getTempo: () => tempo,
    onStep: (event) => events.push(event),
    lookahead: 0.1,
    tickMs: 25,
    startOffset: 0.05,
  });
}

describe('LookaheadScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives the 16th-note step duration from the tempo', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    expect(makeScheduler(ctx, [], events, 120).stepDuration()).toBeCloseTo(0.125, 10);
    expect(makeScheduler(ctx, [], events, 60).stepDuration()).toBeCloseTo(0.25, 10);
  });

  it('schedules steps ahead of the audio clock on each tick', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    const scheduler = makeScheduler(ctx, [], events);

    scheduler.start();
    expect(scheduler.playing).toBe(true);
    // start() ticks immediately: step 0 lands at currentTime + startOffset
    expect(events.map((event) => event.stepIndex)).toEqual([0]);
    expect(events[0]!.time).toBeCloseTo(0.05, 10);
    expect(events[0]!.duration).toBeCloseTo(0.125, 10);

    ctx.advance(0.1);
    vi.advanceTimersByTime(25);
    expect(events.map((event) => event.stepIndex)).toEqual([0, 1]);
    expect(events[1]!.time).toBeCloseTo(0.175, 10);

    ctx.advance(0.2); // currentTime = 0.3
    vi.advanceTimersByTime(25);
    expect(events.map((event) => event.stepIndex)).toEqual([0, 1, 2]);
    expect(events[2]!.time).toBeCloseTo(0.3, 10);

    scheduler.stop();
    expect(scheduler.playing).toBe(false);
  });

  it('triggers oscillator voices for active steps at the scheduled time', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    const notes: (number | null)[] = Array.from({ length: STEPS_PER_PATTERN }, () => null);
    notes[0] = 69; // A4
    notes[2] = 72; // C5
    const track = makeTrack(notes, { volume: 0.5 });
    const scheduler = makeScheduler(ctx, [track], events);

    scheduler.start(); // step 0 at t = 0.05
    expect(ctx.oscillators).toHaveLength(1);
    const osc = ctx.oscillators[0]!;
    expect(osc.type).toBe('square');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0.05);
    expect(osc.start).toHaveBeenCalledWith(0.05);
    // step velocity 1 * track volume 0.5
    expect(ctx.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      0.5 * MAX_VOICE_GAIN,
      0.05 + DEFAULT_ATTACK,
    );

    ctx.advance(0.1);
    vi.advanceTimersByTime(25); // step 1 at 0.175 is a rest: no new voice
    expect(ctx.oscillators).toHaveLength(1);

    ctx.advance(0.2); // currentTime = 0.3
    vi.advanceTimersByTime(25); // step 2 at 0.3 plays C5
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.oscillators[1]!.frequency.setValueAtTime).toHaveBeenCalledWith(midiToFrequency(72), 0.3);
    expect(ctx.oscillators[1]!.start).toHaveBeenCalledWith(0.3);

    scheduler.stop();
  });

  it('skips muted tracks but still emits step events', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    const notes: (number | null)[] = Array.from({ length: STEPS_PER_PATTERN }, () => 69);
    const track = makeTrack(notes, { muted: true });
    const scheduler = makeScheduler(ctx, [track], events);

    scheduler.start();
    vi.advanceTimersByTime(50);
    expect(ctx.oscillators).toHaveLength(0);
    expect(events.length).toBeGreaterThan(0);

    scheduler.stop();
  });

  it('wraps around after 16 steps', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    const scheduler = makeScheduler(ctx, [], events);

    scheduler.start();
    for (let i = 0; i < STEPS_PER_PATTERN; i += 1) {
      ctx.advance(0.125);
      vi.advanceTimersByTime(25);
    }

    const oneLoop = Array.from({ length: STEPS_PER_PATTERN }, (_, i) => i);
    expect(events.map((event) => event.stepIndex)).toEqual([...oneLoop, 0]);

    scheduler.stop();
  });

  it('stop() halts scheduling and start() is idempotent', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    const scheduler = makeScheduler(ctx, [], events);

    scheduler.start();
    scheduler.start(); // must not install a second timer
    expect(events).toHaveLength(1);

    vi.advanceTimersByTime(25);
    expect(events).toHaveLength(1); // audio clock has not moved: nothing new to schedule

    scheduler.stop();
    expect(scheduler.playing).toBe(false);
    ctx.advance(1);
    vi.advanceTimersByTime(200);
    expect(events).toHaveLength(1);
  });

  it('applies tempo changes to subsequently scheduled steps', () => {
    const ctx = new MockAudioContext();
    const events: StepEvent[] = [];
    let tempo = 120;
    const scheduler = new LookaheadScheduler({
      context: ctx,
      getTracks: () => [],
      getTempo: () => tempo,
      onStep: (event) => events.push(event),
      lookahead: 0.1,
      tickMs: 25,
      startOffset: 0.05,
    });

    scheduler.start(); // step 0 at 0.05
    ctx.advance(0.1);
    vi.advanceTimersByTime(25); // step 1 at 0.175
    expect(events).toHaveLength(2);

    tempo = 240; // 16th note = 0.0625 s from now on
    ctx.advance(0.2); // currentTime = 0.3
    vi.advanceTimersByTime(25); // horizon 0.4: steps at 0.3 and 0.3625
    expect(events).toHaveLength(4);
    expect(events[2]!.time).toBeCloseTo(0.3, 10);
    expect(events[2]!.duration).toBeCloseTo(0.0625, 10);
    expect(events[3]!.time - events[2]!.time).toBeCloseTo(0.0625, 10);

    scheduler.stop();
  });
});
