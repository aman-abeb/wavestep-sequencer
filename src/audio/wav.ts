/** Size of the canonical RIFF/WAVE header in bytes (PCM, no extra chunks). */
export const WAV_HEADER_BYTES = 44;

/** Options for {@link encodeWavPcm16}. */
export interface EncodeWavPcm16Options {
  /** Sample rate in Hz; must be a positive integer. */
  sampleRate: number;
  /**
   * Number of interleaved channels in `samples`; defaults to 1 (mono).
   * `samples.length` must be a multiple of `channels`.
   */
  channels?: number;
}

/**
 * Converts one float sample in the -1..1 range to a 16-bit PCM integer.
 * Positive full scale maps to 32767, negative full scale to -32768;
 * out-of-range input is clamped and non-finite input becomes silence.
 */
export function floatToInt16(sample: number): number {
  if (!Number.isFinite(sample)) return 0;
  const clamped = Math.min(1, Math.max(-1, sample));
  const scaled = Math.round(clamped * 32768);
  return Math.min(32767, Math.max(-32768, scaled));
}

/**
 * Encodes float PCM samples into a byte-exact 16-bit PCM WAV file: a
 * canonical 44-byte RIFF/WAVE header (audio format 1 = PCM) followed by the
 * samples as little-endian signed int16 values. `samples` holds interleaved
 * channel data, so `samples.length` must be a multiple of `channels`.
 *
 * @throws {Error} on a non-positive/non-integer sample rate, an invalid
 * channel count, or a sample count that is not a multiple of `channels`.
 */
export function encodeWavPcm16(
  samples: ArrayLike<number>,
  options: EncodeWavPcm16Options,
): Uint8Array {
  const { sampleRate } = options;
  const channels = options.channels ?? 1;
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error(`Invalid WAV sample rate: ${sampleRate}`);
  }
  if (!Number.isInteger(channels) || channels < 1) {
    throw new Error(`Invalid WAV channel count: ${channels}`);
  }
  if (samples.length % channels !== 0) {
    throw new Error(`Sample count ${samples.length} is not a multiple of ${channels} channel(s)`);
  }

  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // RIFF chunk size = file size - 8
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size (PCM)
  view.setUint16(20, 1, true); // audio format: 1 = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(WAV_HEADER_BYTES + i * 2, floatToInt16(samples[i] ?? 0), true);
  }
  return new Uint8Array(buffer);
}

/** Writes an ASCII string into the header one byte at a time. */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
