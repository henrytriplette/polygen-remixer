// "Smart Remix" transforms. These are algorithmic, not a neural net — each one
// applies a musically-informed, non-destructive variation the user can undo.

import {
  state,
  pushHistory,
  setBpm,
  setSynthWave,
  addEffect,
  setEffectParam,
  toast,
} from './store';
import type { Step } from './store';

const clear = (t: { steps: Step[] }) => t.steps.forEach((s) => (s.on = false));
const track = (id: string) => state.drums.find((d) => d.id === id);

function setPattern(id: string, pattern: number[], vel = 0.85) {
  const t = track(id);
  if (!t) return;
  clear(t);
  for (let i = 0; i < t.steps.length; i++) {
    if (pattern[i % pattern.length]) {
      t.steps[i].on = true;
      t.steps[i].velocity = vel;
    }
  }
}

export function generateDrumPattern() {
  pushHistory();
  // Randomized-but-tasteful pattern per genre-neutral feel.
  const kick = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 1 : Math.random() < 0.12 ? 1 : 0));
  const snare = Array.from({ length: 16 }, (_, i) => (i % 8 === 4 ? 1 : 0));
  const hat = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? 1 : Math.random() < 0.4 ? 1 : 0));
  const clap = Array.from({ length: 16 }, (_, i) => (i % 8 === 4 ? 1 : 0));
  setPattern('kick', kick);
  setPattern('snare', snare);
  setPattern('hat', hat, 0.5);
  setPattern('clap', clap);
  toast('Generated a drum pattern');
}

export function generateBassline() {
  pushHistory();
  // Root-driven bassline using the detected key's tonic.
  const tonic = keyToMidi(state.key);
  const degrees = [0, 0, 7, 0, 5, 0, 3, 7];
  state.notes = state.notes.filter(() => false);
  for (let i = 0; i < state.totalSteps; i += 2) {
    const d = degrees[(i / 2) % degrees.length];
    state.notes.push({
      id: `b${i}${Math.random().toString(36).slice(2, 6)}`,
      midi: tonic + d,
      start: i,
      length: 2,
      velocity: 0.8,
    });
  }
  setSynthWave('sawtooth');
  toast('Generated a bassline');
}

export function makeLoFi() {
  pushHistory();
  setBpm(Math.max(70, Math.round(state.bpm * 0.85)), false);
  addEffect('sample', 'bitcrusher', false);
  addEffect('sample', 'filter', false);
  addEffect('beat', 'compressor', false);
  // soften hats
  const hat = track('hat');
  hat?.steps.forEach((s) => (s.velocity = Math.min(s.velocity, 0.4)));
  toast('Made it lo-fi');
}

export function turnIntoHouse() {
  pushHistory();
  setBpm(124, false);
  setPattern('kick', [1, 0, 0, 0], 0.95);
  setPattern('hat', [0, 0, 1, 0], 0.5);
  setPattern('clap', [0, 0, 0, 0, 1, 0, 0, 0], 0.8);
  const snare = track('snare');
  if (snare) clear(snare);
  toast('House groove applied');
}

export function turnIntoDnB() {
  pushHistory();
  setBpm(174, false);
  setPattern('kick', [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  setPattern('snare', [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
  setPattern('hat', [1, 0, 1, 0], 0.45);
  toast('Drum & bass break applied');
}

export function turnIntoTrap() {
  pushHistory();
  setBpm(140, false);
  setPattern('kick', [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  setPattern('snare', [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  // rolling hats
  const hat = track('hat');
  if (hat) {
    clear(hat);
    for (let i = 0; i < hat.steps.length; i++) {
      hat.steps[i].on = true;
      hat.steps[i].velocity = i % 4 === 2 ? 0.7 : 0.4;
      if (i % 8 === 6) hat.steps[i].prob = 0.6; // triplet-ish rolls
    }
  }
  toast('Trap beat applied');
}

export function makeDarker() {
  pushHistory();
  addEffect('sample', 'filter', false);
  const specs = state.channels.find((c) => c.key === 'sample');
  const filt = specs?.effects.find((e) => e.type === 'filter');
  if (filt) setEffectParam('sample', filt.id, 'cutoff', 900);
  addEffect('sample', 'reverb', false);
  toast('Made it darker');
}

export function makeEnergetic() {
  pushHistory();
  setBpm(Math.min(180, state.bpm + 8), false);
  const hat = track('hat');
  hat?.steps.forEach((s, i) => {
    s.on = true;
    s.velocity = i % 2 === 0 ? 0.6 : 0.35;
  });
  addEffect('beat', 'compressor', false);
  toast('More energy');
}

function keyToMidi(key: string): number {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const root = key.split(' ')[0];
  const idx = names.indexOf(root);
  return 36 + (idx < 0 ? 0 : idx); // bass register
}

export const REMIX_ACTIONS = [
  { label: 'Generate Drum Pattern', run: generateDrumPattern },
  { label: 'Generate Bassline', run: generateBassline },
  { label: 'Make it Lo-Fi', run: makeLoFi },
  { label: 'Turn into House', run: turnIntoHouse },
  { label: 'Turn into DnB', run: turnIntoDnB },
  { label: 'Turn into Trap', run: turnIntoTrap },
  { label: 'Make it Darker', run: makeDarker },
  { label: 'Make it More Energetic', run: makeEnergetic },
];
