// Effect modules. Each effect exposes an `input` and `output` node plus a
// param map, so a Channel can chain them dynamically and reorder on the fly.

export type EffectType =
  | 'eq'
  | 'filter'
  | 'reverb'
  | 'delay'
  | 'distortion'
  | 'chorus'
  | 'compressor'
  | 'bitcrusher'
  | 'phaser'
  | 'flanger';

export interface Effect {
  id: string;
  type: EffectType;
  input: AudioNode;
  output: AudioNode;
  params: Record<string, number>;
  setParam(name: string, value: number): void;
  dispose(): void;
}

let idc = 0;
const uid = () => `fx${idc++}`;

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = amount * 100;
  const n = 44100;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/** Generate a decaying-noise impulse response for the convolution reverb. */
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}

export function createEffect(ctx: AudioContext, type: EffectType): Effect {
  switch (type) {
    case 'filter':
      return filterEffect(ctx);
    case 'eq':
      return eqEffect(ctx);
    case 'reverb':
      return reverbEffect(ctx);
    case 'delay':
      return delayEffect(ctx);
    case 'distortion':
      return distortionEffect(ctx);
    case 'bitcrusher':
      return bitcrusherEffect(ctx);
    case 'chorus':
      return chorusEffect(ctx);
    case 'compressor':
      return compressorEffect(ctx);
    case 'phaser':
      return phaserEffect(ctx);
    case 'flanger':
      return flangerEffect(ctx);
  }
}

function filterEffect(ctx: AudioContext): Effect {
  const node = ctx.createBiquadFilter();
  node.type = 'lowpass';
  node.frequency.value = 12000;
  node.Q.value = 1;
  const params = { cutoff: 12000, resonance: 1, type: 0 };
  const types: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];
  return {
    id: uid(),
    type: 'filter',
    input: node,
    output: node,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'cutoff') node.frequency.value = value;
      if (name === 'resonance') node.Q.value = value;
      if (name === 'type') node.type = types[value] || 'lowpass';
    },
    dispose() {
      node.disconnect();
    },
  };
}

function eqEffect(ctx: AudioContext): Effect {
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 250;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1200;
  mid.Q.value = 1;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 4000;
  low.connect(mid);
  mid.connect(high);
  const params = { low: 0, mid: 0, high: 0 };
  return {
    id: uid(),
    type: 'eq',
    input: low,
    output: high,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'low') low.gain.value = value;
      if (name === 'mid') mid.gain.value = value;
      if (name === 'high') high.gain.value = value;
    },
    dispose() {
      low.disconnect();
      mid.disconnect();
      high.disconnect();
    },
  };
}

function reverbEffect(ctx: AudioContext): Effect {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.2, 2.5);
  dry.gain.value = 0.6;
  wet.gain.value = 0.35;
  input.connect(dry);
  dry.connect(output);
  input.connect(conv);
  conv.connect(wet);
  wet.connect(output);
  const params = { size: 2.2, mix: 0.35, decay: 2.5 };
  const rebuild = () =>
    (conv.buffer = makeImpulse(ctx, params.size, params.decay));
  return {
    id: uid(),
    type: 'reverb',
    input,
    output,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'mix') {
        wet.gain.value = value;
        dry.gain.value = 1 - value * 0.7;
      }
      if (name === 'size' || name === 'decay') rebuild();
    },
    dispose() {
      [input, output, dry, wet, conv].forEach((n) => n.disconnect());
    },
  };
}

function delayEffect(ctx: AudioContext): Effect {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const delay = ctx.createDelay(2);
  const fb = ctx.createGain();
  delay.delayTime.value = 0.375;
  fb.gain.value = 0.35;
  wet.gain.value = 0.4;
  input.connect(dry);
  dry.connect(output);
  input.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(output);
  const params = { time: 0.375, feedback: 0.35, mix: 0.4 };
  return {
    id: uid(),
    type: 'delay',
    input,
    output,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'time') delay.delayTime.value = value;
      if (name === 'feedback') fb.gain.value = value;
      if (name === 'mix') wet.gain.value = value;
    },
    dispose() {
      [input, output, dry, wet, delay, fb].forEach((n) => n.disconnect());
    },
  };
}

