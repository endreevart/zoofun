<template>
  <div v-if="loading" class="flex flex-col gap-4">
    <div class="crm-skeleton h-24" />
    <div class="crm-skeleton h-48" />
  </div>
</template>

<script setup lang="ts">
defineProps<{ loading: boolean }>();
</script>
