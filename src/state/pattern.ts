import {
  STEPS_PER_PATTERN,
  createTrack,
  type Track,
  type Waveform,
} from '../audio/types';

/** Number of instrument tracks shown in the grid. */
export const TRACK_COUNT = 4;

/** Tempo the sequencer starts at, in BPM. */
export const DEFAULT_TEMPO_BPM = 120;

/** Lowest tempo accepted by the tempo slider, in BPM. */
export const MIN_TEMPO_BPM = 60;

/** Highest tempo accepted by the tempo slider, in BPM. */
export const MAX_TEMPO_BPM = 220;

/** MIDI note a step toggles to when activated, keyed by track id. */
const DEFAULT_NOTE_BY_TRACK: Readonly<Record<string, number>> = {
  bass: 33, // A1
  lead: 69, // A4
  arp: 76, // E5
  drums: 60, // C4
};

/** Initial track layout: id, display name and starting waveform. */
const TRACK_LAYOUT: ReadonlyArray<{ id: string; name: string; waveform: Waveform }> = [
  { id: 'bass', name: 'Bass', waveform: 'square' },
  { id: 'lead', name: 'Lead', waveform: 'sawtooth' },
  { id: 'arp', name: 'Arp', waveform: 'triangle' },
  { id: 'drums', name: 'Drums', waveform: 'square' },
];

/** UI state of the sequencer: the tracks plus the global tempo. */
export interface SequencerState {
  tracks: Track[];
  tempoBpm: number;
}

/** Creates the initial sequencer state: 4 empty tracks at the default tempo. */
export function createSequencerState(): SequencerState {
  return {
    tracks: TRACK_LAYOUT.map((layout) =>
      createTrack({ id: layout.id, name: layout.name, waveform: layout.waveform }),
    ),
    tempoBpm: DEFAULT_TEMPO_BPM,
  };
}

/**
 * Toggles a step between a rest and the track's default note, returning a new
 * state (the input is never mutated). Out-of-range indices return the state
 * unchanged.
 */
export function toggleStep(
  state: SequencerState,
  trackIndex: number,
  stepIndex: number,
): SequencerState {
  const track = state.tracks[trackIndex];
  if (!track || stepIndex < 0 || stepIndex >= STEPS_PER_PATTERN) return state;
  const current = track.pattern[stepIndex];
  if (!current) return state;
  const defaultNote = DEFAULT_NOTE_BY_TRACK[track.id] ?? 69;
  const pattern = track.pattern.slice();
  pattern[stepIndex] =
    current.note === null
      ? { note: defaultNote, velocity: current.velocity }
      : { note: null, velocity: current.velocity };
  const tracks = state.tracks.slice();
  tracks[trackIndex] = { ...track, pattern };
  return { ...state, tracks };
}

/**
 * Sets the waveform of one track, returning a new state. An unknown track
 * index returns the state unchanged.
 */
export function setTrackWaveform(
  state: SequencerState,
  trackIndex: number,
  waveform: Waveform,
): SequencerState {
  const track = state.tracks[trackIndex];
  if (!track) return state;
  const tracks = state.tracks.slice();
  tracks[trackIndex] = { ...track, waveform };
  return { ...state, tracks };
}

/**
 * Toggles the muted flag of one track, returning a new state (the input is
 * never mutated). An unknown track index returns the state unchanged.
 */
export function toggleTrackMute(state: SequencerState, trackIndex: number): SequencerState {
  const track = state.tracks[trackIndex];
  if (!track) return state;
  const tracks = state.tracks.slice();
  tracks[trackIndex] = { ...track, muted: !track.muted };
  return { ...state, tracks };
}

/**
 * Sets the tempo in BPM, rounded to a whole number and clamped to
 * [{@link MIN_TEMPO_BPM}, {@link MAX_TEMPO_BPM}]. Non-finite input falls back
 * to {@link DEFAULT_TEMPO_BPM}.
 */
export function setTempo(state: SequencerState, tempoBpm: number): SequencerState {
  const bpm = Number.isFinite(tempoBpm)
    ? Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, Math.round(tempoBpm)))
    : DEFAULT_TEMPO_BPM;
  return { ...state, tempoBpm: bpm };
}

/**
 * Deep-copies a sequencer state — every track and every step — so a loaded
 * preset (or any shared state) can be edited without mutating the original.
 */
export function cloneSequencerState(state: SequencerState): SequencerState {
  return {
    tempoBpm: state.tempoBpm,
    tracks: state.tracks.map((track) => ({
      ...track,
      pattern: track.pattern.map((step) => ({ ...step })),
    })),
  };
}
