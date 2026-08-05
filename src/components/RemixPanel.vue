<script setup lang="ts">
import { state } from '../store';
import { REMIX_ACTIONS } from '../remix';
</script>

<template>
  <aside class="remix panel" :class="{ collapsed: !state.remixOpen }">
    <button class="toggle" @click="state.remixOpen = !state.remixOpen">
      {{ state.remixOpen ? '›' : '✨' }}
    </button>

    <div v-if="state.remixOpen" class="body">
      <div class="rhead">
        <span class="title">✨ Remix Suggestions</span>
        <span class="sub dim">non-destructive · one click to try, undo to revert</span>
      </div>
      <div class="actions">
        <button
          v-for="a in REMIX_ACTIONS"
          :key="a.label"
          class="remix-btn"
          @click="a.run()"
        >
          {{ a.label }}
          <span class="arrow">→</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.remix {
  width: 232px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  transition: width 0.2s ease;
  flex-shrink: 0;
}
.remix.collapsed {
  width: 44px;
  padding: 8px;
  align-items: center;
}
.toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--panel-3);
  font-size: 14px;
  z-index: 2;
}
.remix.collapsed .toggle {
  position: static;
}
.rhead {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 30px;
}
.title {
  font-size: 13px;
  font-weight: 600;
  color: var(--purple);
}
.sub {
  font-size: 10px;
  line-height: 1.4;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow-y: auto;
}
.remix-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 13px;
  border-radius: 10px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  transition: 0.14s;
}
.remix-btn:hover {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--purple) 18%, transparent),
    var(--panel-3)
  );
  border-color: var(--purple);
  transform: translateX(2px);
}
.arrow {
  color: var(--purple);
  opacity: 0;
  transition: 0.14s;
}
.remix-btn:hover .arrow {
  opacity: 1;
}

@media (max-width: 820px) {
  /* full-width section below the studio column, not a side rail */
  .remix,
  .remix.collapsed {
    width: 100%;
    flex-shrink: 1;
  }
  .remix.collapsed {
    padding: 10px 14px;
    align-items: stretch;
    flex-direction: row;
    justify-content: flex-end;
  }
  /* the two-line actions become a 2-col grid so they don't run too tall */
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    overflow: visible;
  }
  .arrow {
    opacity: 1;
  }
}
</style>
