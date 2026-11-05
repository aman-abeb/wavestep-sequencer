import { useState } from 'react';
import { renderLoopToWav } from './audio/export';
import type { Waveform } from './audio/types';
import { StepGrid } from './components/StepGrid';
import {
  createSequencerState,
  setTempo,
  setTrackWaveform,
  toggleStep,
  type SequencerState,
} from './state/pattern';
import { PRESETS, createStateFromPreset, getPreset } from './state/presets';

/** File name of the downloaded WAV export. */
export const EXPORT_FILE_NAME = 'wavestep-loop.wav';

/**
 * Root of the WaveStep UI. Owns the single {@link SequencerState}, pipes
 * every grid edit through the pure state helpers in `src/state/pattern.ts`,
 * loads the built-in chiptune presets from `src/state/presets.ts`, and
 * renders the current loop to a downloadable WAV on demand.
 */
export default function App() {
  const [state, setState] = useState<SequencerState>(createSequencerState);
  const [presetId, setPresetId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handlePresetChange = (id: string): void => {
    const preset = getPreset(id);
    if (!preset) return;
    setState(createStateFromPreset(preset));
    setPresetId(preset.id);
  };

  const handleToggleStep = (trackIndex: number, stepIndex: number): void => {
    setState((prev) => toggleStep(prev, trackIndex, stepIndex));
    setPresetId('');
  };

  const handleWaveformChange = (trackIndex: number, waveform: Waveform): void => {
    setState((prev) => setTrackWaveform(prev, trackIndex, waveform));
    setPresetId('');
  };

  const handleTempoChange = (tempoBpm: number): void => {
    setState((prev) => setTempo(prev, tempoBpm));
    setPresetId('');
  };

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
        <label className="preset-label" htmlFor="preset-select">
          Preset
        </label>
        <select
          id="preset-select"
          className="preset-select"
          aria-label="Load a chiptune preset"
          value={presetId}
          onChange={(event) => handlePresetChange(event.target.value)}
        >
          <option value="">Custom</option>
          {PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
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
        onToggleStep={handleToggleStep}
        onWaveformChange={handleWaveformChange}
        onTempoChange={handleTempoChange}
      />
    </main>
  );
}
