<script setup lang="ts">
import {
  state,
  toggleStep,
  toggleAccent,
  setStepVelocity,
  setStepProb,
  setDrumPreset,
  auditionDrum,
} from '../store';
import { DRUM_LIBRARY } from '../audio/drums';
import type { DrumVoice } from '../audio/drums';

const VOICE_ACCENT: Record<string, string> = {
  kick: 'var(--orange)',
  snare: 'var(--cyan)',
  hat: 'var(--purple)',
  clap: 'var(--green)',
};

const libraryVoices = Object.keys(DRUM_LIBRARY) as DrumVoice[];

function stepClick(e: MouseEvent, trackId: string, i: number) {
  if (e.shiftKey) toggleAccent(trackId, i);
  else toggleStep(trackId, i);
}
function stepContext(e: MouseEvent, trackId: string, i: number) {
  e.preventDefault();
  const t = state.drums.find((d) => d.id === trackId)!;
  // cycle velocity through 3 levels on right-click
  const cur = t.steps[i].velocity;
  const next = cur > 0.85 ? 0.5 : cur > 0.45 ? 0.25 : 1;
  setStepVelocity(trackId, i, next);
  if (!t.steps[i].on) toggleStep(trackId, i);
}
function stepDbl(trackId: string, i: number) {
  const t = state.drums.find((d) => d.id === trackId)!;
  const next = t.steps[i].prob >= 1 ? 0.5 : t.steps[i].prob >= 0.5 ? 0.25 : 1;
  setStepProb(trackId, i, next);
}

</script>

<template>
  <section class="seq panel">
    <div class="library">
      <span class="label">Drum Library</span>
      <div class="lib-scroll">
        <div v-for="voice in libraryVoices" :key="voice" class="lib-group">
          <div class="lib-title mono">{{ voice }}s</div>
          <button
            v-for="p in DRUM_LIBRARY[voice]"
            :key="p.id"
            class="lib-item"
            draggable="true"
            @click="auditionDrum(voice, p.id)"
            @dragstart="$event.dataTransfer?.setData('preset', JSON.stringify({ voice, id: p.id }))"
          >
            <span class="pulse-dot" :style="{ background: VOICE_ACCENT[voice] || 'var(--text-dim)' }" />
            {{ p.name }}
          </button>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="grid-head">
        <span class="label">16-Step Sequencer</span>
        <span class="hint dim mono">
          click toggle · right-click velocity · shift+click accent · dbl-click probability
        </span>
      </div>

      <div class="rows">
        <div v-for="track in state.drums" :key="track.id" class="row">
          <div class="track-head">
            <span
              class="track-name"
              :style="{ color: VOICE_ACCENT[track.voice] }"
              >{{ track.name }}</span
            >
            <select
              class="preset-select mono"
              :value="track.presetId"
              @change="setDrumPreset(track.id, ($event.target as HTMLSelectElement).value)"
              @drop.prevent="
                (() => {
                  const d = $event.dataTransfer?.getData('preset');
                  if (d) setDrumPreset(track.id, JSON.parse(d).id);
                })()
              "
              @dragover.prevent
            >
              <option v-for="p in DRUM_LIBRARY[track.voice]" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>

          <div class="steps">
            <button
              v-for="(st, i) in track.steps"
              :key="i"
              class="step"
              :class="{
                on: st.on,
                accent: st.accent,
                beat: i % 4 === 0,
                bar: i % 16 === 0 && i > 0,
                playing: state.currentStep === i,
              }"
              :style="
                st.on
                  ? {
                      background: VOICE_ACCENT[track.voice],
                      opacity: 0.35 + st.velocity * 0.65,
                    }
                  : {}
              "
              @click="stepClick($event, track.id, i)"
              @contextmenu="stepContext($event, track.id, i)"
              @dblclick="stepDbl(track.id, i)"
            >
              <span v-if="st.on && st.prob < 1" class="prob mono">{{ Math.round(st.prob * 100) }}</span>
              <span v-if="st.accent" class="acc">▲</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.seq {
  display: grid;
  grid-template-columns: 168px 1fr;
  min-height: 0;
  overflow: hidden;
}
.library {
  border-right: 1px solid var(--line);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.lib-scroll {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
}
.lib-title {
  font-size: 9px;
  text-transform: uppercase;
  color: var(--text-mute);
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.lib-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 9px;
  border-radius: 7px;
  background: var(--panel-2);
  font-size: 11px;
  text-align: left;
  margin-bottom: 3px;
  border: 1px solid transparent;
  transition: 0.12s;
}
.lib-item:hover {
  background: var(--panel-3);
  border-color: var(--line-strong);
}
.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.grid {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  overflow-x: auto;
}
.grid-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.hint {
  font-size: 9.5px;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.track-head {
  width: 132px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.track-name {
  font-size: 12px;
  font-weight: 600;
}
.preset-select {
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 10px;
  padding: 3px 5px;
  outline: none;
}
.steps {
  display: flex;
  gap: 5px;
}
.step {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  position: relative;
  transition: transform 0.08s, background 0.1s;
  flex-shrink: 0;
}
.step.beat {
  background: var(--panel-3);
}
.step.bar {
  margin-left: 10px;
}
.step:hover {
  border-color: var(--line-strong);
}
.step.on {
  border-color: transparent;
  box-shadow: 0 0 10px color-mix(in srgb, var(--text) 12%, transparent);
}
.step.playing {
  outline: 2px solid color-mix(in srgb, var(--text-bright) 55%, transparent);
  outline-offset: 1px;
}
.step.playing.on {
  animation: pop 0.18s ease;
}
.step .acc {
  position: absolute;
  top: -1px;
  right: 2px;
  font-size: 7px;
  color: var(--on-hue);
}
.step .prob {
  font-size: 8px;
  color: var(--on-hue);
  font-weight: 700;
}
</style>
