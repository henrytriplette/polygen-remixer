<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import {
  state,
  setSliceMode,
  setPitch,
  setStretch,
  reverseSample,
  moveSlice,
  deleteSlice,
  duplicateSlice,
  toggleSliceReverse,
  playSlicePreview,
} from '../store';

const canvas = ref<HTMLCanvasElement | null>(null);
const wrap = ref<HTMLDivElement | null>(null);
const zoom = ref(1);

// Theme-aware slice palette: CSS custom properties that flip in the light theme.
// The DOM overlay binds `var(--slice-N)`; the canvas resolves the hex at draw
// time (see `draw`) so slice colours follow the active theme too.
const SLICE_VARS = ['--slice-1', '--slice-2', '--slice-3', '--slice-4', '--slice-5', '--slice-6'];
const sliceVar = (i: number) => SLICE_VARS[i % SLICE_VARS.length];

// Layout of slices in arrangement (array) order, as 0..1 fractions of width.
// Both the canvas render and the drag overlay share this so they stay aligned.
const sliceLayout = computed(() => {
  const total =
    state.slices.reduce((a, s) => a + (s.end - s.start), 0) || state.duration || 1;
  let cursor = 0;
  return state.slices.map((s, i) => {
    const dur = s.end - s.start;
    const varName = sliceVar(i);
    const item = {
      slice: s,
      index: i,
      left: cursor / total,
      width: dur / total,
      varName, // '--slice-N', for canvas resolution
      color: `var(${varName})`, // for DOM inline styles
    };
    cursor += dur;
    return item;
  });
});

function drawSliceWave(
  ctx: CanvasRenderingContext2D,
  slice: (typeof state.slices)[number],
  x0: number,
  w: number,
  h: number,
  color: string,
) {
  const peaks = state.peaks;
  const N = peaks.length;
  const dur = state.duration || 1;
  const s0 = Math.floor((slice.start / dur) * N);
  const s1 = Math.floor((slice.end / dur) * N);
  const span = Math.max(1, s1 - s0);
  const mid = h / 2;
  ctx.strokeStyle = color;
  for (let x = 0; x < w; x++) {
    const f = x / w;
    const idx = slice.reversed
      ? s1 - 1 - Math.floor(f * span)
      : s0 + Math.floor(f * span);
    const v = peaks[idx] || 0;
    const amp = v * (h * 0.46);
    const px = x0 + x + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, mid - amp);
    ctx.lineTo(px, mid + amp);
    ctx.stroke();
  }
}

function draw() {
  const cv = canvas.value;
  const box = wrap.value;
  if (!cv || !box) return;
  const dpr = window.devicePixelRatio || 1;
  const w = box.clientWidth;
  const h = box.clientHeight;
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const mid = h / 2;
  const peaks = state.peaks;
  if (!peaks.length) return;

  // resolve theme colors from CSS tokens so the canvas follows light/dark
  const cssVar = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const waveColor = cssVar('--text-mute') || '#7a7a7a';
  const markerLine = cssVar('--line-strong') || '#333';
  const markerText = cssVar('--text-mute') || '#5f5f5f';
  const playheadColor = cssVar('--green') || '#4ade80';

  if (state.sliceMode && state.slices.length) {
    // Arrangement view: draw each slice's waveform in play order.
    ctx.lineWidth = 1;
    sliceLayout.value.forEach((it) => {
      const x0 = it.left * w;
      const wpx = it.width * w;
      const color = cssVar(it.varName) || '#4ecbe0';
      ctx.fillStyle = color + '14';
      ctx.fillRect(x0, 0, wpx, h);
      drawSliceWave(ctx, it.slice, x0, wpx, h, color);
      ctx.strokeStyle = color + 'aa';
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, 0);
      ctx.lineTo(x0 + 0.5, h);
      ctx.stroke();
    });
  } else {
    // Continuous buffer view.
    const n = peaks.length;
    ctx.lineWidth = 1;
    ctx.strokeStyle = waveColor;
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * n);
      const amp = (peaks[idx] || 0) * (h * 0.46);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, mid - amp);
      ctx.lineTo(x + 0.5, mid + amp);
      ctx.stroke();
    }
  }

  // bar markers
  for (let b = 0; b <= state.bars; b++) {
    const x = (b / state.bars) * w;
    ctx.fillStyle = markerLine;
    ctx.fillRect(x, 0, 1, h);
    if (b < state.bars) {
      ctx.fillStyle = markerText;
      ctx.font = '9px var(--mono)';
      ctx.fillText('Bar ' + (b + 1), x + 5, 12);
    }
  }

  // playhead
  if (state.currentStep >= 0 && state.totalSteps) {
    const x = (state.currentStep / state.totalSteps) * w;
    ctx.fillStyle = playheadColor;
    ctx.fillRect(x, 0, 2, h);
    ctx.beginPath();
    ctx.moveTo(x - 4, 0);
    ctx.lineTo(x + 6, 0);
    ctx.lineTo(x + 1, 7);
    ctx.fill();
  }
}

