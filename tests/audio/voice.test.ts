import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTACK,
  DEFAULT_RELEASE,
  MAX_VOICE_GAIN,
  createNoiseVoice,
  createStepVoice,
  createVoice,
  triggerNote,
} from '../../src/audio/voice';
import { MockAudioContext } from '../helpers/mock-audio-context';

describe('createVoice', () => {
  it('connects oscillator -> gain -> destination and schedules start/stop', () => {
    const ctx = new MockAudioContext();
    const voice = createVoice({
      context: ctx,
      destination: ctx.destination,
      waveform: 'square',
      frequency: 440,
      startTime: 1,
      duration: 0.25,
      velocity: 0.8,
    });

    expect(ctx.oscillators).toHaveLength(1);
    expect(ctx.gains).toHaveLength(1);
    const osc = ctx.oscillators[0]!;
    const gain = ctx.gains[0]!;

    expect(osc.type).toBe('square');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, 1);
    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
    expect(osc.start).toHaveBeenCalledWith(1);
    expect(osc.stop).toHaveBeenCalledWith(1 + 0.25 + DEFAULT_RELEASE);
    expect(voice.startTime).toBe(1);
    expect(voice.stopTime).toBe(1 + 0.25 + DEFAULT_RELEASE);
  });

  it('applies an attack/hold/release envelope scaled by velocity', () => {
    const ctx = new MockAudioContext();
    createVoice({
      context: ctx,
      destination: ctx.destination,
      waveform: 'sine',
      frequency: 220,
      startTime: 2,
      duration: 0.5,
      velocity: 0.5,
    });

    const envelope = ctx.gains[0]!.gain;
    const peak = 0.5 * MAX_VOICE_GAIN;
    expect(envelope.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 2);
    expect(envelope.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, peak, 2 + DEFAULT_ATTACK);
    expect(envelope.setValueAtTime).toHaveBeenNthCalledWith(2, peak, 2.5);
    expect(envelope.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, 0, 2.5 + DEFAULT_RELEASE);
  });

  it('clamps velocity into the 0..1 range', () => {
    const ctx = new MockAudioContext();
    createVoice({
      context: ctx,
      destination: ctx.destination,
      waveform: 'sawtooth',
      frequency: 110,
      startTime: 0,
      duration: 0.1,
      velocity: 5,
    });
    createVoice({
      context: ctx,
      destination: ctx.destination,
      waveform: 'sawtooth',
      frequency: 110,
      startTime: 0,
      duration: 0.1,
      velocity: -1,
    });

    expect(ctx.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, MAX_VOICE_GAIN, DEFAULT_ATTACK);
    expect(ctx.gains[1]!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 0, DEFAULT_ATTACK);
  });

  it('honors custom attack and release times', () => {
    const ctx = new MockAudioContext();
    const voice = createVoice({
      context: ctx,
      destination: ctx.destination,
      waveform: 'triangle',
      frequency: 330,
      startTime: 0,
      duration: 1,
      velocity: 1,
      attack: 0.1,
      release: 0.2,
    });

    expect(voice.stopTime).toBe(1.2);
    expect(ctx.oscillators[0]!.stop).toHaveBeenCalledWith(1.2);
    expect(ctx.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, MAX_VOICE_GAIN, 0.1);
  });

  it('triggerNote maps MIDI notes to equal-tempered frequencies', () => {
    const ctx = new MockAudioContext();
    triggerNote({
      context: ctx,
      destination: ctx.destination,
      waveform: 'triangle',
      midi: 69,
      startTime: 0,
      duration: 0.1,
      velocity: 1,
    });

    expect(ctx.oscillators[0]!.type).toBe('triangle');
    expect(ctx.oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
  });
});

describe('createNoiseVoice', () => {
  it('plays a looping white-noise buffer source through the same gain envelope', () => {
    const ctx = new MockAudioContext();
    const voice = createNoiseVoice({
      context: ctx,
      destination: ctx.destination,
      startTime: 1,
      duration: 0.25,
      velocity: 0.8,
    });

    expect(ctx.oscillators).toHaveLength(0);
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.buffers).toHaveLength(1);
    const source = ctx.bufferSources[0]!;
    const gain = ctx.gains[0]!;

    expect(source.loop).toBe(true);
    expect(source.buffer).toBe(ctx.buffers[0]);
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
    expect(source.start).toHaveBeenCalledWith(1);
    expect(source.stop).toHaveBeenCalledWith(1 + 0.25 + DEFAULT_RELEASE);
    expect(voice.startTime).toBe(1);
    expect(voice.stopTime).toBe(1 + 0.25 + DEFAULT_RELEASE);
    expect(voice.buffer).toBe(ctx.buffers[0]);

    const envelope = gain.gain;
    const peak = 0.8 * MAX_VOICE_GAIN;
    expect(envelope.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 1);
    expect(envelope.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, peak, 1 + DEFAULT_ATTACK);
    expect(envelope.setValueAtTime).toHaveBeenNthCalledWith(2, peak, 1.25);
    expect(envelope.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, 0, 1.25 + DEFAULT_RELEASE);
  });

  it('fills the noise buffer with white noise in [-1, 1] from the injected random source', () => {
    const ctx = new MockAudioContext();
    createNoiseVoice({
      context: ctx,
      destination: ctx.destination,
      startTime: 0,
      duration: 0.1,
      velocity: 1,
      noiseSeconds: 0.01,
      random: () => 0.75,
    });

    const data = ctx.buffers[0]!.getChannelData(0);
    expect(data.length).toBe(Math.ceil(0.01 * ctx.sampleRate));
    for (const sample of data) {
      expect(sample).toBeCloseTo(0.5, 10); // 0.75 * 2 - 1
    }
  });

  it('clamps velocity into the 0..1 range like createVoice', () => {
    const ctx = new MockAudioContext();
    createNoiseVoice({
      context: ctx,
      destination: ctx.destination,
      startTime: 0,
      duration: 0.1,
      velocity: 5,
    });

    expect(ctx.gains[0]!.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(
      1,
      MAX_VOICE_GAIN,
      DEFAULT_ATTACK,
    );
  });
});

describe('createStepVoice', () => {
  it('dispatches the noise waveform to a buffer source and oscillator waveforms to an oscillator', () => {
    const ctx = new MockAudioContext();
    createStepVoice({
      context: ctx,
      destination: ctx.destination,
      waveform: 'noise',
      frequency: 440,
      startTime: 0,
      duration: 0.1,
      velocity: 1,
    });
    createStepVoice({
      context: ctx,
      destination: ctx.destination,
      waveform: 'square',
      frequency: 440,
      startTime: 0.2,
      duration: 0.1,
      velocity: 1,
    });

    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.oscillators).toHaveLength(1);
    expect(ctx.oscillators[0]!.type).toBe('square');
    expect(ctx.oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0.2);
    expect(ctx.bufferSources[0]!.start).toHaveBeenCalledWith(0);
  });
});
