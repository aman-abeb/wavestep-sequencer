// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../../src/App';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';

afterEach(() => {
  cleanup();
});

/** Dispatches a bubbling, cancelable `keydown` on `target` inside `act()`. */
function pressKey(target: Window | HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('useKeyboardShortcuts', () => {
  function renderHarness() {
    const onTogglePlay = vi.fn();
    const onToggleMute = vi.fn();
    function Harness() {
      useKeyboardShortcuts({ onTogglePlay, onToggleMute, trackCount: 4 });
      return (
        <div>
          <input aria-label="Text input" />
          <select aria-label="Pick one">
            <option value="a">a</option>
          </select>
          <textarea aria-label="Notes" />
          <button type="button">Plain button</button>
        </div>
      );
    }
    const utils = render(<Harness />);
    return { onTogglePlay, onToggleMute, ...utils };
  }

  it('toggles play on Space and prevents the default page scroll', () => {
    const { onTogglePlay, onToggleMute } = renderHarness();
    const event = pressKey(window, { key: ' ', code: 'Space' });
    expect(event.defaultPrevented).toBe(true);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('also handles events bubbling up from the document body', () => {
    const { onTogglePlay } = renderHarness();
    pressKey(document.body, { key: ' ', code: 'Space' });
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('maps Digit1..Digit4 to 0-based track indices', () => {
    const { onToggleMute } = renderHarness();
    for (let digit = 1; digit <= 4; digit += 1) {
      pressKey(window, { key: String(digit), code: `Digit${digit}` });
    }
    expect(onToggleMute.mock.calls).toEqual([[0], [1], [2], [3]]);
  });

  it('falls back to the bare digit key (e.g. numpad digits)', () => {
    const { onToggleMute } = renderHarness();
    pressKey(window, { key: '2', code: 'Numpad2' });
    expect(onToggleMute).toHaveBeenCalledWith(1);
  });

  it('ignores digits outside 1..trackCount', () => {
    const { onToggleMute } = renderHarness();
    pressKey(window, { key: '0', code: 'Digit0' });
    pressKey(window, { key: '5', code: 'Digit5' });
    pressKey(window, { key: '9', code: 'Digit9' });
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('ignores modified and auto-repeated key presses', () => {
    const { onTogglePlay, onToggleMute } = renderHarness();
    pressKey(window, { key: ' ', code: 'Space', ctrlKey: true });
    pressKey(window, { key: ' ', code: 'Space', metaKey: true });
    pressKey(window, { key: ' ', code: 'Space', altKey: true });
    pressKey(window, { key: ' ', code: 'Space', repeat: true });
    pressKey(window, { key: '!', code: 'Digit1', shiftKey: true });
    expect(onTogglePlay).not.toHaveBeenCalled();
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('ignores shortcuts originating from form controls', () => {
    const { onTogglePlay, onToggleMute } = renderHarness();
    pressKey(screen.getByLabelText('Text input'), { key: ' ', code: 'Space' });
    pressKey(screen.getByLabelText('Pick one'), { key: '1', code: 'Digit1' });
    pressKey(screen.getByLabelText('Notes'), { key: ' ', code: 'Space' });
    pressKey(screen.getByRole('button', { name: 'Plain button' }), { key: '2', code: 'Digit2' });
    expect(onTogglePlay).not.toHaveBeenCalled();
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('removes the window listener on unmount', () => {
    const { onTogglePlay, unmount } = renderHarness();
    unmount();
    pressKey(window, { key: ' ', code: 'Space' });
    expect(onTogglePlay).not.toHaveBeenCalled();
  });
});

describe('App — global keyboard shortcuts', () => {
  it('Space toggles the transport button between Play and Stop', () => {
    render(<App />);
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play.getAttribute('aria-pressed')).toBe('false');
    expect(play.getAttribute('aria-keyshortcuts')).toBe('Space');

    const event = pressKey(window, { key: ' ', code: 'Space' });
    expect(event.defaultPrevented).toBe(true);
    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop.getAttribute('aria-pressed')).toBe('true');

    pressKey(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('Digit1..Digit4 toggle the matching track mute buttons', () => {
    render(<App />);
    const names = ['Mute Bass', 'Mute Lead', 'Mute Arp', 'Mute Drums'];
    for (const name of names) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
    }

    pressKey(window, { key: '1', code: 'Digit1' });
    expect(screen.getByRole('button', { name: 'Mute Bass' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Mute Lead' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    pressKey(window, { key: '4', code: 'Digit4' });
    expect(screen.getByRole('button', { name: 'Mute Drums' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    pressKey(window, { key: '1', code: 'Digit1' });
    expect(screen.getByRole('button', { name: 'Mute Bass' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('exposes aria-keyshortcuts 1..4 on the mute buttons', () => {
    render(<App />);
    const names = ['Mute Bass', 'Mute Lead', 'Mute Arp', 'Mute Drums'];
    names.forEach((name, index) => {
      expect(screen.getByRole('button', { name }).getAttribute('aria-keyshortcuts')).toBe(
        String(index + 1),
      );
    });
  });

  it('clicking a mute button and pressing its Digit key drive the same state', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Mute Lead' }));
    expect(screen.getByRole('button', { name: 'Mute Lead' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    pressKey(window, { key: '2', code: 'Digit2' });
    expect(screen.getByRole('button', { name: 'Mute Lead' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('ignores shortcuts coming from grid form controls', () => {
    render(<App />);
    pressKey(screen.getByRole('slider', { name: 'Tempo' }), { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    pressKey(screen.getByRole('combobox', { name: 'Waveform for Bass' }), {
      key: '1',
      code: 'Digit1',
    });
    expect(screen.getByRole('button', { name: 'Mute Bass' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