watch(
  () => [
    state.peaks,
    state.currentStep,
    state.sliceMode,
    state.bars,
    state.wholeReversed,
    state.theme,
    sliceLayout.value,
  ],
  draw,
  { deep: true },
);

let rafId = 0;
onMounted(() => {
  draw();
  window.addEventListener('resize', draw);
  const loop = () => {
    if (state.playing) draw();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
});
onUnmounted(() => {
  window.removeEventListener('resize', draw);
  cancelAnimationFrame(rafId);
});

// ---- Drag-to-rearrange -----------------------------------------------------
const dragIndex = ref<number | null>(null);
const dropIndex = ref<number | null>(null);
const dragDelta = ref(0);
let pointerStartX = 0;
let movedFar = false;

function tileDown(e: PointerEvent, index: number) {
  // let action buttons handle their own clicks
  if ((e.target as HTMLElement).closest('[data-action]')) return;
  dragIndex.value = index;
  dropIndex.value = index;
  pointerStartX = e.clientX;
  dragDelta.value = 0;
  movedFar = false;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function tileMove(e: PointerEvent) {
  if (dragIndex.value === null || !wrap.value) return;
  const dx = e.clientX - pointerStartX;
  if (Math.abs(dx) > 4) movedFar = true;
  dragDelta.value = dx;
  const rect = wrap.value.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const layout = sliceLayout.value;
  let ins = 0;
  for (const it of layout) {
    const center = (it.left + it.width / 2) * rect.width;
    if (cx > center) ins++;
    else break;
  }
  dropIndex.value = ins;
}

function tileUp(index: number) {
  if (dragIndex.value === null) return;
  const from = dragIndex.value;
  if (!movedFar) {
    playSlicePreview(state.slices[index].id);
  } else if (dropIndex.value !== null) {
    const ins = dropIndex.value;
    const to = ins > from ? ins - 1 : ins;
    moveSlice(from, to);
  }
  dragIndex.value = null;
  dropIndex.value = null;
  dragDelta.value = 0;
}

const markerLeft = computed(() => {
  if (dropIndex.value === null) return null;
  const layout = sliceLayout.value;
  const ins = dropIndex.value;
  if (ins >= layout.length) {
    const last = layout[layout.length - 1];
    return last ? (last.left + last.width) * 100 : 0;
  }
  return layout[ins].left * 100;
});

const pitchAngle = computed(() => (state.pitch / 12) * 135);
let knobDrag = false;
let startY = 0;
let startPitch = 0;
function knobDown(e: MouseEvent) {
  knobDrag = true;
  startY = e.clientY;
  startPitch = state.pitch;
  window.addEventListener('mousemove', knobMove);
  window.addEventListener('mouseup', knobUp);
}
function knobMove(e: MouseEvent) {
  if (!knobDrag) return;
  const delta = Math.round((startY - e.clientY) / 8);
  setPitch(Math.max(-12, Math.min(12, startPitch + delta)));
}
function knobUp() {
  knobDrag = false;
  window.removeEventListener('mousemove', knobMove);
  window.removeEventListener('mouseup', knobUp);
}
</script>

<template>
  <section class="editor panel">
    <div class="head">
      <span class="label">Sample Editor</span>
      <div class="slice-btns">
        <button
          class="btn small"
          :class="{ active: state.sliceMode }"
          :style="state.sliceMode ? 'background:var(--cyan);border-color:var(--cyan)' : ''"
          @click="setSliceMode(!state.sliceMode, 'auto')"
        >
          ✂ Slice
        </button>
        <button class="btn small ghost" @click="setSliceMode(true, 'auto')">Auto</button>
        <button class="btn small ghost" @click="setSliceMode(true, 'even')">Manual</button>
        <button class="btn small ghost" @click="setSliceMode(true, 'random')">Random</button>
      </div>
    </div>

    <div
      ref="wrap"
      class="wave"
      @wheel.prevent="zoom = Math.max(1, Math.min(6, zoom + (($event as WheelEvent).deltaY < 0 ? 0.3 : -0.3)))"
    >
      <canvas ref="canvas" />

      <!-- draggable slice overlay -->
      <div v-if="state.sliceMode && state.slices.length" class="slice-overlay">
        <div
          v-for="it in sliceLayout"
          :key="it.slice.id"
          class="slice-tile"
          :data-sid="it.slice.id"
          :class="{ dragging: dragIndex === it.index, rev: it.slice.reversed }"
          :style="{
            left: it.left * 100 + '%',
            width: it.width * 100 + '%',
            borderColor: it.color,
            transform: dragIndex === it.index ? `translateX(${dragDelta}px)` : '',
            zIndex: dragIndex === it.index ? 5 : 1,
          }"
          @pointerdown="tileDown($event, it.index)"
          @pointermove="tileMove"
          @pointerup="tileUp(it.index)"
        >
          <span class="tile-badge mono" :style="{ background: it.color }">{{ it.index + 1 }}</span>
          <div class="tile-actions">
            <button data-action title="Reverse" @click="toggleSliceReverse(it.slice.id)">⇋</button>
            <button data-action title="Duplicate" @click="duplicateSlice(it.slice.id)">⧉</button>
            <button data-action class="del" title="Delete" @click="deleteSlice(it.slice.id)">✕</button>
          </div>
        </div>

        <div
          v-if="markerLeft !== null && dragIndex !== null"
          class="drop-marker"
          :style="{ left: markerLeft + '%' }"
        />
      </div>

      <div v-if="!state.hasSample" class="empty mono">
        drop a sample to see its waveform
      </div>
    </div>

    <div class="controls">
      <div class="ctl stretch">
        <span class="label">Time Stretch · {{ state.stretch.toFixed(2) }}x</span>
        <div class="ctl-body">
          <div class="stretch-slider">
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.01"
              :value="state.stretch"
              @input="setStretch(+($event.target as HTMLInputElement).value)"
            />
            <div class="ticks mono"><span>0.5x</span><span>1x</span><span>2x</span></div>
          </div>
        </div>
      </div>

      <div class="ctl">
        <span class="label">Pitch</span>
        <div class="ctl-body">
          <div class="knob" @mousedown="knobDown">
            <div class="knob-dial" :style="{ transform: `rotate(${pitchAngle}deg)` }">
              <span class="knob-mark" />
            </div>
          </div>
          <span class="knob-val mono">{{ state.pitch > 0 ? '+' : '' }}{{ state.pitch }}</span>
        </div>
      </div>

      <div class="ctl">
        <span class="label">Reverse</span>
        <div class="ctl-body">
          <button
            class="btn"
            :class="{ active: state.wholeReversed }"
            :style="state.wholeReversed ? 'background:var(--purple);border-color:var(--purple)' : ''"
            @click="reverseSample"
          >
            ⇋ Reverse
          </button>
        </div>
      </div>

      <div v-if="state.sliceMode" class="ctl slices-info">
        <span class="label">{{ state.slices.length }} slices</span>
        <div class="ctl-body">
          <span class="drag-hint dim mono">drag tiles to rearrange · click to preview</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  gap: 10px;
  min-height: 0;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.slice-btns {
  display: flex;
  gap: 6px;
}
.wave {
  position: relative;
  flex: 1;
  min-height: 120px;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-mute);
  font-size: 12px;
}

