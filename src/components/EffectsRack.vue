<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  state,
  addEffect,
  removeEffect,
  setEffectParam,
  reorderEffect,
  pushHistory,
  EFFECT_PARAM_SPECS,
} from '../store';
import type { EffectType } from '../audio/effects';

const ALL_EFFECTS: EffectType[] = [
  'eq',
  'filter',
  'reverb',
  'delay',
  'distortion',
  'chorus',
  'compressor',
  'bitcrusher',
  'phaser',
  'flanger',
];
const adding = ref(false);

const activeCh = computed(() =>
  state.channels.find((c) => c.key === state.activeEffectChannel)!,
);

function pickChannel(key: string) {
  state.activeEffectChannel = key;
}

// XY pad for filter
function xyDown(e: MouseEvent, fxId: string) {
  pushHistory();
  const el = e.currentTarget as HTMLElement;
  const move = (ev: MouseEvent) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, 1 - (ev.clientY - r.top) / r.height));
    const cutoff = Math.round(40 * Math.pow(18000 / 40, x));
    const reso = 0.1 + y * 18;
    setEffectParam(state.activeEffectChannel, fxId, 'cutoff', cutoff);
    setEffectParam(state.activeEffectChannel, fxId, 'resonance', reso);
  };
  move(e);
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
function xyPos(params: Record<string, number>) {
  const x = Math.log(params.cutoff / 40) / Math.log(18000 / 40);
  const y = 1 - (params.resonance - 0.1) / 18;
  return { left: x * 100 + '%', top: y * 100 + '%' };
}
</script>

<template>
  <section class="rack panel">
    <div class="rack-head">
      <span class="label">Effects Rack</span>
      <div class="ch-tabs">
        <button
          v-for="c in state.channels"
          :key="c.key"
          class="ch-tab"
          :class="{ active: state.activeEffectChannel === c.key }"
          :style="state.activeEffectChannel === c.key ? { borderColor: c.accent, color: c.accent } : {}"
          @click="pickChannel(c.key)"
        >
          {{ c.name }}
          <span v-if="c.effects.length" class="fx-count">{{ c.effects.length }}</span>
        </button>
      </div>
    </div>

    <div class="chain">
      <div v-if="!activeCh.effects.length" class="empty mono">
        no effects on {{ activeCh.name }} — add one below
      </div>

      <div
        v-for="(fx, idx) in activeCh.effects"
        :key="fx.id"
        class="module"
      >
        <div class="mod-head">
          <span class="mod-name">{{ fx.type }}</span>
          <div class="mod-actions">
            <button class="ico" :disabled="idx === 0" :aria-label="`Move ${fx.type} earlier`" @click="reorderEffect(activeCh.key, idx, idx - 1)">↑</button>
            <button class="ico" :disabled="idx === activeCh.effects.length - 1" :aria-label="`Move ${fx.type} later`" @click="reorderEffect(activeCh.key, idx, idx + 1)">↓</button>
            <button class="ico del" :aria-label="`Remove ${fx.type}`" @click="removeEffect(activeCh.key, fx.id)">✕</button>
          </div>
        </div>

        <!-- XY pad for filter -->
        <div v-if="fx.type === 'filter'" class="xy" @mousedown="xyDown($event, fx.id)">
          <div class="xy-grid" />
          <div class="xy-dot" :style="xyPos(fx.params)" />
          <span class="xy-lab tl">High Q</span>
          <span class="xy-lab bl">Low Q</span>
          <span class="xy-lab br">Bright</span>
          <span class="xy-lab bl2">Warm</span>
        </div>

        <div class="params">
          <div v-for="spec in EFFECT_PARAM_SPECS[fx.type]" :key="spec.name" class="param">
            <div class="param-top">
              <span class="dim">{{ spec.label }}</span>
              <span class="mono val">{{ fx.params[spec.name]?.toFixed(spec.step < 1 ? 2 : 0) }}</span>
            </div>
            <input
              type="range"
              :min="spec.min"
              :max="spec.max"
              :step="spec.step"
              :value="fx.params[spec.name]"
              :aria-label="`${fx.type} ${spec.label}`"
              @pointerdown="pushHistory"
              @input="setEffectParam(activeCh.key, fx.id, spec.name, +($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="add-row">
      <button class="btn" style="border-color: var(--purple)" @click="adding = !adding">
        + Add Effect
      </button>
      <div v-if="adding" class="add-menu">
        <button
          v-for="t in ALL_EFFECTS"
          :key="t"
          class="add-item"
          @click="addEffect(activeCh.key, t); adding = false"
        >
          {{ t }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rack {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  gap: 10px;
  min-height: 0;
}
.rack-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ch-tabs {
  display: flex;
  gap: 6px;
}
.ch-tab {
  flex: 1;
  padding: 6px;
  border-radius: 7px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-size: 11px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.fx-count {
  background: color-mix(in srgb, var(--text) 15%, transparent);
  border-radius: 100px;
  padding: 0 5px;
  font-size: 9px;
}
.chain {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 3px;
}
.empty {
  color: var(--text-mute);
  font-size: 11px;
  text-align: center;
  padding: 20px 0;
}
.module {
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 9px 11px;
  animation: fadein 0.2s ease;
}
.mod-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.mod-name {
  font-size: 12px;
  font-weight: 600;
  text-transform: capitalize;
  color: var(--purple);
}
.mod-actions {
  display: flex;
  gap: 3px;
}
.ico {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--panel-3);
  font-size: 11px;
  color: var(--text-dim);
}
.ico:hover {
  color: var(--text);
}
.ico.del:hover {
  color: var(--red);
}
.ico:disabled {
  opacity: 0.3;
}
.xy {
  position: relative;
  height: 110px;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: 8px;
  margin-bottom: 9px;
  cursor: crosshair;
  overflow: hidden;
}
.xy-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 25% 25%;
}
.xy-dot {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--purple);
  box-shadow: 0 0 14px var(--purple);
  transform: translate(-50%, -50%);
}
.xy-lab {
  position: absolute;
  font-size: 8px;
  color: var(--text-mute);
  font-family: var(--mono);
}
.xy-lab.tl {
  top: 4px;
  left: 5px;
}
.xy-lab.bl {
  bottom: 4px;
  left: 5px;
}
.xy-lab.br {
  bottom: 4px;
  right: 5px;
}
.xy-lab.bl2 {
  top: 4px;
  right: 5px;
}
.params {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
}
.param-top {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  margin-bottom: 3px;
}
.param input {
  width: 100%;
}
.val {
  color: var(--text);
}
.add-row {
  position: relative;
}
.add-menu {
  position: absolute;
  bottom: 44px;
  left: 0;
  right: 0;
  background: var(--panel-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  z-index: 20;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
}
.add-item {
  padding: 7px;
  border-radius: 6px;
  font-size: 11px;
  text-transform: capitalize;
  background: var(--panel-2);
  text-align: left;
}
.add-item:hover {
  background: var(--purple);
  color: var(--on-hue);
}
</style>
