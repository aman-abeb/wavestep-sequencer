import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTACK,
  DEFAULT_RELEASE,
  MAX_VOICE_GAIN,
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
