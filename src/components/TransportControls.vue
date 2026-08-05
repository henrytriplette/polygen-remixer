<script setup lang="ts">
import { state, togglePlay, stop, setLoop, toggleMetronome } from '../store';
</script>

<template>
  <div class="transport panel">
    <div class="left">
      <div class="display">
        <span class="disp-label">Position</span>
        <span class="pos dot-matrix" :class="{ live: state.playing }">
          {{ String(Math.floor(Math.max(0, state.currentStep) / 16) + 1).padStart(2, '0') }}.{{
            String((Math.max(0, state.currentStep) % 16) + 1).padStart(2, '0')
          }}
        </span>
      </div>
    </div>

    <div class="center">
      <button class="tbtn" title="To start" aria-label="Return to start" @click="stop">◄◄</button>
      <button
        class="tbtn play"
        :class="{ playing: state.playing }"
        :aria-label="state.playing ? 'Pause' : 'Play'"
        @click="togglePlay"
      >
        {{ state.playing ? '❚❚' : '▶' }}
      </button>
      <button class="tbtn" title="Stop" aria-label="Stop" @click="stop">■</button>
      <button
        class="tbtn loop"
        :class="{ on: state.loop }"
        title="Loop"
        aria-label="Loop playback"
        :aria-pressed="state.loop"
        @click="setLoop(!state.loop)"
      >
        ↻
      </button>
      <button
        class="tbtn metro"
        :class="{ on: state.metronome }"
        title="Metronome"
        aria-label="Metronome"
        :aria-pressed="state.metronome"
        @click="toggleMetronome"
      >
        ⏱
      </button>
    </div>

    <div class="right">
      <span class="hint dim">SPACE — PLAY / STOP</span>
      <div class="display right-disp">
        <span class="disp-label">Tempo</span>
        <span class="bpm-disp">
          <span class="bpm-num dot-matrix">{{ state.bpm }}</span>
          <span class="bpm-unit">BPM</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.transport {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  gap: 16px;
}
.left,
.right {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}
.right {
  justify-content: flex-end;
}
.display {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.right-disp {
  align-items: flex-end;
}
.disp-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-mute);
  font-weight: 600;
}
.pos {
  font-size: 26px;
  line-height: 0.9;
  color: var(--text);
}
.pos.live {
  color: var(--green);
}
.bpm-disp {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.bpm-num {
  font-size: 24px;
  line-height: 0.9;
  color: var(--text);
}
.bpm-unit {
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--text-mute);
  font-weight: 600;
}
.center {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tbtn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 13px;
  display: grid;
  place-items: center;
  transition: 0.12s;
}
.tbtn:hover {
  background: var(--panel-3);
  border-color: var(--line-strong);
}
/* PLAY — neutral outline at rest, red + pulsing while live (tracker pattern) */
.tbtn.play {
  width: 56px;
  height: 44px;
  border-radius: var(--radius-pill);
  background: transparent;
  border-color: var(--line-strong);
  color: var(--text-bright);
  font-size: 16px;
}
.tbtn.play:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.tbtn.play.playing {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  animation: play-pulse 1.4s ease-in-out infinite;
}
@keyframes play-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 1px var(--accent), 0 0 8px var(--accent-glow);
  }
  50% {
    box-shadow: 0 0 0 1px var(--accent), 0 0 18px var(--accent-glow);
  }
}
.tbtn.loop.on {
  color: var(--accent);
  border-color: var(--accent);
}
.tbtn.metro.on {
  color: var(--accent);
  border-color: var(--accent);
}
.hint {
  font-size: 9px;
  font-family: var(--mono);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

@media (max-width: 820px) {
  .transport {
    padding: 8px 10px;
    gap: 5px;
  }
  .left,
  .right {
    min-width: 0;
  }
  .left {
    flex: 0 1 54px;
  }
  .right {
    flex: 0 1 38px;
  }
  .hint {
    display: none;
  }
  .disp-label {
    display: none;
  }
  .pos {
    font-size: 20px;
  }
  .bpm-num {
    font-size: 18px;
  }
  .bpm-unit {
    display: none;
  }
  .center {
    gap: 6px;
  }
  .tbtn {
    width: 40px;
    height: 40px;
  }
  .tbtn.play {
    width: 52px;
    height: 42px;
  }
}
</style>
