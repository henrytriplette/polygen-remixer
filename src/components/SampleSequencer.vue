<script setup lang="ts">
import {
  state,
  toggleSampleStep,
  clearSampleGrid,
  distributeSlices,
  playSlicePreview,
} from '../store';

// slice colours mirror the Sample Editor's theme-aware palette
const sliceColor = (i: number) => `var(--slice-${(i % 6) + 1})`;
</script>

<template>
  <section class="sampleseq panel">
    <div class="ss-head">
      <span class="label">Sample Sequencer</span>
      <span class="ss-hint dim mono">click cells to trigger chops · click a name to preview</span>
      <div class="ss-actions">
        <button class="btn small ghost" @click="distributeSlices()">Auto</button>
        <button class="btn small ghost" @click="clearSampleGrid()">Clear</button>
      </div>
    </div>

    <div v-if="!state.hasSample || !state.slices.length" class="ss-empty mono">
      load a sample to sequence its chops · use ✂ Slice in the editor to make more
    </div>

    <div v-else class="ss-grid">
      <div v-for="(slice, i) in state.slices" :key="slice.id" class="ss-row">
        <button
          class="ss-name"
          :style="{ color: sliceColor(i) }"
          title="Preview chop"
          @click="playSlicePreview(slice.id)"
        >
          <span class="ss-dot" :style="{ background: sliceColor(i) }" />
          Chop {{ i + 1 }}
        </button>
        <div class="ss-steps">
          <button
            v-for="s in state.totalSteps"
            :key="s"
            class="ss-step"
            :class="{
              on: state.sampleGrid[i]?.[s - 1],
              beat: (s - 1) % 4 === 0,
              bar: (s - 1) % 16 === 0 && s > 1,
              playing: state.currentStep === s - 1,
            }"
            :style="state.sampleGrid[i]?.[s - 1] ? { background: sliceColor(i) } : {}"
            @click="toggleSampleStep(i, s - 1)"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sampleseq {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  gap: 12px;
  min-height: 0;
}
.ss-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.ss-hint {
  font-size: 9.5px;
  flex: 1;
}
.ss-actions {
  display: flex;
  gap: 6px;
}
.ss-empty {
  color: var(--text-mute);
  font-size: 12px;
  text-align: center;
  padding: 40px 0;
}
.ss-grid {
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow: auto;
  min-height: 0;
  padding-right: 3px;
}
.ss-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ss-name {
  width: 96px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  padding: 4px 2px;
}
.ss-name:hover {
  filter: brightness(1.2);
}
.ss-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ss-steps {
  display: flex;
  gap: 5px;
}
.ss-step {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  flex-shrink: 0;
  transition: transform 0.08s, background 0.1s;
}
.ss-step.beat {
  background: var(--panel-3);
}
.ss-step.bar {
  margin-left: 10px;
}
.ss-step:hover {
  border-color: var(--line-strong);
}
.ss-step.on {
  border-color: transparent;
  box-shadow: 0 0 10px color-mix(in srgb, var(--text) 12%, transparent);
}
.ss-step.playing {
  outline: 2px solid color-mix(in srgb, var(--text-bright) 55%, transparent);
  outline-offset: 1px;
}
.ss-step.playing.on {
  animation: pop 0.18s ease;
}

@media (max-width: 820px) {
  .ss-head {
    flex-wrap: wrap;
  }
  .ss-grid {
    overflow-x: auto;
  }
  .ss-name {
    width: 78px;
    font-size: 11px;
  }
}
</style>
