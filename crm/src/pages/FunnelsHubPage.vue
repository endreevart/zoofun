<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Воронки"
      subtitle="Привлечение, активация, деньги, удержание"
      help="Ступени из наших данных: сайт, сад и оплаты. Кнопка «играть» на сайте — это не заход в сад."
    />
    <CrmBusy :loading="!data" />

    <div v-if="data" class="crm-grid-bento-3 crm-stagger">
      <StatCard highlight icon="pi pi-filter" label="Всего воронок" :value="data.cards.total_funnels" help="Сколько воронок в каталоге. Это не число людей." :delay="0" />
      <StatCard icon="pi pi-check-circle" label="В норме" :value="data.cards.healthy" help="Воронки, где между шагами теряем немного." :delay="40" />
      <StatCard icon="pi pi-exclamation-triangle" label="Внимание" :value="data.cards.attention" help="Теряем заметно, но не все. Смотреть шаг, где уходят." :delay="80" />
      <StatCard icon="pi pi-times-circle" label="Критично" :value="data.cards.critical" help="Почти все уходят на одном шаге. Сначала проверить, не врёт ли учёт." :delay="120" />
      <StatCard icon="pi pi-percentage" label="Конверсия продукта" :value="`${data.headline.overall_conversion_pct}%`" help="От регистрации до первой оплаты. Не сайт и не повторная покупка." :delay="160" />
      <StatCard icon="pi pi-chart-line" label="Средний отвал" :value="`${data.headline.avg_step_drop_pct}%`" help="Средняя доля, которую теряем между соседними шагами по всем воронкам." :delay="200" />
    </div>

    <section v-if="tiles.length" class="flex flex-col gap-3">
      <h2 class="crm-catalog-title">
        Каталог
        <CrmHelp text="Каждая плитка — одна воронка. Процент сверху — доля, дошедшая до последнего шага. Отвал — средний обрыв между соседними шагами." />
      </h2>
      <div class="crm-grid-bento-4 crm-stagger">
        <div
          v-for="(item, index) in tiles"
          :key="item.key"
          class="crm-tile crm-tile-funnel"
          :style="{ animationDelay: `${index * 40}ms` }"
        >
          <RouterLink
            class="crm-tile-cover"
            :to="{ name: 'funnel-detail', params: { key: item.key } }"
            :aria-label="item.label"
          />
          <div class="crm-tile-body">
            <div class="flex items-start justify-between gap-3">
              <p class="crm-tile-title">{{ item.label }}</p>
              <div class="flex items-center gap-2">
                <CrmHelp :text="funnelHelp(item.key)" />
                <span class="crm-tile-kicker">{{ item.group }}</span>
              </div>
            </div>
            <p class="crm-tile-value">{{ item.end_conversion_pct }}%</p>
            <p class="crm-tile-meta">отвал {{ item.avg_step_drop_pct }}%</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CrmBusy from "@/components/crm/CrmBusy.vue";
import CrmHelp from "@/components/crm/CrmHelp.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type FunnelSummary } from "@/lib/api";
import { funnelHelp } from "@/lib/funnel-help";
import { usePeriodStore } from "@/stores/period";

const period = usePeriodStore();
const data = ref<FunnelSummary | null>(null);

const tiles = computed(() =>
  (data.value?.groups ?? []).flatMap((group) =>
    group.funnels.map((item) => ({ ...item, group: group.label })),
  ),
);

onMounted(async () => {
  data.value = await crmApi.funnelSummary(period.query);
});
</script>

<style scoped>
.crm-catalog-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--crm-text-muted, #667085);
}

.crm-tile-funnel {
  position: relative;
}

.crm-tile-cover {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  z-index: 0;
}

.crm-tile-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.75rem;
  pointer-events: none;
  height: 100%;
}

.crm-tile-body :deep(.crm-help) {
  pointer-events: auto;
}
</style>

