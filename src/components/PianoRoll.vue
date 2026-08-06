<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { state, addNote, removeNote, setInstrument, clearNotes } from '../store';
import { midiToName, INSTRUMENTS } from '../audio/synth';

// two-octave bass/melody range
const LOW = 36;
const HIGH = 60;
const ROW_COUNT = HIGH - LOW + 1;
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
const midiToRow = (m: number) => HIGH - m;


// ---- Viewport (UI-only; never mutates notes / project data) ---------------
// Horizontal in steps [vStep0, vStep1); vertical in row units [vRow0, vRow1)
// where row 0 is the top pitch (HIGH). Fit = whole song × whole pitch range.
const MIN_STEP_SPAN = 2;
const MIN_ROW_SPAN = 4;
const vStep0 = ref(0);
const vStep1 = ref(state.totalSteps);
const vRow0 = ref(0);
const vRow1 = ref(ROW_COUNT);

const gridEl = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const gridW = ref(1);
const gridH = ref(1);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const stepSpan = () => Math.max(1e-6, vStep1.value - vStep0.value);
const rowSpan = () => Math.max(1e-6, vRow1.value - vRow0.value);
const stepToX = (s: number) => ((s - vStep0.value) / stepSpan()) * gridW.value;
const xToStep = (x: number) => vStep0.value + (x / gridW.value) * stepSpan();
const rowToY = (r: number) => ((r - vRow0.value) / rowSpan()) * gridH.value;
const yToRow = (y: number) => vRow0.value + (y / gridH.value) * rowSpan();
const rowH = () => gridH.value / rowSpan();

const isZoomed = computed(
  () => stepSpan() < state.totalSteps - 1e-4 || rowSpan() < ROW_COUNT - 1e-4,
);
function resetView() {
  vStep0.value = 0;
  vStep1.value = state.totalSteps;
  vRow0.value = 0;
  vRow1.value = ROW_COUNT;
}
function zoomX(anchorFrac: number, factor: number) {
  const anchor = vStep0.value + anchorFrac * stepSpan();
  const span = clamp(stepSpan() / factor, MIN_STEP_SPAN, state.totalSteps);
  const s0 = clamp(anchor - anchorFrac * span, 0, state.totalSteps - span);
  vStep0.value = s0;
  vStep1.value = s0 + span;
}
function zoomY(anchorFrac: number, factor: number) {
  const anchor = vRow0.value + anchorFrac * rowSpan();
  const span = clamp(rowSpan() / factor, MIN_ROW_SPAN, ROW_COUNT);
  const r0 = clamp(anchor - anchorFrac * span, 0, ROW_COUNT - span);
  vRow0.value = r0;
  vRow1.value = r0 + span;
}
function panSteps(d: number) {
  const s0 = clamp(vStep0.value + d, 0, state.totalSteps - stepSpan());
  vStep0.value = s0;
  vStep1.value = s0 + stepSpan();
}
function panRows(d: number) {
  const r0 = clamp(vRow0.value + d, 0, ROW_COUNT - rowSpan());
  vRow0.value = r0;
  vRow1.value = r0 + rowSpan();
}

// changing the song length re-fits horizontally so the view stays in range
watch(
  () => state.totalSteps,
  () => {
    vStep0.value = 0;
    vStep1.value = state.totalSteps;
  },
);

function onWheel(e: WheelEvent) {
  if (!gridEl.value) return;
  e.preventDefault();
  const rect = gridEl.value.getBoundingClientRect();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  if (e.shiftKey) zoomY(clamp((e.clientY - rect.top) / rect.height, 0, 1), factor);
  else zoomX(clamp((e.clientX - rect.left) / rect.width, 0, 1), factor);
}

// ---- Pointer: click to place/remove notes, drag empty space to pan --------
let downX = 0;
let downY = 0;
let lastX = 0;
let lastY = 0;
let downStep = 0;
let downMidi = 0;
let moved = false;
let panning = false;

function cellAt(clientX: number, clientY: number) {
  const rect = gridEl.value!.getBoundingClientRect();
  return {
    step: Math.floor(xToStep(clientX - rect.left)),
    midi: HIGH - Math.floor(yToRow(clientY - rect.top)),
  };
}
function gridDown(e: PointerEvent) {
  if (pinching) return;
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  moved = false;
  panning = false;
  const c = cellAt(e.clientX, e.clientY);
  downStep = c.step;
  downMidi = c.midi;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function gridMove(e: PointerEvent) {
  if (pinching || activePointers.size > 1) return;
  if (!downX && !downY) return;
  if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) {
    moved = true;
    panning = true;
  }
  if (panning) {
    panSteps(-((e.clientX - lastX) / gridW.value) * stepSpan());
    panRows(-((e.clientY - lastY) / gridH.value) * rowSpan());
  }
  lastX = e.clientX;
  lastY = e.clientY;
}
function gridUp() {
  if (!panning && !pinching) {
    if (
      downStep >= 0 &&
      downStep < state.totalSteps &&
      downMidi >= LOW &&
      downMidi <= HIGH
    ) {
      const existing = state.notes.find(
        (n) => n.midi === downMidi && downStep >= n.start && downStep < n.start + n.length,
      );
      if (existing) removeNote(existing.id);
      else addNote(downMidi, downStep, 2);
    }
  }
  downX = downY = 0;
  panning = false;
}

