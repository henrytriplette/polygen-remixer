// The single reactive store. It owns UI-facing state and bridges every user
// action to the imperative audio engine. The engine's step callback reads from
// here to trigger drums, sample slices and synth notes in perfect sync.

import { reactive, watch } from 'vue';
import { engine } from './audio/engine';
import { Channel } from './audio/channel';
import {
  SamplePlayer,
  evenSlices,
  autoSlices,
  transientChopCount,
  nextSliceId,
  cropBuffer,
  MIN_AUTO_CHOPS,
  MAX_AUTO_CHOPS,
} from './audio/sample';
import type { Slice } from './audio/sample';
import { Synth, noteId, DEFAULT_INSTRUMENT, instrumentById, instrumentForWave } from './audio/synth';
import type { Note } from './audio/synth';
import { DRUM_LIBRARY, playDrum } from './audio/drums';
import type { DrumPreset, DrumVoice } from './audio/drums';
import { analyze, analyzeAsync } from './audio/analysis';
import { EFFECT_PARAM_SPECS } from './audio/effects';
import type { EffectType } from './audio/effects';
import { audioBufferToWav, downloadBlob } from './audio/wav';
import { isProjectFile } from './project';
import type { DrumTrack, ProjectFileV2, SavedEffect, Step } from './project';
export type { Step } from './project';

export interface UiEffect extends SavedEffect {}

export interface UiChannel {
  key: string;
  name: string;
  accent: string;
  volume: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  meter: number;
  effects: UiEffect[];
}

const newStep = (): Step => ({ on: false, velocity: 0.8, prob: 1, accent: false });
const makeSteps = (n: number) => Array.from({ length: n }, newStep);

interface State {
  ready: boolean;
  // sample
  sampleName: string;
  hasSample: boolean;
  analyzing: boolean;
  // microphone recording
  recStatus: 'idle' | 'requesting' | 'recording' | 'error';
  recElapsed: number; // seconds
  recError: string;
  originalBpm: number;
  key: string;
  duration: number;
  loudness: number;
  peaks: number[];
  slices: Slice[];
  sampleGrid: boolean[][]; // sample step sequencer: [sliceIndex][step] on/off
  sliceMode: boolean;
  manualSlice: boolean; // draw-your-own-region slicing mode
  selectedSliceId: string | null; // chop selected for boundary editing / delete
  autoChopCount: number; // requested number of chops in auto slice mode
  trimStart: number; // seconds — start of the active/selection region
  trimEnd: number; // seconds — end of the active/selection region
  trimmed: boolean; // has the buffer been cropped from the original?
  stretch: number;
  sampleGain: number; // makeup gain for the sample (0–4×)
  pitch: number;
  wholeReversed: boolean;
  // transport
  playing: boolean;
  bpm: number;
  bars: number;
  totalSteps: number;
  currentStep: number;
  loop: boolean;
  metronome: boolean;
  // sequencer / instruments
  drums: DrumTrack[];
  notes: Note[];
  synthWave: string; // legacy base wave, kept for project back-compat
  instrument: string; // active melody instrument id
  // mixer
  channels: UiChannel[];
  // ui
  view: 'studio' | 'perform';
  workspace: 'beat' | 'chops' | 'melody' | 'effects' | 'mix';
  theme: 'dark' | 'light';
  remixOpen: boolean;
  activeEffectChannel: string;
  toast: string;
  // undo
  canUndo: boolean;
  canRedo: boolean;
}

const CHANNEL_DEFS = [
  { key: 'sample', name: 'Sample', accent: 'var(--cyan)' },
  { key: 'beat', name: 'Beat', accent: 'var(--orange)' },
  { key: 'bass', name: 'Bass', accent: 'var(--green)' },
  { key: 'fx', name: 'FX', accent: 'var(--purple)' },
];

export const state = reactive<State>({
  ready: false,
  sampleName: '',
  hasSample: false,
  analyzing: false,
  recStatus: 'idle',
  recElapsed: 0,
  recError: '',
  originalBpm: 0,
  key: '—',
  duration: 0,
  loudness: 0,
  peaks: [],
  slices: [],
  sampleGrid: [],
  sliceMode: false,
  manualSlice: false,
  selectedSliceId: null,
  autoChopCount: 8,
  trimStart: 0,
  trimEnd: 0,
  trimmed: false,
  stretch: 1,
  sampleGain: 1,
  pitch: 0,
  wholeReversed: false,
  playing: false,
  bpm: 120,
  bars: 2,
  totalSteps: 32,
  currentStep: -1,
  loop: true,
  metronome: false,
  drums: [
    { id: 'kick', name: 'Kick', voice: 'kick', presetId: 'k808', steps: makeSteps(32), muted: false },
    { id: 'snare', name: 'Snare', voice: 'snare', presetId: 's909', steps: makeSteps(32), muted: false },
    { id: 'hat', name: 'Hat', voice: 'hat', presetId: 'hclosed', steps: makeSteps(32), muted: false },
    { id: 'clap', name: 'Clap', voice: 'clap', presetId: 'c909', steps: makeSteps(32), muted: false },
  ],
  notes: [],
  synthWave: 'sawtooth',
  instrument: DEFAULT_INSTRUMENT,
  channels: CHANNEL_DEFS.map((c) => ({
    ...c,
    volume: 0.8,
    pan: 0,
    muted: false,
    soloed: false,
    meter: 0,
    effects: [],
  })),
  view: 'studio',
  workspace: 'beat',
  theme: 'dark',
  remixOpen: false,
  activeEffectChannel: 'sample',
  toast: '',
  canUndo: false,
  canRedo: false,
});

