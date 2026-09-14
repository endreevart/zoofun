<template>
  <nav v-if="total > rows" class="crm-pager" aria-label="Страницы">
    <button
      type="button"
      class="crm-pager-btn"
      :disabled="offset <= 0"
      @click="go(offset - rows)"
    >
      Назад
    </button>
    <p class="crm-pager-status">{{ from }}–{{ to }} из {{ totalLabel }}</p>
    <button
      type="button"
      class="crm-pager-btn"
      :disabled="offset + rows >= total"
      @click="go(offset + rows)"
    >
      Дальше
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  total: number;
  rows: number;
  offset: number;
}>();

const emit = defineEmits<{ "update:offset": [value: number] }>();

const from = computed(() => (props.total === 0 ? 0 : props.offset + 1));
const to = computed(() => Math.min(props.offset + props.rows, props.total));
const totalLabel = computed(() => props.total.toLocaleString("ru-RU"));

function go(next: number) {
  const clamped = Math.max(0, Math.min(next, Math.max(0, props.total - 1)));
  const aligned = Math.floor(clamped / props.rows) * props.rows;
  if (aligned !== props.offset) emit("update:offset", aligned);
}
</script>

<style scoped>
.crm-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.crm-pager-status {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--crm-muted);
}

.crm-pager-btn {
  border: none;
  border-radius: 9999px;
  padding: 0.45rem 1rem;
  background: #fff;
  color: var(--crm-ink);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  box-shadow: var(--crm-shadow);
  cursor: pointer;
}

.crm-pager-btn:disabled {
  opacity: 0.4;
  cursor: default;
  box-shadow: none;
}

.crm-pager-btn:not(:disabled):hover {
  background: var(--crm-accent-soft);
  color: var(--crm-accent);
}
</style>
