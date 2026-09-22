<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" class="text-sm font-semibold text-muted">{{ label }}</label>
    <slot />
    <small v-if="hint" class="text-xs text-muted">{{ hint }}</small>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string;
  hint?: string;
}>();
</script>
