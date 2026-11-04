// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StepGrid } from '../../src/components/StepGrid';
import {
  DEFAULT_TEMPO_BPM,
  MAX_TEMPO_BPM,
  MIN_TEMPO_BPM,
  createSequencerState,
  setTempo,
  setTrackWaveform,
  toggleStep,
  type SequencerState,
} from '../../src/state/pattern';

afterEach(() => cleanup());

/** Stateful harness mirroring how App wires the grid to the pure model. */
function Harness() {
  const [state, setState] = useState<SequencerState>(createSequencerState);
  return (
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
  );
}

function renderStateless(overrides: Partial<Parameters<typeof StepGrid>[0]> = {}) {
  const props = {
    state: createSequencerState(),
    onToggleStep: vi.fn(),
    onWaveformChange: vi.fn(),
    onTempoChange: vi.fn(),
    ...overrides,
  };
  render(<StepGrid {...props} />);
  return props;
}

describe('StepGrid', () => {
  it('renders 4 tracks x 16 step buttons, 4 waveform selects and a tempo slider', () => {
    render(<Harness />);
    const cells = screen.getAllByRole('button', { name: /step \d+/ });
    expect(cells).toHaveLength(64);
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    expect(screen.getByRole('slider', { name: 'Tempo' })).toBeTruthy();
    expect(screen.getByText(`${DEFAULT_TEMPO_BPM} BPM`)).toBeTruthy();
    // every cell starts as a rest
    for (const cell of cells) {
      expect(cell.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('toggles a cell on click and back off on a second click', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Bass step 1 rest' }));
    const active = screen.getByRole('button', { name: 'Bass step 1 active' });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(active.className).toContain('active');
    fireEvent.click(active);
    expect(
      screen.getByRole('button', { name: 'Bass step 1 rest' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('reports toggles with (trackIndex, stepIndex)', () => {
    const { onToggleStep } = renderStateless();
    fireEvent.click(screen.getByRole('button', { name: 'Arp step 16 rest' }));
    expect(onToggleStep).toHaveBeenCalledTimes(1);
    expect(onToggleStep).toHaveBeenCalledWith(2, 15);
  });

  it('reflects an externally toggled step as pressed', () => {
    const state = toggleStep(createSequencerState(), 0, 4);
    renderStateless({ state });
    expect(
      screen.getByRole('button', { name: 'Bass step 5 active' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('changes a track waveform via its select and reports (trackIndex, waveform)', () => {
    const { onWaveformChange } = renderStateless();
    const select = screen.getByRole('combobox', { name: 'Waveform for Lead' });
    expect((select as HTMLSelectElement).value).toBe('sawtooth');
    fireEvent.change(select, { target: { value: 'sine' } });
    expect(onWaveformChange).toHaveBeenCalledTimes(1);
    expect(onWaveformChange).toHaveBeenCalledWith(1, 'sine');
  });

  it('updates the waveform in state when driven through the harness', () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'Waveform for Drums' });
    fireEvent.change(select, { target: { value: 'triangle' } });
    expect((select as HTMLSelectElement).value).toBe('triangle');
  });

  it('reports tempo slider changes in BPM', () => {
    const { onTempoChange } = renderStateless();
    const slider = screen.getByRole('slider', { name: 'Tempo' });
    fireEvent.change(slider, { target: { value: String(MAX_TEMPO_BPM) } });
    expect(onTempoChange).toHaveBeenCalledWith(MAX_TEMPO_BPM);
  });

  it('clamps out-of-range slider input and shows the clamped BPM', () => {
    render(<Harness />);
    const slider = screen.getByRole('slider', { name: 'Tempo' });
    fireEvent.change(slider, { target: { value: '999' } });
    expect(screen.getByText(`${MAX_TEMPO_BPM} BPM`)).toBeTruthy();
    fireEvent.change(slider, { target: { value: '10' } });
    expect(screen.getByText(`${MIN_TEMPO_BPM} BPM`)).toBeTruthy();
  });
});
