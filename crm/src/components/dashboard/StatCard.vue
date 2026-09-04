<template>
  <div class="crm-stat crm-animate-in" :class="{ 'is-highlight': highlight, 'is-clickable': clickable }" :style="delayStyle" @click="$emit('click')">
    <div class="flex items-start gap-2 relative z-[1] w-full">
      <span class="crm-stat-label">{{ label }}</span>
      <div v-if="icon" class="crm-stat-icon ml-auto">
        <i :class="icon" />
      </div>
    </div>
    <div class="crm-stat-value relative z-[1]">{{ value }}</div>
    <div v-if="hint" class="crm-stat-hint relative z-[1]">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
  highlight?: boolean;
  clickable?: boolean;
  delay?: number;
}>();

defineEmits<{ click: [] }>();

const delayStyle = computed(() => (props.delay != null ? { animationDelay: `${props.delay}ms` } : undefined));
</script>