function distortionEffect(ctx: AudioContext): Effect {
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const output = ctx.createGain();
  shaper.curve = makeDistortionCurve(0.3);
  shaper.oversample = '4x';
  output.gain.value = 0.7;
  input.connect(shaper);
  shaper.connect(output);
  const params = { drive: 0.3, level: 0.7 };
  return {
    id: uid(),
    type: 'distortion',
    input,
    output,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'drive') shaper.curve = makeDistortionCurve(value);
      if (name === 'level') output.gain.value = value;
    },
    dispose() {
      [input, shaper, output].forEach((n) => n.disconnect());
    },
  };
}

function bitcrusherEffect(ctx: AudioContext): Effect {
  // ScriptProcessor keeps this dependency-free and works everywhere.
  const input = ctx.createGain();
  const output = ctx.createGain();
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  let bits = 8;
  let normFreq = 0.35; // 0..1 fraction of sample rate
  let phaser = 0;
  let last = 0;
  proc.onaudioprocess = (e) => {
    const inp = e.inputBuffer.getChannelData(0);
    const out = e.outputBuffer.getChannelData(0);
    const step = Math.pow(0.5, bits);
    for (let i = 0; i < inp.length; i++) {
      phaser += normFreq;
      if (phaser >= 1) {
        phaser -= 1;
        last = step * Math.floor(inp[i] / step + 0.5);
      }
      out[i] = last;
    }
  };
  input.connect(proc);
  proc.connect(output);
  const params = { bits: 8, rate: 0.35, mix: 1 };
  return {
    id: uid(),
    type: 'bitcrusher',
    input,
    output,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'bits') bits = value;
      if (name === 'rate') normFreq = value;
    },
    dispose() {
      proc.onaudioprocess = null;
      [input, output, proc].forEach((n) => n.disconnect());
    },
  };
}

function chorusEffect(ctx: AudioContext): Effect {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const delay = ctx.createDelay(0.05);
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  delay.delayTime.value = 0.025;
  depth.gain.value = 0.004;
  lfo.frequency.value = 1.2;
  wet.gain.value = 0.5;
  lfo.connect(depth);
  depth.connect(delay.delayTime);
  input.connect(dry);
  dry.connect(output);
  input.connect(delay);
  delay.connect(wet);
  wet.connect(output);
  lfo.start();
  const params = { rate: 1.2, depth: 0.004, mix: 0.5 };
  return {
    id: uid(),
    type: 'chorus',
    input,
    output,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'rate') lfo.frequency.value = value;
      if (name === 'depth') depth.gain.value = value;
      if (name === 'mix') wet.gain.value = value;
    },
    dispose() {
      try {
        lfo.stop();
      } catch {}
      [input, output, dry, wet, delay, depth].forEach((n) => n.disconnect());
    },
  };
}

function compressorEffect(ctx: AudioContext): Effect {
  const node = ctx.createDynamicsCompressor();
  node.threshold.value = -20;
  node.ratio.value = 4;
  node.attack.value = 0.005;
  node.release.value = 0.2;
  const params = { threshold: -20, ratio: 4, attack: 0.005, release: 0.2 };
  return {
    id: uid(),
    type: 'compressor',
    input: node,
    output: node,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      (node as any)[name].value = value;
    },
    dispose() {
      node.disconnect();
    },
  };
}

function phaserEffect(ctx: AudioContext): Effect {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const stages = [0, 0, 0, 0].map(() => {
    const f = ctx.createBiquadFilter();
    f.type = 'allpass';
    f.frequency.value = 1000;
    return f;
  });
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 0.5;
  depth.gain.value = 800;
  lfo.connect(depth);
  input.connect(stages[0]);
  for (let i = 0; i < stages.length - 1; i++) stages[i].connect(stages[i + 1]);
  stages.forEach((s) => depth.connect(s.frequency));
  stages[stages.length - 1].connect(output);
  input.connect(output);
  lfo.start();
  const params = { rate: 0.5, depth: 800 };
  return {
    id: uid(),
    type: 'phaser',
    input,
    output,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'rate') lfo.frequency.value = value;
      if (name === 'depth') depth.gain.value = value;
    },
    dispose() {
      try {
        lfo.stop();
      } catch {}
      [input, output, depth, ...stages].forEach((n) => n.disconnect());
    },
  };
}

