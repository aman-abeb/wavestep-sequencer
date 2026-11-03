/** MIDI note number of A4, the reference pitch. */
export const A4_MIDI = 69;

/** Frequency of A4 in Hz. */
export const A4_FREQUENCY = 440;

/**
 * Converts a MIDI note number to a frequency in Hz using 12-tone equal
 * temperament with A4 = 440 Hz: `f = 440 * 2^((midi - 69) / 12)`.
 */
export function midiToFrequency(midi: number): number {
  return A4_FREQUENCY * 2 ** ((midi - A4_MIDI) / 12);
}

const NOTE_OFFSETS: { [K in 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B']: number } = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Parses a note name such as `"A4"`, `"C#4"` or `"Bb3"` into a MIDI note
 * number. Sharps (`#`) and flats (`b`) are both accepted, letter case is
 * ignored, and octaves may be negative (`"C-1"` is MIDI 0).
 *
 * @throws {Error} if the name is malformed or outside the MIDI range 0-127.
 */
export function noteNameToMidi(name: string): number {
  const match = /^([A-Ga-g])([#b]?)(-?\d{1,2})$/.exec(name.trim());
  if (!match) {
    throw new Error(`Invalid note name: ${JSON.stringify(name)}`);
  }
  const letter = match[1]!.toUpperCase() as keyof typeof NOTE_OFFSETS;
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number.parseInt(match[3]!, 10);
  const midi = (octave + 1) * 12 + NOTE_OFFSETS[letter] + accidental;
  if (midi < 0 || midi > 127) {
    throw new Error(`Note out of MIDI range (0-127): ${JSON.stringify(name)}`);
  }
  return midi;
}
