import { describe, expect, it } from 'vitest';
import {
  A4_FREQUENCY,
  A4_MIDI,
  midiToFrequency,
  noteNameToMidi,
} from '../../src/audio/note';

describe('midiToFrequency', () => {
  it('maps A4 to exactly 440 Hz', () => {
    expect(A4_MIDI).toBe(69);
    expect(A4_FREQUENCY).toBe(440);
    expect(midiToFrequency(69)).toBe(440);
  });

  it('doubles the frequency every octave', () => {
    expect(midiToFrequency(81)).toBeCloseTo(880, 10); // A5
    expect(midiToFrequency(57)).toBeCloseTo(220, 10); // A3
  });

  it('uses 12-tone equal temperament for semitones', () => {
    expect(midiToFrequency(70)).toBeCloseTo(440 * 2 ** (1 / 12), 10);
    expect(midiToFrequency(60)).toBeCloseTo(261.6255653005986, 6); // C4
  });

  it('handles the lowest piano key', () => {
    expect(midiToFrequency(21)).toBeCloseTo(27.5, 10); // A0
  });
});

describe('noteNameToMidi', () => {
  it('parses natural notes across octaves', () => {
    expect(noteNameToMidi('C-1')).toBe(0);
    expect(noteNameToMidi('C4')).toBe(60);
    expect(noteNameToMidi('A4')).toBe(69);
    expect(noteNameToMidi('G9')).toBe(127);
  });

  it('parses sharps and flats enharmonically', () => {
    expect(noteNameToMidi('C#4')).toBe(61);
    expect(noteNameToMidi('Db4')).toBe(61);
    expect(noteNameToMidi('Bb3')).toBe(58);
    expect(noteNameToMidi('a4')).toBe(69);
  });

  it('round-trips through midiToFrequency', () => {
    expect(midiToFrequency(noteNameToMidi('A4'))).toBe(440);
    expect(midiToFrequency(noteNameToMidi('E5'))).toBeCloseTo(659.2551138257398, 6);
  });

  it('rejects invalid or out-of-range note names', () => {
    expect(() => noteNameToMidi('')).toThrow();
    expect(() => noteNameToMidi('H4')).toThrow();
    expect(() => noteNameToMidi('C')).toThrow();
    expect(() => noteNameToMidi('G#9')).toThrow();
  });
});