// ---- Pinch to zoom (two pointers), capture phase --------------------------
const activePointers = new Map<number, { x: number; y: number }>();
let pinching = false;
let pinchStartDist = 0;
let pinchStartS0 = 0;
let pinchSpanX0 = 0;
let pinchStartR0 = 0;
let pinchSpanY0 = 0;
let pinchFx = 0;
let pinchFy = 0;
function dist() {
  const p = [...activePointers.values()];
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
}
function onPtrDown(e: PointerEvent) {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2 && gridEl.value) {
    const rect = gridEl.value.getBoundingClientRect();
    const p = [...activePointers.values()];
    pinchStartDist = dist();
    pinchFx = clamp(((p[0].x + p[1].x) / 2 - rect.left) / rect.width, 0, 1);
    pinchFy = clamp(((p[0].y + p[1].y) / 2 - rect.top) / rect.height, 0, 1);
    pinchStartS0 = vStep0.value;
    pinchSpanX0 = stepSpan();
    pinchStartR0 = vRow0.value;
    pinchSpanY0 = rowSpan();
    pinching = true;
    panning = false;
  }
}
function onPtrMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinching && activePointers.size === 2) {
    e.preventDefault();
    const ratio = dist() / (pinchStartDist || 1);
    const spanX = clamp(pinchSpanX0 / ratio, MIN_STEP_SPAN, state.totalSteps);
    const ax = pinchStartS0 + pinchFx * pinchSpanX0;
    vStep0.value = clamp(ax - pinchFx * spanX, 0, state.totalSteps - spanX);
    vStep1.value = vStep0.value + spanX;
    const spanY = clamp(pinchSpanY0 / ratio, MIN_ROW_SPAN, ROW_COUNT);
    const ay = pinchStartR0 + pinchFy * pinchSpanY0;
    vRow0.value = clamp(ay - pinchFy * spanY, 0, ROW_COUNT - spanY);
    vRow1.value = vRow0.value + spanY;
  }
}
function onPtrUp(e: PointerEvent) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinching = false;
}

// ---- Visible pitch labels for the key column ------------------------------
const visiblePitches = computed(() => {
  const out: {
    midi: number;
    y: number;
    h: number;
    black: boolean;
    isC: boolean;
    name: string;
    showLabel: boolean;
  }[] = [];
  const h = rowH();
  for (let m = HIGH; m >= LOW; m--) {
    const y = rowToY(midiToRow(m));
    if (y + h < 0 || y > gridH.value) continue;
    out.push({
      midi: m,
      y,
      h,
      black: isBlack(m),
      isC: m % 12 === 0,
      name: midiToName(m),
      showLabel: m % 12 === 0 || h >= 15,
    });
  }
  return out;
});

// note geometry (through the viewport)
const noteLeft = (start: number) => stepToX(start);
const noteWidth = (len: number) => (len / stepSpan()) * gridW.value;
const noteTop = (m: number) => rowToY(midiToRow(m));

// ---- Canvas grid render ---------------------------------------------------
function draw() {
  const cv = canvas.value;
  const w = gridW.value;
  const h = gridH.value;
  if (!cv || w < 1 || h < 1) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const css = (n: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const line = css('--line') || '#232323';
  const lineStrong = css('--line-strong') || '#383838';
  const green = css('--green') || '#5dd97c';

  // pitch rows: shade black keys + row separators
  const rh = rowH();
  const r0 = Math.max(0, Math.floor(vRow0.value));
  const r1 = Math.min(ROW_COUNT, Math.ceil(vRow1.value));
  for (let row = r0; row < r1; row++) {
    const y = rowToY(row);
    if (isBlack(HIGH - row)) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, y, w, rh);
    }
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }

  // beat / bar vertical lines
  const s0 = Math.max(0, Math.floor(vStep0.value));
  const s1 = Math.min(state.totalSteps, Math.ceil(vStep1.value));
  for (let step = s0; step <= s1; step++) {
    const x = stepToX(step);
    const isBar = step % 16 === 0;
    ctx.strokeStyle = isBar || step % 4 === 0 ? lineStrong : line;
    ctx.lineWidth = isBar ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  ctx.lineWidth = 1;

  // playhead
  if (
    state.currentStep >= 0 &&
    state.currentStep >= vStep0.value - 1e-6 &&
    state.currentStep <= vStep1.value + 1e-6
  ) {
    ctx.fillStyle = green;
    ctx.fillRect(stepToX(state.currentStep), 0, 2, h);
  }
}

