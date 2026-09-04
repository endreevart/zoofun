<template>
  <section class="funnel-columns-wrap crm-panel">
    <div class="funnel-columns-scroll">
      <div class="funnel-columns">
        <template v-for="(step, index) in steps" :key="step.key">
          <div v-if="index > 0" class="funnel-connector" :class="{ 'is-drop': step.drop_pct > 0 }">
            <span v-if="step.drop_pct > 0" class="funnel-connector-drop">−{{ step.drop_pct }}%</span>
            <i class="pi pi-arrow-right funnel-connector-icon" />
          </div>
          <article class="funnel-column" :class="{ 'is-empty': step.count === 0 }">
            <header class="funnel-column-header">
              <span class="funnel-column-num">{{ index + 1 }}</span>
              <h4 class="funnel-column-title">{{ step.label }}</h4>
              <div class="funnel-column-stats">
                <span class="funnel-column-count">{{ step.count.toLocaleString("ru-RU") }}</span>
                <span class="funnel-column-pct">{{ step.pct_of_previous }}%</span>
              </div>
            </header>
            <div class="funnel-column-body">
              <div v-for="(sample, si) in step.samples ?? []" :key="`${step.key}-${sample.id}-${si}`" class="funnel-sample-card">
                <span class="funnel-sample-avatar">{{ initials(sample.title) }}</span>
                <span class="funnel-sample-info">
                  <span class="funnel-sample-name">{{ sample.title }}</span>
                  <span v-if="sample.subtitle" class="funnel-sample-meta">{{ sample.subtitle }}</span>
                  <span v-if="sample.at" class="funnel-sample-date">{{ formatDay(sample.at) }}</span>
                </span>
              </div>
              <div v-if="!step.samples?.length" class="funnel-empty-card">Пока никого</div>
              <div v-else-if="remaining(step) > 0" class="funnel-more">+{{ remaining(step) }} ещё</div>
            </div>
          </article>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { FunnelStep } from "@/lib/api";

defineProps<{ steps: FunnelStep[] }>();

function initials(value: string) {
  const src = value.trim();
  if (!src) return "?";
  return src.slice(0, 2).toUpperCase();
}

function formatDay(ts: number) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString("ru-RU");
}

function remaining(step: FunnelStep) {
  return Math.max(0, (step.samples_total ?? step.count) - (step.samples?.length ?? 0));
}
</script>

<style scoped>
.funnel-columns-wrap {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  height: 100%;
}

.funnel-columns-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
}

.funnel-columns {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 100%;
  min-width: 0;
}

.funnel-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 2.25rem;
  flex-shrink: 0;
}

.funnel-connector-icon {
  font-size: 0.75rem;
  color: var(--crm-muted);
  opacity: 0.6;
}

.funnel-connector.is-drop .funnel-connector-icon,
.funnel-connector-drop {
  color: #f87171;
}

.funnel-connector-drop {
  font-size: 0.625rem;
  font-weight: 700;
}

.funnel-column {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  width: auto;
  height: 100%;
  border-radius: 1.25rem;
  background: #fafafa;
  border: 1px solid #f0f0f0;
}

.funnel-column.is-empty {
  opacity: 0.75;
}

.funnel-column-header {
  padding: 1rem 1rem 0.75rem;
}

.funnel-column-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 9999px;
  background: var(--crm-accent-soft);
  color: var(--crm-accent);
  font-size: 0.6875rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.funnel-column-title {
  margin: 0 0 0.625rem;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.35;
}

.funnel-column-stats {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.funnel-column-count {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

.funnel-column-pct {
  font-size: 0.75rem;
  color: var(--crm-muted);
  font-weight: 600;
}

.funnel-column-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0 0.75rem 0.75rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.funnel-sample-card {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.875rem;
  background: #fff;
  box-shadow: 0 2px 8px rgba(20, 20, 20, 0.05);
}

.funnel-sample-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.625rem;
  background: var(--crm-accent-soft);
  color: var(--crm-accent);
  font-size: 0.6875rem;
  font-weight: 700;
  flex-shrink: 0;
}

.funnel-sample-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.funnel-sample-name,
.funnel-sample-meta,
.funnel-sample-date {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.funnel-sample-name {
  font-size: 0.8125rem;
  font-weight: 600;
}

.funnel-sample-meta,
.funnel-sample-date,
.funnel-more,
.funnel-empty-card {
  font-size: 0.6875rem;
  color: var(--crm-muted);
}

.funnel-empty-card {
  padding: 1rem;
  border: 1px dashed #e5e5e5;
  border-radius: 0.875rem;
  text-align: center;
  font-size: 0.8125rem;
}

.funnel-more {
  font-weight: 600;
  color: var(--crm-accent);
  text-align: center;
}

@media (max-width: 767px) {
  .funnel-columns-scroll {
    overflow-x: auto;
  }

  .funnel-columns {
    width: auto;
    min-width: min-content;
  }

  .funnel-column {
    flex: 0 0 12rem;
    width: 12rem;
  }
}
</style>
