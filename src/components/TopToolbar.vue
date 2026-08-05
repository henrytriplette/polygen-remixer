<script setup lang="ts">
import { ref } from 'vue';
import {
  state,
  loadFile,
  setBpm,
  setBars,
  undo,
  redo,
  exportWav,
  saveProject,
  toggleTheme,
} from '../store';

const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

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
      @click="pick"
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

    <div class="controls">
      <label class="field">
        <span class="label">BPM</span>
        <input
          class="bpm mono"
          type="number"
          :value="state.bpm"
          min="40"
          max="220"
          @input="setBpm(+($event.target as HTMLInputElement).value)"
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
        :title="state.theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
        @click="toggleTheme"
      >
        {{ state.theme === 'dark' ? '◐' : '◑' }}
      </button>
      <button class="btn" @click="exportWav">Export</button>
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
