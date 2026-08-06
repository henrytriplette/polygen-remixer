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
  setSliceDuration,
  setSliceStartTime,
  setSliceEndTime,
  addManualSlice,
  clearSlices,
  setAutoChopCount,
  playSlicePreview,
  setTrim,
  applyTrim,
  resetSample,
  previewTrim,
  pushHistory,
} from '../store';

const canvas = ref<HTMLCanvasElement | null>(null);
const wrap = ref<HTMLDivElement | null>(null);
const overview = ref<HTMLDivElement | null>(null);

// ---- Waveform viewport (zoom + pan) ----------------------------------------
// UI-only state: the visible [viewStart, viewEnd] slice of buffer time. Never
// touches sample data, slice timing, or playback — only what the canvas shows.
const viewStart = ref(0);
const viewEnd = ref(0);
const viewSpan = computed(() => Math.max(1e-6, viewEnd.value - viewStart.value));
const isZoomed = computed(
  () => state.duration > 0 && viewSpan.value < state.duration - 1e-4,
);
const minSpan = computed(() => Math.max(0.01, state.duration / 1000));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// time (seconds) <-> fraction of the visible viewport (0..1)
const timeToFrac = (t: number) => (t - viewStart.value) / viewSpan.value;
const fracToTime = (f: number) => viewStart.value + f * viewSpan.value;

function resetView() {
  viewStart.value = 0;
  viewEnd.value = state.duration;
}
function zoomAt(anchorFrac: number, factor: number) {
  if (!state.duration) return;
  const anchorT = fracToTime(anchorFrac);
  const span = clamp(viewSpan.value / factor, minSpan.value, state.duration);
  const start = clamp(anchorT - anchorFrac * span, 0, state.duration - span);
  viewStart.value = start;
  viewEnd.value = start + span;
}
function panByFrac(df: number) {
  if (!state.duration) return;
  const span = viewSpan.value;
  const start = clamp(viewStart.value + df * span, 0, state.duration - span);
  viewStart.value = start;
  viewEnd.value = start + span;
}

// the packed slice-arrangement view is not buffer-time — zoom only applies to
// the continuous (trim / manual) waveform, so force a full view there.
const arrangementView = computed(
  () => state.sliceMode && !state.manualSlice && state.slices.length > 0,
);
watch(arrangementView, (a) => {
  if (a) resetView();
});
// a new / trimmed / reset sample always restores the full-sample viewport
watch(
  () => state.duration,
  () => resetView(),
  { immediate: true },
);

function onWheel(e: WheelEvent) {
  if (!state.duration || arrangementView.value) return; // let the page scroll
  e.preventDefault();
  const rect = wrap.value!.getBoundingClientRect();
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    const delta = e.shiftKey ? e.deltaY : e.deltaX;
    panByFrac((delta / rect.width) * 0.8);
  } else {
    const anchor = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    zoomAt(anchor, e.deltaY < 0 ? 1.18 : 1 / 1.18);
  }
}

// pinch-to-zoom (two pointers) via native capture-phase listeners so it works
// regardless of the child overlays that capture single pointers
const activePointers = new Map<number, number>();
let pinching = false;
let pinchStartDist = 0;
let pinchStartStart = 0;
let pinchStartSpan = 0;
let pinchMidFrac = 0;
function pinchDist() {
  const xs = [...activePointers.values()];
  return Math.abs(xs[0] - xs[1]);
}
function onWrapPointerDown(e: PointerEvent) {
  activePointers.set(e.pointerId, e.clientX);
  if (activePointers.size === 2 && !arrangementView.value) {
    const rect = wrap.value!.getBoundingClientRect();
    const xs = [...activePointers.values()];
    pinchStartDist = Math.abs(xs[0] - xs[1]);
    pinchMidFrac = clamp(((xs[0] + xs[1]) / 2 - rect.left) / rect.width, 0, 1);
    pinchStartStart = viewStart.value;
    pinchStartSpan = viewSpan.value;
    pinching = true;
    selecting.value = false; // cancel any in-progress draw/trim
    trimDrag.value = null;
  }
}
function onWrapPointerMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, e.clientX);
  if (pinching && activePointers.size === 2) {
    e.preventDefault();
    const ratio = pinchDist() / (pinchStartDist || 1);
    const span = clamp(pinchStartSpan / ratio, minSpan.value, state.duration);
    const anchorT = pinchStartStart + pinchMidFrac * pinchStartSpan;
    const start = clamp(anchorT - pinchMidFrac * span, 0, state.duration - span);
    viewStart.value = start;
    viewEnd.value = start + span;
  }
}
function onWrapPointerUp(e: PointerEvent) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinching = false;
}

