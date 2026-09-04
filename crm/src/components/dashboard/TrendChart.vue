<template>
  <section class="crm-panel crm-chart-panel crm-animate-in" :style="delayStyle">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-base font-semibold m-0 text-ink">{{ title }}</h3>
    </div>
    <Chart type="bar" :data="chartData" :options="options" class="h-56 chart-enter" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Chart from 'primevue/chart'
import { CRM_CHART_ACCENT, chartAnimation, chartTooltip, chartXLabel } from '@/lib/chart-theme'

const props = defineProps<{
  title: string
  points: { date: string; count: number }[]
  delay?: number
  horizontal?: boolean
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
      backgroundColor: CRM_CHART_ACCENT,
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: props.horizontal ? 22 : 28,
    },
  ],
}))

const options = computed(() => ({
  indexAxis: props.horizontal ? ('y' as const) : ('x' as const),
  maintainAspectRatio: false,
  animation: chartAnimation,
  plugins: {
    legend: { display: false },
    tooltip: chartTooltip,
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: { display: props.horizontal, color: '#F0F0F0' },
      ticks: { color: '#8A8A8A', font: { size: 11 }, maxRotation: 0 },
    },
    y: {
      beginAtZero: true,
      grid: { display: !props.horizontal, color: '#F0F0F0' },
      ticks: { precision: 0, color: '#8A8A8A', font: { size: 11 } },
    },
  },
}))
</script>

<style scoped>
.chart-enter {
  animation: chart-grow 0.65s ease-out both;
  animation-delay: inherit;
}

@keyframes chart-grow {
  from {
    opacity: 0;
    transform: scaleY(0.92);
    transform-origin: bottom;
  }
  to {
    opacity: 1;
    transform: scaleY(1);
  }
}
</style>
