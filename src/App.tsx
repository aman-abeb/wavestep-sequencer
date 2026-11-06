import { useCallback, useEffect, useRef, useState } from 'react';
import { renderLoopToWav } from './audio/export';
import { LookaheadScheduler } from './audio/scheduler';
import type { Waveform } from './audio/types';
import { StepGrid } from './components/StepGrid';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  createSequencerState,
  setTempo,
  setTrackWaveform,
  toggleStep,
  toggleTrackMute,
  type SequencerState,
} from './state/pattern';
import { PRESETS, createStateFromPreset, getPreset } from './state/presets';

/** File name of the downloaded WAV export. */
export const EXPORT_FILE_NAME = 'wavestep-loop.wav';

/**
 * Root of the WaveStep UI. Owns the single {@link SequencerState}, pipes
 * every grid edit through the pure state helpers in `src/state/pattern.ts`,
 * loads the built-in chiptune presets from `src/state/presets.ts`, drives
 * live playback through a {@link LookaheadScheduler}, and renders the
 * current loop to a downloadable WAV on demand.
 *
 * Global keyboard shortcuts (see `src/hooks/useKeyboardShortcuts.ts`):
 * Space toggles play/stop, Digit1..Digit4 toggle the four track mutes.
 */
export default function App() {
  const [state, setState] = useState<SequencerState>(createSequencerState);
  const [playing, setPlaying] = useState(false);
  const [presetId, setPresetId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /** Latest state, read by the long-lived scheduler callbacks. */
  const stateRef = useRef<SequencerState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<LookaheadScheduler | null>(null);

  /** Stop playback and release the audio context when the app unmounts. */
  useEffect(() => {
    return () => {
      schedulerRef.current?.stop();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  /**
   * Toggles transport play/stop. In the browser this starts/stops a
   * lookahead scheduler on a lazily created `AudioContext`; in headless
   * environments (e.g. jsdom tests) it flips the transport state only.
   */
  const handleTogglePlay = useCallback((): void => {
    const running = schedulerRef.current;
    if (running?.playing) {
      running.stop();
      setPlaying(false);
      return;
    }
    if (typeof AudioContext === 'undefined') {
      setPlaying((prev) => !prev);
      return;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const context = audioContextRef.current;
    if (context.state === 'suspended') {
      void context.resume();
    }
    let scheduler = schedulerRef.current;
    if (!scheduler) {
      scheduler = new LookaheadScheduler({
        context,
        getTracks: () => stateRef.current.tracks,
        getTempo: () => stateRef.current.tempoBpm,
      });
      schedulerRef.current = scheduler;
    }
    scheduler.start();
    setPlaying(true);
  }, []);

  /** Toggles the mute flag of one track (also bound to Digit1..Digit4). */
  const handleToggleMute = useCallback((trackIndex: number): void => {
    setState((prev) => toggleTrackMute(prev, trackIndex));
    setPresetId('');
  }, []);

  useKeyboardShortcuts({
    onTogglePlay: handleTogglePlay,
    onToggleMute: handleToggleMute,
    trackCount: state.tracks.length,
  });

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
        <button
          type="button"
          className={`play-button${playing ? ' playing' : ''}`}
          aria-pressed={playing}
          aria-keyshortcuts="Space"
          onClick={handleTogglePlay}
        >
          {playing ? 'Stop' : 'Play'}
        </button>
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
        <span className="shortcut-hint">Space = play/stop · 1–4 = mute track</span>
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
        onToggleMute={handleToggleMute}
      />
    </main>
  );
}
