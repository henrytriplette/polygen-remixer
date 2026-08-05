<script setup lang="ts">
import {
  state,
  setChannelVolume,
  setChannelPan,
  toggleMute,
  toggleSolo,
} from '../store';
</script>

<template>
  <section class="mixer panel">
    <span class="label">Mixer</span>
    <div class="strips">
      <div v-for="c in state.channels" :key="c.key" class="strip">
        <div class="strip-name" :style="{ color: c.accent }">{{ c.name }}</div>

        <div class="fader-area">
          <div class="meter">
            <div
              class="meter-fill"
              :style="{
                height: Math.min(100, c.meter * 130) + '%',
                background: c.accent,
              }"
            />
          </div>
          <input
            class="fader"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="c.volume"
            @input="setChannelVolume(c.key, +($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="pan">
          <span class="pan-lab mono">{{
            c.pan === 0 ? 'C' : c.pan < 0 ? 'L' + Math.round(-c.pan * 100) : 'R' + Math.round(c.pan * 100)
          }}</span>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.02"
            :value="c.pan"
            @input="setChannelPan(c.key, +($event.target as HTMLInputElement).value)"
          />
        </div>

        <div class="ms">
          <button
            class="ms-btn"
            :class="{ on: c.muted }"
            @click="toggleMute(c.key)"
          >
            M
          </button>
          <button
            class="ms-btn solo"
            :class="{ on: c.soloed }"
            @click="toggleSolo(c.key)"
          >
            S
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mixer {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.strips {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex: 1;
  min-height: 0;
}
.strip {
  flex: 1 1 0;
  max-width: 190px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.strip-name {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.fader-area {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}
.meter {
  position: absolute;
  top: 0;
  bottom: 0;
  right: calc(50% + 13px);
  width: 6px;
  height: 100%;
  background: var(--well);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}
.meter-fill {
  width: 100%;
  border-radius: 4px;
  transition: height 0.05s linear;
}
.fader {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 20px;
  height: 100%;
}
.fader::-webkit-slider-runnable-track {
  width: 4px;
}
.pan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 100%;
}
.pan input {
  width: 100%;
}
.pan-lab {
  font-size: 9px;
  color: var(--text-mute);
}
.ms {
  display: flex;
  gap: 6px;
}
.ms-btn {
  width: 26px;
  height: 24px;
  border-radius: 6px;
  background: var(--panel-3);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  border: 1px solid transparent;
}
.ms-btn.on {
  background: var(--red);
  color: var(--on-accent);
}
.ms-btn.solo.on {
  background: var(--green);
  color: var(--on-hue);
}

@media (max-width: 820px) {
  /* four strips shrink to share the width instead of overflowing */
  .strips {
    gap: 6px;
    justify-content: space-between;
  }
  .strip {
    max-width: none;
    min-width: 0;
    padding: 10px 4px;
  }
  .ms-btn {
    width: 24px;
    height: 26px;
  }
}
</style>
