<template>
  <span class="crm-help" @click.stop>
    <button
      ref="btn"
      type="button"
      class="crm-help-btn"
      :class="{ 'is-accent': onAccent, 'is-open': open }"
      aria-label="Что это"
      :aria-expanded="open"
      @click.stop="toggle"
    >
      ?
    </button>
    <Teleport v-if="open" to="body">
      <div
        ref="bubble"
        class="crm-help-bubble"
        role="tooltip"
        :style="bubbleStyle"
        @click.stop
      >
        {{ text }}
      </div>
    </Teleport>
  </span>
</template>

<script lang="ts">
let activeHide: (() => void) | null = null;
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{
  text: string;
  onAccent?: boolean;
}>();

const btn = ref<HTMLButtonElement | null>(null);
const bubble = ref<HTMLDivElement | null>(null);
const open = ref(false);
const bubbleStyle = ref<Record<string, string>>({});

function place() {
  const node = btn.value;
  if (!node) return;
  const box = node.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 24);
  let left = box.left;
  if (left + width > window.innerWidth - 12) {
    left = window.innerWidth - width - 12;
  }
  bubbleStyle.value = {
    position: "fixed",
    top: `${box.bottom + 8}px`,
    left: `${Math.max(12, left)}px`,
    width: `${width}px`,
  };
}

function hide() {
  open.value = false;
  if (activeHide === hide) activeHide = null;
}

function toggle() {
  if (open.value) {
    hide();
    return;
  }
  activeHide?.();
  place();
  open.value = true;
  activeHide = hide;
}

function onDoc(event: MouseEvent) {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (btn.value?.contains(target)) return;
  if (bubble.value?.contains(target)) return;
  hide();
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") hide();
}

onMounted(() => {
  document.addEventListener("click", onDoc);
  window.addEventListener("keydown", onKey);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
});

onBeforeUnmount(() => {
  if (activeHide === hide) activeHide = null;
  document.removeEventListener("click", onDoc);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("scroll", hide, true);
  window.removeEventListener("resize", hide);
});
</script>

<style scoped>
.crm-help {
  display: inline-flex;
  flex-shrink: 0;
  vertical-align: middle;
}

.crm-help-btn {
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border-radius: 9999px;
  border: 1px solid #d0d5dd;
  background: #fff;
  color: #667085;
  font: 700 0.7rem/1 ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
}

.crm-help-btn:hover,
.crm-help-btn.is-open {
  border-color: #98a2b3;
  color: #111;
}

.crm-help-btn.is-accent {
  border-color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
</style>

<style>
.crm-help-bubble {
  z-index: 80;
  padding: 0.7rem 0.85rem;
  border-radius: 0.85rem;
  background: #111;
  color: #fff;
  font-size: 0.8125rem;
  line-height: 1.35;
  box-shadow: 0 10px 28px rgba(17, 17, 17, 0.2);
}
</style>
