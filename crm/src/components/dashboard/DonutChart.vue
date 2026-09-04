<template>
  <section class="crm-panel crm-chart-panel crm-animate-in" :style="delayStyle">
    <div class="flex items-center justify-between mb-4 gap-3">
      <h3 class="text-base font-semibold m-0 text-ink">{{ title }}</h3>
      <span v-if="centerLabel" class="text-xs text-muted font-medium">{{ centerLabel }}</span>
    </div>
    <div class="flex flex-col md:flex-row items-center gap-4">
      <div class="relative w-full max-w-[220px] md:w-[180px] lg:w-[220px] aspect-square shrink-0 chart-enter">
        <Chart type="doughnut" :data="chartData" :options="options" class="h-full w-full" />
      </div>
      <ul v-if="showLegend" class="donut-legend flex-1 w-full m-0 p-0 list-none">
        <li v-for="(slice, i) in slices" :key="slice.label" class="donut-legend-item">
          <span class="donut-legend-dot" :style="{ background: colors[i] }" />
          <span class="donut-legend-label">{{ slice.label }}</span>
          <span class="donut-legend-value">{{ slice.value.toLocaleString('ru-RU') }}</span>
          <span class="donut-legend-pct">{{ pct(slice.value) }}%</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Chart from 'primevue/chart'
import { chartAnimation, chartTooltip, donutColors } from '@/lib/chart-theme'

export interface DonutSlice {
  label: string
  value: number
}

const props = withDefaults(
  defineProps<{
    title: string
    slices: DonutSlice[]
    delay?: number
    centerLabel?: string
    showLegend?: boolean
    cutout?: string
  }>(),
  {
    showLegend: true,
    cutout: '68%',
  },
)

const delayStyle = computed(() =>
  props.delay != null ? { animationDelay: `${props.delay}ms` } : undefined,
)

const total = computed(() => props.slices.reduce((s, x) => s + x.value, 0) || 1)
const colors = computed(() => donutColors(props.slices.length))

const chartData = computed(() => ({
  labels: props.slices.map((s) => s.label),
  datasets: [
    {
      data: props.slices.map((s) => s.value),
      backgroundColor: colors.value,
      borderWidth: 0,
      hoverOffset: 8,
    },
  ],
}))

const options = computed(() => ({
  maintainAspectRatio: false,
  cutout: props.cutout,
  animation: {
    ...chartAnimation,
    animateRotate: true,
    animateScale: true,
  },
  plugins: {
    legend: { display: false },
    tooltip: chartTooltip,
  },
}))

function pct(v: number) {
  return total.value ? Math.round((v / total.value) * 100) : 0
}
</script>

<style scoped>
.chart-enter {
  animation: donut-pop 0.65s ease-out both;
  animation-delay: inherit;
}

@keyframes donut-pop {
  from {
    opacity: 0;
    transform: scale(0.88) rotate(-8deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

.donut-legend-item {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  gap: 0.5rem 0.75rem;
  align-items: center;
  padding: 0.4rem 0;
  border-bottom: 1px solid #f5f5f5;
  font-size: 0.8125rem;
  animation: crm-fade-in-up 0.4s ease-out both;
}

.donut-legend-item:nth-child(1) { animation-delay: 80ms; }
.donut-legend-item:nth-child(2) { animation-delay: 130ms; }
.donut-legend-item:nth-child(3) { animation-delay: 180ms; }
.donut-legend-item:nth-child(4) { animation-delay: 230ms; }
.donut-legend-item:nth-child(5) { animation-delay: 280ms; }
.donut-legend-item:nth-child(6) { animation-delay: 330ms; }

.donut-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
}

.donut-legend-label {
  color: var(--crm-ink, #141414);
  font-weight: 500;
}

.donut-legend-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.donut-legend-pct {
  color: var(--crm-muted, #8a8a8a);
  font-size: 0.75rem;
  min-width: 2.5rem;
  text-align: right;
}
</style>
