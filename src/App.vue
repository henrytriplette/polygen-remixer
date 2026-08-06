<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import TopToolbar from './components/TopToolbar.vue';
import SampleEditor from './components/SampleEditor.vue';
import BeatSequencer from './components/BeatSequencer.vue';
import SampleSequencer from './components/SampleSequencer.vue';
import PianoRoll from './components/PianoRoll.vue';
import EffectsRack from './components/EffectsRack.vue';
import Mixer from './components/Mixer.vue';
import TransportControls from './components/TransportControls.vue';
import RemixPanel from './components/RemixPanel.vue';
import PerformanceMode from './components/PerformanceMode.vue';
import {
  state,
  togglePlay,
  pollMeters,
  triggerChop,
  triggerDrumPad,
  CHOP_PAD_KEYS,
  DRUM_PAD_KEYS,
} from './store';

const workspaces = [
  { key: 'beat' as const, label: 'Beat', accent: 'var(--orange)' },
  { key: 'chops' as const, label: 'Chops', accent: 'var(--cyan)' },
  { key: 'melody' as const, label: 'Melody', accent: 'var(--green)' },
  { key: 'effects' as const, label: 'Effects', accent: 'var(--purple)' },
  { key: 'mix' as const, label: 'Mix', accent: 'var(--cyan)' },
];

// keyboard: space transport, pad keys for performance / quick audition
const chopKeyIndex: Record<string, number> = Object.fromEntries(
  CHOP_PAD_KEYS.map((k, i) => [k, i]),
);
const drumKeyIndex: Record<string, number> = Object.fromEntries(
  DRUM_PAD_KEYS.map((k, i) => [k, i]),
);

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
    return;
  }
  const k = e.key.toLowerCase();
  if (k in chopKeyIndex) triggerChop(chopKeyIndex[k]);
  else if (k in drumKeyIndex) triggerDrumPad(drumKeyIndex[k]);
}

let raf = 0;
function meterLoop() {
  pollMeters();
  raf = requestAnimationFrame(meterLoop);
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(meterLoop);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="app">
    <TopToolbar />

    <div class="tabs">
      <div class="tab-group">
        <button
          class="tab"
          :class="{ active: state.view === 'studio' }"
          @click="state.view = 'studio'"
        >
          Studio
        </button>
        <button
          class="tab"
          :class="{ active: state.view === 'perform' }"
          @click="state.view = 'perform'"
        >
          Perform
        </button>
      </div>
      <div class="timeline">
        <span
          v-for="b in state.bars * 4"
          :key="b"
          class="tl-tick"
          :class="{ on: Math.floor(Math.max(0, state.currentStep) / 4) === b - 1 && state.playing }"
          >{{ b }}</span
        >
      </div>
    </div>

    <div class="stage">
      <template v-if="state.view === 'studio'">
        <div class="main">
          <SampleEditor class="hero" />

          <div class="workspace-bar">
            <div class="ws-tabs">
              <button
                v-for="w in workspaces"
                :key="w.key"
                class="ws-tab"
                :class="{ active: state.workspace === w.key }"
                :style="state.workspace === w.key ? { borderColor: w.accent, color: w.accent } : {}"
                @click="state.workspace = w.key"
              >
                <span class="ws-dot" :style="{ background: w.accent }" />
                {{ w.label }}
              </button>
            </div>
          </div>

          <div class="workspace">
            <BeatSequencer v-if="state.workspace === 'beat'" />
            <SampleSequencer v-else-if="state.workspace === 'chops'" />
            <PianoRoll v-else-if="state.workspace === 'melody'" />
            <EffectsRack v-else-if="state.workspace === 'effects'" />
            <Mixer v-else />
          </div>
        </div>
      </template>
      <template v-else>
        <PerformanceMode />
      </template>

      <RemixPanel />
    </div>

    <TransportControls />

    <transition name="toast">
      <div v-if="state.toast" class="toast mono">{{ state.toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 4px;
}
.tab-group {
  display: flex;
  gap: 4px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 3px;
}
.tab {
  padding: 6px 18px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
}
.tab.active {
  background: var(--panel-3);
  color: var(--text);
}
.timeline {
  flex: 1;
  display: flex;
  gap: 3px;
  overflow: hidden;
}
.tl-tick {
  flex: 1;
  height: 20px;
  border-radius: 4px;
  background: var(--panel);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  font-size: 9px;
  color: var(--text-mute);
  font-family: var(--mono);
  min-width: 18px;
}
.tl-tick.on {
  background: var(--green);
  color: var(--on-hue);
  border-color: var(--green);
}
.stage {
  flex: 1;
  display: flex;
  gap: 8px;
  min-height: 0;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
}
.hero {
  flex: 4 1 0;
  min-height: 200px;
}
.workspace-bar {
  display: flex;
  align-items: center;
}
.ws-tabs {
  display: flex;
  gap: 4px;
  width: 100%;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 3px;
}
.ws-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  border: 1px solid transparent;
  transition: 0.12s;
}
.ws-tab:hover {
  color: var(--text);
}
.ws-tab.active {
  background: var(--panel-3);
}
.ws-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  opacity: 0.9;
}
.workspace {
  flex: 6 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.workspace > section {
  flex: 1;
  min-height: 0;
}
.toast {
  position: fixed;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--panel-3);
  border: 1px solid var(--line-strong);
  padding: 10px 20px;
  border-radius: 100px;
  font-size: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  z-index: 100;
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* ---- Mobile: scrolling, single-column layout with a pinned transport ---- */
@media (max-width: 820px) {
  .app {
    height: auto;
    min-height: 100dvh;
    padding: 6px;
    gap: 6px;
  }
  .tabs {
    flex-wrap: wrap;
    gap: 8px;
  }
  /* the decorative bar-tick timeline is noise on a phone */
  .timeline {
    display: none;
  }
  .stage {
    flex-direction: column;
    min-height: 0;
  }
  .main {
    overflow: visible;
  }
  /* natural heights instead of viewport-proportional flex */
  .hero {
    flex: none;
    min-height: 260px;
  }
  .workspace {
    flex: none;
    min-height: 340px;
  }
  .ws-tabs {
    gap: 2px;
  }
  .ws-tab {
    min-width: 0;
    gap: 4px;
    padding: 8px 3px;
  }
  .ws-dot {
    width: 5px;
    height: 5px;
  }
  .workspace > section {
    flex: none;
  }
  /* keep play/stop reachable while the page scrolls */
  .transport {
    position: sticky;
    bottom: 6px;
    z-index: 40;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
  .toast {
    bottom: 88px;
  }
}
</style>
