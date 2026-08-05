import { analyzeSamples } from './analysis';

self.addEventListener('message', (event: MessageEvent<{ data: Float32Array; sampleRate: number; duration: number }>) => {
  const analysis = analyzeSamples(event.data.data, event.data.sampleRate, event.data.duration);
  self.postMessage(analysis, { transfer: [analysis.peaks.buffer] });
});