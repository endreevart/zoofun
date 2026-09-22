<template>
  <div class="flex flex-col items-center justify-center py-12 px-4 text-center crm-animate-in">
    <div class="w-14 h-14 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mb-4">
      <i :class="icon" class="text-2xl" />
    </div>
    <h3 class="text-base font-semibold m-0 mb-1">{{ title }}</h3>
    <p v-if="description" class="text-sm text-muted m-0 mb-4 max-w-sm">{{ description }}</p>
    <Button v-if="actionLabel" :label="actionLabel" icon="pi pi-plus" rounded severity="contrast" @click="$emit('action')" />
  </div>
</template>

<script setup lang="ts">
import Button from "primevue/button";

withDefaults(
  defineProps<{
    icon?: string;
    title: string;
    description?: string;
    actionLabel?: string;
  }>(),
  { icon: "pi pi-inbox" },
);

defineEmits<{ action: [] }>();
</script>
