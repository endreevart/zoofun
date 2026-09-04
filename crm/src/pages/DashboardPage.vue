<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader title="Обзор" subtitle="Как живёт бэкенд и сайт">
      <template #actions>
        <Button icon="pi pi-refresh" label="Обновить" rounded severity="secondary" outlined @click="load" :loading="loading" />
      </template>
    </CrmPageHeader>

    <div v-if="data" class="crm-grid-kpi crm-stagger">
      <StatCard highlight icon="pi pi-users" label="Родители" :value="data.parents_total" :delay="0" clickable @click="go('parents')" />
      <StatCard icon="pi pi-heart" label="Профили" :value="data.children_total" :delay="40" />
      <StatCard icon="pi pi-star" label="Звери" :value="data.creatures_total" :delay="80" clickable @click="go('creatures')" />
      <StatCard icon="pi pi-bolt" label="Активны 7д" :value="data.active_parents" :delay="120" />
      <StatCard icon="pi pi-chart-bar" label="DAU" :value="data.dau" :hint="delta(data.dau_delta_pct)" :delay="160" />
      <StatCard icon="pi pi-chart-line" label="WAU" :value="data.wau" :delay="200" />
      <StatCard icon="pi pi-calendar" label="MAU" :value="data.mau" :delay="240" />
      <StatCard icon="pi pi-globe" label="Визиты сайта" :value="data.site_sessions" :delay="280" clickable @click="go('traffic')" />
      <StatCard icon="pi pi-eye" label="Просмотры" :value="data.pageviews" :delay="320" />
      <StatCard icon="pi pi-map" label="Сессии острова" :value="data.island_sessions" :delay="360" clickable @click="go('usage')" />
      <StatCard icon="pi pi-wallet" label="Оплаты" :value="data.paid_orders" :delay="400" clickable @click="go('payments')" />
      <StatCard icon="pi pi-money-bill" label="Выручка, ₽" :value="data.revenue_rub.toLocaleString('ru-RU')" :delay="440" />
    </div>

    <div v-if="data" class="crm-grid-charts-2 crm-stagger">
      <LineChart title="DAU родителей" :points="data.charts.dau" :delay="120" />
      <TrendChart title="Новые родители" :points="data.charts.parents" :delay="200" />
    </div>

  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import LineChart from "@/components/dashboard/LineChart.vue";
import TrendChart from "@/components/dashboard/TrendChart.vue";
import { crmApi, type Overview } from "@/lib/api";

const router = useRouter();
const loading = ref(false);
const data = ref<Overview | null>(null);

function delta(value: number | null) {
  if (value == null) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

function go(name: string) {
  void router.push({ name });
}

async function load() {
  loading.value = true;
  try {
    data.value = await crmApi.overview(30);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>
