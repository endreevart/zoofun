<template>
  <div class="funnel-detail">
    <CrmPageHeader
      :title="data?.label ?? 'Воронка'"
      :subtitle="data?.description"
      :help="data ? funnelHelp(data.key) : undefined"
    >
      <template v-if="isReturn" #actions>
        <nav class="return-days" aria-label="За сколько дней считать возврат">
          <button
            v-for="item in DAY_PRESETS"
            :key="item"
            type="button"
            class="crm-nav-pill-item"
            :class="{ 'is-active': days === item }"
            @click="setDays(item)"
          >
            {{ item }} дн.
          </button>
          <label class="return-days-custom">
            <span>свои</span>
            <input
              v-model.number="customDays"
              type="number"
              min="1"
              max="90"
              @change="applyCustomDays"
            />
          </label>
        </nav>
      </template>
    </CrmPageHeader>
    <div v-if="data" class="crm-grid-charts-2">
      <StatCard
        v-if="isReturn"
        label="% возврата"
        :value="returnPctLabel"
        :help="`Доля семей, которые снова зашли в сад не позже чем через ${days} дн. после первого захода. Считаем тех, у кого эти дни уже прошли.`"
      />
      <StatCard
        label="До конца"
        :value="`${data.end_conversion_pct}%`"
        help="Доля первого шага, которая дошла до последнего. Для оттока это не «хорошо» — смотри описание воронки."
      />
      <StatCard
        label="Средний отвал"
        :value="`${data.avg_step_drop_pct}%`"
        help="Средний процент, который теряем между соседними колонками. Большое число — обрыв на одном шаге."
      />
    </div>
    <FunnelColumns v-if="data" class="funnel-detail-columns" :steps="data.steps" :funnel-key="data.key" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import FunnelColumns from "@/components/dashboard/FunnelColumns.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type FunnelDetail } from "@/lib/api";
import { funnelHelp } from "@/lib/funnel-help";
import { usePeriodStore } from "@/stores/period";

const DAY_PRESETS = [1, 3, 7, 14, 30];

const route = useRoute();
const period = usePeriodStore();
const data = ref<FunnelDetail | null>(null);
const days = ref(7);
const customDays = ref(7);

const isReturn = computed(() => String(route.params.key) === "return");

const returnPctLabel = computed(() => {
  const value = data.value?.return_pct;
  return value == null ? "—" : `${value}%`;
});

function clampDays(value: number) {
  if (!Number.isFinite(value)) return 7;
  return Math.min(90, Math.max(1, Math.round(value)));
}

function setDays(value: number) {
  days.value = clampDays(value);
  customDays.value = days.value;
  void load();
}

function applyCustomDays() {
  setDays(Number(customDays.value));
}

async function load() {
  const key = String(route.params.key || "product");
  data.value = await crmApi.funnel(
    key,
    period.query,
    key === "return" ? { days: days.value } : undefined,
  );
}

onMounted(() => {
  void load();
});
watch(() => route.params.key, () => {
  void load();
});
</script>

<style scoped>
.funnel-detail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: calc(100dvh - 8.5rem);
  min-height: 28rem;
  overflow: hidden;
}

.funnel-detail-columns {
  flex: 1;
  min-height: 0;
}

.funnel-detail :deep(.crm-page-header) {
  margin-bottom: 0;
}

.funnel-detail :deep(.crm-stat) {
  min-height: 5.5rem;
}

.return-days {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.return-days-custom {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: 0.25rem;
  color: var(--crm-muted, #8a8a8a);
  font-size: 0.8rem;
}

.return-days-custom input {
  width: 4.25rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--crm-line, #e5e5e5);
  border-radius: 0.5rem;
  font: inherit;
}
</style>
