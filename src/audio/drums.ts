// Synthesized drum voices. Everything is generated from oscillators + noise so
// the app ships with a full kit and zero binary sample dependencies. Each preset
// tweaks the synthesis so the drum library feels varied (808 vs 909 vs trap...).

export type DrumVoice = 'kick' | 'snare' | 'hat' | 'clap' | 'perc' | 'crash';

export interface DrumPreset {
  id: string;
  name: string;
  voice: DrumVoice;
  tune: number; // base frequency or multiplier
  decay: number;
  extra?: number; // per-voice flavor knob
}

export const DRUM_LIBRARY: Record<DrumVoice, DrumPreset[]> = {
  kick: [
    { id: 'k808', name: '808 Kick', voice: 'kick', tune: 52, decay: 0.9 },
    { id: 'k909', name: '909 Kick', voice: 'kick', tune: 60, decay: 0.4 },
    { id: 'khouse', name: 'House Kick', voice: 'kick', tune: 65, decay: 0.3 },
    { id: 'ktrap', name: 'Trap Kick', voice: 'kick', tune: 46, decay: 1.1 },
    { id: 'kboom', name: 'Boom Kick', voice: 'kick', tune: 40, decay: 1.4 },
  ],
  snare: [
    { id: 's909', name: '909 Snare', voice: 'snare', tune: 190, decay: 0.2 },
    { id: 's808', name: '808 Snare', voice: 'snare', tune: 220, decay: 0.15 },
    { id: 'strap', name: 'Trap Snare', voice: 'snare', tune: 250, decay: 0.18 },
    { id: 'srim', name: 'Rimshot', voice: 'snare', tune: 400, decay: 0.08 },
  ],
  hat: [
    { id: 'hclosed', name: 'Closed Hat', voice: 'hat', tune: 1, decay: 0.05 },
    { id: 'hopen', name: 'Open Hat', voice: 'hat', tune: 1, decay: 0.3 },
    { id: 'htrap', name: 'Trap Hat', voice: 'hat', tune: 1.4, decay: 0.04 },
  ],
  clap: [
    { id: 'c909', name: '909 Clap', voice: 'clap', tune: 1, decay: 0.2 },
    { id: 'crev', name: 'Reverb Clap', voice: 'clap', tune: 1, decay: 0.4 },
  ],
  perc: [
    { id: 'ptom', name: 'Tom', voice: 'perc', tune: 160, decay: 0.3 },
    { id: 'pconga', name: 'Conga', voice: 'perc', tune: 260, decay: 0.25 },
    { id: 'pcow', name: 'Cowbell', voice: 'perc', tune: 540, decay: 0.2 },
  ],
  crash: [
    { id: 'crash', name: 'Crash', voice: 'crash', tune: 1, decay: 1.2 },
    { id: 'ride', name: 'Ride', voice: 'crash', tune: 1.6, decay: 0.6 },
  ],
};

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/** Trigger one drum hit into `dest` at absolute context time `t`. */
export function playDrum(
  ctx: AudioContext,
  dest: AudioNode,
  preset: DrumPreset,
  t: number,
  velocity = 1,
) {
  switch (preset.voice) {
    case 'kick':
      return kick(ctx, dest, preset, t, velocity);
    case 'snare':
      return snare(ctx, dest, preset, t, velocity);
    case 'hat':
      return hat(ctx, dest, preset, t, velocity);
    case 'clap':
      return clap(ctx, dest, preset, t, velocity);
    case 'perc':
      return perc(ctx, dest, preset, t, velocity);
    case 'crash':
      return crash(ctx, dest, preset, t, velocity);
  }
}

function kick(ctx: AudioContext, dest: AudioNode, p: DrumPreset, t: number, v: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const f = p.tune;
  osc.frequency.setValueAtTime(f * 3, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  gain.gain.setValueAtTime(v, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + p.decay + 0.05);
}

function snare(ctx: AudioContext, dest: AudioNode, p: DrumPreset, t: number, v: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(v * 0.8, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
  src.connect(hp);
  hp.connect(ng);
  ng.connect(dest);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = p.tune;
  const og = ctx.createGain();
  og.gain.setValueAtTime(v * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + p.decay * 0.6);
  osc.connect(og);
  og.connect(dest);

  src.start(t);
  src.stop(t + p.decay + 0.05);
  osc.start(t);
  osc.stop(t + p.decay);
}

function hat(ctx: AudioContext, dest: AudioNode, p: DrumPreset, t: number, v: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000 * p.tune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v * 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + p.decay + 0.02);
}

function clap(ctx: AudioContext, dest: AudioNode, p: DrumPreset, t: number, v: number) {
  // Three quick noise bursts create the classic clap flam.
  for (let i = 0; i < 3; i++) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    const start = t + i * 0.01;
    g.gain.setValueAtTime(v * 0.6, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + p.decay);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(start);
    src.stop(start + p.decay + 0.02);
  }
}

function perc(ctx: AudioContext, dest: AudioNode, p: DrumPreset, t: number, v: number) {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = p.tune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v * 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + p.decay + 0.02);
}

function crash(ctx: AudioContext, dest: AudioNode, p: DrumPreset, t: number, v: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000 * p.tune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v * 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + p.decay);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + p.decay + 0.05);
}
