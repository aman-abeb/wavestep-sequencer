import { noteNameToMidi } from '../audio/note';
import {
  createEmptyPattern,
  createTrack,
  type Pattern,
  type Track,
  type Waveform,
} from '../audio/types';
import { cloneSequencerState, type SequencerState } from './pattern';

/** A built-in chiptune loop that can be loaded into the grid. */
export interface Preset {
  /** Stable id used by the preset picker. */
  id: string;
  /** Display name in the picker. */
  name: string;
  /** One-line description of the loop. */
  description: string;
  /** The sequencer state the preset loads. */
  state: SequencerState;
}

/** One active step of a preset pattern: `[stepIndex, noteName, velocity?]`. */
type StepSpec = readonly [stepIndex: number, noteName: string, velocity?: number];

/** Builds a 16-step pattern from compact `[step, noteName, velocity?]` specs. */
function buildPattern(specs: readonly StepSpec[]): Pattern {
  const pattern = createEmptyPattern();
  for (const [stepIndex, noteName, velocity] of specs) {
    pattern[stepIndex] = { note: noteNameToMidi(noteName), velocity: velocity ?? 0.9 };
  }
  return pattern;
}

/** Builds one preset track using the standard grid id/name layout. */
function presetTrack(
  id: string,
  name: string,
  waveform: Waveform,
  specs: readonly StepSpec[],
  volume = 0.8,
): Track {
  return createTrack({ id, name, waveform, volume, pattern: buildPattern(specs) });
}

const BASSLINE_PRESET: Preset = {
  id: 'bassline',
  name: 'Square Bassline',
  description: 'Funky square-wave bass over a sine kick — 128 BPM.',
  state: {
    tempoBpm: 128,
    tracks: [
      presetTrack('bass', 'Bass', 'square', [
        [0, 'A1', 1],
        [3, 'A1', 0.85],
        [6, 'C2', 0.9],
        [8, 'A1', 0.95],
        [10, 'G1', 0.85],
        [12, 'A1', 1],
        [14, 'D2', 0.8],
      ]),
      presetTrack('lead', 'Lead', 'sawtooth', []),
      presetTrack('arp', 'Arp', 'triangle', []),
      presetTrack('drums', 'Drums', 'sine', [
        [0, 'C2', 1],
        [4, 'C2', 0.9],
        [8, 'C2', 1],
        [12, 'C2', 0.9],
      ]),
    ],
  },
};

const ARP_PRESET: Preset = {
  id: 'arp',
  name: 'Sawtooth Arp',
  description: 'Sixteenth-note sawtooth arpeggio with square bass and noise offbeat hats — 140 BPM.',
  state: {
    tempoBpm: 140,
    tracks: [
      presetTrack('bass', 'Bass', 'square', [
        [0, 'A1', 1],
        [4, 'A1', 0.9],
        [8, 'F1', 0.95],
        [12, 'G1', 0.95],
      ]),
      presetTrack('lead', 'Lead', 'sawtooth', []),
      presetTrack('arp', 'Arp', 'sawtooth', [
        [0, 'A3', 1],
        [1, 'C4'],
        [2, 'E4'],
        [3, 'A4'],
        [4, 'C5', 0.95],
        [5, 'E5'],
        [6, 'C5'],
        [7, 'A4'],
        [8, 'F3', 1],
        [9, 'A3'],
        [10, 'C4'],
        [11, 'F4'],
        [12, 'A4', 0.95],
        [13, 'C5'],
        [14, 'D5'],
        [15, 'E5'],
      ]),
      presetTrack('drums', 'Drums', 'noise', [
        [2, 'C4', 0.5],
        [6, 'C4', 0.5],
        [10, 'C4', 0.5],
        [14, 'C4', 0.5],
      ]),
    ],
  },
};

const DRUMS_PRESET: Preset = {
  id: 'drums',
  name: 'Noise Drums',
  description: 'White-noise hi-hats and snare over a sine kick — 120 BPM.',
  state: {
    tempoBpm: 120,
    tracks: [
      presetTrack('bass', 'Bass', 'sine', [
        [0, 'A1', 1],
        [4, 'A1', 0.95],
        [8, 'A1', 1],
        [12, 'A1', 0.95],
      ]),
      presetTrack('lead', 'Lead', 'sawtooth', []),
      presetTrack('arp', 'Arp', 'triangle', []),
      presetTrack('drums', 'Drums', 'noise', [
        [0, 'C4', 0.8],
        [2, 'C4', 0.5],
        [4, 'C4', 0.9],
        [6, 'C4', 0.5],
        [8, 'C4', 0.8],
        [10, 'C4', 0.5],
        [12, 'C4', 0.9],
        [14, 'C4', 0.5],
      ]),
    ],
  },
};

/** All built-in presets, in picker order. */
export const PRESETS: readonly Preset[] = [BASSLINE_PRESET, ARP_PRESET, DRUMS_PRESET];

/** Looks up a preset by id; returns `undefined` for unknown ids. */
export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

/**
 * Returns a fresh, deep-copied {@link SequencerState} for a preset, so grid
 * edits never mutate the shared preset definition.
 */
export function createStateFromPreset(preset: Preset): SequencerState {
  return cloneSequencerState(preset.state);
}
