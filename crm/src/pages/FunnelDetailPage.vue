<template>
  <div class="funnel-detail">
    <CrmPageHeader :title="data?.label ?? 'Воронка'" :subtitle="data?.description" />
    <div v-if="data" class="crm-grid-charts-2">
      <StatCard label="До конца" :value="`${data.end_conversion_pct}%`" />
      <StatCard label="Средний отвал" :value="`${data.avg_step_drop_pct}%`" />
    </div>
    <FunnelColumns v-if="data" class="funnel-detail-columns" :steps="data.steps" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import FunnelColumns from "@/components/dashboard/FunnelColumns.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type FunnelDetail } from "@/lib/api";

const route = useRoute();
const data = ref<FunnelDetail | null>(null);

async function load() {
  const key = String(route.params.key || "product");
  data.value = await crmApi.funnel(key, key === "product" || key === "death" ? 0 : 30);
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
</style>
