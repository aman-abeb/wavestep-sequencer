import { describe, expect, it } from 'vitest';
import { STEPS_PER_PATTERN, type Waveform } from '../../src/audio/types';
import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, TRACK_COUNT } from '../../src/state/pattern';
import { PRESETS, createStateFromPreset, getPreset } from '../../src/state/presets';

const VALID_WAVEFORMS: readonly Waveform[] = ['square', 'triangle', 'sawtooth', 'sine', 'noise'];

describe('PRESETS', () => {
  it('ships exactly the bassline, arp and drums presets', () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual(['bassline', 'arp', 'drums']);
    for (const preset of PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  it('every preset is a valid 4-track x 16-step sequencer state', () => {
    for (const preset of PRESETS) {
      const { state } = preset;
      expect(state.tracks).toHaveLength(TRACK_COUNT);
      expect(state.tempoBpm).toBeGreaterThanOrEqual(MIN_TEMPO_BPM);
      expect(state.tempoBpm).toBeLessThanOrEqual(MAX_TEMPO_BPM);
      const ids = new Set<string>();
      let activeSteps = 0;
      for (const track of state.tracks) {
        expect(VALID_WAVEFORMS).toContain(track.waveform);
        expect(track.pattern).toHaveLength(STEPS_PER_PATTERN);
        expect(ids.has(track.id)).toBe(false);
        ids.add(track.id);
        for (const step of track.pattern) {
          expect(step.velocity).toBeGreaterThanOrEqual(0);
          expect(step.velocity).toBeLessThanOrEqual(1);
          if (step.note !== null) {
            activeSteps += 1;
            expect(Number.isInteger(step.note)).toBe(true);
            expect(step.note).toBeGreaterThanOrEqual(0);
            expect(step.note).toBeLessThanOrEqual(127);
          }
        }
      }
      expect(activeSteps).toBeGreaterThan(0);
    }
  });

  it('the drums preset uses a noise track for the hats and a sine track for the kick', () => {
    const drums = getPreset('drums');
    expect(drums).toBeDefined();
    const noiseTrack = drums!.state.tracks.find((track) => track.waveform === 'noise');
    expect(noiseTrack).toBeDefined();
    expect(noiseTrack!.id).toBe('drums');
    expect(noiseTrack!.pattern.some((step) => step.note !== null)).toBe(true);
    const sineTrack = drums!.state.tracks.find((track) => track.waveform === 'sine');
    expect(sineTrack).toBeDefined();
    expect(sineTrack!.pattern.filter((step) => step.note !== null)).toHaveLength(4);
  });

  it('getPreset returns undefined for unknown ids', () => {
    expect(getPreset('does-not-exist')).toBeUndefined();
    expect(getPreset('')).toBeUndefined();
  });

  it('createStateFromPreset returns a deep copy that does not mutate the preset', () => {
    const preset = getPreset('bassline')!;
    const state = createStateFromPreset(preset);
    expect(state).toEqual(preset.state);
    expect(state).not.toBe(preset.state);
    expect(state.tracks[0]).not.toBe(preset.state.tracks[0]);

    state.tracks[0]!.pattern[0] = { note: null, velocity: 0.1 };
    state.tracks[1]!.waveform = 'sine';
    state.tempoBpm = 999;

    expect(preset.state.tracks[0]!.pattern[0]!.note).not.toBeNull();
    expect(preset.state.tracks[1]!.waveform).toBe('sawtooth');
    expect(preset.state.tempoBpm).toBe(128);
  });
});
