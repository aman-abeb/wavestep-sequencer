import { describe, expect, it } from 'vitest';
import { STEPS_PER_PATTERN } from '../../src/audio/types';
import {
  DEFAULT_TEMPO_BPM,
  MAX_TEMPO_BPM,
  MIN_TEMPO_BPM,
  TRACK_COUNT,
  cloneSequencerState,
  createSequencerState,
  setTempo,
  setTrackWaveform,
  toggleStep,
  toggleTrackMute,
} from '../../src/state/pattern';

describe('createSequencerState', () => {
  it('creates 4 tracks of 16 resting steps at the default tempo', () => {
    const state = createSequencerState();
    expect(state.tracks).toHaveLength(TRACK_COUNT);
    expect(state.tempoBpm).toBe(DEFAULT_TEMPO_BPM);
    expect(state.tracks.map((track) => track.id)).toEqual(['bass', 'lead', 'arp', 'drums']);
    for (const track of state.tracks) {
      expect(track.pattern).toHaveLength(STEPS_PER_PATTERN);
      expect(track.pattern.every((step) => step.note === null)).toBe(true);
      expect(track.muted).toBe(false);
    }
  });
});

describe('toggleStep', () => {
  it('activates a rest with the track default note and deactivates an active step', () => {
    const initial = createSequencerState();
    const on = toggleStep(initial, 0, 0);
    expect(on.tracks[0]!.pattern[0]!.note).toBe(33); // A1 for bass
    expect(on.tracks[0]!.pattern[0]!.velocity).toBeGreaterThan(0);
    const off = toggleStep(on, 0, 0);
    expect(off.tracks[0]!.pattern[0]!.note).toBeNull();
  });

  it('uses each track’s own default note', () => {
    const state = createSequencerState();
    expect(toggleStep(state, 1, 3).tracks[1]!.pattern[3]!.note).toBe(69); // lead A4
    expect(toggleStep(state, 2, 3).tracks[2]!.pattern[3]!.note).toBe(76); // arp E5
    expect(toggleStep(state, 3, 3).tracks[3]!.pattern[3]!.note).toBe(60); // drums C4
  });

  it('does not mutate the input state', () => {
    const initial = createSequencerState();
    toggleStep(initial, 0, 5);
    expect(initial.tracks[0]!.pattern[5]!.note).toBeNull();
  });

  it('ignores out-of-range indices', () => {
    const state = createSequencerState();
    expect(toggleStep(state, -1, 0)).toBe(state);
    expect(toggleStep(state, 99, 0)).toBe(state);
    expect(toggleStep(state, 0, -1)).toBe(state);
    expect(toggleStep(state, 0, STEPS_PER_PATTERN)).toBe(state);
  });
});

describe('setTrackWaveform', () => {
  it('updates only the targeted track and leaves the input untouched', () => {
    const state = createSequencerState();
    const next = setTrackWaveform(state, 2, 'sine');
    expect(next.tracks[2]!.waveform).toBe('sine');
    expect(next.tracks[0]!.waveform).toBe('square');
    expect(state.tracks[2]!.waveform).toBe('triangle');
  });

  it('returns the same state for an unknown track', () => {
    const state = createSequencerState();
    expect(setTrackWaveform(state, 42, 'sine')).toBe(state);
  });
});

describe('toggleTrackMute', () => {
  it('toggles the muted flag of the targeted track without mutating the input', () => {
    const initial = createSequencerState();
    expect(initial.tracks.every((track) => track.muted === false)).toBe(true);

    const muted = toggleTrackMute(initial, 0);
    expect(muted).not.toBe(initial);
    expect(muted.tracks[0]).not.toBe(initial.tracks[0]);
    expect(muted.tracks[0]!.muted).toBe(true);
    expect(muted.tracks[1]!.muted).toBe(false);
    expect(initial.tracks[0]!.muted).toBe(false);

    const unmuted = toggleTrackMute(muted, 0);
    expect(unmuted.tracks[0]!.muted).toBe(false);
  });

  it('preserves the rest of the track and the tempo when muting', () => {
    const state = setTrackWaveform(toggleStep(createSequencerState(), 2, 4), 2, 'sine');
    const muted = toggleTrackMute(state, 2);
    expect(muted.tracks[2]!.waveform).toBe('sine');
    expect(muted.tracks[2]!.pattern[4]!.note).toBe(76);
    expect(muted.tracks[2]!.volume).toBe(state.tracks[2]!.volume);
    expect(muted.tempoBpm).toBe(state.tempoBpm);
  });

  it('returns the same state for an out-of-range track index', () => {
    const state = createSequencerState();
    expect(toggleTrackMute(state, -1)).toBe(state);
    expect(toggleTrackMute(state, TRACK_COUNT)).toBe(state);
    expect(toggleTrackMute(state, 99)).toBe(state);
  });
});

describe('setTempo', () => {
  it('sets, rounds and clamps the tempo', () => {
    const state = createSequencerState();
    expect(setTempo(state, 140).tempoBpm).toBe(140);
    expect(setTempo(state, 140.6).tempoBpm).toBe(141);
    expect(setTempo(state, 10).tempoBpm).toBe(MIN_TEMPO_BPM);
    expect(setTempo(state, 999).tempoBpm).toBe(MAX_TEMPO_BPM);
    expect(setTempo(state, Number.NaN).tempoBpm).toBe(DEFAULT_TEMPO_BPM);
  });
});

describe('cloneSequencerState', () => {
  it('deep-copies tracks and steps so edits do not leak into the source state', () => {
    const toggled = toggleStep(createSequencerState(), 0, 0);
    const clone = cloneSequencerState(toggled);
    expect(clone).toEqual(toggled);
    expect(clone).not.toBe(toggled);
    expect(clone.tracks[0]).not.toBe(toggled.tracks[0]);
    expect(clone.tracks[0]!.pattern[0]).not.toBe(toggled.tracks[0]!.pattern[0]);

    clone.tracks[0]!.pattern[0] = { note: null, velocity: 0.1 };
    clone.tracks[1]!.waveform = 'sine';
    clone.tempoBpm = 90;

    expect(toggled.tracks[0]!.pattern[0]!.note).toBe(33);
    expect(toggled.tracks[1]!.waveform).toBe('sawtooth');
    expect(toggled.tempoBpm).toBe(DEFAULT_TEMPO_BPM);
  });

  it('preserves per-track muted flags through a deep clone', () => {
    const muted = toggleTrackMute(createSequencerState(), 3);
    const clone = cloneSequencerState(muted);
    expect(clone.tracks[3]!.muted).toBe(true);
    expect(clone.tracks[0]!.muted).toBe(false);

    clone.tracks[3]!.muted = false;
    expect(muted.tracks[3]!.muted).toBe(true);
  });
});
