import { onMounted, ref, watch, type Ref } from 'vue'

/** Smooth count-up for numeric stat values. */
export function useAnimatedNumber(source: Ref<string | number>, duration = 700) {
  const display = ref<string | number>(source.value)

  function animateTo(target: number) {
    const start = typeof display.value === 'number' ? display.value : 0
    if (start === target) {
      display.value = target
      return
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - (1 - p) ** 3
      display.value = Math.round(start + (target - start) * eased)
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  watch(
    source,
    (v) => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        animateTo(v)
      } else {
        display.value = v
      }
    },
    { immediate: true },
  )

  onMounted(() => {
    const v = source.value
    if (typeof v === 'number') animateTo(v)
  })

  return display
}