// ---- Persistence: remember the last-open workspace across reloads ----------

const WORKSPACE_KEY = 'remix.workspace';
const REMIX_OPEN_KEY = 'remix.remixOpen';
const THEME_KEY = 'remix.theme';
const VALID_WORKSPACES = ['beat', 'chops', 'melody', 'effects', 'mix'] as const;

function applyTheme(theme: State['theme']) {
  document.documentElement.setAttribute('data-theme', theme);
}

try {
  const saved = localStorage.getItem(WORKSPACE_KEY);
  if (saved && (VALID_WORKSPACES as readonly string[]).includes(saved)) {
    state.workspace = saved as State['workspace'];
  }
  const remixOpen = localStorage.getItem(REMIX_OPEN_KEY);
  if (remixOpen !== null) state.remixOpen = remixOpen === '1';
  const theme = localStorage.getItem(THEME_KEY);
  if (theme === 'light' || theme === 'dark') state.theme = theme;
} catch {
  // localStorage may be unavailable (private mode / disabled); ignore.
}
// apply once at startup so first paint matches the saved theme
applyTheme(state.theme);

export function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
}

watch(
  () => state.theme,
  (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  },
);

watch(
  () => state.workspace,
  (ws) => {
    try {
      localStorage.setItem(WORKSPACE_KEY, ws);
    } catch {
      /* ignore */
    }
  },
);

watch(
  () => state.remixOpen,
  (open) => {
    try {
      localStorage.setItem(REMIX_OPEN_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
);

// ---- Audio wiring (non-reactive singletons) --------------------------------

const channels: Record<string, Channel> = {};
let samplePlayer: SamplePlayer | null = null;
let bassSynth: Synth | null = null;
let originalBuffer: AudioBuffer | null = null; // kept so trim can be reset

function presetById(voice: DrumVoice, id: string): DrumPreset {
  return DRUM_LIBRARY[voice].find((p) => p.id === id) || DRUM_LIBRARY[voice][0];
}

function initAudio() {
  const ctx = engine.ensure();
  if (Object.keys(channels).length) return;
  Object.assign(channels, createConfiguredChannels(ctx, engine.master));
  samplePlayer = new SamplePlayer(ctx, channels.sample.input);
  bassSynth = new Synth(ctx, channels.bass.input);
  bassSynth.setInstrument(state.instrument);

  engine.onStep((step, time) => scheduleStep(step, time));
  engine.onVisualStep = (s) => (state.currentStep = s);
}

function createConfiguredChannels(ctx: BaseAudioContext, bus: AudioNode): Record<string, Channel> {
  const configured: Record<string, Channel> = {};
  const anySolo = state.channels.some((channel) => channel.soloed);
  for (const ui of state.channels) {
    const channel = new Channel(ctx, bus);
    channel.soloed = ui.soloed;
    channel.setPan(ui.pan);
    channel.setVolume(ui.volume);
    channel.setMute(ui.muted);
    for (const savedEffect of ui.effects) {
      const effect = channel.addEffect(savedEffect.type);
      for (const [name, value] of Object.entries(savedEffect.params)) {
        effect.setParam(name, value);
      }
    }
    channel.applyGain(anySolo);
    configured[ui.key] = channel;
  }
  return configured;
}

function rebuildAudioGraph() {
  const ctx = engine.ensure();
  const buffer = samplePlayer?.buffer ?? null;
  Object.values(channels).forEach((channel) => channel.dispose());
  for (const key of Object.keys(channels)) delete channels[key];
  Object.assign(channels, createConfiguredChannels(ctx, engine.master));
  samplePlayer = new SamplePlayer(ctx, channels.sample.input);
  bassSynth = new Synth(ctx, channels.bass.input);
  bassSynth.setInstrument(state.instrument);
  if (buffer) samplePlayer.load(buffer);
  applySampleParams();
}

let metroBeat = 0;
function scheduleStep(step: number, time: number) {
  const ctx = engine.ctx!;
  // drums
  for (const track of state.drums) {
    if (track.muted) continue;
    const st = track.steps[step];
    if (!st || !st.on) continue;
    if (st.prob < 1 && Math.random() > st.prob) continue;
    const vel = st.velocity * (st.accent ? 1.3 : 1);
    playDrum(ctx, channels.beat.input, presetById(track.voice, track.presetId), time, vel);
  }
  // sample slices — polyphonic step grid (any number of chops per step)
  if (samplePlayer) {
    for (let i = 0; i < state.slices.length; i++) {
      if (state.sampleGrid[i]?.[step]) samplePlayer.playSlice(state.slices[i], time);
    }
  }
  // bass / melody notes
  if (bassSynth) {
    const spb = engine.secondsPerStep();
    for (const n of state.notes) {
      if (n.start === step) bassSynth.play(n.midi, time, n.length * spb, n.velocity);
    }
  }
  // metronome
  if (state.metronome && step % 4 === 0) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = step % 16 === 0 ? 1600 : 900;
    g.gain.setValueAtTime(0.25, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(g);
    g.connect(channels.fx.input);
    osc.start(time);
    osc.stop(time + 0.06);
    metroBeat++;
  }
}

// ---- Undo/redo -------------------------------------------------------------

type Snapshot = string;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];

function snapshot(): Snapshot {
  return JSON.stringify({
    drums: state.drums,
    notes: state.notes,
    sampleGrid: state.sampleGrid,
    slices: state.slices,
    selectedSliceId: state.selectedSliceId,
    autoChopCount: state.autoChopCount,
    pitch: state.pitch,
    stretch: state.stretch,
    sampleGain: state.sampleGain,
    wholeReversed: state.wholeReversed,
    bpm: state.bpm,
    bars: state.bars,
    totalSteps: state.totalSteps,
    loop: state.loop,
    metronome: state.metronome,
    synthWave: state.synthWave,
    instrument: state.instrument,
    channels: state.channels.map(({ meter: _meter, ...channel }) => channel),
  });
}

export function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
  state.canUndo = undoStack.length > 0;
  state.canRedo = false;
}

function restore(snap: Snapshot) {
  const s = JSON.parse(snap);
  state.drums = s.drums;
  state.notes = s.notes;
  state.sampleGrid = s.sampleGrid;
  state.slices = s.slices;
  state.selectedSliceId = s.selectedSliceId ?? null;
  if (typeof s.autoChopCount === 'number') state.autoChopCount = s.autoChopCount;
  state.pitch = s.pitch;
  state.stretch = s.stretch;
  if (typeof s.sampleGain === 'number') state.sampleGain = s.sampleGain;
  state.wholeReversed = s.wholeReversed;
  state.bpm = s.bpm;
  state.bars = s.bars;
  state.totalSteps = s.totalSteps;
  state.loop = s.loop;
  state.metronome = s.metronome;
  state.synthWave = s.synthWave;
  state.instrument = s.instrument ?? instrumentForWave(s.synthWave);
  bassSynth?.setInstrument(state.instrument);
  state.channels = s.channels.map((channel: Omit<UiChannel, 'meter'>) => ({ ...channel, meter: 0 }));
  engine.bpm = state.bpm;
  engine.bars = state.bars;
  engine.loop = state.loop;
  if (Object.keys(channels).length) rebuildAudioGraph();
  applySampleParams();
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop()!);
  state.canUndo = undoStack.length > 0;
  state.canRedo = true;
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop()!);
  state.canRedo = redoStack.length > 0;
  state.canUndo = true;
}

