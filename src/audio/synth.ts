// A small subtractive synth voice for the piano roll (bass / lead lines).

export interface Note {
  id: string;
  midi: number; // pitch
  start: number; // in steps
  length: number; // in steps
  velocity: number;
}

let nc = 0;
export const noteId = () => `n${nc++}`;

export function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToName(m: number) {
  return `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
}

export type SynthWave = 'sawtooth' | 'square' | 'sine' | 'triangle';

// A melody instrument is a subtractive-synth recipe (osc + filter + ADSR). No
// binary assets — every voice is generated live, so it works in the offline
// export context too.
export interface SynthInstrument {
  id: string;
  name: string;
  wave: SynthWave; // base oscillator (also the back-compat `synthWave`)
  detune: number; // cents for a 2nd, slightly-detuned osc (0 = mono)
  sub: boolean; // add a sine one octave down
  cutoff: number; // base low-pass cutoff (Hz)
  cutoffEnv: number; // cutoff is (cutoff × cutoffEnv) at onset, decays to cutoff
  q: number;
  attack: number;
  decay: number;
  sustain: number; // 0..1 of peak
  release: number;
  gain: number; // output level
}

export const INSTRUMENTS: SynthInstrument[] = [
  { id: 'bass', name: 'Bass', wave: 'sawtooth', detune: 0, sub: true, cutoff: 520, cutoffEnv: 3, q: 7, attack: 0.005, decay: 0.12, sustain: 0.55, release: 0.08, gain: 0.34 },
  { id: 'lead', name: 'Lead', wave: 'sawtooth', detune: 9, sub: false, cutoff: 2600, cutoffEnv: 1.6, q: 3, attack: 0.006, decay: 0.1, sustain: 0.72, release: 0.12, gain: 0.24 },
  { id: 'pluck', name: 'Pluck', wave: 'triangle', detune: 0, sub: false, cutoff: 4200, cutoffEnv: 3.2, q: 2, attack: 0.002, decay: 0.16, sustain: 0.001, release: 0.09, gain: 0.3 },
  { id: 'keys', name: 'Keys', wave: 'sine', detune: 5, sub: false, cutoff: 3200, cutoffEnv: 1.3, q: 1, attack: 0.005, decay: 0.28, sustain: 0.4, release: 0.22, gain: 0.28 },
  { id: 'pad', name: 'Pad', wave: 'sawtooth', detune: 13, sub: false, cutoff: 1300, cutoffEnv: 1.15, q: 1, attack: 0.16, decay: 0.35, sustain: 0.82, release: 0.55, gain: 0.2 },
];
export const DEFAULT_INSTRUMENT = 'lead';

export function instrumentById(id: string): SynthInstrument {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[1];
}
/** Back-compat: map a legacy `synthWave` value to a sensible instrument id. */
export function instrumentForWave(wave: string): string {
  switch (wave) {
    case 'sine':
      return 'keys';
    case 'triangle':
      return 'pluck';
    case 'square':
      return 'lead';
    default:
      return 'lead'; // sawtooth / unknown
  }
}

export class Synth {
  instrument: SynthInstrument = instrumentById(DEFAULT_INSTRUMENT);

  constructor(private ctx: BaseAudioContext, private dest: AudioNode) {}

  setInstrument(id: string) {
    this.instrument = instrumentById(id);
  }

  play(midi: number, when: number, duration: number, velocity = 1) {
    const inst = this.instrument;
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    // oscillators — main, optional detuned twin, optional sub octave
    const oscs: OscillatorNode[] = [];
    const main = this.ctx.createOscillator();
    main.type = inst.wave;
    main.frequency.value = midiToFreq(midi);
    oscs.push(main);
    if (inst.detune) {
      const twin = this.ctx.createOscillator();
      twin.type = inst.wave;
      twin.frequency.value = midiToFreq(midi);
      twin.detune.value = inst.detune;
      oscs.push(twin);
    }
    if (inst.sub) {
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = midiToFreq(midi - 12);
      oscs.push(sub);
    }

    // filter with a downward cutoff envelope
    filter.type = 'lowpass';
    filter.Q.value = inst.q;
    const openF = Math.min(18000, inst.cutoff * inst.cutoffEnv);
    filter.frequency.setValueAtTime(openF, when);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, inst.cutoff),
      when + inst.attack + inst.decay + 0.02,
    );

    // ADSR amplitude envelope, held for `duration` then released
    const peak = Math.max(0.0002, inst.gain * velocity);
    const sus = Math.max(0.0002, peak * inst.sustain);
    const relStart = Math.max(when + inst.attack + inst.decay, when + duration);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + inst.attack);
    g.gain.exponentialRampToValueAtTime(sus, when + inst.attack + inst.decay);
    g.gain.setValueAtTime(sus, relStart);
    g.gain.exponentialRampToValueAtTime(0.0001, relStart + inst.release);

    const stopAt = relStart + inst.release + 0.05;
    for (const o of oscs) {
      o.connect(filter);
      o.start(when);
      o.stop(stopAt);
    }
    filter.connect(g);
    g.connect(this.dest);
  }
}
