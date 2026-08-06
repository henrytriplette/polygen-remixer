import { describe, expect, it } from 'vitest';
import { isProjectFile } from './project';
import { INSTRUMENTS, instrumentById, instrumentForWave } from './audio/synth';

const validProject = {
  version: 2,
  audioData: 'data:audio/wav;base64,UklGRg==',
  sampleName: 'sample.wav',
  originalBpm: 120,
  key: 'C Major',
  bpm: 120,
  bars: 1,
  loop: true,
  metronome: false,
  drums: [{
    id: 'kick', name: 'Kick', voice: 'kick', presetId: 'k808', muted: false,
    steps: [{ on: true, velocity: 0.8, prob: 1, accent: false }],
  }],
  notes: [],
  slices: [],
  sampleGrid: [],
  pitch: 0,
  stretch: 1,
  wholeReversed: false,
  synthWave: 'sawtooth',
  channels: [{ key: 'sample', volume: 0.8, pan: 0, muted: false, soloed: false, effects: [] }],
};

describe('isProjectFile', () => {
  it('accepts a valid version 2 project', () => {
    expect(isProjectFile(validProject)).toBe(true);
  });

  it('rejects unsupported versions and unsafe effect types', () => {
    expect(isProjectFile({ ...validProject, version: 1 })).toBe(false);
    const channels = [{ ...validProject.channels[0], effects: [{ id: 'x', type: 'unknown', params: {} }] }];
    expect(isProjectFile({ ...validProject, channels })).toBe(false);
  });

  it('rejects invalid transport ranges', () => {
    expect(isProjectFile({ ...validProject, bpm: Number.NaN })).toBe(false);
    expect(isProjectFile({ ...validProject, bars: 8 })).toBe(false);
  });

  it('accepts an optional instrument and older files without one', () => {
    expect(isProjectFile({ ...validProject, instrument: 'pad' })).toBe(true);
    // the base fixture has no `instrument` — older projects must still load
    expect(isProjectFile(validProject)).toBe(true);
    // a non-string instrument is rejected
    expect(isProjectFile({ ...validProject, instrument: 42 })).toBe(false);
  });
});

describe('melody instruments', () => {
  it('exposes the focused instrument palette', () => {
    expect(INSTRUMENTS.map((i) => i.id)).toEqual(['bass', 'lead', 'pluck', 'keys', 'pad']);
  });

  it('falls back safely for unknown ids', () => {
    expect(instrumentById('nope').id).toBeTypeOf('string');
    expect(instrumentById('pad').id).toBe('pad');
  });

  it('maps legacy waveforms to instruments', () => {
    expect(instrumentForWave('sine')).toBe('keys');
    expect(instrumentForWave('triangle')).toBe('pluck');
    expect(instrumentForWave('square')).toBe('lead');
    expect(instrumentForWave('sawtooth')).toBe('lead');
  });
});