// ---- Actions ---------------------------------------------------------------

export async function loadFile(file: File): Promise<boolean> {
  initAudio();
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') await ctx.resume();
  state.analyzing = true;
  try {
    const arr = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr.slice(0));
    // only mutate state once decoding succeeds, so a bad file/recording leaves
    // the current sample and project untouched
    state.sampleName = file.name;
    originalBuffer = buffer;
    samplePlayer!.load(buffer);
    const a = await analyzeAsync(buffer);
    state.peaks = Array.from(a.peaks);
    state.originalBpm = a.bpm;
    state.key = a.key;
    state.duration = a.duration;
    state.loudness = a.loudnessDb;
    state.bpm = a.bpm;
    (state as any)._transients = a.transients;
    // trim selection starts as the whole sample
    state.trimStart = 0;
    state.trimEnd = a.duration;
    state.trimmed = false;
    // default chop count follows the detected transients, then auto-slice
    state.autoChopCount = transientChopCount(a.transients, a.duration);
    state.slices = autoSlices(a.transients, state.peaks, a.duration, state.autoChopCount);
    distributeSlices();
    state.hasSample = true;
    state.ready = true;
    toast(`Analyzed ${file.name}`);
    return true;
  } catch (e) {
    toast('Could not decode that audio file');
    console.error(e);
    return false;
  } finally {
    state.analyzing = false;
  }
}

// ---- Microphone recording --------------------------------------------------
// Open decision: capture is capped at 30s (a practical sample length that won't
// exhaust memory) and there is no mixer monitoring in this first release.
export const MAX_REC_SECONDS = 30;
let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let recChunks: Blob[] = [];
let recCancelled = false;
let recTimer: number | null = null;

function stopTracks() {
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
}
function clearRecTimer() {
  if (recTimer !== null) {
    clearInterval(recTimer);
    recTimer = null;
  }
}
function pickRecMime(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const t of types) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export async function startRecording() {
  if (state.recStatus === 'recording' || state.recStatus === 'requesting') return;
  state.recError = '';
  if (
    typeof MediaRecorder === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    state.recStatus = 'error';
    state.recError = 'Recording is not supported in this browser';
    return;
  }
  state.recStatus = 'requesting';
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    state.recStatus = 'error';
    state.recError = 'Microphone access was denied or no device is available';
    return;
  }
  try {
    initAudio();
    const ctx = engine.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    const mime = pickRecMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recChunks = [];
    recCancelled = false;
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) recChunks.push(e.data);
    };
    mr.onstop = () => void finishRecording();
    mr.onerror = () => {
      clearRecTimer();
      stopTracks();
      state.recStatus = 'error';
      state.recError = 'Recording failed';
    };
    mediaRecorder = mr;
    mediaStream = stream;
    mr.start();
    state.recElapsed = 0;
    state.recStatus = 'recording';
    recTimer = window.setInterval(() => {
      state.recElapsed = Math.min(MAX_REC_SECONDS, state.recElapsed + 0.1);
      if (state.recElapsed >= MAX_REC_SECONDS) stopRecording();
    }, 100);
  } catch {
    stopTracks();
    state.recStatus = 'error';
    state.recError = 'Could not start recording';
  }
}