function flangerEffect(ctx: AudioContext): Effect {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const delay = ctx.createDelay(0.02);
  const fb = ctx.createGain();
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  const wet = ctx.createGain();
  delay.delayTime.value = 0.005;
  fb.gain.value = 0.5;
  depth.gain.value = 0.003;
  lfo.frequency.value = 0.3;
  wet.gain.value = 0.6;
  lfo.connect(depth);
  depth.connect(delay.delayTime);
  input.connect(output);
  input.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(output);
  lfo.start();
  const params = { rate: 0.3, depth: 0.003, feedback: 0.5 };
  return {
    id: uid(),
    type: 'flanger',
    input,
    output,
    params,
    setParam(name, value) {
      params[name as keyof typeof params] = value;
      if (name === 'rate') lfo.frequency.value = value;
      if (name === 'depth') depth.gain.value = value;
      if (name === 'feedback') fb.gain.value = value;
    },
    dispose() {
      try {
        lfo.stop();
      } catch {}
      [input, output, delay, fb, depth, wet].forEach((n) => n.disconnect());
    },
  };
}

export const EFFECT_PARAM_SPECS: Record<
  EffectType,
  { name: string; label: string; min: number; max: number; step: number }[]
> = {
  filter: [
    { name: 'cutoff', label: 'Cutoff', min: 40, max: 18000, step: 1 },
    { name: 'resonance', label: 'Reso', min: 0.1, max: 20, step: 0.1 },
    { name: 'type', label: 'Type', min: 0, max: 2, step: 1 },
  ],
  eq: [
    { name: 'low', label: 'Low', min: -18, max: 18, step: 0.5 },
    { name: 'mid', label: 'Mid', min: -18, max: 18, step: 0.5 },
    { name: 'high', label: 'High', min: -18, max: 18, step: 0.5 },
  ],
  reverb: [
    { name: 'size', label: 'Size', min: 0.2, max: 5, step: 0.1 },
    { name: 'decay', label: 'Decay', min: 0.5, max: 6, step: 0.1 },
    { name: 'mix', label: 'Dry/Wet', min: 0, max: 1, step: 0.01 },
  ],
  delay: [
    { name: 'time', label: 'Time', min: 0.02, max: 1.5, step: 0.01 },
    { name: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01 },
    { name: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
  ],
  distortion: [
    { name: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01 },
    { name: 'level', label: 'Level', min: 0, max: 1, step: 0.01 },
  ],
  bitcrusher: [
    { name: 'bits', label: 'Bits', min: 1, max: 16, step: 1 },
    { name: 'rate', label: 'Rate', min: 0.02, max: 1, step: 0.01 },
  ],
  chorus: [
    { name: 'rate', label: 'Rate', min: 0.1, max: 6, step: 0.1 },
    { name: 'depth', label: 'Depth', min: 0.001, max: 0.01, step: 0.0005 },
    { name: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
  ],
  compressor: [
    { name: 'threshold', label: 'Thresh', min: -60, max: 0, step: 1 },
    { name: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5 },
    { name: 'attack', label: 'Attack', min: 0.001, max: 0.3, step: 0.001 },
    { name: 'release', label: 'Release', min: 0.05, max: 1, step: 0.01 },
  ],
  phaser: [
    { name: 'rate', label: 'Rate', min: 0.1, max: 4, step: 0.1 },
    { name: 'depth', label: 'Depth', min: 100, max: 2000, step: 10 },
  ],
  flanger: [
    { name: 'rate', label: 'Rate', min: 0.1, max: 3, step: 0.1 },
    { name: 'depth', label: 'Depth', min: 0.001, max: 0.008, step: 0.0005 },
    { name: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01 },
  ],
};
