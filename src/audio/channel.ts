// A mixer channel: input -> [insert effects...] -> pan -> gain -> analyser -> bus.
// Effects can be added, removed and reordered live without dropping audio.

import { createEffect } from './effects';
import type { Effect, EffectType } from './effects';

export class Channel {
  input: GainNode;
  private panner: StereoPannerNode;
  private gain: GainNode;
  private analyser: AnalyserNode;
  effects: Effect[] = [];

  volume = 0.8;
  pan = 0;
  muted = false;
  soloed = false;

  constructor(private ctx: AudioContext, bus: AudioNode) {
    this.input = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.gain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.gain.gain.value = this.volume;
    this.panner.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(bus);
    this.rewire();
  }

  /** Rebuild the internal chain after an effect add/remove/reorder. */
  private rewire() {
    this.input.disconnect();
    this.effects.forEach((e) => e.output.disconnect());
    let node: AudioNode = this.input;
    for (const e of this.effects) {
      node.connect(e.input);
      node = e.output;
    }
    node.connect(this.panner);
  }

  addEffect(type: EffectType): Effect {
    const fx = createEffect(this.ctx, type);
    this.effects.push(fx);
    this.rewire();
    return fx;
  }

  removeEffect(id: string) {
    const fx = this.effects.find((e) => e.id === id);
    if (!fx) return;
    this.effects = this.effects.filter((e) => e.id !== id);
    this.rewire();
    fx.dispose();
  }

  reorder(from: number, to: number) {
    const [item] = this.effects.splice(from, 1);
    this.effects.splice(to, 0, item);
    this.rewire();
  }

  setVolume(v: number) {
    this.volume = v;
    this.applyGain();
  }
  setPan(p: number) {
    this.pan = p;
    this.panner.pan.value = p;
  }
  setMute(m: boolean) {
    this.muted = m;
    this.applyGain();
  }

  /** anySolo lets the mixer implement solo across all channels. */
  applyGain(anySolo = false) {
    const audible = this.muted ? false : anySolo ? this.soloed : true;
    this.gain.gain.setTargetAtTime(audible ? this.volume : 0, this.ctx.currentTime, 0.01);
  }

  level(): number {
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }
}