// ---- Overview / pan strip (shown when zoomed) ------------------------------
const winLeftPct = computed(() =>
  state.duration ? (viewStart.value / state.duration) * 100 : 0,
);
const winWidthPct = computed(() =>
  state.duration ? (viewSpan.value / state.duration) * 100 : 100,
);
let ovDragging = false;
let ovStartX = 0;
let ovStartViewStart = 0;
function ovDown(e: PointerEvent) {
  if (!overview.value || !state.duration) return;
  const rect = overview.value.getBoundingClientRect();
  const clickFrac = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const inWindow =
    clickFrac >= viewStart.value / state.duration &&
    clickFrac <= viewEnd.value / state.duration;
  if (!inWindow) {
    // jump: centre the viewport on the click
    const start = clamp(
      clickFrac * state.duration - viewSpan.value / 2,
      0,
      state.duration - viewSpan.value,
    );
    viewStart.value = start;
    viewEnd.value = start + viewSpan.value;
  }
  ovDragging = true;
  ovStartX = e.clientX;
  ovStartViewStart = viewStart.value;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function ovMove(e: PointerEvent) {
  if (!ovDragging || !overview.value) return;
  const rect = overview.value.getBoundingClientRect();
  const dt = ((e.clientX - ovStartX) / rect.width) * state.duration;
  const start = clamp(ovStartViewStart + dt, 0, state.duration - viewSpan.value);
  viewStart.value = start;
  viewEnd.value = start + viewSpan.value;
}
function ovUp() {
  ovDragging = false;
}

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

  if (state.sliceMode && !state.manualSlice && state.slices.length) {
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
    // Continuous buffer view — map each pixel through the current viewport.
    const n = peaks.length;
    const dur = state.duration || 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = waveColor;
    for (let x = 0; x < w; x++) {
      const t = fracToTime(x / w);
      const idx = Math.min(n - 1, Math.max(0, Math.floor((t / dur) * n)));
      const amp = (peaks[idx] || 0) * (h * 0.46);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, mid - amp);
      ctx.lineTo(x + 0.5, mid + amp);
      ctx.stroke();
    }
  }

  const dur = state.duration || 1;
  // bar markers (positioned in buffer time, through the viewport)
  for (let b = 0; b <= state.bars; b++) {
    const fx = timeToFrac((b / state.bars) * dur);
    if (fx < -0.001 || fx > 1.001) continue;
    const x = fx * w;
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
    const fx = timeToFrac((state.currentStep / state.totalSteps) * dur);
    if (fx >= -0.001 && fx <= 1.001) {
      const x = fx * w;
      ctx.fillStyle = playheadColor;
      ctx.fillRect(x, 0, 2, h);
      ctx.beginPath();
      ctx.moveTo(x - 4, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x + 1, 7);
      ctx.fill();
    }
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
    viewStart.value,
    viewEnd.value,
    sliceLayout.value,
  ],
  draw,
  { deep: true },
);

