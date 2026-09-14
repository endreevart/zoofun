<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Обзор"
      subtitle="Как живёт бэкенд и сайт"
      help="Цифры за дни сверху. Нажмите карточку — откроется список. Выручка — только прошедшие оплаты."
    >
      <template #actions>
        <Button icon="pi pi-refresh" label="Обновить" rounded severity="secondary" outlined @click="load" :loading="loading" />
      </template>
    </CrmPageHeader>

    <CrmBusy :loading="loading && !data" />

    <div v-if="data" class="crm-grid-kpi crm-stagger">
      <StatCard highlight icon="pi pi-users" label="Родители" :value="data.new_parents" help="Новые аккаунты за эти дни. Не все семьи за всё время." :delay="0" clickable @click="go('parents')" />
      <StatCard icon="pi pi-heart" label="Профили" :value="data.children_new" help="Детские профили. Обычно один на семью. Это не юридические имена." :delay="40" />
      <StatCard icon="pi pi-star" label="Звери" :value="data.creatures_new" help="Новые звери за эти дни. Яйцо без 3D-модели тоже считается." :delay="80" clickable @click="go('creatures')" />
      <StatCard icon="pi pi-bolt" label="Активны" :value="data.active_parents" help="Семьи, которые хотя бы раз заходили на сайт или в сад." :delay="120" />
      <StatCard icon="pi pi-chart-bar" label="DAU" :value="data.dau" :hint="delta(data.dau_delta_pct)" help="Сколько разных семей заходили за последние сутки окна. Не число устройств." :delay="160" />
      <StatCard icon="pi pi-chart-line" label="WAU" :value="data.wau" help="Сколько разных семей заходили за последние 7 дней окна." :delay="200" />
      <StatCard icon="pi pi-calendar" label="MAU" :value="data.mau" help="Сколько разных семей заходили за последние 30 дней окна." :delay="240" />
      <StatCard icon="pi pi-globe" label="Визиты сайта" :value="data.site_sessions" help="Заходы на маркетинговый сайт. Сад и страница «играть» Метрику не грузят." :delay="280" clickable @click="go('traffic')" />
      <StatCard icon="pi pi-eye" label="Просмотры" :value="data.pageviews" help="Сколько страниц открыли. Одна сессия может дать несколько просмотров." :delay="320" />
      <StatCard icon="pi pi-map" label="Сессии острова" :value="data.island_sessions" help="Заходы в сад. Это не кнопка «играть» на сайте." :delay="360" clickable @click="go('usage')" />
      <StatCard icon="pi pi-wallet" label="Оплаты" :value="data.paid_orders" help="Прошедшие оплаты. Созданные и незавершённые сюда не входят." :delay="400" clickable @click="go('payments')" />
      <StatCard icon="pi pi-money-bill" label="Выручка, ₽" :value="data.revenue_rub.toLocaleString('ru-RU')" help="Сколько заплатили за эти дни. Возвраты отдельно." :delay="440" />
      <StatCard icon="pi pi-box" label="Пакеты, ₽" :value="(data.pack_revenue_rub ?? 0).toLocaleString('ru-RU')" :hint="`${data.pack_orders ?? 0} оплат`" help="Только пакеты 1/5/10/15/20 зверей. Острова здесь не считаются." :delay="480" />
      <StatCard icon="pi pi-map" label="Луга, ₽" :value="(data.world_revenue_rub ?? 0).toLocaleString('ru-RU')" :hint="`${data.world_orders ?? 0} оплат`" help="Собери сам, Висячий луг и Куболесье. Повторные копии тоже." :delay="520" />
      <StatCard icon="pi pi-clock" label="Бросили оплату" :value="data.abandoned_checkouts ?? 0" help="Начали платить и не закончили, или открыли магазин и не пошли в банк." :delay="560" clickable @click="go('payments')" />
      <StatCard icon="pi pi-exclamation-triangle" label="Яйца без 3D" :value="data.stuck_meshes ?? 0" help="Картинка есть, модель не собралась больше 10 минут. Исходный рисунок не показываем." :delay="600" clickable @click="go('creatures')" />
    </div>

    <div v-if="data" class="crm-grid-charts-2 crm-stagger">
      <LineChart title="DAU родителей" help="Сколько разных семей заходили в каждый день окна. Не визиты и не адреса." :points="data.charts.dau" :delay="120" />
      <TrendChart title="Новые родители" help="Регистрации по дням Москвы. Не первый заход в сад." :points="data.charts.parents" :delay="200" />
    </div>

  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import CrmBusy from "@/components/crm/CrmBusy.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import LineChart from "@/components/dashboard/LineChart.vue";
import TrendChart from "@/components/dashboard/TrendChart.vue";
import { crmApi, type Overview } from "@/lib/api";
import { usePeriodStore } from "@/stores/period";

const router = useRouter();
const period = usePeriodStore();
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
    data.value = await crmApi.overview(period.query);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>
