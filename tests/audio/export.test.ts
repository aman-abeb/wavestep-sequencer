import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../../src/audio/note';
import {
  DEFAULT_EXPORT_SAMPLE_RATE,
  loopDurationSeconds,
  renderLoopToWav,
  schedulePattern,
  stepDurationSeconds,
} from '../../src/audio/export';
import { STEPS_PER_PATTERN, createEmptyPattern, createTrack, type Track } from '../../src/audio/types';
import { MAX_VOICE_GAIN } from '../../src/audio/voice';
import { WAV_HEADER_BYTES } from '../../src/audio/wav';
import { PRESETS, getPreset } from '../../src/state/presets';
import {
  createMockOfflineContextFactory,
  MockOfflineAudioContext,
} from '../helpers/mock-offline-context';

function makeTrack(
  notes: (number | null)[],
  overrides: Partial<Pick<Track, 'id' | 'name' | 'waveform' | 'volume' | 'muted'>> = {},
): Track {
  const pattern = createEmptyPattern();
  notes.forEach((note, index) => {
    pattern[index] = { note, velocity: 1 };
  });
  return createTrack({ id: 'lead', name: 'Lead', waveform: 'square', pattern, ...overrides });
}

function restPattern(): (number | null)[] {
  return Array.from({ length: STEPS_PER_PATTERN }, () => null);
}

function allNotes(note: number): (number | null)[] {
  return Array.from({ length: STEPS_PER_PATTERN }, () => note);
}

