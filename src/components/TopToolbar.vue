<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import {
  state,
  loadFile,
  setBpm,
  setBars,
  undo,
  redo,
  exportWav,
  saveProject,
  loadProject,
  toggleTheme,
  startRecording,
  stopRecording,
  cancelRecording,
  dismissRecError,
  disposeRecording,
  MAX_REC_SECONDS,
} from '../store';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const elapsedLabel = computed(() => fmtTime(state.recElapsed));
const maxLabel = fmtTime(MAX_REC_SECONDS);
onUnmounted(() => disposeRecording());

const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const projectInput = ref<HTMLInputElement | null>(null);

function pick() {
  fileInput.value?.click();
}
function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) loadFile(f);
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type.startsWith('audio')) loadFile(f);
}
function onProjectFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadProject(file);
  (e.target as HTMLInputElement).value = '';
}
</script>

<template>
  <header class="toolbar panel">
    <div class="brand">
      <span class="dot" :class="{ live: state.playing }" />
      <span class="name">REMIX<b>STUDIO</b></span>
    </div>

    <div
      class="drop"
      :class="{ over: dragging }"
      role="button"
      tabindex="0"
      :aria-label="state.hasSample ? `Replace sample ${state.sampleName}` : 'Upload audio sample'"
      @click="pick"
      @keydown.enter="pick"
      @keydown.space.prevent="pick"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <template v-if="!state.hasSample">
        <span class="up">↑</span>
        <div>
          <strong>Upload sample</strong>
          <span class="dim"> or drag an audio file here</span>
        </div>
      </template>
      <template v-else>
        <span class="up" style="color: var(--cyan)">♪</span>
        <div class="analysis">
          <div class="fname">{{ state.sampleName }}</div>
          <div class="stats mono">
            <span
              ><i class="dim">BPM</i> {{ state.originalBpm }}</span
            >
            <span><i class="dim">KEY</i> {{ state.key }}</span>
            <span><i class="dim">LEN</i> {{ state.duration.toFixed(1) }}s</span>
            <span><i class="dim">RMS</i> {{ state.loudness }}dB</span>
          </div>
        </div>
      </template>
      <span v-if="state.analyzing" class="analyzing mono">analyzing…</span>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept="audio/*"
      hidden
      @change="onFile"
    />
    <input
      ref="projectInput"
      type="file"
      accept=".remix.json,application/json"
      hidden
      @change="onProjectFile"
    />

    <!-- microphone recording -->
    <div class="rec" :class="`rec-${state.recStatus}`">
      <button
        v-if="state.recStatus === 'idle'"
        class="btn rec-btn"
        aria-label="Record a sample from the microphone"
        @click="startRecording"
      >
        <span class="rec-dot" /> Rec
      </button>
      <span v-else-if="state.recStatus === 'requesting'" class="rec-msg mono">
        requesting mic…
      </span>
      <template v-else-if="state.recStatus === 'recording'">
        <span class="rec-time mono" role="timer" aria-live="polite">
          <span class="rec-dot live" /> {{ elapsedLabel }}
          <i class="dim">/ {{ maxLabel }}</i>
        </span>
        <button
          class="btn small rec-stop"
          aria-label="Stop recording and use it as the sample"
          @click="stopRecording"
        >
          ■ Stop
        </button>
        <button class="btn small ghost" aria-label="Cancel recording" @click="cancelRecording">
          Cancel
        </button>
      </template>
      <template v-else-if="state.recStatus === 'error'">
        <span class="rec-err mono" role="alert">{{ state.recError }}</span>
        <button
          class="btn small ghost"
          aria-label="Dismiss recording error"
          @click="dismissRecError"
        >
          ✕
        </button>
      </template>
    </div>

    <div class="controls">
      <label class="field">
        <span class="label">BPM</span>
        <input
          class="bpm mono"
          type="number"
          :value="state.bpm"
          min="40"
          max="220"
          @change="setBpm(+($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="field">
        <span class="label">Key</span>
        <div class="chip mono">{{ state.key }}</div>
      </label>
      <label class="field">
        <span class="label">Length</span>
        <select
          class="select"
          :value="state.bars"
          @change="setBars(+($event.target as HTMLSelectElement).value)"
        >
          <option :value="1">1 Bar</option>
          <option :value="2">2 Bars</option>
          <option :value="4">4 Bars</option>
        </select>
      </label>

      <div class="divider" />
      <button class="btn ghost small" :disabled="!state.canUndo" @click="undo">
        ↶ Undo
      </button>
      <button class="btn ghost small" :disabled="!state.canRedo" @click="redo">
        ↷ Redo
      </button>
      <div class="divider" />
      <button
        class="btn ghost small theme-toggle"
        :aria-label="state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        :title="state.theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
        @click="toggleTheme"
      >
        {{ state.theme === 'dark' ? '◐' : '◑' }}
      </button>
      <button class="btn" @click="exportWav">Export</button>
      <button class="btn" @click="projectInput?.click()">Load Project</button>
      <button class="btn primary" @click="saveProject">Save Project</button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-radius: var(--radius);
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding-right: 4px;
}
.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--red);
  box-shadow: 0 0 12px var(--red);
  transition: 0.2s;
}
.dot.live {
  animation: blink 1.1s steps(2, start) infinite;
}
@keyframes blink {
  50% {
    opacity: 0.25;
  }
}
.name {
  font-family: var(--display);
  font-size: 22px;
  letter-spacing: 2px;
  font-weight: 400;
  color: var(--text-dim);
}
.name b {
  font-weight: 700;
  color: var(--text-bright);
}
.theme-toggle {
  min-width: 32px;
  justify-content: center;
  font-size: 14px;
}
.drop {
  flex: 1;
  min-width: 220px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  min-height: 46px;
}
.drop:hover,
.drop.over {
  border-color: var(--cyan);
  background: rgba(53, 214, 208, 0.06);
}
.up {
  font-size: 18px;
  color: var(--text-dim);
}
.analysis .fname {
  font-weight: 600;
  font-size: 12px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stats {
  display: flex;
  gap: 14px;
  font-size: 11px;
  margin-top: 2px;
}
.stats i {
  font-style: normal;
  margin-right: 3px;
}
.analyzing {
  color: var(--cyan);
  font-size: 11px;
  animation: pulse 1s infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}
.controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bpm {
  width: 62px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--text);
  padding: 6px 8px;
  font-size: 13px;
  outline: none;
}
.divider {
  width: 1px;
  height: 30px;
  background: var(--line);
}