export function stopRecording() {
  if (state.recStatus !== 'recording' || !mediaRecorder) return;
  recCancelled = false;
  clearRecTimer();
  try {
    mediaRecorder.stop(); // → onstop → finishRecording()
  } catch {
    /* ignore */
  }
  stopTracks();
}

export function cancelRecording() {
  clearRecTimer();
  if (state.recStatus === 'recording' && mediaRecorder) {
    recCancelled = true;
    try {
      mediaRecorder.stop();
    } catch {
      /* ignore */
    }
  }
  stopTracks();
  state.recStatus = 'idle';
  state.recElapsed = 0;
}

async function finishRecording() {
  clearRecTimer();
  const cancelled = recCancelled;
  const chunks = recChunks;
  const type = mediaRecorder?.mimeType || 'audio/webm';
  mediaRecorder = null;
  recChunks = [];
  if (cancelled || !chunks.length) {
    state.recStatus = 'idle';
    state.recElapsed = 0;
    return;
  }
  const blob = new Blob(chunks, { type });
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
  const file = new File([blob], `recording-${Date.now()}.${ext}`, { type });
  state.recStatus = 'idle';
  const ok = await loadFile(file); // reuse the upload analysis path
  if (!ok) {
    state.recStatus = 'error';
    state.recError = 'Could not decode the recording';
  }
}

export function dismissRecError() {
  if (state.recStatus === 'error') {
    state.recStatus = 'idle';
    state.recError = '';
  }
}

/** Release the mic + timer (call on component teardown). */
export function disposeRecording() {
  clearRecTimer();
  try {
    mediaRecorder?.stop();
  } catch {
    /* ignore */
  }
  mediaRecorder = null;
  stopTracks();
}

/** Build a default sample grid: each slice fires once, spread across the loop. */
export function distributeSlices() {
  const steps = state.totalSteps;
  const grid: boolean[][] = state.slices.map(() => new Array(steps).fill(false));
  if (state.slices.length) {
    const per = Math.max(1, Math.floor(steps / state.slices.length));
    state.slices.forEach((_, i) => {
      grid[i][(i * per) % steps] = true;
    });
  }
  state.sampleGrid = grid;
}

/** Toggle one cell of the sample step sequencer. */
export function toggleSampleStep(row: number, step: number) {
  const r = state.sampleGrid[row];
  if (!r || step < 0 || step >= r.length) return;
  pushHistory();
  r[step] = !r[step];
}

/** Clear every cell of the sample sequencer. */
export function clearSampleGrid() {
  pushHistory();
  state.sampleGrid = state.slices.map(() => new Array(state.totalSteps).fill(false));
}

// ---- Trim ------------------------------------------------------------------

/** Update the trim selection [start, end] (seconds), clamped with a min gap. */
export function setTrim(start: number, end: number) {
  const dur = state.duration || 0;
  const gap = 0.02;
  start = Math.max(0, Math.min(start, dur - gap));
  end = Math.min(dur, Math.max(end, start + gap));
  state.trimStart = start;
  state.trimEnd = end;
}

/** Re-derive everything from a (possibly cropped) buffer and reset the trim. */
function loadBuffer(buffer: AudioBuffer, trimmed: boolean) {
  samplePlayer!.load(buffer);
  const a = analyze(buffer);
  state.peaks = Array.from(a.peaks);
  state.duration = a.duration;
  state.loudness = a.loudnessDb;
  // re-detect tempo & key for the new region and apply the tempo to the engine
  state.originalBpm = a.bpm;
  state.key = a.key;
  setBpm(a.bpm, false);
  (state as any)._transients = a.transients;
  state.autoChopCount = transientChopCount(a.transients, a.duration);
  state.slices = autoSlices(a.transients, state.peaks, a.duration, state.autoChopCount);
  if (state.wholeReversed) state.slices.forEach((s) => (s.reversed = true));
  state.selectedSliceId = null;
  state.trimStart = 0;
  state.trimEnd = a.duration;
  state.trimmed = trimmed;
  applySampleParams();
  distributeSlices();
}

/** Crop the buffer down to the current trim selection (destructive, resettable). */
export function applyTrim() {
  if (!samplePlayer?.buffer) return;
  const s = state.trimStart;
  const e = state.trimEnd;
  if (e - s < 0.02 || (s < 0.005 && e > state.duration - 0.005)) {
    toast('Select a region to trim first');
    return;
  }
  const ctx = engine.ensure();
  loadBuffer(cropBuffer(ctx, samplePlayer.buffer, s, e), true);
  toast(`Trimmed to ${(e - s).toFixed(2)}s`);
}

/** Restore the originally-loaded sample. */
export function resetSample() {
  if (!originalBuffer) return;
  loadBuffer(originalBuffer, false);
  toast('Restored original sample');
}

