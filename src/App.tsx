import { useState } from 'react';
import { StepGrid } from './components/StepGrid';
import {
  createSequencerState,
  setTempo,
  setTrackWaveform,
  toggleStep,
  type SequencerState,
} from './state/pattern';

/**
 * Root of the WaveStep UI. Owns the single {@link SequencerState} and pipes
 * every grid edit through the pure state helpers in `src/state/pattern.ts`.
 */
export default function App() {
  const [state, setState] = useState<SequencerState>(createSequencerState);

  return (
    <main className="app">
      <header className="app-header">
        <h1>WaveStep</h1>
        <p className="tagline">4-track chiptune step sequencer — click a cell to toggle a note</p>
      </header>
      <StepGrid
        state={state}
        onToggleStep={(trackIndex, stepIndex) =>
          setState((prev) => toggleStep(prev, trackIndex, stepIndex))
        }
        onWaveformChange={(trackIndex, waveform) =>
          setState((prev) => setTrackWaveform(prev, trackIndex, waveform))
        }
        onTempoChange={(tempoBpm) => setState((prev) => setTempo(prev, tempoBpm))}
      />
    </main>
  );
}
