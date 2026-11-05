// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { EXPORT_FILE_NAME } from '../../src/App';
import { renderLoopToWav } from '../../src/audio/export';
import { DEFAULT_TEMPO_BPM } from '../../src/state/pattern';

vi.mock('../../src/audio/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/export')>();
  return { ...actual, renderLoopToWav: vi.fn() };
});

const mockedRenderLoopToWav = vi.mocked(renderLoopToWav);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App — Export WAV button', () => {
  beforeEach(() => {
    mockedRenderLoopToWav.mockReset();
    mockedRenderLoopToWav.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:wavestep-mock'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it('renders the current loop and triggers a wavestep-loop.wav download', async () => {
    const clicks: Array<{ href: string; download: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download });
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /export the current loop as a wav file/i }));

    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(mockedRenderLoopToWav).toHaveBeenCalledTimes(1);
    expect(mockedRenderLoopToWav).toHaveBeenCalledWith(
      expect.objectContaining({ tempoBpm: DEFAULT_TEMPO_BPM, tracks: expect.any(Array) }),
    );
    expect(clicks[0]!.download).toBe(EXPORT_FILE_NAME);
    expect(clicks[0]!.href).toContain('blob:wavestep-mock');

    const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(4);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:wavestep-mock');
  });

  it('shows an alert when the offline render fails', async () => {
    mockedRenderLoopToWav.mockRejectedValue(new Error('offline context unavailable'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /export the current loop as a wav file/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('offline context unavailable');
  });
});

describe('App — preset picker', () => {
  beforeEach(() => {
    mockedRenderLoopToWav.mockReset();
    mockedRenderLoopToWav.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
  });

  it('loads the drums preset into the grid when picked', () => {
    render(<App />);
    const picker = screen.getByRole('combobox', { name: /load a chiptune preset/i });
    fireEvent.change(picker, { target: { value: 'drums' } });

    // the drums preset opens with a noise hat on step 1 (index 0)
    expect(
      screen.getByRole('button', { name: 'Drums step 1 active' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      (screen.getByRole('combobox', { name: 'Waveform for Drums' }) as HTMLSelectElement).value,
    ).toBe('noise');
    expect(screen.getByText('120 BPM')).toBeTruthy();
  });

  it('loads the bassline preset and resets to Custom after a manual edit', () => {
    render(<App />);
    const picker = screen.getByRole('combobox', {
      name: /load a chiptune preset/i,
    }) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: 'bassline' } });

    expect(picker.value).toBe('bassline');
    expect(screen.getByRole('button', { name: 'Bass step 1 active' })).toBeTruthy();
    expect(screen.getByText('128 BPM')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bass step 2 rest' }));
    expect(picker.value).toBe('');
    expect(screen.getByRole('button', { name: 'Bass step 2 active' })).toBeTruthy();
  });
});
