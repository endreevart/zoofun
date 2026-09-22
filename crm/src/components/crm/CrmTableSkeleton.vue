<template>
  <div class="flex flex-col gap-3 py-2">
    <div v-for="i in rows" :key="i" class="crm-skeleton h-10 rounded-2xl" :style="{ animationDelay: `${i * 80}ms` }" />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number;
  }>(),
  { rows: 6 },
);
</script>
