import { useState } from 'react';
import { renderLoopToWav } from './audio/export';
import { StepGrid } from './components/StepGrid';
import {
  createSequencerState,
  setTempo,
  setTrackWaveform,
  toggleStep,
  type SequencerState,
} from './state/pattern';

/** File name of the downloaded WAV export. */
export const EXPORT_FILE_NAME = 'wavestep-loop.wav';

/**
 * Root of the WaveStep UI. Owns the single {@link SequencerState}, pipes
 * every grid edit through the pure state helpers in `src/state/pattern.ts`,
 * and renders the current loop to a downloadable WAV on demand.
 */
export default function App() {
  const [state, setState] = useState<SequencerState>(createSequencerState);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportWav = async (): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const bytes = await renderLoopToWav({ tracks: state.tracks, tempoBpm: state.tempoBpm });
      // Copy into a fresh ArrayBuffer so the Blob owns exactly the WAV bytes.
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = EXPORT_FILE_NAME;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Failed to export WAV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>WaveStep</h1>
        <p className="tagline">4-track chiptune step sequencer — click a cell to toggle a note</p>
      </header>
      <div className="app-actions">
        <button
          type="button"
          className="export-button"
          onClick={handleExportWav}
          disabled={exporting}
          aria-label="Export the current loop as a WAV file"
        >
          {exporting ? 'Rendering…' : 'Export WAV'}
        </button>
        {exportError !== null && (
          <p className="export-error" role="alert">
            {exportError}
          </p>
        )}
      </div>
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