/** Audition just the current trim selection. */
export function previewTrim() {
  initAudio();
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') ctx.resume();
  samplePlayer?.playRegion(state.trimStart, state.trimEnd, ctx.currentTime + 0.01);
}

/** Drag-to-rearrange: move a slice (and its sequencer row) to a new position. */
export function moveSlice(from: number, to: number) {
  if (from === to || from < 0 || to < 0) return;
  if (from >= state.slices.length || to >= state.slices.length) return;
  pushHistory();
  const [item] = state.slices.splice(from, 1);
  state.slices.splice(to, 0, item);
  const [row] = state.sampleGrid.splice(from, 1);
  if (row) state.sampleGrid.splice(to, 0, row);
}

export function deleteSlice(id: string) {
  const i = state.slices.findIndex((s) => s.id === id);
  if (i < 0) return;
  pushHistory();
  state.slices.splice(i, 1);
  state.sampleGrid.splice(i, 1); // keep the sequencer row aligned with the chop
  // move selection to a sensible neighbour (or clear on the last chop)
  if (state.selectedSliceId === id) {
    state.selectedSliceId = state.slices.length
      ? state.slices[Math.min(i, state.slices.length - 1)].id
      : null;
  }
}

export function duplicateSlice(id: string) {
  const i = state.slices.findIndex((s) => s.id === id);
  if (i < 0) return;
  pushHistory();
  state.slices.splice(i + 1, 0, { ...state.slices[i], id: nextSliceId() });
  const row = state.sampleGrid[i]
    ? [...state.sampleGrid[i]]
    : new Array(state.totalSteps).fill(false);
  state.sampleGrid.splice(i + 1, 0, row);
}

export function toggleSliceReverse(id: string) {
  const s = state.slices.find((x) => x.id === id);
  if (!s) return;
  pushHistory();
  s.reversed = !s.reversed;
}

/** Set a slice's playback length by moving its end (start stays fixed). Clamped
 *  to [0.02s, end-of-buffer]. History is managed by the caller (once per drag). */
export function setSliceDuration(index: number, dur: number) {
  const s = state.slices[index];
  if (!s) return;
  const maxDur = state.duration - s.start;
  s.end = s.start + Math.max(0.02, Math.min(dur, maxDur));
}

const MIN_SLICE = 0.02; // minimum chop length, seconds

/** Move a slice's start edge. Independent per chop: clamped to [0, end-min].
 *  History is managed by the caller (once per drag / keypress). */
export function setSliceStartTime(id: string, t: number) {
  const s = state.slices.find((x) => x.id === id);
  if (!s) return;
  s.start = Math.max(0, Math.min(t, s.end - MIN_SLICE));
}

/** Move a slice's end edge. Clamped to [start+min, sampleDuration]. */
export function setSliceEndTime(id: string, t: number) {
  const s = state.slices.find((x) => x.id === id);
  if (!s) return;
  s.end = Math.min(state.duration, Math.max(t, s.start + MIN_SLICE));
}

/** Audition a single slice (click-to-preview in the editor). */
export function playSlicePreview(id: string) {
  initAudio();
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') ctx.resume();
  const s = state.slices.find((x) => x.id === id);
  if (s && samplePlayer) samplePlayer.playSlice(s, ctx.currentTime + 0.01);
}

export function setSliceMode(on: boolean, kind: 'auto' | 'random' | 'manual' = 'auto') {
  state.sliceMode = on;
  if (!on) {
    state.manualSlice = false;
    return;
  }
  if (kind === 'manual') {
    // draw-your-own-region mode: keep any existing slices, let the user paint more
    state.manualSlice = true;
    return;
  }
  state.manualSlice = false;
  pushHistory();
  state.selectedSliceId = null;
  const trans = (state as any)._transients || [];
  if (kind === 'auto') {
    state.slices = autoSlices(trans, state.peaks, state.duration, state.autoChopCount);
  } else {
    // random glitch chops
    const n = 8 + Math.floor(Math.random() * 12);
    state.slices = evenSlices(state.duration, n).sort(() => Math.random() - 0.5);
  }
  distributeSlices();
}

/**
 * Set the requested number of auto chops (2–32) and, when auto-slicing is the
 * active view, regenerate the chops at that count. Migration policy: the sample
 * sequencer is **redistributed** to the default one-hit-per-chop pattern, since
 * the chop set has changed and old per-chop step edits no longer map. One call =
 * one undo entry.
 */
export function setAutoChopCount(count: number) {
  count = Math.max(MIN_AUTO_CHOPS, Math.min(MAX_AUTO_CHOPS, Math.round(count)));
  if (count === state.autoChopCount) return;
  // re-chop when the auto (arrangement) view is active — one undo entry that
  // captures the previous count AND slices before we change them
  if (state.sliceMode && !state.manualSlice && state.hasSample) {
    pushHistory();
    state.autoChopCount = count;
    state.selectedSliceId = null;
    const trans = (state as any)._transients || [];
    state.slices = autoSlices(trans, state.peaks, state.duration, count);
    distributeSlices();
  } else {
    // otherwise just remember the preference for the next auto slice
    state.autoChopCount = count;
  }
}

