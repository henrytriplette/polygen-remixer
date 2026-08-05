// Sample analysis: waveform peaks, loudness, transient detection, tempo, and
// musical key. These are real (if lightweight) DSP estimates — good enough to
// drive the UI and slicing, and honest about being estimates.

export interface Analysis {
  peaks: Float32Array; // downsampled min/max magnitude for drawing
  bpm: number;
  key: string;
  transients: number[]; // sample offsets (seconds)
  loudnessDb: number; // approx RMS in dBFS
  duration: number;
}

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

/** Downsample to `buckets` peak magnitudes for waveform rendering. */
export function computePeaks(data: Float32Array, buckets = 2000): Float32Array {
  const out = new Float32Array(buckets);
  const size = Math.max(1, Math.floor(data.length / buckets));
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * size;
    for (let j = 0; j < size; j++) {
      const v = Math.abs(data[start + j] || 0);
      if (v > max) max = v;
    }
    out[i] = max;
  }
  return out;
}

function rmsDb(data: Float32Array): number {
  let sum = 0;
  const stride = Math.max(1, Math.floor(data.length / 100000));
  let n = 0;
  for (let i = 0; i < data.length; i += stride) {
    sum += data[i] * data[i];
    n++;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  return Math.round(20 * Math.log10(rms + 1e-9));
}

/** Onset detection via spectral-flux-ish energy differences on the envelope. */
export function detectTransients(
  data: Float32Array,
  sampleRate: number,
): number[] {
  const win = Math.floor(sampleRate * 0.01); // 10ms energy windows
  const env: number[] = [];
  for (let i = 0; i < data.length; i += win) {
    let e = 0;
    for (let j = 0; j < win && i + j < data.length; j++) {
      e += data[i + j] * data[i + j];
    }
    env.push(Math.sqrt(e / win));
  }
  // Adaptive threshold on positive envelope difference.
  const diffs = env.map((v, i) => Math.max(0, v - (env[i - 1] || 0)));
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const thresh = mean * 2.2;
  const onsets: number[] = [];
  let lastIdx = -10;
  for (let i = 1; i < diffs.length; i++) {
    if (
      diffs[i] > thresh &&
      diffs[i] >= diffs[i - 1] &&
      diffs[i] >= (diffs[i + 1] || 0) &&
      i - lastIdx > 3
    ) {
      onsets.push((i * win) / sampleRate);
      lastIdx = i;
    }
  }
  return onsets;
}

/** Tempo estimate: autocorrelation of the onset-energy envelope. */
export function detectBPM(data: Float32Array, sampleRate: number): number {
  const win = Math.floor(sampleRate * 0.01);
  const env: number[] = [];
  for (let i = 0; i < data.length; i += win) {
    let e = 0;
    for (let j = 0; j < win && i + j < data.length; j++)
      e += Math.abs(data[i + j]);
    env.push(e / win);
  }
  // difference / half-wave rectify
  const flux = env.map((v, i) => Math.max(0, v - (env[i - 1] || 0)));
  const envRate = sampleRate / win; // frames per second
  const minBpm = 70,
    maxBpm = 180;
  const minLag = Math.floor((60 / maxBpm) * envRate);
  const maxLag = Math.ceil((60 / minBpm) * envRate);
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = lag; i < flux.length; i++) sum += flux[i] * flux[i - lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  let bpm = (60 * envRate) / bestLag;
  while (bpm < 80) bpm *= 2;
  while (bpm > 170) bpm /= 2;
  return Math.round(bpm);
}

/** Key estimate via a 12-bin chroma vector matched to major/minor profiles. */
export function detectKey(data: Float32Array, sampleRate: number): string {
  const size = 4096;
  const chroma = new Float32Array(12);
  const hann = new Float32Array(size);
  for (let i = 0; i < size; i++)
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);

  const hops = Math.min(60, Math.floor(data.length / size));
  const hop = Math.floor(data.length / Math.max(1, hops));
  const re = new Float32Array(size);
  const im = new Float32Array(size);

  for (let h = 0; h < hops; h++) {
    const off = h * hop;
    for (let i = 0; i < size; i++) {
      re[i] = (data[off + i] || 0) * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < size / 2; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const freq = (k * sampleRate) / size;
      if (freq < 55 || freq > 2000) continue;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
  }

  // Krumhansl-ish profiles
  const major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minor = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  let bestScore = -Infinity;
  let bestKey = 'C Major';
  for (let tonic = 0; tonic < 12; tonic++) {
    let scoreMaj = 0,
      scoreMin = 0;
    for (let i = 0; i < 12; i++) {
      scoreMaj += chroma[(tonic + i) % 12] * major[i];
      scoreMin += chroma[(tonic + i) % 12] * minor[i];
    }
    if (scoreMaj > bestScore) {
      bestScore = scoreMaj;
      bestKey = `${NOTE_NAMES[tonic]} Major`;
    }
    if (scoreMin > bestScore) {
      bestScore = scoreMin;
      bestKey = `${NOTE_NAMES[tonic]} Minor`;
    }
  }
  return bestKey;
}

/** In-place iterative radix-2 FFT. size must be a power of two. */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k,
          b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export function analyze(buffer: AudioBuffer): Analysis {
  const data = buffer.getChannelData(0);
  return {
    peaks: computePeaks(data),
    bpm: detectBPM(data, buffer.sampleRate),
    key: detectKey(data, buffer.sampleRate),
    transients: detectTransients(data, buffer.sampleRate),
    loudnessDb: rmsDb(data),
    duration: buffer.duration,
  };
}