function readAscii(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

describe('stepDurationSeconds / loopDurationSeconds', () => {
  it('derives the 16th-note duration from the tempo', () => {
    expect(stepDurationSeconds(120)).toBeCloseTo(0.125, 10);
    expect(stepDurationSeconds(240)).toBeCloseTo(0.0625, 10);
    expect(stepDurationSeconds(Number.NaN)).toBeCloseTo(0.125, 10);
    expect(stepDurationSeconds(-5)).toBeCloseTo(0.125, 10);
  });

  it('adds the release tail to the 16-step loop duration', () => {
    expect(loopDurationSeconds(120)).toBeCloseTo(16 * 0.125 + 0.06, 10);
  });
});

describe('schedulePattern', () => {
  it('schedules one voice per active step at exact 16th-note times', () => {
    const context = new MockOfflineAudioContext();
    const notes = restPattern();
    notes[0] = 69; // A4
    notes[4] = 72; // C5
    notes[15] = 60; // C4
    const track = makeTrack(notes);

    const voices = schedulePattern({ context, tracks: [track], tempoBpm: 120 });

    expect(voices).toBe(3);
    expect(context.oscillators).toHaveLength(3);
    const starts = context.scheduledVoices.map((voice) => voice.startTime);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeCloseTo(0.5, 10); // step 4 at 4 * 0.125 s
    expect(starts[2]).toBeCloseTo(1.875, 10); // step 15 at 15 * 0.125 s
    expect(context.oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
    expect(context.oscillators[1]!.frequency.setValueAtTime).toHaveBeenCalledWith(
      midiToFrequency(72),
      0.5,
    );
    expect(context.oscillators[2]!.start).toHaveBeenCalledWith(1.875);
  });

  it('honors the startTime offset and the tempo-derived spacing', () => {
    const context = new MockOfflineAudioContext();
    const notes = restPattern();
    notes[0] = 69;
    notes[1] = 69;

    const voices = schedulePattern({
      context,
      tracks: [makeTrack(notes)],
      tempoBpm: 240,
      startTime: 0.5,
    });

    expect(voices).toBe(2);
    expect(context.scheduledVoices[0]!.startTime).toBeCloseTo(0.5, 10);
    expect(context.scheduledVoices[1]!.startTime).toBeCloseTo(0.5 + 0.0625, 10);
  });

  it('skips muted tracks and rests, and scales velocity by track volume', () => {
    const context = new MockOfflineAudioContext();
    const muted = makeTrack(allNotes(69), { id: 'muted', muted: true });
    const rests = makeTrack(restPattern(), { id: 'rests' });
    const quietNotes = restPattern();
    quietNotes[0] = 69;
    const quiet = makeTrack(quietNotes, { id: 'quiet', volume: 0.5 });

    const voices = schedulePattern({ context, tracks: [muted, rests, quiet], tempoBpm: 120 });

    expect(voices).toBe(1);
    expect(context.oscillators).toHaveLength(1);
    expect(context.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.5 * MAX_VOICE_GAIN,
      expect.any(Number),
    );
  });

  it('schedules noise-waveform tracks as looping buffer sources instead of oscillators', () => {
    const context = new MockOfflineAudioContext();
    const notes = restPattern();
    notes[0] = 60;
    notes[4] = 60;
    const track = makeTrack(notes, { id: 'drums', waveform: 'noise' });

    const voices = schedulePattern({ context, tracks: [track], tempoBpm: 120 });

    expect(voices).toBe(2);
    expect(context.oscillators).toHaveLength(0);
    expect(context.bufferSources).toHaveLength(2);
    expect(context.bufferSources[0]!.start).toHaveBeenCalledWith(0);
    expect(context.bufferSources[1]!.start).toHaveBeenCalledWith(0.5);
    expect(context.bufferSources[0]!.loop).toBe(true);
    const buffer = context.bufferSources[0]!.buffer;
    expect(buffer).not.toBeNull();
    const data = buffer!.getChannelData(0);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let allEqual = true;
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i]!;
      if (value < min) min = value;
      if (value > max) max = value;
      if (value !== data[0]) allEqual = false;
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(allEqual).toBe(false); // white noise, not a constant DC signal
  });
});

describe('renderLoopToWav', () => {
  it('sizes the offline context to the full loop, schedules every active step and encodes the render', async () => {
    const { factory, contexts } = createMockOfflineContextFactory();
    const bassNotes = restPattern();
    bassNotes[0] = 33; // A1
    bassNotes[8] = 33;
    const leadNotes = restPattern();
    leadNotes[4] = 76; // E5
    const tracks = [
      makeTrack(bassNotes, { id: 'bass' }),
      makeTrack(leadNotes, { id: 'lead', waveform: 'sawtooth' }),
    ];

    const bytes = await renderLoopToWav({
      tracks,
      tempoBpm: 120,
      sampleRate: 8000,
      contextFactory: factory,
    });

    expect(contexts).toHaveLength(1);
    const context = contexts[0]!;
    const expectedLength = Math.ceil(loopDurationSeconds(120) * 8000);
    expect(context.numberOfChannels).toBe(1);
    expect(context.length).toBe(expectedLength);
    expect(context.sampleRate).toBe(8000);
    expect(context.startRenderingCalls).toBe(1);
    expect(context.oscillators).toHaveLength(3); // 2 bass hits + 1 lead hit
    expect(context.scheduledVoices.map((voice) => voice.startTime)).toEqual([0, 0.5, 1]);

    expect(bytes.length).toBe(WAV_HEADER_BYTES + expectedLength * 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(readAscii(bytes, 0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + expectedLength * 2);
    expect(readAscii(bytes, 8)).toBe('WAVE');
    expect(readAscii(bytes, 12)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(28, true)).toBe(16000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readAscii(bytes, 36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(expectedLength * 2);
  });

  it('encodes the rendered samples as little-endian 16-bit PCM', async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]);
    const { factory } = createMockOfflineContextFactory({ samples });

    const bytes = await renderLoopToWav({
      tracks: [],
      tempoBpm: 120,
      sampleRate: 1000,
      contextFactory: factory,
    });

    expect(bytes.length).toBe(WAV_HEADER_BYTES + samples.length * 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const expected = [0, 16384, -16384, 32767, -32768, 8192];
    expected.forEach((value, index) => {
      expect(view.getInt16(WAV_HEADER_BYTES + index * 2, true)).toBe(value);
    });
    expect(bytes[WAV_HEADER_BYTES + 3]).toBe(0x40); // 0.5 -> 0x4000, little-endian high byte
    expect(bytes[WAV_HEADER_BYTES + 9]).toBe(0x80); // -1 -> 0x8000, little-endian high byte
  });

  it('uses the default 44100 Hz sample rate when none is given', async () => {
    const { factory, contexts } = createMockOfflineContextFactory();

    await renderLoopToWav({ tracks: [], tempoBpm: 120, contextFactory: factory });

    expect(contexts[0]!.sampleRate).toBe(DEFAULT_EXPORT_SAMPLE_RATE);
    expect(contexts[0]!.length).toBe(
      Math.ceil(loopDurationSeconds(120) * DEFAULT_EXPORT_SAMPLE_RATE),
    );
  });
});

describe('preset WAV export', () => {
  for (const preset of PRESETS) {
    it(`exports the "${preset.id}" preset to a spec-valid 16-bit PCM WAV`, async () => {
      const sampleRate = 8000;
      const { factory, contexts } = createMockOfflineContextFactory();

      const bytes = await renderLoopToWav({
        tracks: preset.state.tracks,
        tempoBpm: preset.state.tempoBpm,
        sampleRate,
        contextFactory: factory,
      });

      const sampleCount = Math.ceil(loopDurationSeconds(preset.state.tempoBpm) * sampleRate);
      const dataSize = sampleCount * 2;
      expect(sampleCount).toBe(contexts[0]!.length);
      expect(bytes.length).toBe(WAV_HEADER_BYTES + dataSize);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(readAscii(bytes, 0)).toBe('RIFF');
      expect(view.getUint32(4, true)).toBe(36 + dataSize); // RIFF chunk size = file size - 8
      expect(readAscii(bytes, 8)).toBe('WAVE');
      expect(readAscii(bytes, 12)).toBe('fmt ');
      expect(view.getUint16(20, true)).toBe(1); // audio format 1 = PCM
      expect(view.getUint16(22, true)).toBe(1); // mono
      expect(view.getUint32(24, true)).toBe(sampleRate);
      expect(view.getUint16(34, true)).toBe(16); // 16 bits per sample
      expect(readAscii(bytes, 36)).toBe('data');
      expect(view.getUint32(40, true)).toBe(dataSize); // data chunk size = sampleCount * 2
    });
  }

  it('renders the drums preset noise hats as buffer sources alongside the sine kick oscillators', async () => {
    const preset = getPreset('drums');
    expect(preset).toBeDefined();
    const { factory, contexts } = createMockOfflineContextFactory();

    await renderLoopToWav({
      tracks: preset!.state.tracks,
      tempoBpm: preset!.state.tempoBpm,
      sampleRate: 8000,
      contextFactory: factory,
    });

    const context = contexts[0]!;
    expect(context.bufferSources).toHaveLength(8); // 8 noise hats on the even steps
    expect(context.oscillators).toHaveLength(4); // 4 sine kick hits on the beats
    expect(context.scheduledNoiseVoices.map((voice) => voice.startTime)).toEqual([
      0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75,
    ]);
  });
});