/** Manual slicing: add a slice for a hand-drawn [start, end] buffer region. */
export function addManualSlice(start: number, end: number) {
  const dur = state.duration;
  const s = Math.max(0, Math.min(start, end));
  const e = Math.min(dur, Math.max(start, end));
  if (e - s < 0.02) return;
  pushHistory();
  const slice = { id: nextSliceId(), start: s, end: e, pitch: 0, reversed: false, gain: 1 };
  state.slices.push(slice);
  const idx = state.slices.length - 1;
  const row = new Array(state.totalSteps).fill(false);
  row[(idx * 4) % state.totalSteps] = true; // drop it on a beat so it's audible
  state.sampleGrid.push(row);
  // audition the new chop immediately
  if (samplePlayer) {
    const ctx = engine.ensure();
    if (ctx.state === 'suspended') ctx.resume();
    samplePlayer.playSlice(slice, ctx.currentTime + 0.01);
  }
}

/** Remove every slice (and its sequencer rows). */
export function clearSlices() {
  pushHistory();
  state.slices = [];
  state.sampleGrid = [];
}

export function toggleStep(trackId: string, i: number, recordHistory = true) {
  const t = state.drums.find((d) => d.id === trackId);
  if (!t) return;
  if (recordHistory) pushHistory();
  t.steps[i].on = !t.steps[i].on;
}

export function setStepVelocity(trackId: string, i: number, v: number) {
  const t = state.drums.find((d) => d.id === trackId);
  if (t) {
    pushHistory();
    t.steps[i].velocity = v;
  }
}
export function setStepProb(trackId: string, i: number, p: number) {
  const t = state.drums.find((d) => d.id === trackId);
  if (t) {
    pushHistory();
    t.steps[i].prob = p;
  }
}
export function toggleAccent(trackId: string, i: number) {
  const t = state.drums.find((d) => d.id === trackId);
  if (t) {
    pushHistory();
    t.steps[i].accent = !t.steps[i].accent;
  }
}

export function setDrumPreset(trackId: string, presetId: string) {
  const t = state.drums.find((d) => d.id === trackId);
  if (t && t.presetId !== presetId) {
    pushHistory();
    t.presetId = presetId;
  }
}

export function auditionDrum(voice: DrumVoice, presetId: string) {
  initAudio();
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') ctx.resume();
  playDrum(ctx, channels.beat.input, presetById(voice, presetId), ctx.currentTime + 0.01);
}

// piano roll
export function addNote(midi: number, start: number, length = 2, velocity = 0.9) {
  pushHistory();
  state.notes.push({ id: noteId(), midi, start, length, velocity });
}
export function removeNote(id: string) {
  pushHistory();
  state.notes = state.notes.filter((n) => n.id !== id);
}
/** Remove every melody note in one undoable action (piano-roll Clear). */
export function clearNotes() {
  if (!state.notes.length) return;
  pushHistory();
  state.notes = [];
  toast('Melody cleared — undo to restore');
}
/** Set the melody instrument (project-wide). One undo entry per committed change. */
export function setInstrument(id: string, recordHistory = true) {
  const inst = instrumentById(id);
  if (state.instrument === inst.id) return;
  if (recordHistory) pushHistory();
  state.instrument = inst.id;
  state.synthWave = inst.wave; // keep legacy field valid for save/back-compat
  bassSynth?.setInstrument(inst.id);
}

// sample params
export function setPitch(semi: number) {
  state.pitch = semi;
  applySampleParams();
}
export function setStretch(rate: number) {
  state.stretch = rate;
  applySampleParams();
}
/** Sample makeup gain (0–4×). History is managed by the caller (once per drag). */
export function setSampleGain(v: number) {
  state.sampleGain = Math.max(0, Math.min(4, v));
  applySampleParams();
}
export function reverseSample() {
  pushHistory();
  state.wholeReversed = !state.wholeReversed;
  state.slices.forEach((s) => (s.reversed = state.wholeReversed));
  applySampleParams();
}
function applySampleParams() {
  if (!samplePlayer) return;
  samplePlayer.pitch = state.pitch;
  samplePlayer.rate = state.stretch;
  samplePlayer.gain = state.sampleGain;
  samplePlayer.wholeReversed = state.wholeReversed;
}

// transport
export async function togglePlay() {
  initAudio();
  if (state.playing) {
    engine.stop();
    state.playing = false;
    state.currentStep = -1;
  } else {
    await engine.start();
    state.playing = true;
  }
}
export function stop() {
  engine.stop();
  state.playing = false;
  state.currentStep = -1;
}
export function setBpm(v: number, recordHistory = true) {
  if (state.bpm === v) return;
  if (recordHistory) pushHistory();
  state.bpm = v;
  engine.bpm = v;
}
export function setLoop(v: boolean) {
  state.loop = v;
  engine.loop = v;
}
export function toggleMetronome() {
  state.metronome = !state.metronome;
}

export function setBars(bars: number) {
  if (state.bars === bars) return;
  pushHistory();
  const newTotal = bars * 16;
  const resize = (steps: Step[]) => {
    const out = makeSteps(newTotal);
    for (let i = 0; i < newTotal; i++) out[i] = steps[i % steps.length] || newStep();
    return out;
  };
  state.drums.forEach((d) => (d.steps = resize(d.steps)));
  // resize the sample grid the same way (loop the existing pattern)
  state.sampleGrid = state.sampleGrid.map((row) => {
    const out = new Array(newTotal).fill(false);
    if (row.length) for (let i = 0; i < newTotal; i++) out[i] = row[i % row.length];
    return out;
  });
  state.bars = bars;
  state.totalSteps = newTotal;
  engine.bars = bars;
}

