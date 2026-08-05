<script setup lang="ts">
import { ref } from 'vue';
import { triggerPad } from '../store';

const active = ref<number | null>(null);
const PAD_LABELS = [
  'Slice 1',
  'Slice 2',
  'Slice 3',
  'Slice 4',
  'Kick',
  'Snare',
  'Hat',
  'Clap',
];
const PAD_KEYS = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R'];
const PAD_COLORS = [
  'var(--cyan)',
  'var(--cyan)',
  'var(--cyan)',
  'var(--cyan)',
  'var(--orange)',
  'var(--orange)',
  'var(--orange)',
  'var(--orange)',
];

function hit(i: number) {
  triggerPad(i);
  active.value = i;
  setTimeout(() => {
    if (active.value === i) active.value = null;
  }, 140);
}
</script>

<template>
  <div class="perform">
    <div class="perform-head">
      <span class="label">Live Performance</span>
      <span class="dim">tap pads or use keys 1-4 / Q-W-E-R · hold for retrigger feel</span>
    </div>
    <div class="pads">
      <button
        v-for="(label, i) in PAD_LABELS"
        :key="i"
        class="pad"
        :class="{ hit: active === i }"
        :style="{ '--pad': PAD_COLORS[i] }"
        @pointerdown="hit(i)"
      >
        <span class="pad-key mono">{{ PAD_KEYS[i] }}</span>
        <span class="pad-label">{{ label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.perform {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
}
.perform-head {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pads {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 16px;
}
.pad {
  border-radius: 18px;
  background: var(--panel);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px;
  transition: transform 0.08s, box-shadow 0.1s, background 0.1s;
  position: relative;
  overflow: hidden;
}
.pad::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 20%, var(--pad), transparent 70%);
  opacity: 0.12;
}
.pad:hover {
  border-color: var(--pad);
}
.pad.hit {
  transform: scale(0.97);
  background: var(--pad);
  box-shadow: 0 0 40px var(--pad);
}
.pad.hit .pad-label,
.pad.hit .pad-key {
  color: var(--on-hue);
}
.pad-key {
  font-size: 12px;
  color: var(--text-mute);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 2px 8px;
  z-index: 1;
}
.pad-label {
  font-size: 17px;
  font-weight: 600;
  z-index: 1;
}

@media (max-width: 820px) {
  .perform {
    padding: 14px;
    gap: 12px;
  }
  /* 2 × 4 grid gives far bigger touch targets than 4 × 2 on a phone */
  .pads {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(4, minmax(96px, 1fr));
    gap: 12px;
  }
  .pad {
    padding: 14px;
  }
}
</style>
