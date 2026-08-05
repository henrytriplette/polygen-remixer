import { describe, expect, it } from 'vitest';
import { isProjectFile } from './project';

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
});