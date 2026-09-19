<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Скорость роста"
      :subtitle="subtitle"
      help="Жизнь проекта: сколько новых семей появляется и как быстро. Период — сверху. Это регистрации, не заходы в сад."
    >
      <template #actions>
        <div class="growth-live-badge" :class="{ 'is-stale': !livePulse }">
          <span class="growth-live-dot" />
          Live
        </div>
        <Button
          icon="pi pi-refresh"
          rounded
          severity="secondary"
          outlined
          :loading="loading"
          @click="load"
        />
      </template>
    </CrmPageHeader>

    <CrmBusy :loading="loading && !data" />

    <div v-if="data" class="crm-grid-kpi crm-stagger">
      <StatCard
        highlight
        clickable
        icon="pi pi-users"
        label="Родители сейчас"
        :value="data.cards.parents_total"
        :hint="asOfHint"
        help="Все аккаунты в базе. Не только за выбранные дни."
        :delay="0"
        @click="go('parents')"
      />
      <StatCard
        icon="pi pi-bolt"
        label="За последний час"
        :value="data.cards.parents_last_hour"
        help="Новые регистрации за час. Москва."
        :delay="40"
        @click="go('parents')"
        clickable
      />
      <StatCard
        icon="pi pi-sun"
        label="Новых сегодня"
        :value="data.cards.parents_today"
        help="Семьи, которые завели аккаунт с полуночи Москвы."
        :delay="80"
        clickable
        @click="go('parents')"
      />
      <StatCard
        icon="pi pi-calendar"
        label="За неделю"
        :value="data.cards.parents_week"
        help="Новые аккаунты за последние 7 дней, включая сегодня."
        :delay="120"
        clickable
        @click="go('parents')"
      />
      <StatCard
        icon="pi pi-chart-line"
        label="Среднее в день"
        :value="data.cards.avg_per_day"
        :hint="`${data.cards.parents_period} за период`"
        help="Новые семьи за выбранные дни, делённые на число дней в окне."
        :delay="160"
      />
      <StatCard
        icon="pi pi-percentage"
        label="Темп роста"
        :value="growthRateLabel"
        :hint="growthRateHint"
        help="Сколько новых семей за это окно против такого же окна перед ним."
        :delay="200"
      />
      <StatCard
        icon="pi pi-flag"
        label="Пик дня"
        :value="data.cards.peak_day_count"
        :hint="peakDayHint"
        help="День в окне, когда зарегистрировалось больше всего семей."
        :delay="240"
      />
      <StatCard
        icon="pi pi-heart"
        label="Профили сегодня"
        :value="data.cards.children_today"
        :hint="`${data.cards.children_total} всего`"
        help="Детские профили. Обычно один на семью."
        :delay="280"
      />
      <StatCard
        icon="pi pi-star"
        label="Звери сегодня"
        :value="data.cards.creatures_today"
        :hint="`${data.cards.creatures_total} всего`"
        help="Новые звери с полуночи Москвы. Яйцо без модели тоже считается."
        :delay="320"
        clickable
        @click="go('creatures')"
      />
    </div>

    <div v-if="data" class="crm-grid-charts-2 crm-stagger">
      <TrendChart
        title="Новые родители по дням"
        help="Регистрации по календарю Москвы. Не первый заход в сад."
        :points="data.charts.daily_parents"
        :delay="120"
      />
      <LineChart
        title="Регистрации сегодня по часам"
        help="С полуночи Москвы. Пустой час — ноль, не «нет данных»."
        :points="data.charts.hourly_today"
        :delay="160"
      />
    </div>

    <div v-if="data" class="crm-grid-charts-2 crm-stagger">
      <LineChart
        title="Накопленный рост семей"
        help="Сколько семей было к каждому дню окна. Старт — все, кто уже были до окна."
        :points="data.charts.cumulative_parents"
        :delay="200"
      />
      <TrendChart
        title="Ускорение день к дню"
        help="На сколько регистраций сегодня больше или меньше, чем вчера. Ноль — ровно столько же."
        :points="data.charts.velocity"
        :delay="240"
      />
    </div>

    <div v-if="data" class="crm-grid-charts-2 crm-stagger">
      <LineChart
        title="Новые звери по дням"
        help="Когда появляются зуфики. Не оплаты."
        :points="data.charts.daily_creatures"
        :delay="280"
      />
      <CrmPanel :delay="320">
        <h3 class="text-base font-semibold m-0 mb-4">Срез роста</h3>
        <ul class="growth-slice-list">
          <li>
            <span>Родители всего</span>
            <strong>{{ data.cards.parents_total.toLocaleString("ru-RU") }}</strong>
          </li>
          <li>
            <span>Профили всего</span>
            <strong>{{ data.cards.children_total.toLocaleString("ru-RU") }}</strong>
          </li>
          <li>
            <span>Звери всего</span>
            <strong>{{ data.cards.creatures_total.toLocaleString("ru-RU") }}</strong>
          </li>
          <li>
            <span>Дней с приростом</span>
            <strong>{{ data.peaks.days_with_growth }}</strong>
          </li>
        </ul>
        <h3 class="text-base font-semibold m-0 mt-6 mb-3">Последние семьи</h3>
        <ul class="growth-slice-list">
          <li v-for="item in data.recent_parents.slice(0, 8)" :key="item.id">
            <span>{{ item.email }}</span>
            <strong>{{ formatWhen(item.created_at, true) }}</strong>
          </li>
        </ul>
      </CrmPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import CrmBusy from "@/components/crm/CrmBusy.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import LineChart from "@/components/dashboard/LineChart.vue";
