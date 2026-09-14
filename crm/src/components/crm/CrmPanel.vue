<template>
  <section class="crm-panel crm-animate-in" :class="[className, { 'is-flat': flat }]" :style="delayStyle">
    <header v-if="title || subtitle || help || $slots.header" class="crm-panel__header">
      <div class="crm-panel__titles">
        <div v-if="title || help" class="crm-panel__title-row">
          <h3 v-if="title" class="crm-panel__title">{{ title }}</h3>
          <CrmHelp v-if="help" :text="help" />
        </div>
        <p v-if="subtitle" class="crm-panel__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.header" class="crm-panel__header-actions">
        <slot name="header" />
      </div>
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CrmHelp from "@/components/crm/CrmHelp.vue";

const props = defineProps<{
  className?: string;
  flat?: boolean;
  delay?: number;
  title?: string;
  subtitle?: string;
  help?: string;
}>();

const delayStyle = computed(() =>
  props.delay != null ? { animationDelay: `${props.delay}ms` } : undefined,
);
</script>

<style scoped>
.crm-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.crm-panel__titles {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.crm-panel__title-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.crm-panel__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--crm-text, #111);
}
.crm-panel__subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--crm-text-muted, #667085);
}
.crm-panel__header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
</style>
