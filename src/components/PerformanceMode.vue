<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import {
  state,
  triggerChop,
  triggerDrumPad,
  CHOP_PAD_KEYS,
  DRUM_PAD_KEYS,
} from '../store';

// which pad is flashing right now, e.g. 'chop-3' / 'drum-1'
const active = ref<string | null>(null);
let flashTimer: number | undefined;
function flash(id: string) {
  active.value = id;
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    if (active.value === id) active.value = null;
  }, 140);
}

const chopColor = (i: number) => `var(--slice-${(i % 6) + 1})`;
const chopKey = (i: number) =>
  i < CHOP_PAD_KEYS.length ? CHOP_PAD_KEYS[i].toUpperCase() : '';

function hitChop(i: number) {
  triggerChop(i);
  flash('chop-' + i);
}
function hitDrum(i: number) {
  triggerDrumPad(i);
  flash('drum-' + i);
}

// mirror the global key triggers visually (App.vue plays the audio; here we just
// light the matching pad so keyboard performance shows feedback)
const chopIndexByKey: Record<string, number> = Object.fromEntries(
  CHOP_PAD_KEYS.map((k, i) => [k, i]),
);
const drumIndexByKey: Record<string, number> = Object.fromEntries(
  DRUM_PAD_KEYS.map((k, i) => [k, i]),
);
function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k in chopIndexByKey && state.slices[chopIndexByKey[k]]) flash('chop-' + chopIndexByKey[k]);
  else if (k in drumIndexByKey) flash('drum-' + drumIndexByKey[k]);
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  clearTimeout(flashTimer);
});
</script>

<template>
  <div class="perform">
    <div class="perform-head">
      <span class="label">Live Performance</span>
      <span class="dim">
        tap pads or use keys · chops = 1-0 / Q-P · drums = A-S-D-F
      </span>
    </div>

    <!-- one pad per chop; the grid scrolls when there are many -->
    <div class="pad-section chops-section">
      <span class="sub-label label">Chops · {{ state.slices.length }}</span>
      <div v-if="state.slices.length" class="chop-pads">
        <button
          v-for="(s, i) in state.slices"
          :key="s.id"
          type="button"
          class="pad chop"
          :class="{ hit: active === 'chop-' + i }"
          :style="{ '--pad': chopColor(i) }"
          :aria-label="`Chop ${i + 1}${chopKey(i) ? ', key ' + chopKey(i) : ''}`"
          @pointerdown="hitChop(i)"
        >
          <span v-if="chopKey(i)" class="pad-key mono">{{ chopKey(i) }}</span>
          <span class="pad-label">Chop {{ i + 1 }}</span>
        </button>
      </div>
      <div v-else class="pad-empty dim">
        load a sample and slice it — every chop becomes a pad here
      </div>
    </div>

    <!-- fixed drum pads -->
    <div class="pad-section">
      <span class="sub-label label">Drums</span>
      <div class="drum-pads">
        <button
          v-for="(d, i) in state.drums"
          :key="d.id"
          type="button"
          class="pad drum"
          :class="{ hit: active === 'drum-' + i }"
          :aria-label="`${d.name}, key ${DRUM_PAD_KEYS[i]?.toUpperCase()}`"
          @pointerdown="hitDrum(i)"
        >
          <span class="pad-key mono">{{ DRUM_PAD_KEYS[i]?.toUpperCase() }}</span>
          <span class="pad-label">{{ d.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.perform {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
}
.perform-head {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pad-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
/* the chop grid takes the remaining height and scrolls */
.chops-section {
  flex: 1;
  min-height: 0;
}
.sub-label {
  flex-shrink: 0;
}
.chop-pads {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  grid-auto-rows: minmax(88px, 1fr);
  gap: 12px;
  padding-right: 4px;
}
.drum-pads {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  height: 96px;
  flex-shrink: 0;
}
.pad {
  border-radius: 16px;
  background: var(--panel);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px;
  transition: transform 0.08s, box-shadow 0.1s, background 0.1s;
  position: relative;
  overflow: hidden;
}
.pad.drum {
  --pad: var(--orange);
}
.pad::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 20%, var(--pad), transparent 70%);
  opacity: 0.12;
  pointer-events: none;
}
.pad:hover {
  border-color: var(--pad);
}
.pad:focus-visible {
  outline: 2px solid var(--pad);
  outline-offset: 2px;
}
.pad.hit {
  transform: scale(0.97);
  background: var(--pad);
  box-shadow: 0 0 32px var(--pad);
}
.pad.hit .pad-label,
.pad.hit .pad-key {
  color: var(--on-hue);
}
.pad-key {
  font-size: 11px;
  color: var(--text-mute);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 2px 7px;
  z-index: 1;
}
.pad-label {
  font-size: 15px;
  font-weight: 600;
  z-index: 1;
}
.pad-empty {
  flex: 1;
  display: grid;
  place-items: center;
  border: 1px dashed var(--line);
  border-radius: 12px;
  font-size: 12px;
  text-align: center;
  padding: 20px;
}

@media (max-width: 820px) {
  .perform {
    padding: 14px;
    gap: 12px;
  }
  .chop-pads {
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    grid-auto-rows: minmax(80px, 1fr);
    gap: 10px;
  }
  .pad-label {
    font-size: 14px;
  }
}
</style>
