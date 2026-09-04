<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader title="Воронки" subtitle="Привлечение, активация, деньги, удержание" />

    <div v-if="data" class="crm-grid-bento-3 crm-stagger">
      <StatCard highlight icon="pi pi-filter" label="Всего воронок" :value="data.cards.total_funnels" :delay="0" />
      <StatCard icon="pi pi-check-circle" label="В норме" :value="data.cards.healthy" :delay="40" />
      <StatCard icon="pi pi-exclamation-triangle" label="Внимание" :value="data.cards.attention" :delay="80" />
      <StatCard icon="pi pi-times-circle" label="Критично" :value="data.cards.critical" :delay="120" />
      <StatCard icon="pi pi-percentage" label="Конверсия продукта" :value="`${data.headline.overall_conversion_pct}%`" :delay="160" />
      <StatCard icon="pi pi-chart-line" label="Средний отвал" :value="`${data.headline.avg_step_drop_pct}%`" :delay="200" />
    </div>

    <section v-if="tiles.length" class="flex flex-col gap-3">
      <h2 class="text-sm font-semibold text-muted m-0">Каталог</h2>
      <div class="crm-grid-bento-4 crm-stagger">
        <RouterLink
          v-for="(item, index) in tiles"
          :key="item.key"
          :to="{ name: 'funnel-detail', params: { key: item.key } }"
          class="crm-tile"
          :style="{ animationDelay: `${index * 40}ms` }"
        >
          <div class="flex items-start justify-between gap-3">
            <p class="crm-tile-title">{{ item.label }}</p>
            <span class="crm-tile-kicker">{{ item.group }}</span>
          </div>
          <p class="crm-tile-value">{{ item.end_conversion_pct }}%</p>
          <p class="crm-tile-meta">отвал {{ item.avg_step_drop_pct }}%</p>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type FunnelSummary } from "@/lib/api";

const data = ref<FunnelSummary | null>(null);

const tiles = computed(() =>
  (data.value?.groups ?? []).flatMap((group) =>
    group.funnels.map((item) => ({ ...item, group: group.label })),
  ),
);

onMounted(async () => {
  data.value = await crmApi.funnelSummary(30);
});
</script>
