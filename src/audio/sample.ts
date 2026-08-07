// Sample playback: plays the whole buffer or individual slices with pitch,
// reverse and playback-rate ("time stretch") control. Real granular stretching
// is out of scope; we use playbackRate + detune which is rock-solid and still
// musical. Reverse is done by swapping in a pre-reversed buffer.

export interface Slice {
  id: string;
  start: number; // seconds
  end: number; // seconds
  pitch: number; // semitones
  reversed: boolean;
  gain: number;
}

let sc = 0;
const sid = () => `sl${sc++}`;
export const nextSliceId = () => sid();

export function makeSlices(transients: number[], duration: number): Slice[] {
  const pts = [0, ...transients.filter((t) => t > 0.02 && t < duration - 0.02), duration];
  const uniq = [...new Set(pts.map((p) => +p.toFixed(4)))].sort((a, b) => a - b);
  const slices: Slice[] = [];
  for (let i = 0; i < uniq.length - 1; i++) {
    slices.push({
      id: sid(),
      start: uniq[i],
      end: uniq[i + 1],
      pitch: 0,
      reversed: false,
      gain: 1,
    });
  }
  return slices;
}

export function evenSlices(duration: number, count: number): Slice[] {
  const slices: Slice[] = [];
  const seg = duration / count;
  for (let i = 0; i < count; i++) {
    slices.push({
      id: sid(),
      start: i * seg,
      end: (i + 1) * seg,
      pitch: 0,
      reversed: false,
      gain: 1,
    });
  }
  return slices;
}

export const MIN_AUTO_CHOPS = 2;
export const MAX_AUTO_CHOPS = 32;

/** How many chops a plain transient slice would yield (clamped to the range). */
export function transientChopCount(transients: number[], duration: number): number {
  const internal = transients.filter((t) => t > 0.02 && t < duration - 0.02).length;
  return Math.max(MIN_AUTO_CHOPS, Math.min(MAX_AUTO_CHOPS, internal + 1));
}

/**
 * Produce exactly `count` transient-aware chops. When there are more detected
 * transients than needed, keep the strongest (by waveform peak at that time);
 * when there are too few, fill by repeatedly splitting the widest gap. Result is
 * ordered, gap-free and covers [0, duration].
 */
export function autoSlices(
  transients: number[],
  peaks: ArrayLike<number>,
  duration: number,
  count: number,
): Slice[] {
  count = Math.max(MIN_AUTO_CHOPS, Math.min(MAX_AUTO_CHOPS, Math.floor(count)));
  const need = count - 1; // internal boundaries
  const N = peaks.length || 1;
  const strengthAt = (t: number) => {
    const idx = Math.min(N - 1, Math.max(0, Math.floor((t / duration) * N)));
    return peaks[idx] || 0;
  };

  let internal = transients
    .filter((t) => t > 0.02 && t < duration - 0.02)
    .sort((a, b) => a - b);

  if (internal.length > need) {
    // keep the strongest `need` onsets, then restore time order
    internal = internal
      .map((t) => ({ t, s: strengthAt(t) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, need)
      .map((o) => o.t)
      .sort((a, b) => a - b);
  } else if (internal.length < need) {
    const bounds = [0, ...internal, duration];
    while (bounds.length - 2 < need) {
      let wi = 0;
      let widest = -1;
      for (let i = 0; i < bounds.length - 1; i++) {
        const gap = bounds[i + 1] - bounds[i];
        if (gap > widest) {
          widest = gap;
          wi = i;
        }
      }
      bounds.splice(wi + 1, 0, (bounds[wi] + bounds[wi + 1]) / 2);
    }
    internal = bounds.slice(1, -1);
  }

  const pts = [0, ...internal, duration];
  const slices: Slice[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    slices.push({
      id: sid(),
      start: pts[i],
      end: pts[i + 1],
      pitch: 0,
      reversed: false,
      gain: 1,
    });
  }
  return slices;
}

export function reverseBuffer(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0, j = buf.length - 1; i < buf.length; i++, j--) dst[i] = src[j];
  }
  return out;
}

/** Return a new buffer containing only the [start, end] (seconds) region. */
export function cropBuffer(
  ctx: BaseAudioContext,
  buf: AudioBuffer,
  start: number,
  end: number,
): AudioBuffer {
  const sr = buf.sampleRate;
  const s = Math.max(0, Math.floor(start * sr));
  const e = Math.min(buf.length, Math.floor(end * sr));
  const len = Math.max(1, e - s);
  const out = ctx.createBuffer(buf.numberOfChannels, len, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.getChannelData(c).set(buf.getChannelData(c).subarray(s, e));
  }
  return out;
}

export class SamplePlayer {
  buffer: AudioBuffer | null = null;
  reversed: AudioBuffer | null = null;
  rate = 1; // time-stretch / speed
  pitch = 0; // global semitones
  gain = 1; // makeup gain (allows boosting quiet samples above unity)
  wholeReversed = false;

  constructor(private ctx: BaseAudioContext, private dest: AudioNode) {}

  load(buffer: AudioBuffer) {
    this.buffer = buffer;
    this.reversed = reverseBuffer(this.ctx, buffer);
  }

  /** Audition an arbitrary [start, end] region of the buffer (trim preview). */
  playRegion(start: number, end: number, when: number) {
    if (!this.buffer) return;
    return this.startSource(this.buffer, start, Math.max(0.01, end - start), when, 0, 1);
  }

  private startSource(
    buf: AudioBuffer,
    offset: number,
    duration: number,
    when: number,
    semis: number,
    gain: number,
  ) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = this.rate;
    src.detune.value = (this.pitch + semis) * 100;
    const g = this.ctx.createGain();
    g.gain.value = gain * this.gain;
    src.connect(g);
    g.connect(this.dest);
    src.start(when, offset, duration);
    return src;
  }

  /** Play one slice at absolute time `when`. */
  playSlice(slice: Slice, when: number) {
    if (!this.buffer) return;
    const dur = slice.end - slice.start;
    if (slice.reversed) {
      const buf = this.reversed!;
      const offset = Math.max(0, this.buffer.duration - slice.end);
      return this.startSource(buf, offset, dur, when, slice.pitch, slice.gain);
    }
    return this.startSource(this.buffer, slice.start, dur, when, slice.pitch, slice.gain);
  }

  /** Play the full sample (used for preview / loop of the raw sample). */
  playAll(when: number, from = 0) {
    if (!this.buffer) return;
    const buf = this.wholeReversed ? this.reversed! : this.buffer;
    return this.startSource(buf, from, buf.duration - from, when, 0, 1);
  }
}
