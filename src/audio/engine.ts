// Core audio engine: owns the AudioContext, master bus, and the transport
// scheduler. Everything timing-critical lives here, deliberately outside of
// Vue's reactivity so the audio clock never hitches on a re-render.

export type StepCallback = (step: number, time: number) => void;

class AudioEngine {
  ctx: AudioContext | null = null;

  // Master signal chain: [sum] -> masterGain -> limiter -> analyser -> dest
  master!: GainNode;
  limiter!: DynamicsCompressorNode;
  analyser!: AnalyserNode;

  // Transport
  bpm = 120;
  stepsPerBar = 16; // 16th-note resolution
  bars = 2; // kept in sync with state.bars by the store
  isPlaying = false;
  loop = true;
  private currentStep = 0;
  private nextNoteTime = 0;
  private lookahead = 25; // ms timer interval
  private scheduleAhead = 0.1; // seconds to schedule in advance
  private timerId: number | null = null;

  private stepCallbacks = new Set<StepCallback>();
  // Fired (via requestAnimationFrame) so the UI can light up the playhead.
  onVisualStep: ((step: number) => void) | null = null;
  private visualQueue: { step: number; time: number }[] = [];

  get totalSteps() {
    return this.stepsPerBar * this.bars;
  }

  /** Lazily create the context on first user gesture (autoplay policy). */
  ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    return ctx;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  secondsPerStep() {
    // 16th notes: a quarter note = 60/bpm, a 16th = that / 4.
    return 60 / this.bpm / (this.stepsPerBar / 4);
  }

  onStep(cb: StepCallback) {
    this.stepCallbacks.add(cb);
    return () => this.stepCallbacks.delete(cb);
  }

  async start() {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;
    this.scheduler();
    this.runVisualLoop();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.currentStep = 0;
    this.visualQueue = [];
    if (this.onVisualStep) this.onVisualStep(-1);
  }

  private scheduler = () => {
    if (!this.ctx || !this.isPlaying) return;
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
      const step = this.currentStep;
      const time = this.nextNoteTime;
      this.stepCallbacks.forEach((cb) => cb(step, time));
      this.visualQueue.push({ step, time });
      // advance
      this.nextNoteTime += this.secondsPerStep();
      this.currentStep = (this.currentStep + 1) % this.totalSteps;
      if (this.currentStep === 0 && !this.loop) {
        // schedule a stop once the last note has played
        const stopAt = this.nextNoteTime;
        const delay = (stopAt - this.ctx.currentTime) * 1000;
        setTimeout(() => this.stop(), Math.max(0, delay));
      }
    }
    this.timerId = window.setTimeout(this.scheduler, this.lookahead);
  };

  private runVisualLoop() {
    const tick = () => {
      if (!this.isPlaying || !this.ctx) return;
      const t = this.ctx.currentTime;
      let idx = -1;
      while (this.visualQueue.length && this.visualQueue[0].time <= t) {
        idx = this.visualQueue.shift()!.step;
      }
      if (idx >= 0 && this.onVisualStep) this.onVisualStep(idx);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Master peak level 0..1 for the output meter. */
  masterLevel(): number {
    if (!this.analyser) return 0;
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

export const engine = new AudioEngine();
