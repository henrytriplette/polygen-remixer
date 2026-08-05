<script setup lang="ts">
import { computed } from 'vue';
import { state, addNote, removeNote, setSynthWave } from '../store';
import { midiToName } from '../audio/synth';

// two octaves of bass/melody range
const LOW = 36;
const HIGH = 60;
const rows = computed(() => {
  const r: number[] = [];
  for (let m = HIGH; m >= LOW; m--) r.push(m);
  return r;
});
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);

function cellClick(midi: number, step: number) {
  const existing = state.notes.find(
    (n) => n.midi === midi && step >= n.start && step < n.start + n.length,
  );
  if (existing) removeNote(existing.id);
  else addNote(midi, step, 2);
}

const waves = ['sawtooth', 'square', 'sine', 'triangle'];
</script>

<template>
  <section class="roll panel">
    <div class="roll-head">
      <span class="label">Piano Roll · Bass / Melody</span>
      <div class="wave-select">
        <button
          v-for="w in waves"
          :key="w"
          class="btn small ghost"
          :class="{ active: state.synthWave === w }"
          :style="state.synthWave === w ? 'background:var(--green);border-color:var(--green)' : ''"
          @click="setSynthWave(w)"
        >
          {{ w }}
        </button>
      </div>
    </div>

    <div class="roll-grid">
      <div class="keys">
        <div
          v-for="m in rows"
          :key="m"
          class="key"
          :class="{ black: isBlack(m), c: m % 12 === 0 }"
        >
          <span v-if="m % 12 === 0" class="key-label mono">{{ midiToName(m) }}</span>
        </div>
      </div>
      <div
        class="cells"
        :style="{ gridTemplateColumns: `repeat(${state.totalSteps}, var(--cell-w, 1fr))` }"
      >
        <template v-for="m in rows" :key="m">
          <div
            v-for="s in state.totalSteps"
            :key="m + '-' + s"
            class="cell"
            :class="{
              black: isBlack(m),
              beat: (s - 1) % 4 === 0,
              bar: (s - 1) % 16 === 0,
              playhead: state.currentStep === s - 1,
            }"
            @click="cellClick(m, s - 1)"
          />
        </template>
        <div
          v-for="n in state.notes"
          :key="n.id"
          class="note"
          :style="{
            left: (n.start / state.totalSteps) * 100 + '%',
            width: (n.length / state.totalSteps) * 100 + '%',
            top: ((HIGH - n.midi) / (HIGH - LOW + 1)) * 100 + '%',
            height: (1 / (HIGH - LOW + 1)) * 100 + '%',
          }"
          @click.stop="removeNote(n.id)"
        >
          <span class="note-name">{{ midiToName(n.midi) }}</span>
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
}
.wave-select {
  display: flex;
  gap: 5px;
}
.roll-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 52px 1fr;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  min-height: 150px;
}
.keys {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
}
.key {
  flex: 1;
  border-bottom: 1px solid var(--line);
  background: var(--panel-2);
  display: flex;
  align-items: center;
  padding-left: 6px;
  min-height: 0;
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
}
.cells {
  position: relative;
  display: grid;
  grid-auto-rows: 1fr;
}
.cell {
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}
.cell.black {
  background: rgba(0, 0, 0, 0.22);
}
.cell.beat {
  border-right-color: var(--line-strong);
}
.cell.bar {
  border-right-color: var(--line-strong);
}
.cell:hover {
  background: color-mix(in srgb, var(--green) 20%, transparent);
}
.cell.playhead {
  background: color-mix(in srgb, var(--green) 10%, transparent);
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
  /* horizontal scroll with a pinned key column and wider, tappable cells */
  .roll-grid {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    min-height: 320px;
  }
  .keys {
    position: sticky;
    left: 0;
    z-index: 3;
    flex: 0 0 46px;
    background: var(--panel);
  }
  .cells {
    --cell-w: 30px;
    flex: 0 0 auto;
  }
}
</style>