watch(
  () => [
    vStep0.value, vStep1.value, vRow0.value, vRow1.value,
    gridW.value, gridH.value, state.currentStep, state.totalSteps,
    state.notes.length, state.theme,
  ],
  draw,
  { deep: true },
);

let ro: ResizeObserver | undefined;
let rafId = 0;
onMounted(() => {
  const el = gridEl.value;
  if (el) {
    ro = new ResizeObserver(() => {
      gridW.value = el.clientWidth;
      gridH.value = el.clientHeight;
      draw();
    });
    ro.observe(el);
    gridW.value = el.clientWidth;
    gridH.value = el.clientHeight;
    el.addEventListener('pointerdown', onPtrDown, { capture: true });
    el.addEventListener('pointermove', onPtrMove, { capture: true });
    el.addEventListener('pointerup', onPtrUp, { capture: true });
    el.addEventListener('pointercancel', onPtrUp, { capture: true });
  }
  draw();
  const loop = () => {
    if (state.playing) draw();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
});
onUnmounted(() => {
  ro?.disconnect();
  cancelAnimationFrame(rafId);
  const el = gridEl.value;
  if (el) {
    el.removeEventListener('pointerdown', onPtrDown, { capture: true });
    el.removeEventListener('pointermove', onPtrMove, { capture: true });
    el.removeEventListener('pointerup', onPtrUp, { capture: true });
    el.removeEventListener('pointercancel', onPtrUp, { capture: true });
  }
});
</script>

<template>
  <section class="roll panel">
    <div class="roll-head">
      <span class="label">Piano Roll · Bass / Melody</span>
      <div class="wave-select" role="group" aria-label="Melody instrument">
        <button
          v-for="inst in INSTRUMENTS"
          :key="inst.id"
          class="btn small ghost"
          :class="{ active: state.instrument === inst.id }"
          :style="state.instrument === inst.id ? 'background:var(--green);border-color:var(--green)' : ''"
          :aria-pressed="state.instrument === inst.id"
          :aria-label="`${inst.name} instrument`"
          @click="setInstrument(inst.id)"
        >
          {{ inst.name }}
        </button>
        <button
          v-if="isZoomed"
          class="btn small ghost"
          aria-label="Fit whole song and pitch range"
          title="Fit whole song"
          @click="resetView()"
        >
          ⤢ Fit
        </button>
        <button
          class="btn small ghost roll-clear"
          :disabled="!state.notes.length"
          :aria-label="`Clear all ${state.notes.length} melody notes`"
          title="Clear all melody notes"
          @click="clearNotes()"
        >
          ✕ Clear
        </button>
      </div>
    </div>

    <div class="roll-grid">
      <div class="keys">
        <div
          v-for="p in visiblePitches"
          :key="p.midi"
          class="key"
          :class="{ black: p.black, c: p.isC }"
          :style="{ top: p.y + 'px', height: p.h + 'px' }"
        >
          <span v-if="p.showLabel" class="key-label mono">{{ p.name }}</span>
        </div>
      </div>
      <div
        ref="gridEl"
        class="grid-area"
        @wheel="onWheel"
        @pointerdown="gridDown"
        @pointermove="gridMove"
        @pointerup="gridUp"
      >
        <canvas ref="canvas" />
        <div
          v-for="n in state.notes"
          :key="n.id"
          class="note"
          :style="{
            left: noteLeft(n.start) + 'px',
            width: noteWidth(n.length) + 'px',
            top: noteTop(n.midi) + 'px',
            height: rowH() + 'px',
          }"
          @pointerdown.stop
          @click.stop="removeNote(n.id)"
        >
          <span v-if="noteWidth(n.length) > 24" class="note-name">{{ midiToName(n.midi) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roll {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  gap: 10px;
  min-height: 0;
}
.roll-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.wave-select {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.roll-clear:hover:not(:disabled) {
  color: var(--red);
  border-color: var(--red);
}
.roll-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 46px 1fr;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  min-height: 160px;
}
.keys {
  position: relative;
  border-right: 1px solid var(--line);
  overflow: hidden;
}
.key {
  position: absolute;
  left: 0;
  right: 0;
  background: var(--panel-2);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  padding-left: 6px;
  overflow: hidden;
}
.key.black {
  background: var(--panel);
}
.key.c {
  background: var(--panel-3);
}
.key-label {
  font-size: 8px;
  color: var(--text-mute);
  white-space: nowrap;
}
.grid-area {
  position: relative;
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
}
.grid-area canvas {
  position: absolute;
  inset: 0;
}
.note {
  position: absolute;
  background: var(--green);
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--green), #000 30%);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  box-sizing: border-box;
}
.note:hover {
  filter: brightness(1.15);
}
.note-name {
  font-size: 8px;
  color: var(--on-hue);
  font-weight: 700;
  font-family: var(--mono);
}

@media (max-width: 820px) {
  .roll-grid {
    grid-template-columns: 40px 1fr;
    min-height: 300px;
  }
}
</style>