// mixer
export function setChannelVolume(key: string, v: number) {
  const c = state.channels.find((x) => x.key === key);
  if (c) c.volume = v;
  channels[key]?.setVolume(v);
}
export function setChannelPan(key: string, p: number) {
  const c = state.channels.find((x) => x.key === key);
  if (c) c.pan = p;
  channels[key]?.setPan(p);
}
export function toggleMute(key: string) {
  const c = state.channels.find((x) => x.key === key);
  if (!c) return;
  pushHistory();
  c.muted = !c.muted;
  channels[key]?.setMute(c.muted);
  refreshSolo();
}
export function toggleSolo(key: string) {
  const c = state.channels.find((x) => x.key === key);
  if (!c) return;
  pushHistory();
  c.soloed = !c.soloed;
  if (channels[key]) channels[key].soloed = c.soloed;
  refreshSolo();
}
function refreshSolo() {
  const anySolo = state.channels.some((c) => c.soloed);
  state.channels.forEach((c) => channels[c.key]?.applyGain(anySolo));
}

// effects
export function addEffect(channelKey: string, type: EffectType, recordHistory = true) {
  initAudio();
  const ch = channels[channelKey];
  if (!ch) return;
  if (recordHistory) pushHistory();
  const fx = ch.addEffect(type);
  const uiCh = state.channels.find((c) => c.key === channelKey)!;
  uiCh.effects.push({ id: fx.id, type, params: { ...fx.params } });
}
export function removeEffect(channelKey: string, id: string) {
  if (!channels[channelKey]?.effects.some((effect) => effect.id === id)) return;
  pushHistory();
  channels[channelKey]?.removeEffect(id);
  const uiCh = state.channels.find((c) => c.key === channelKey)!;
  uiCh.effects = uiCh.effects.filter((e) => e.id !== id);
}
export function setEffectParam(channelKey: string, id: string, name: string, value: number) {
  const fx = channels[channelKey]?.effects.find((e) => e.id === id);
  fx?.setParam(name, value);
  const uiCh = state.channels.find((c) => c.key === channelKey)!;
  const uiFx = uiCh.effects.find((e) => e.id === id);
  if (uiFx) uiFx.params[name] = value;
}
export function reorderEffect(channelKey: string, from: number, to: number) {
  if (from === to) return;
  pushHistory();
  channels[channelKey]?.reorder(from, to);
  const uiCh = state.channels.find((c) => c.key === channelKey)!;
  const [item] = uiCh.effects.splice(from, 1);
  uiCh.effects.splice(to, 0, item);
}
export { EFFECT_PARAM_SPECS };

// performance pads
// Performance-pad keyboard bindings, shared by the pad grid and the global key
// handler. Chops beyond CHOP_PAD_KEYS.length have no key (pointer/touch only).
export const CHOP_PAD_KEYS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
];
export const DRUM_PAD_KEYS = ['a', 's', 'd', 'f'];

/** Trigger a sample chop by index with low latency (used by pads + keys). */
export function triggerChop(index: number) {
  const s = state.slices[index];
  if (!s) return;
  initAudio();
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') ctx.resume();
  samplePlayer!.playSlice(s, ctx.currentTime + 0.005);
}

/** Trigger a drum pad by index (Kick / Snare / Hat / Clap). */
export function triggerDrumPad(index: number) {
  const d = state.drums[index];
  if (d) auditionDrum(d.voice, d.presetId);
}

// meters — polled by the UI on a rAF loop
export function pollMeters() {
  if (!Object.keys(channels).length) return;
  for (const c of state.channels) {
    const lvl = channels[c.key]?.level() ?? 0;
    c.meter = c.meter * 0.6 + lvl * 0.4;
  }
}

// toast
let toastTimer: number | null = null;
export function toast(msg: string) {
  state.toast = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (state.toast = ''), 2600);
}

