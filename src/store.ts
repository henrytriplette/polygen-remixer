// The single reactive store. It owns UI-facing state and bridges every user
// action to the imperative audio engine. The engine's step callback reads from
// here to trigger drums, sample slices and synth notes in perfect sync.

import { reactive, watch } from 'vue';
import { engine } from './audio/engine';
import { Channel } from './audio/channel';
import { SamplePlayer, makeSlices, evenSlices, nextSliceId } from './audio/sample';
import type { Slice } from './audio/sample';
import { Synth, noteId } from './audio/synth';
import type { Note } from './audio/synth';
import { DRUM_LIBRARY, playDrum } from './audio/drums';
import type { DrumPreset, DrumVoice } from './audio/drums';
import { analyze } from './audio/analysis';
import { EFFECT_PARAM_SPECS } from './audio/effects';
import type { EffectType } from './audio/effects';
import { audioBufferToWav, downloadBlob } from './audio/wav';

export interface Step {
  on: boolean;
  velocity: number; // 0..1
  prob: number; // 0..1
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

export interface UiEffect {
  id: string;
  type: EffectType;
  params: Record<string, number>;
}

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
  originalBpm: number;
  key: string;
  duration: number;
  loudness: number;
  peaks: number[];
  slices: Slice[];
  sampleSteps: (string | null)[]; // slice id per step
  sliceMode: boolean;
  stretch: number;
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
  synthWave: string;
  // mixer
  channels: UiChannel[];
  // ui
  view: 'studio' | 'perform';
  workspace: 'beat' | 'melody' | 'effects' | 'mix';
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
  originalBpm: 0,
  key: '—',
  duration: 0,
  loudness: 0,
  peaks: [],
  slices: [],
  sampleSteps: [],
  sliceMode: false,
  stretch: 1,
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
const VALID_WORKSPACES = ['beat', 'melody', 'effects', 'mix'] as const;

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

function presetById(voice: DrumVoice, id: string): DrumPreset {
  return DRUM_LIBRARY[voice].find((p) => p.id === id) || DRUM_LIBRARY[voice][0];
}

function initAudio() {
  const ctx = engine.ensure();
  if (Object.keys(channels).length) return;
  for (const def of CHANNEL_DEFS) channels[def.key] = new Channel(ctx, engine.master);
  samplePlayer = new SamplePlayer(ctx, channels.sample.input);
  bassSynth = new Synth(ctx, channels.bass.input);

  engine.onStep((step, time) => scheduleStep(step, time));
  engine.onVisualStep = (s) => (state.currentStep = s);
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
  // sample slices
  const sliceId = state.sampleSteps[step];
  if (sliceId && samplePlayer) {
    const slice = state.slices.find((s) => s.id === sliceId);
    if (slice) samplePlayer.playSlice(slice, time);
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
    sampleSteps: state.sampleSteps,
    slices: state.slices,
    pitch: state.pitch,
    stretch: state.stretch,
    wholeReversed: state.wholeReversed,
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
  state.sampleSteps = s.sampleSteps;
  state.slices = s.slices;
  state.pitch = s.pitch;
  state.stretch = s.stretch;
  state.wholeReversed = s.wholeReversed;
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

export async function loadFile(file: File) {
  initAudio();
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') await ctx.resume();
  state.analyzing = true;
  state.sampleName = file.name;
  try {
    const arr = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr.slice(0));
    samplePlayer!.load(buffer);
    const a = analyze(buffer);
    state.peaks = Array.from(a.peaks);
    state.originalBpm = a.bpm;
    state.key = a.key;
    state.duration = a.duration;
    state.loudness = a.loudnessDb;
    state.bpm = a.bpm;
    (state as any)._transients = a.transients;
    // default: one auto-slice pass so the sample is immediately playable
    state.slices = makeSlices(a.transients, a.duration);
    distributeSlices();
    state.hasSample = true;
    state.ready = true;
    toast(`Analyzed ${file.name}`);
  } catch (e) {
    toast('Could not decode that audio file');
    console.error(e);
  } finally {
    state.analyzing = false;
  }
}

/** Map current slices across the loop's steps, evenly. */
export function distributeSlices() {
  const steps = state.totalSteps;
  const arr: (string | null)[] = new Array(steps).fill(null);
  if (state.slices.length) {
    const per = Math.max(1, Math.floor(steps / state.slices.length));
    state.slices.forEach((s, i) => {
      const idx = (i * per) % steps;
      arr[idx] = s.id;
    });
  }
  state.sampleSteps = arr;
}

/** Drag-to-rearrange: move a slice to a new position; playback order follows. */
export function moveSlice(from: number, to: number) {
  if (from === to || from < 0 || to < 0) return;
  if (from >= state.slices.length || to >= state.slices.length) return;
  pushHistory();
  const [item] = state.slices.splice(from, 1);
  state.slices.splice(to, 0, item);
  distributeSlices();
}

export function deleteSlice(id: string) {
  pushHistory();
  state.slices = state.slices.filter((s) => s.id !== id);
  distributeSlices();
}

export function duplicateSlice(id: string) {
  const i = state.slices.findIndex((s) => s.id === id);
  if (i < 0) return;
  pushHistory();
  state.slices.splice(i + 1, 0, { ...state.slices[i], id: nextSliceId() });
  distributeSlices();
}

export function toggleSliceReverse(id: string) {
  const s = state.slices.find((x) => x.id === id);
  if (!s) return;
  pushHistory();
  s.reversed = !s.reversed;
}

/** Audition a single slice (click-to-preview in the editor). */
export function playSlicePreview(id: string) {
  initAudio();
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') ctx.resume();
  const s = state.slices.find((x) => x.id === id);
  if (s && samplePlayer) samplePlayer.playSlice(s, ctx.currentTime + 0.01);
}

export function setSliceMode(on: boolean, kind: 'auto' | 'random' | 'even' = 'auto') {
  state.sliceMode = on;
  if (!on) return;
  pushHistory();
  const trans = (state as any)._transients || [];
  if (kind === 'auto') state.slices = makeSlices(trans, state.duration);
  else if (kind === 'even') state.slices = evenSlices(state.duration, 16);
  else {
    // random glitch chops
    const n = 8 + Math.floor(Math.random() * 12);
    state.slices = evenSlices(state.duration, n).sort(() => Math.random() - 0.5);
  }
  distributeSlices();
}

export function toggleStep(trackId: string, i: number) {
  const t = state.drums.find((d) => d.id === trackId);
  if (!t) return;
  pushHistory();
  t.steps[i].on = !t.steps[i].on;
}

export function setStepVelocity(trackId: string, i: number, v: number) {
  const t = state.drums.find((d) => d.id === trackId);
  if (t) t.steps[i].velocity = v;
}
export function setStepProb(trackId: string, i: number, p: number) {
  const t = state.drums.find((d) => d.id === trackId);
  if (t) t.steps[i].prob = p;
}
export function toggleAccent(trackId: string, i: number) {
  const t = state.drums.find((d) => d.id === trackId);
  if (t) t.steps[i].accent = !t.steps[i].accent;
}

export function setDrumPreset(trackId: string, presetId: string) {
  const t = state.drums.find((d) => d.id === trackId);
  if (t) t.presetId = presetId;
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
export function setSynthWave(w: string) {
  state.synthWave = w;
  if (bassSynth) bassSynth.wave = w as any;
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
export function setBpm(v: number) {
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
  const newTotal = bars * 16;
  const resize = (steps: Step[]) => {
    const out = makeSteps(newTotal);
    for (let i = 0; i < newTotal; i++) out[i] = steps[i % steps.length] || newStep();
    return out;
  };
  state.drums.forEach((d) => (d.steps = resize(d.steps)));
  state.bars = bars;
  state.totalSteps = newTotal;
  engine.bars = bars;
  distributeSlices();
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
  c.muted = !c.muted;
  channels[key]?.setMute(c.muted);
  refreshSolo();
}
export function toggleSolo(key: string) {
  const c = state.channels.find((x) => x.key === key);
  if (!c) return;
  c.soloed = !c.soloed;
  if (channels[key]) channels[key].soloed = c.soloed;
  refreshSolo();
}
function refreshSolo() {
  const anySolo = state.channels.some((c) => c.soloed);
  state.channels.forEach((c) => channels[c.key]?.applyGain(anySolo));
}

// effects
export function addEffect(channelKey: string, type: EffectType) {
  initAudio();
  const ch = channels[channelKey];
  if (!ch) return;
  const fx = ch.addEffect(type);
  const uiCh = state.channels.find((c) => c.key === channelKey)!;
  uiCh.effects.push({ id: fx.id, type, params: { ...fx.params } });
}
export function removeEffect(channelKey: string, id: string) {
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
  channels[channelKey]?.reorder(from, to);
  const uiCh = state.channels.find((c) => c.key === channelKey)!;
  const [item] = uiCh.effects.splice(from, 1);
  uiCh.effects.splice(to, 0, item);
}
export { EFFECT_PARAM_SPECS };

// performance pads
export function triggerPad(index: number) {
  initAudio();
  const ctx = engine.ensure();
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime + 0.005;
  if (index < 4 && state.slices[index]) {
    samplePlayer!.playSlice(state.slices[index], t);
  } else {
    const drum = state.drums[index % state.drums.length];
    playDrum(ctx, channels.beat.input, presetById(drum.voice, drum.presetId), t);
  }
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
  const dur = state.totalSteps * secondsPerStep * loops + 1;
  const rate = 44100;
  const offline = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);

  // Rebuild a minimal graph in the offline context.
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  const offChans: Record<string, GainNode> = {};
  for (const def of CHANNEL_DEFS) {
    const g = offline.createGain();
    const ui = state.channels.find((c) => c.key === def.key)!;
    g.gain.value = ui.muted ? 0 : ui.volume;
    g.connect(master);
    offChans[def.key] = g;
  }

  const offSample = new SamplePlayer(offline as any, offChans.sample);
  offSample.load(samplePlayer.buffer);
  offSample.pitch = state.pitch;
  offSample.rate = state.stretch;
  offSample.wholeReversed = state.wholeReversed;
  const offSynth = new Synth(offline as any, offChans.bass);
  offSynth.wave = state.synthWave as any;

  for (let loop = 0; loop < loops; loop++) {
    for (let step = 0; step < state.totalSteps; step++) {
      const t = (loop * state.totalSteps + step) * secondsPerStep + 0.05;
      for (const track of state.drums) {
        if (track.muted) continue;
        const st = track.steps[step];
        if (!st?.on) continue;
        const vel = st.velocity * (st.accent ? 1.3 : 1);
        playDrum(offline as any, offChans.beat, presetById(track.voice, track.presetId), t, vel);
      }
      const sliceId = state.sampleSteps[step];
      if (sliceId) {
        const slice = state.slices.find((s) => s.id === sliceId);
        if (slice) offSample.playSlice(slice, t);
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

export function saveProject() {
  const project = {
    version: 1,
    sampleName: state.sampleName,
    bpm: state.bpm,
    bars: state.bars,
    drums: state.drums,
    notes: state.notes,
    slices: state.slices,
    sampleSteps: state.sampleSteps,
    channels: state.channels.map((c) => ({
      key: c.key,
      volume: c.volume,
      pan: c.pan,
      muted: c.muted,
    })),
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  downloadBlob(blob, (state.sampleName || 'remix').replace(/\.[^.]+$/, '') + '.remix.json');
  toast('Project saved');
}
