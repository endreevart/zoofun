<template>
  <header class="crm-page-header crm-animate-in">
    <div>
      <h1 class="crm-page-title">
        {{ title }}<span v-if="count != null" class="crm-page-title-count"> ({{ count }})</span>
      </h1>
      <p v-if="subtitle" class="crm-page-subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  /** Total items in the current list view — shown as «Title (N)». */
  count?: number | null
}>()
</script>
