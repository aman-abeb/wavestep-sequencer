import { useEffect } from 'react';

/** Options for {@link useKeyboardShortcuts}. */
export interface KeyboardShortcutsOptions {
  /** Invoked when Space is pressed: toggles transport play/stop. */
  onTogglePlay: () => void;
  /** Invoked with a 0-based track index when Digit1..DigitN is pressed. */
  onToggleMute: (trackIndex: number) => void;
  /** How many tracks the number row can mute (Digit1..DigitN). */
  trackCount: number;
}

/** Tag names whose focused elements keep their native key behavior. */
const FORM_CONTROL_TAGS: ReadonlySet<string> = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

/**
 * Whether `target` is a form control (or editable element) that must keep its
 * native keyboard behavior, so global shortcuts never fight typing or button
 * activation.
 */
function isFormControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (FORM_CONTROL_TAGS.has(target.tagName) || target.isContentEditable)
  );
}

/**
 * Extracts the 1-based digit of a `DigitN` key code, falling back to a bare
 * digit `key` (e.g. numpad keys); returns `null` for anything else.
 */
function digitFromEvent(event: KeyboardEvent): number | null {
  const fromCode = /^Digit([1-9])$/.exec(event.code);
  if (fromCode) return Number.parseInt(fromCode[1]!, 10);
  const fromKey = /^([1-9])$/.exec(event.key);
  return fromKey ? Number.parseInt(fromKey[1]!, 10) : null;
}

/**
 * Global keyboard shortcuts for the sequencer, attached to `window`:
 *
 * - **Space** toggles play/stop (`preventDefault`, so the page never scrolls)
 * - **Digit1..DigitN** toggles the mute state of track `N - 1`
 *
 * Presses are ignored when they originate from a form control
 * (input/select/textarea/button/contenteditable), while a modifier key
 * (Ctrl/Meta/Alt, or Shift for digits) is held, when the key auto-repeats, or
 * when the event was already handled. The listener is removed on unmount.
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions): void {
  const { onTogglePlay, onToggleMute, trackCount } = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isFormControlTarget(event.target)) return;

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        onTogglePlay();
        return;
      }

      const digit = digitFromEvent(event);
      if (digit !== null && !event.shiftKey && digit >= 1 && digit <= trackCount) {
        event.preventDefault();
        onToggleMute(digit - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onTogglePlay, onToggleMute, trackCount]);
}
