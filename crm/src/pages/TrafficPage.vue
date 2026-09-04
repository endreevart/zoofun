<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader title="Посещаемость сайта" subtitle="Первая аналитика, после согласия на cookie" />
    <div v-if="data" class="crm-grid-bento-3">
      <StatCard highlight label="Сессии" :value="data.sessions" />
      <StatCard label="Просмотры" :value="data.pageviews" />
      <StatCard label="Средняя сессия, сек" :value="data.avg_duration_sec" />
    </div>
    <LineChart v-if="data" title="Сессии по дням" :points="data.charts.sessions" />
    <div v-if="data" class="crm-grid-charts-2">
      <DonutChart title="Источник" :slices="sourceSlices" />
      <DonutChart title="Устройство" :slices="deviceSlices" />
    </div>
    <CrmPanel v-if="data" title="Страницы">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted">
            <th class="py-2">Путь</th>
            <th>Просмотры</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="page in data.top_pages" :key="page.path">
            <td class="py-2">{{ page.path }}</td>
            <td>{{ page.views }}</td>
          </tr>
        </tbody>
      </table>
    </CrmPanel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import LineChart from "@/components/dashboard/LineChart.vue";
import DonutChart from "@/components/dashboard/DonutChart.vue";
import { crmApi, type Traffic } from "@/lib/api";

const data = ref<Traffic | null>(null);
const sourceSlices = computed(() => (data.value?.by_source ?? []).map((item) => ({ label: item.key, value: item.count })));
const deviceSlices = computed(() => (data.value?.by_device ?? []).map((item) => ({ label: item.key, value: item.count })));

onMounted(async () => {
  data.value = await crmApi.traffic(30);
});
</script>
