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

export class Synth {
  wave: SynthWave = 'sawtooth';
  cutoff = 1800;
  constructor(private ctx: BaseAudioContext, private dest: AudioNode) {}

  play(midi: number, when: number, duration: number, velocity = 1) {
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = this.wave;
    sub.type = 'sine';
    osc.frequency.value = midiToFreq(midi);
    sub.frequency.value = midiToFreq(midi - 12);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.cutoff, when);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(200, this.cutoff * 0.4),
      when + duration,
    );
    filter.Q.value = 6;

    const peak = 0.28 * velocity;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.01);
    g.gain.setValueAtTime(peak, when + duration * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(g);
    g.connect(this.dest);
    osc.start(when);
    sub.start(when);
    osc.stop(when + duration + 0.02);
    sub.stop(when + duration + 0.02);
  }
}