/* microphone recording control */
.rec {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.rec-btn {
  gap: 7px;
}
.rec-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.rec-dot.live {
  box-shadow: 0 0 8px var(--accent-glow);
  animation: rec-blink 1s steps(2, start) infinite;
}
@keyframes rec-blink {
  50% {
    opacity: 0.3;
  }
}
.rec-time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent);
}
.rec-time i {
  font-style: normal;
}
.rec-stop {
  border-color: var(--accent);
  color: var(--accent);
}
.rec-msg {
  font-size: 11px;
  color: var(--text-dim);
}
.rec-err {
  font-size: 11px;
  color: var(--accent);
  max-width: 220px;
}

@media (max-width: 820px) {
  .toolbar {
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 12px;
  }
  /* row 1: brand.  row 2: upload (full width).  row 3: controls (wrap). */
  .brand {
    order: 1;
  }
  .drop {
    order: 3;
    flex-basis: 100%;
    min-width: 0;
  }
  .rec {
    order: 4;
    flex-wrap: wrap;
  }
  .controls {
    order: 2;
    width: 100%;
    flex-wrap: wrap;
    gap: 8px 10px;
    justify-content: flex-start;
  }
  .controls .divider {
    display: none;
  }
  /* let the action buttons breathe / stay tappable */
  .controls .btn {
    padding: 8px 12px;
  }
}
</style>
