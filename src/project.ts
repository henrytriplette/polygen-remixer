import type { Slice } from './audio/sample';
import type { Note } from './audio/synth';
import type { DrumVoice } from './audio/drums';
import type { EffectType } from './audio/effects';

export interface Step {
  on: boolean;
  velocity: number;
  prob: number;
  accent: boolean;
}

export interface DrumTrack {
  id: string;
  name: string;
  voice: DrumVoice;
  presetId: string;
  steps: Step[];
  muted: boolean;
}

export interface SavedEffect {
  id: string;
  type: EffectType;
  params: Record<string, number>;
}

export interface SavedChannel {
  key: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  effects: SavedEffect[];
}

export interface ProjectFileV2 {
  version: 2;
  audioData: string;
  sampleName: string;
  originalBpm: number;
  key: string;
  bpm: number;
  bars: number;
  loop: boolean;
  metronome: boolean;
  drums: DrumTrack[];
  notes: Note[];
  slices: Slice[];
  sampleGrid: boolean[][];
  pitch: number;
  stretch: number;
  wholeReversed: boolean;
  synthWave: string;
  channels: SavedChannel[];
  autoChopCount?: number; // optional: added after v2, older files still load
  instrument?: string; // optional: melody instrument id, older files fall back
}

const EFFECT_TYPES: readonly EffectType[] = [
  'eq', 'filter', 'reverb', 'delay', 'distortion', 'chorus', 'compressor',
  'bitcrusher', 'phaser', 'flanger',
];
const DRUM_VOICES: readonly DrumVoice[] = ['kick', 'snare', 'hat', 'clap', 'perc', 'crash'];
const SYNTH_WAVES = ['sawtooth', 'square', 'sine', 'triangle'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function isProjectFile(value: unknown): value is ProjectFileV2 {
  if (!isRecord(value)) return false;
  if (
    value.version !== 2 ||
    typeof value.audioData !== 'string' ||
    !value.audioData.startsWith('data:audio/wav;base64,') ||
    typeof value.sampleName !== 'string' ||
    !isNumber(value.originalBpm) ||
    typeof value.key !== 'string' ||
    !isNumber(value.bpm) || value.bpm < 40 || value.bpm > 220 ||
    !isNumber(value.bars) || ![1, 2, 4].includes(value.bars) ||
    typeof value.loop !== 'boolean' ||
    typeof value.metronome !== 'boolean' ||
    !isNumber(value.pitch) ||
    !isNumber(value.stretch) ||
    typeof value.wholeReversed !== 'boolean' ||
    typeof value.synthWave !== 'string' || !SYNTH_WAVES.includes(value.synthWave) ||
    (value.instrument !== undefined && typeof value.instrument !== 'string') ||
    (value.autoChopCount !== undefined &&
      (!isNumber(value.autoChopCount) || value.autoChopCount < 2 || value.autoChopCount > 32)) ||
    !Array.isArray(value.drums) || !Array.isArray(value.notes) ||
    !Array.isArray(value.slices) || !Array.isArray(value.sampleGrid) ||
    !Array.isArray(value.channels)
  ) return false;

  const validSteps = value.drums.every((track) =>
    isRecord(track) && typeof track.id === 'string' && typeof track.name === 'string' &&
    typeof track.voice === 'string' && DRUM_VOICES.includes(track.voice as DrumVoice) &&
    typeof track.presetId === 'string' && typeof track.muted === 'boolean' &&
    Array.isArray(track.steps) && track.steps.every((step) =>
      isRecord(step) && typeof step.on === 'boolean' && isNumber(step.velocity) &&
      isNumber(step.prob) && typeof step.accent === 'boolean'),
  );
  const validGrid = value.sampleGrid.every((row) =>
    Array.isArray(row) && row.every((cell) => typeof cell === 'boolean'),
  );
  const validChannels = value.channels.every((channel) =>
    isRecord(channel) && typeof channel.key === 'string' && isNumber(channel.volume) &&
    isNumber(channel.pan) && typeof channel.muted === 'boolean' &&
    typeof channel.soloed === 'boolean' && Array.isArray(channel.effects) &&
    channel.effects.every((effect) =>
      isRecord(effect) && typeof effect.id === 'string' &&
      typeof effect.type === 'string' && EFFECT_TYPES.includes(effect.type as EffectType) &&
      isRecord(effect.params) && Object.values(effect.params).every(isNumber)),
  );
  return validSteps && validGrid && validChannels;
}