// export / render
export async function exportWav() {
  if (!samplePlayer?.buffer) {
    toast('Load a sample first');
    return;
  }
  toast('Rendering WAV…');
  const loops = 2;
  const secondsPerStep = 60 / state.bpm / 4;
  const effectTail = Math.max(
    1,
    ...state.channels.flatMap((channel) =>
      channel.effects.map((effect) => {
        if (effect.type === 'reverb') return Math.min(10, effect.params.size ?? 2);
        if (effect.type === 'delay') return Math.min(10, (effect.params.time ?? 0.4) * 8);
        return 1;
      }),
    ),
  );
  const dur = state.totalSteps * secondsPerStep * loops + effectTail;
  const rate = 44100;
  const offline = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);

  // Rebuild the live master and channel graph in the offline context.
  const master = offline.createGain();
  master.gain.value = 0.9;
  const limiter = offline.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  master.connect(limiter);
  limiter.connect(offline.destination);

  const offChans = createConfiguredChannels(offline, master);
  const offSample = new SamplePlayer(offline, offChans.sample.input);
  offSample.load(samplePlayer.buffer);
  offSample.pitch = state.pitch;
  offSample.rate = state.stretch;
  offSample.gain = state.sampleGain;
  offSample.wholeReversed = state.wholeReversed;
  const offSynth = new Synth(offline, offChans.bass.input);
  offSynth.setInstrument(state.instrument);

  for (let loop = 0; loop < loops; loop++) {
    for (let step = 0; step < state.totalSteps; step++) {
      const t = (loop * state.totalSteps + step) * secondsPerStep + 0.05;
      for (const track of state.drums) {
        if (track.muted) continue;
        const st = track.steps[step];
        if (!st?.on) continue;
        if (st.prob < 1 && Math.random() > st.prob) continue;
        const vel = st.velocity * (st.accent ? 1.3 : 1);
        playDrum(offline, offChans.beat.input, presetById(track.voice, track.presetId), t, vel);
      }
      for (let i = 0; i < state.slices.length; i++) {
        if (state.sampleGrid[i]?.[step]) offSample.playSlice(state.slices[i], t);
      }
      for (const n of state.notes) {
        if (n.start === step) offSynth.play(n.midi, t, n.length * secondsPerStep, n.velocity);
      }
    }
  }

  const rendered = await offline.startRendering();
  const blob = audioBufferToWav(rendered);
  downloadBlob(blob, (state.sampleName || 'remix').replace(/\.[^.]+$/, '') + '-remix.wav');
  toast('Exported WAV ✓');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function saveProject() {
  if (!samplePlayer?.buffer) {
    toast('Load a sample first');
    return;
  }
  toast('Saving project…');
  const audioData = await blobToDataUrl(audioBufferToWav(samplePlayer.buffer));
  const project = {
    version: 2,
    audioData,
    sampleName: state.sampleName,
    originalBpm: state.originalBpm,
    key: state.key,
    bpm: state.bpm,
    bars: state.bars,
    loop: state.loop,
    metronome: state.metronome,
    drums: state.drums,
    notes: state.notes,
    slices: state.slices,
    sampleGrid: state.sampleGrid,
    autoChopCount: state.autoChopCount,
    pitch: state.pitch,
    stretch: state.stretch,
    sampleGain: state.sampleGain,
    wholeReversed: state.wholeReversed,
    synthWave: state.synthWave,
    instrument: state.instrument,
    channels: state.channels.map(({ key, volume, pan, muted, soloed, effects }) => ({
      key, volume, pan, muted, soloed, effects,
    })),
  } satisfies ProjectFileV2;
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  downloadBlob(blob, (state.sampleName || 'remix').replace(/\.[^.]+$/, '') + '.remix.json');
  toast('Project saved');
}

export async function loadProject(file: File) {
  state.analyzing = true;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!isProjectFile(parsed)) throw new Error('Unsupported or invalid project file');

    stop();
    const ctx = engine.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    const encodedAudio = await fetch(parsed.audioData).then((response) => response.arrayBuffer());
    const buffer = await ctx.decodeAudioData(encodedAudio);

    state.sampleName = parsed.sampleName;
    state.originalBpm = parsed.originalBpm;
    state.key = parsed.key;
    state.duration = buffer.duration;
    const restoredAnalysis = await analyzeAsync(buffer);
    state.loudness = restoredAnalysis.loudnessDb;
    state.peaks = Array.from(restoredAnalysis.peaks);
    state.bpm = parsed.bpm;
    state.bars = parsed.bars;
    state.totalSteps = parsed.bars * 16;
    state.loop = parsed.loop;
    state.metronome = parsed.metronome;
    state.drums = parsed.drums;
    state.notes = parsed.notes;
    state.slices = parsed.slices;
    state.sampleGrid = parsed.sampleGrid;
    state.autoChopCount =
      parsed.autoChopCount ??
      transientChopCount(restoredAnalysis.transients, buffer.duration);
    (state as any)._transients = restoredAnalysis.transients;
    state.selectedSliceId = null;
    state.pitch = parsed.pitch;
    state.stretch = parsed.stretch;
    state.sampleGain = parsed.sampleGain ?? 1;
    state.wholeReversed = parsed.wholeReversed;
    state.synthWave = parsed.synthWave;
    state.instrument = parsed.instrument ?? instrumentForWave(parsed.synthWave);
    state.channels = parsed.channels.map((saved) => ({
      ...saved,
      name: CHANNEL_DEFS.find((channel) => channel.key === saved.key)?.name ?? saved.key,
      accent: CHANNEL_DEFS.find((channel) => channel.key === saved.key)?.accent ?? 'var(--cyan)',
      meter: 0,
    }));
    state.trimStart = 0;
    state.trimEnd = buffer.duration;
    state.trimmed = false;
    state.hasSample = true;
    state.ready = true;

    engine.bpm = parsed.bpm;
    engine.bars = parsed.bars;
    engine.loop = parsed.loop;
    originalBuffer = buffer;
    rebuildAudioGraph();
    samplePlayer!.load(buffer);
    applySampleParams();
    undoStack.length = 0;
    redoStack.length = 0;
    state.canUndo = false;
    state.canRedo = false;
    toast(`Loaded ${file.name}`);
  } catch (error) {
    console.error(error);
    toast(error instanceof Error ? error.message : 'Could not load project');
  } finally {
    state.analyzing = false;
  }
}
