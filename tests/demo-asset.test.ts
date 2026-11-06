/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_SAMPLE_RATE, loopDurationSeconds } from '../src/audio/export';
import { WAV_HEADER_BYTES } from '../src/audio/wav';
import { getPreset } from '../src/state/presets';
import {
  DEMO_PRESET_ID,
  DEMO_WAV_RELATIVE_PATH,
  generateDemoWavBytes,
} from '../scripts/generate-demo-wav';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const demoWavPath = join(projectRoot, DEMO_WAV_RELATIVE_PATH);

function readAscii(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Asserts the canonical 44-byte RIFF/WAVE header of a mono 16-bit PCM WAV. */
function expectValidPcm16Header(bytes: Uint8Array, expectedSampleCount: number): void {
  const dataSize = expectedSampleCount * 2;
  expect(bytes.length).toBe(WAV_HEADER_BYTES + dataSize);
  const view = dataView(bytes);
  expect(readAscii(bytes, 0)).toBe('RIFF');
  expect(view.getUint32(4, true)).toBe(36 + dataSize); // RIFF chunk size = file size - 8
  expect(readAscii(bytes, 8)).toBe('WAVE');
  expect(readAscii(bytes, 12)).toBe('fmt ');
  expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
  expect(view.getUint16(20, true)).toBe(1); // audio format 1 = PCM
  expect(view.getUint16(22, true)).toBe(1); // mono
  expect(view.getUint32(24, true)).toBe(DEFAULT_EXPORT_SAMPLE_RATE);
  expect(view.getUint32(28, true)).toBe(DEFAULT_EXPORT_SAMPLE_RATE * 2); // byte rate
  expect(view.getUint16(32, true)).toBe(2); // block align
  expect(view.getUint16(34, true)).toBe(16); // bits per sample
  expect(readAscii(bytes, 36)).toBe('data');
  expect(view.getUint32(40, true)).toBe(dataSize); // data chunk size = sampleCount * 2
}

/** Largest absolute 16-bit sample in the data chunk (0 would mean silence). */
function maxAbsSample(bytes: Uint8Array): number {
  const view = dataView(bytes);
  let max = 0;
  for (let offset = WAV_HEADER_BYTES; offset + 1 < bytes.length; offset += 2) {
    max = Math.max(max, Math.abs(view.getInt16(offset, true)));
  }
  return max;
}

describe('demo WAV asset (public/demo.wav)', () => {
  it('renders the demo preset through the real export path into a valid 16-bit PCM WAV', async () => {
    const preset = getPreset(DEMO_PRESET_ID);
    expect(preset).toBeDefined();
    const bytes = await generateDemoWavBytes();
    const sampleCount = Math.ceil(
      loopDurationSeconds(preset!.state.tempoBpm) * DEFAULT_EXPORT_SAMPLE_RATE,
    );
    expectValidPcm16Header(bytes, sampleCount);
    expect(maxAbsSample(bytes)).toBeGreaterThan(1000); // audible chiptune, not silence
  });

  it('keeps the on-disk public/demo.wav valid and in sync with the encoder', async () => {
    // Bootstrap on a fresh checkout: regenerate the asset through the same
    // deterministic export path used by `npm run demo:wav`, then validate it.
    if (!existsSync(demoWavPath)) {
      mkdirSync(dirname(demoWavPath), { recursive: true });
      writeFileSync(demoWavPath, await generateDemoWavBytes());
    }
    const preset = getPreset(DEMO_PRESET_ID);
    expect(preset).toBeDefined();
    const disk = new Uint8Array(readFileSync(demoWavPath));
    const sampleCount = Math.ceil(loopDurationSeconds(preset!.state.tempoBpm) * 44100);
    expectValidPcm16Header(disk, sampleCount);
    expect(maxAbsSample(disk)).toBeGreaterThan(1000);
    // The committed asset can never drift from the export path.
    expect(disk).toEqual(await generateDemoWavBytes());
  });
});