/* slice overlay */
.slice-overlay {
  position: absolute;
  inset: 0;
}
.slice-tile {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 2px solid transparent;
  border-right: 1px solid var(--hover);
  cursor: grab;
  transition: background 0.1s;
}
.slice-tile:hover {
  background: var(--hover);
}
.slice-tile.dragging {
  cursor: grabbing;
  background: var(--hover);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  border-radius: 6px;
  transition: none;
}
.slice-tile.rev {
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 6px,
    color-mix(in srgb, var(--purple) 12%, transparent) 6px,
    color-mix(in srgb, var(--purple) 12%, transparent) 12px
  );
}
.tile-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 4px;
  color: var(--on-hue);
  font-size: 9px;
  font-weight: 700;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.tile-actions {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.12s;
}
.slice-tile:hover .tile-actions {
  opacity: 1;
}
.tile-actions button {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--text-dim);
  font-size: 10px;
  display: grid;
  place-items: center;
  padding: 0;
}
.tile-actions button:hover {
  color: var(--text);
  background: var(--panel-3);
}
.tile-actions button.del:hover {
  color: var(--red);
  border-color: var(--red);
}
.drop-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  margin-left: -1.5px;
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
  pointer-events: none;
  border-radius: 2px;
}

.controls {
  display: flex;
  gap: 28px;
  align-items: flex-start;
  flex-wrap: wrap;
  padding-top: 2px;
}
.ctl {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ctl > .label {
  line-height: 12px;
}
/* every control body is the same height and vertically centers its control,
   so all three columns align on a common baseline under aligned labels */
.ctl-body {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.stretch {
  flex: 0 1 300px;
  min-width: 240px;
}
.stretch .ctl-body {
  width: 100%;
}
.stretch-slider {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stretch input {
  width: 100%;
}
.ticks {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--text-mute);
}
.knob {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, var(--panel-3), var(--panel-2));
  border: 1px solid var(--line-strong);
  position: relative;
  cursor: ns-resize;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}
.knob-dial {
  position: absolute;
  inset: 0;
}
.knob-mark {
  position: absolute;
  left: 50%;
  top: 6px;
  width: 3px;
  height: 14px;
  border-radius: 3px;
  background: var(--orange);
  transform: translateX(-50%);
}
.knob-val {
  font-size: 12px;
  min-width: 22px;
}
.slices-info {
  flex: 1;
  min-width: 180px;
}
.drag-hint {
  font-size: 10px;
}
</style>
