import { describe, expect, it } from 'vitest';
import { WAV_HEADER_BYTES, encodeWavPcm16, floatToInt16 } from '../../src/audio/wav';

describe('floatToInt16', () => {
  it('maps full scale to 32767 / -32768 and zero to zero', () => {
    expect(floatToInt16(0)).toBe(0);
    expect(floatToInt16(1)).toBe(32767);
    expect(floatToInt16(-1)).toBe(-32768);
  });

  it('rounds fractional samples symmetrically', () => {
    expect(floatToInt16(0.5)).toBe(16384);
    expect(floatToInt16(-0.5)).toBe(-16384);
    expect(floatToInt16(0.25)).toBe(8192);
  });

  it('clamps out-of-range and non-finite input', () => {
    expect(floatToInt16(2)).toBe(32767);
    expect(floatToInt16(-2)).toBe(-32768);
    expect(floatToInt16(Number.NaN)).toBe(0);
    expect(floatToInt16(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('encodeWavPcm16', () => {
  it('writes a byte-exact 44-byte RIFF/WAVE header for mono 16-bit PCM at 44100 Hz', () => {
    const bytes = encodeWavPcm16(new Float32Array([0]), { sampleRate: 44100 });
    expect(bytes.length).toBe(WAV_HEADER_BYTES + 2);
    expect(Array.from(bytes)).toEqual([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x26, 0x00, 0x00, 0x00, // chunk size 36 + 2 = 38
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6d, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // fmt chunk size 16
      0x01, 0x00, // audio format 1 = PCM
      0x01, 0x00, // 1 channel (mono)
      0x44, 0xac, 0x00, 0x00, // 44100 Hz little-endian
      0x88, 0x58, 0x01, 0x00, // byte rate 88200
      0x02, 0x00, // block align 2
      0x10, 0x00, // 16 bits per sample
      0x64, 0x61, 0x74, 0x61, // "data"
      0x02, 0x00, 0x00, 0x00, // data chunk size 2
      0x00, 0x00, // the single sample: 0
    ]);
  });

  it('encodes samples as little-endian int16 after the header', () => {
    const bytes = encodeWavPcm16([0.5, -0.5, 1, -1], { sampleRate: 8000 });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(28, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBe(16384);
    expect(view.getInt16(46, true)).toBe(-16384);
    expect(view.getInt16(48, true)).toBe(32767);
    expect(view.getInt16(50, true)).toBe(-32768);
    expect(bytes[45]).toBe(0x40); // 16384 = 0x4000, little-endian high byte
    expect(bytes[51]).toBe(0x80); // -32768 = 0x8000, little-endian high byte
  });

  it('supports interleaved stereo with correct block align and byte rate', () => {
    const bytes = encodeWavPcm16([0, 0, 0, 0], { sampleRate: 48000, channels: 2 });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(48000 * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(40, true)).toBe(8);
    expect(bytes.length).toBe(WAV_HEADER_BYTES + 8);
  });

  it('rejects invalid sample rates, channel counts and sample counts', () => {
    expect(() => encodeWavPcm16([0], { sampleRate: 0 })).toThrow();
    expect(() => encodeWavPcm16([0], { sampleRate: 44100.5 })).toThrow();
    expect(() => encodeWavPcm16([0], { sampleRate: 44100, channels: 0 })).toThrow();
    expect(() => encodeWavPcm16([0, 0, 0], { sampleRate: 44100, channels: 2 })).toThrow();
  });
});