let rafId = 0;
onMounted(() => {
  draw();
  window.addEventListener('resize', draw);
  // pinch listeners on the waveform, capture phase so they see every pointer
  const el = wrap.value;
  if (el) {
    el.addEventListener('pointerdown', onWrapPointerDown, { capture: true });
    el.addEventListener('pointermove', onWrapPointerMove, { capture: true });
    el.addEventListener('pointerup', onWrapPointerUp, { capture: true });
    el.addEventListener('pointercancel', onWrapPointerUp, { capture: true });
  }
  window.addEventListener('keydown', onDeleteKey);
  const loop = () => {
    if (state.playing) draw();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
});
onUnmounted(() => {
  window.removeEventListener('resize', draw);
  window.removeEventListener('keydown', onDeleteKey);
  const el = wrap.value;
  if (el) {
    el.removeEventListener('pointerdown', onWrapPointerDown, { capture: true });
    el.removeEventListener('pointermove', onWrapPointerMove, { capture: true });
    el.removeEventListener('pointerup', onWrapPointerUp, { capture: true });
    el.removeEventListener('pointercancel', onWrapPointerUp, { capture: true });
  }
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

// ---- Resize a slice's duration (drag its right edge) -----------------------
const resizeIndex = ref<number | null>(null);
const resizeLabel = ref('');
// captured at drag start so the reflow stays stable while dragging
let rzCumBefore = 0; // total duration of slices before the dragged one
let rzOtherTotal = 0; // total duration of every OTHER slice
let rzStartDur = 0;
let rzStartX = 0;
let rzStartTotal = 0;
let rzPushed = false;

function resizeDown(index: number, e: PointerEvent) {
  e.stopPropagation();
  const durs = state.slices.map((s) => s.end - s.start);
  rzStartTotal = durs.reduce((a, b) => a + b, 0) || 1;
  rzCumBefore = durs.slice(0, index).reduce((a, b) => a + b, 0);
  rzStartDur = durs[index];
  rzOtherTotal = rzStartTotal - rzStartDur;
  rzStartX = e.clientX;
  rzPushed = false;
  resizeIndex.value = index;
  resizeLabel.value = rzStartDur.toFixed(2) + 's';
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function resizeMove(e: PointerEvent) {
  if (resizeIndex.value === null || !wrap.value) return;
  e.stopPropagation();
  if (!rzPushed) {
    pushHistory(); // one undo entry per actual resize gesture
    rzPushed = true;
  }
  const rect = wrap.value.getBoundingClientRect();
  let dur: number;
  if (rzOtherTotal <= 0) {
    // single slice: map pixel delta straight to duration
    const dx = e.clientX - rzStartX;
    dur = rzStartDur + (dx * rzStartTotal) / rect.width;
  } else {
    // place the dragged right edge exactly under the cursor, accounting for the
    // live reflow of the other (fixed-duration) tiles
    const f = Math.min(0.999, Math.max(0.001, (e.clientX - rect.left) / rect.width));
    dur = (f * rzOtherTotal - rzCumBefore) / (1 - f);
  }
  setSliceDuration(resizeIndex.value, dur);
  const s = state.slices[resizeIndex.value];
  if (s) resizeLabel.value = (s.end - s.start).toFixed(2) + 's';
}

function resizeUp(e: PointerEvent) {
  if (resizeIndex.value === null) return;
  e.stopPropagation();
  resizeIndex.value = null;
}

// ---- Manual slicing: draw a region on the waveform to create a slice -------
const sliceCss = (i: number) => `var(${sliceVar(i)})`;
const selecting = ref(false);
const selStartX = ref(0);
const selCurX = ref(0);
const selLeft = computed(() => {
  const w = wrap.value?.clientWidth || 1;
  return (Math.min(selStartX.value, selCurX.value) / w) * 100;
});
const selWidth = computed(() => {
  const w = wrap.value?.clientWidth || 1;
  return (Math.abs(selCurX.value - selStartX.value) / w) * 100;
});
function manualDown(e: PointerEvent) {
  if (pinching || activePointers.size > 1) return;
  if ((e.target as HTMLElement).closest('[data-action]')) return;
  if (!wrap.value) return;
  const rect = wrap.value.getBoundingClientRect();
  selStartX.value = e.clientX - rect.left;
  selCurX.value = selStartX.value;
  selecting.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function manualMove(e: PointerEvent) {
  if (pinching || !selecting.value || !wrap.value) return;
  const rect = wrap.value.getBoundingClientRect();
  selCurX.value = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
}
function manualUp() {
  if (!selecting.value || !wrap.value) return;
  selecting.value = false;
  const w = wrap.value.clientWidth || 1;
  const a = fracToTime(selStartX.value / w);
  const b = fracToTime(selCurX.value / w);
  if (Math.abs(selCurX.value - selStartX.value) < 4) {
    // a click, not a drag → select (and preview) the chop under the cursor
    const hit = state.slices.find((sl) => a >= sl.start && a < sl.end);
    selectedSliceId.value = hit ? hit.id : null;
    if (hit) playSlicePreview(hit.id);
  } else {
    addManualSlice(a, b);
    // select the freshly-drawn chop (appended last)
    const created = state.slices[state.slices.length - 1];
    selectedSliceId.value = created ? created.id : null;
  }
}

// ---- Selected-chop boundary editing (manual mode) --------------------------
// selection lives in the store so the sequencer / delete key share it
const selectedSliceId = computed<string | null>({
  get: () => state.selectedSliceId,
  set: (v) => (state.selectedSliceId = v),
});
const selectedSlice = computed(
  () => state.slices.find((s) => s.id === selectedSliceId.value) || null,
);
const selectedIndex = computed(() =>
  state.slices.findIndex((s) => s.id === selectedSliceId.value),
);
// selection is only meaningful while manual slicing; drop it otherwise
watch(
  () => [state.manualSlice, state.duration],
  () => {
    selectedSliceId.value = null;
  },
);

const boundDrag = ref<'start' | 'end' | null>(null);
let boundPushed = false;
function boundDown(which: 'start' | 'end', e: PointerEvent) {
  if (pinching || !selectedSlice.value) return;
  e.stopPropagation();
  boundDrag.value = which;
  boundPushed = false;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function boundMove(e: PointerEvent) {
  if (pinching || !boundDrag.value || !selectedSlice.value || !wrap.value) return;
  e.stopPropagation();
  if (!boundPushed) {
    pushHistory(); // one undo entry per completed drag
    boundPushed = true;
  }
  const rect = wrap.value.getBoundingClientRect();
  const t = fracToTime(clamp((e.clientX - rect.left) / rect.width, 0, 1));
  if (boundDrag.value === 'start') setSliceStartTime(selectedSlice.value.id, t);
  else setSliceEndTime(selectedSlice.value.id, t);
}
function boundUp() {
  boundDrag.value = null;
}
function boundKey(which: 'start' | 'end', e: KeyboardEvent) {
  const s = selectedSlice.value;
  if (!s) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSlice(s.id); // store picks the next selection
    return;
  }
  let dir = 0;
  if (e.key === 'ArrowLeft') dir = -1;
  else if (e.key === 'ArrowRight') dir = 1;
  else return;
  e.preventDefault();
  const step = (e.shiftKey ? 0.05 : 0.01) * dir;
  pushHistory();
  if (which === 'start') setSliceStartTime(s.id, s.start + step);
  else setSliceEndTime(s.id, s.end + step);
  playSlicePreview(s.id);
}

// global Delete / Backspace removes the selected chop (when not typing)
function onDeleteKey(e: KeyboardEvent) {
  if (!state.manualSlice || !state.selectedSliceId) return;
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const el = e.target as HTMLElement | null;
  const tag = el?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el?.isContentEditable)
    return;
  e.preventDefault();
  deleteSlice(state.selectedSliceId);
}

// ---- Trim handles ----------------------------------------------------------
const trimStartPct = computed(() => timeToFrac(state.trimStart) * 100);
const trimEndPct = computed(() => timeToFrac(state.trimEnd) * 100);
const hasSelection = computed(
  () => state.trimStart > 0.005 || state.trimEnd < state.duration - 0.005,
);
const trimDrag = ref<'start' | 'end' | null>(null);
function trimDown(which: 'start' | 'end', e: PointerEvent) {
  if (pinching) return;
  trimDrag.value = which;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  e.stopPropagation();
}
function trimMove(e: PointerEvent) {
  if (pinching || !trimDrag.value || !wrap.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const t = fracToTime(f);
  if (trimDrag.value === 'start') setTrim(t, state.trimEnd);
  else setTrim(state.trimStart, t);
}
function trimUp() {
  trimDrag.value = null;
}

const pitchAngle = computed(() => (state.pitch / 12) * 135);
let knobDrag = false;
let startY = 0;
let startPitch = 0;
function knobDown(e: MouseEvent) {
  pushHistory();
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
      <div class="editor-actions">
        <div v-if="state.hasSample && !state.sliceMode" class="btn-group">
          <button
            class="btn small"
            :disabled="!hasSelection"
            :class="{ active: hasSelection }"
            :style="hasSelection ? 'background:var(--accent);border-color:var(--accent);color:var(--on-accent)' : ''"
            @click="applyTrim"
          >
            Trim
          </button>
          <button class="btn small ghost" @click="previewTrim">▶ Preview</button>
          <button class="btn small ghost" :disabled="!state.trimmed" @click="resetSample">
            ↺ Reset
          </button>
        </div>
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
          <button
            class="btn small"
            :class="{ active: state.manualSlice }"
            :style="state.manualSlice ? 'background:var(--cyan);border-color:var(--cyan)' : ''"
            @click="setSliceMode(true, 'manual')"
          >
            Manual
          </button>
          <button class="btn small ghost" @click="setSliceMode(true, 'random')">Random</button>
          <button
            v-if="state.manualSlice && state.slices.length"
            class="btn small ghost"
            @click="clearSlices()"
          >
            Clear
          </button>
        </div>

        <!-- auto chop count (only in the auto/arrangement slice view) -->
        <div
          v-if="state.sliceMode && !state.manualSlice"
          class="chop-count"
          role="group"
          aria-label="Automatic chop count"
        >
          <span class="cc-label label">Chops</span>
          <button
            class="cc-btn"
            aria-label="Fewer chops"
            :disabled="state.autoChopCount <= 2"
            @click="setAutoChopCount(state.autoChopCount - 1)"
          >
            −
          </button>
          <input
            class="cc-input mono"
            type="number"
            min="2"
            max="32"
            aria-label="Number of automatic chops"
            :value="state.autoChopCount"
            @change="setAutoChopCount(+($event.target as HTMLInputElement).value)"
          />
          <button
            class="cc-btn"
            aria-label="More chops"
            :disabled="state.autoChopCount >= 32"
            @click="setAutoChopCount(state.autoChopCount + 1)"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <div ref="wrap" class="wave" @wheel="onWheel">
      <canvas ref="canvas" />

      <button
        v-if="isZoomed"
        class="zoom-reset btn small"
        title="Fit whole sample"
        @click="resetView()"
      >
        ⤢ Fit
      </button>

      <!-- draggable slice overlay (arrangement view) -->
      <div
        v-if="state.sliceMode && !state.manualSlice && state.slices.length"
        class="slice-overlay"
      >
        <div
          v-for="it in sliceLayout"
          :key="it.slice.id"
          class="slice-tile"
          :data-sid="it.slice.id"
          :class="{
            dragging: dragIndex === it.index,
            resizing: resizeIndex === it.index,
            rev: it.slice.reversed,
          }"
          :style="{
            left: it.left * 100 + '%',
            width: it.width * 100 + '%',
            borderColor: it.color,
            transform: dragIndex === it.index ? `translateX(${dragDelta}px)` : '',
            zIndex: dragIndex === it.index || resizeIndex === it.index ? 5 : 1,
          }"
          @pointerdown="tileDown($event, it.index)"
          @pointermove="tileMove"
          @pointerup="tileUp(it.index)"
        >
          <span class="tile-badge mono" :style="{ background: it.color }">{{ it.index + 1 }}</span>
          <span
            v-if="resizeIndex === it.index"
            class="tile-len mono"
            :style="{ background: it.color }"
            >{{ resizeLabel }}</span
          >
          <div class="tile-actions">
            <button data-action title="Reverse" @click="toggleSliceReverse(it.slice.id)">⇋</button>
            <button data-action title="Duplicate" @click="duplicateSlice(it.slice.id)">⧉</button>
            <button data-action class="del" title="Delete" @click="deleteSlice(it.slice.id)">✕</button>
          </div>
          <span
            class="slice-resize"
            data-action
            title="Drag to change length"
            :style="{ background: it.color }"
            @pointerdown="resizeDown(it.index, $event)"
            @pointermove="resizeMove"
            @pointerup="resizeUp"
          />
        </div>

        <div
          v-if="markerLeft !== null && dragIndex !== null"
          class="drop-marker"
          :style="{ left: markerLeft + '%' }"
        />
      </div>

      <!-- manual slicing: draw a region on the continuous waveform -->
      <div
        v-if="state.sliceMode && state.manualSlice"
        class="manual-overlay"
        @pointerdown="manualDown"
        @pointermove="manualMove"
        @pointerup="manualUp"
      >
        <div
          v-for="(s, i) in state.slices"
          :key="s.id"
          class="manual-region"
          :class="{ selected: s.id === selectedSliceId }"
          :style="{
            left: timeToFrac(s.start) * 100 + '%',
            width: (timeToFrac(s.end) - timeToFrac(s.start)) * 100 + '%',
            borderColor: sliceCss(i),
            background: `color-mix(in srgb, ${sliceCss(i)} ${s.id === selectedSliceId ? 26 : 16}%, transparent)`,
          }"
        >
          <span class="mr-badge mono" :style="{ background: sliceCss(i) }">{{ i + 1 }}</span>
          <span v-if="s.id === selectedSliceId" class="mr-len mono">
            {{ (s.end - s.start).toFixed(2) }}s
          </span>
          <button
            class="mr-del"
            data-action
            :title="`Delete chop ${i + 1}`"
            :aria-label="`Delete chop ${i + 1}`"
            @pointerdown.stop
            @click="deleteSlice(s.id)"
          >
            ✕
          </button>
        </div>

        <!-- start / end boundary handles for the selected chop -->
        <template v-if="selectedSlice">
          <div
            class="chop-handle"
            data-action
            role="slider"
            tabindex="0"
            :aria-label="`Chop ${selectedIndex + 1} start`"
            :aria-valuemin="0"
            :aria-valuemax="state.duration"
            :aria-valuenow="selectedSlice.start"
            :style="{ left: timeToFrac(selectedSlice.start) * 100 + '%' }"
            @pointerdown="boundDown('start', $event)"
            @pointermove="boundMove"
            @pointerup="boundUp"
            @keydown="boundKey('start', $event)"
          >
            <span class="ch-grip" />
          </div>
          <div
            class="chop-handle end"
            data-action
            role="slider"
            tabindex="0"
            :aria-label="`Chop ${selectedIndex + 1} end`"
            :aria-valuemin="0"
            :aria-valuemax="state.duration"
            :aria-valuenow="selectedSlice.end"
            :style="{ left: timeToFrac(selectedSlice.end) * 100 + '%' }"
            @pointerdown="boundDown('end', $event)"
            @pointermove="boundMove"
            @pointerup="boundUp"
            @keydown="boundKey('end', $event)"
          >
            <span class="ch-grip" />
          </div>
        </template>

        <div
          v-if="selecting"
          class="manual-sel"
          :style="{ left: selLeft + '%', width: selWidth + '%' }"
        />
      </div>

      <!-- trim handles (continuous view only) -->
      <div v-if="state.hasSample && !state.sliceMode" class="trim-overlay">
        <div class="trim-dim" :style="{ left: 0, width: trimStartPct + '%' }" />
        <div class="trim-dim" :style="{ left: trimEndPct + '%', right: 0 }" />
        <div
          v-if="hasSelection"
          class="trim-len mono"
          :style="{ left: (trimStartPct + trimEndPct) / 2 + '%' }"
        >
          {{ (state.trimEnd - state.trimStart).toFixed(2) }}s
        </div>
        <div
          class="trim-handle"
          :style="{ left: trimStartPct + '%' }"
          @pointerdown="trimDown('start', $event)"
          @pointermove="trimMove"
          @pointerup="trimUp"
        >
          <span class="grip" />
        </div>
        <div
          class="trim-handle"
          :style="{ left: trimEndPct + '%' }"
          @pointerdown="trimDown('end', $event)"
          @pointermove="trimMove"
          @pointerup="trimUp"
        >
          <span class="grip" />
        </div>
      </div>

      <div v-if="!state.hasSample" class="empty mono">
        drop a sample to see its waveform
      </div>
    </div>

    <!-- overview / pan strip (only while zoomed in) -->
    <div
      v-if="isZoomed"
      ref="overview"
      class="wave-overview"
      @pointerdown="ovDown"
      @pointermove="ovMove"
      @pointerup="ovUp"
    >
      <div
        class="ov-window"
        :style="{ left: winLeftPct + '%', width: winWidthPct + '%' }"
      />
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
              @pointerdown="pushHistory"
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
          <span class="drag-hint dim mono">{{
            state.manualSlice
              ? 'drag on the waveform to slice · click a region to preview'
              : 'drag tiles to rearrange · drag edge to resize · click to preview'
          }}</span>
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
  gap: 10px;
}
.editor-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.btn-group {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-right: 10px;
  border-right: 1px solid var(--line);
}
.slice-btns {
  display: flex;
  gap: 6px;
}
.chop-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cc-label {
  margin-right: 2px;
}
.cc-btn {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
  line-height: 1;
  display: grid;
  place-items: center;
}
.cc-btn:hover:not(:disabled) {
  border-color: var(--line-strong);
}
.cc-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.cc-input {
  width: 42px;
  text-align: center;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--text);
  padding: 4px 4px;
  font-size: 12px;
  outline: none;
}
.cc-input:focus {
  border-color: var(--cyan);
}
.wave {
  position: relative;
  flex: 1;
  min-height: 120px;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  /* let a single-finger vertical swipe scroll the page, but reserve pinch +
     horizontal gestures for our zoom/pan handlers */
  touch-action: pan-y;
}
/* "Fit" button to reset the zoom, floating top-right of the waveform */
.zoom-reset {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 8;
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  backdrop-filter: blur(4px);
}
/* overview / pan strip under the waveform */
.wave-overview {
  position: relative;
  height: 26px;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
  overflow: hidden;
  touch-action: none;
  background-image: repeating-linear-gradient(
    90deg,
    var(--line) 0,
    var(--line) 1px,
    transparent 1px,
    transparent 12.5%
  );
}
.ov-window {
  position: absolute;
  top: 0;
  bottom: 0;
  min-width: 8px;
  background: color-mix(in srgb, var(--cyan) 20%, transparent);
  border: 1px solid var(--cyan);
  border-radius: 4px;
  cursor: grab;
}
.ov-window:active {
  cursor: grabbing;
}
/* manual slicing: draw regions on the continuous waveform */
.manual-overlay {
  position: absolute;
  inset: 0;
  cursor: crosshair;
  touch-action: none;
}
.manual-region {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 2px solid transparent;
  border-right: 2px solid transparent;
  pointer-events: none;
}
.manual-region.selected {
  box-shadow: inset 0 0 0 2px var(--text-bright);
  z-index: 2;
}
.mr-len {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  padding: 1px 6px;
  border-radius: 100px;
  font-size: 9px;
  font-weight: 700;
  color: var(--on-hue);
  background: var(--text-bright);
  pointer-events: none;
  white-space: nowrap;
}
/* draggable start/end boundary handles for the selected chop */
.chop-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 20px;
  margin-left: -10px;
  display: flex;
  justify-content: center;
  cursor: ew-resize;
  pointer-events: auto;
  touch-action: none;
  z-index: 5;
}
.chop-handle::before {
  content: '';
  width: 2px;
  height: 100%;
  background: var(--text-bright);
}
.chop-handle:focus-visible {
  outline: none;
}
.chop-handle:focus-visible::before {
  background: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.ch-grip {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 14px;
  height: 16px;
  background: var(--text-bright);
  border-radius: 4px 4px 0 0;
}
.chop-handle.end .ch-grip {
  bottom: auto;
  top: 0;
  border-radius: 0 0 4px 4px;
}
.chop-handle:focus-visible .ch-grip {
  background: var(--accent);
}
.mr-badge {
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
}
.mr-del {
  position: absolute;
  bottom: 4px;
  left: 4px;
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
  pointer-events: auto;
  opacity: 0;
  transition: opacity 0.12s;
}
.manual-region:hover .mr-del,
.manual-region.selected .mr-del {
  opacity: 1;
}
.mr-del:hover {
  color: var(--red);
  border-color: var(--red);
}
.manual-sel {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  border-left: 2px solid var(--accent);
  border-right: 2px solid var(--accent);
  pointer-events: none;
}
/* trim handles + dimmed excluded regions */
.trim-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.trim-dim {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.55);
}
.trim-len {
  position: absolute;
  top: 6px;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--on-accent);
  background: var(--accent);
  padding: 1px 7px;
  border-radius: 100px;
}
.trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 18px;
  margin-left: -9px;
  display: flex;
  justify-content: center;
  cursor: ew-resize;
  pointer-events: auto;
  touch-action: none;
}
.trim-handle::before {
  content: '';
  width: 2px;
  height: 100%;
  background: var(--accent);
}
.trim-handle .grip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 14px;
  height: 16px;
  background: var(--accent);
  border-radius: 0 0 4px 4px;
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
/* right-edge grip to drag a slice's length */
.slice-resize {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -3px;
  width: 8px;
  cursor: ew-resize;
  opacity: 0;
  border-radius: 3px;
  transition: opacity 0.12s;
  touch-action: none;
  z-index: 4;
}
.slice-tile:hover .slice-resize {
  opacity: 0.6;
}
.slice-resize:hover,
.slice-tile.resizing .slice-resize {
  opacity: 1;
}
/* live length read-out while dragging the edge */
.tile-len {
  position: absolute;
  top: 22px;
  left: 4px;
  padding: 1px 6px;
  border-radius: 100px;
  color: var(--on-hue);
  font-size: 9px;
  font-weight: 700;
  pointer-events: none;
  white-space: nowrap;
  z-index: 6;
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

@media (max-width: 820px) {
  .head {
    flex-wrap: wrap;
    gap: 8px;
  }
  .slice-btns {
    flex-wrap: wrap;
  }
  /* stack the controls so the pitch knob can't overlap anything */
  .controls {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .stretch {
    flex: none;
    min-width: 0;
  }
  .ctl-body {
    height: auto;
    min-height: 44px;
  }
  /* no hover on touch — keep the per-slice actions + resize grip visible */
  .tile-actions {
    opacity: 1;
  }
  .slice-resize {
    opacity: 0.7;
    width: 12px;
  }
  .mr-del {
    opacity: 1;
  }
}
</style>
