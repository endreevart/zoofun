/** Shared Chart.js palette for CRM dashboards. */
export const CRM_CHART_COLORS = [
  'rgba(255, 87, 34, 0.92)',
  'rgba(255, 138, 101, 0.88)',
  'rgba(255, 183, 77, 0.88)',
  'rgba(20, 20, 20, 0.75)',
  'rgba(138, 138, 138, 0.65)',
  'rgba(255, 87, 34, 0.35)',
]

export const CRM_CHART_ACCENT = 'rgba(255, 87, 34, 0.85)'
export const CRM_CHART_ACCENT_FILL = 'rgba(255, 87, 34, 0.12)'

export function chartXLabel(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(5)
  return date
}

export const chartTooltip = {
  backgroundColor: '#141414',
  cornerRadius: 12,
  padding: 12,
  titleFont: { size: 12, weight: '600' as const },
  bodyFont: { size: 12 },
}

/** Tooltip with explicit x-axis title and optional value suffix (e.g. "событий"). */
export function chartTooltipConfig(opts?: {
  valueLabel?: string
  seriesLabel?: string
}) {
  return {
    ...chartTooltip,
    callbacks: {
      title: (items: { label?: string }[]) => items[0]?.label ?? '',
      label: (ctx: { parsed: { y: number }; dataset: { label?: string } }) => {
        const val = ctx.parsed.y.toLocaleString('ru-RU')
        if (opts?.valueLabel) return `${val} ${opts.valueLabel}`
        const name = opts?.seriesLabel ?? ctx.dataset.label ?? 'Значение'
        return `${name}: ${val}`
      },
    },
  }
}

export const chartAnimation = {
  duration: 900,
  easing: 'easeOutQuart' as const,
}

export function donutColors(n: number): string[] {
  return Array.from({ length: n }, (_, i) => CRM_CHART_COLORS[i % CRM_CHART_COLORS.length])
}
