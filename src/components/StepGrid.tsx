import { STEPS_PER_PATTERN, createEmptyStep, type Waveform } from '../audio/types';
import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, type SequencerState } from '../state/pattern';

/** Waveform choices offered per track, in display order. */
const WAVEFORM_OPTIONS: readonly Waveform[] = ['square', 'triangle', 'sawtooth', 'sine', 'noise'];

/** Props for {@link StepGrid}; every edit flows out through the callbacks. */
export interface StepGridProps {
  /** Current sequencer state to render. */
  state: SequencerState;
  /** Called when a step cell is clicked, with `(trackIndex, stepIndex)`. */
  onToggleStep: (trackIndex: number, stepIndex: number) => void;
  /** Called when a track's waveform select changes. */
  onWaveformChange: (trackIndex: number, waveform: Waveform) => void;
  /** Called when the tempo slider moves, with the requested BPM. */
  onTempoChange: (tempoBpm: number) => void;
}

/**
 * The 4-track x 16-step sequencer grid: one row per track with a waveform
 * select and 16 toggle buttons, plus the global tempo slider. Purely
 * presentational — all mutations happen in the parent via the callbacks.
 *
 * Each cell is a real `<button>` with `aria-pressed` and a descriptive
 * `aria-label` (`"Bass step 1 rest"` / `"Bass step 1 active"`), so the grid
 * is fully keyboard- and screen-reader-operable.
 */
export function StepGrid({ state, onToggleStep, onWaveformChange, onTempoChange }: StepGridProps) {
  return (
    <section className="step-grid" aria-label="Step sequencer">
      <div className="tempo-row">
        <label className="tempo-label" htmlFor="tempo-slider">
          Tempo
        </label>
        <input
          id="tempo-slider"
          className="tempo-slider"
          type="range"
          min={MIN_TEMPO_BPM}
          max={MAX_TEMPO_BPM}
          step={1}
          value={state.tempoBpm}
          onChange={(event) => onTempoChange(Number(event.target.value))}
        />
        <output className="tempo-output" aria-live="polite">
          {state.tempoBpm} BPM
        </output>
      </div>

      <div className="tracks">
        {state.tracks.map((track, trackIndex) => (
          <div className="track-row" key={track.id} data-track={track.id}>
            <div className="track-header">
              <span className="track-name">{track.name}</span>
              <select
                className="waveform-select"
                aria-label={`Waveform for ${track.name}`}
                value={track.waveform}
                onChange={(event) => onWaveformChange(trackIndex, event.target.value as Waveform)}
              >
                {WAVEFORM_OPTIONS.map((waveform) => (
                  <option key={waveform} value={waveform}>
                    {waveform}
                  </option>
                ))}
              </select>
            </div>
            <div className="steps" role="group" aria-label={`${track.name} steps`}>
              {Array.from({ length: STEPS_PER_PATTERN }, (_, stepIndex) => {
                const step = track.pattern[stepIndex] ?? createEmptyStep();
                const active = step.note !== null;
                const beat = stepIndex % 4 === 0;
                return (
                  <button
                    key={stepIndex}
                    type="button"
                    className={`step${active ? ' active' : ''}${beat ? ' beat' : ''}`}
                    aria-pressed={active}
                    aria-label={`${track.name} step ${stepIndex + 1} ${active ? 'active' : 'rest'}`}
                    data-track-index={trackIndex}
                    data-step-index={stepIndex}
                    onClick={() => onToggleStep(trackIndex, stepIndex)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