import TrendChart from "@/components/dashboard/TrendChart.vue";
import { crmApi, type GrowthSpeed } from "@/lib/api";
import { formatWhen } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const REFRESH_MS = 30_000;

const router = useRouter();
const period = usePeriodStore();
const loading = ref(false);
const data = ref<GrowthSpeed | null>(null);
const livePulse = ref(true);
let timer: ReturnType<typeof setInterval> | null = null;

const subtitle = computed(() => {
  const base = "Скорость привлечения семей";
  if (!data.value) return base;
  return `${base} · автообновление каждые 30 с`;
});

const asOfHint = computed(() => {
  if (!data.value?.as_of) return undefined;
  const stamp = new Date(data.value.as_of);
  if (Number.isNaN(stamp.getTime())) return undefined;
  return `на ${stamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
});

const growthRateLabel = computed(() => {
  const pct = data.value?.cards.growth_rate_pct;
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
});

const growthRateHint = computed(() => {
  if (data.value?.cards.growth_rate_pct == null) return "нет базы для сравнения";
  return "vs предыдущий период";
});

const peakDayHint = computed(() => {
  const raw = data.value?.cards.peak_day_date;
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [, month, day] = raw.slice(0, 10).split("-");
    return `${day}.${month}`;
  }
  return raw;
});

function go(name: string) {
  void router.push({ name });
}

async function load() {
  loading.value = true;
  try {
    data.value = await crmApi.growthSpeed(period.query);
    livePulse.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
  timer = setInterval(() => {
    void load();
  }, REFRESH_MS);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.growth-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.growth-live-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
  animation: growth-pulse 1.6s ease-out infinite;
}

.growth-live-badge.is-stale {
  background: rgba(138, 138, 138, 0.12);
  color: #6b6b6b;
}

.growth-live-badge.is-stale .growth-live-dot {
  background: #9ca3af;
  animation: none;
}

@keyframes growth-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

.growth-slice-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.growth-slice-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.9rem;
}

.growth-slice-list span {
  color: var(--crm-muted, #8a8a8a);
}

.growth-slice-list strong {
  font-variant-numeric: tabular-nums;
}
</style>
