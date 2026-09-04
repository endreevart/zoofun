<template>
  <section class="crm-panel crm-chart-panel crm-animate-in" :style="delayStyle">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-base font-semibold m-0 text-ink">{{ title }}</h3>
    </div>
    <Chart type="line" :data="chartData" :options="options" class="h-56 chart-enter" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Chart from 'primevue/chart'
import {
  CRM_CHART_ACCENT,
  CRM_CHART_ACCENT_FILL,
  chartAnimation,
  chartTooltipConfig,
  chartXLabel,
} from '@/lib/chart-theme'

const props = defineProps<{
  title: string
  points: { date: string; count: number }[]
  delay?: number
  fill?: boolean
  /** Tooltip suffix, e.g. "событий" → "9 событий" with hour in title */
  tooltipValueLabel?: string
  /** Override series name in tooltip body */
  tooltipSeriesLabel?: string
}>()

const delayStyle = computed(() =>
  props.delay != null ? { animationDelay: `${props.delay}ms` } : undefined,
)

const chartData = computed(() => ({
  labels: props.points.map((p) => chartXLabel(p.date)),
  datasets: [
    {
      label: props.title,
      data: props.points.map((p) => p.count),
      borderColor: CRM_CHART_ACCENT,
      backgroundColor: props.fill !== false ? CRM_CHART_ACCENT_FILL : 'transparent',
      fill: props.fill !== false,
      tension: 0.38,
      borderWidth: 2.5,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: '#fff',
      pointBorderColor: CRM_CHART_ACCENT,
      pointBorderWidth: 2,
    },
  ],
}))

const options = computed(() => ({
  maintainAspectRatio: false,
  animation: chartAnimation,
  interaction: { intersect: false, mode: 'index' as const },
  plugins: {
    legend: { display: false },
    tooltip: chartTooltipConfig({
      valueLabel: props.tooltipValueLabel,
      seriesLabel: props.tooltipSeriesLabel,
    }),
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#8A8A8A', font: { size: 11 }, maxRotation: 0 },
    },
    y: {
      beginAtZero: true,
      grid: { color: '#F0F0F0' },
      ticks: { precision: 0, color: '#8A8A8A', font: { size: 11 } },
    },
  },
}))
</script>

<style scoped>
.chart-enter {
  animation: line-draw 0.7s ease-out both;
  animation-delay: inherit;
}

@keyframes line-draw {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
