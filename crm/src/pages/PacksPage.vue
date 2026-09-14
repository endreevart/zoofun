<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Пакеты"
      subtitle="Генерации и острова. Сколько купили за выбранный период."
      help="Пакеты 1/5/10/15/20 зверей и копии лугов. Выручка — прошедшие оплаты. Удаление зверя кредит не возвращает."
    />
    <CrmBusy :loading="loading && !items.length" />
    <CrmPanel
      v-if="items.length"
      title="Каталог"
      help="Сколько купили и на сколько рублей за дни сверху. Цена — текущая в магазине, не та, что была раньше."
    >
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Пакет</th>
              <th>Цена</th>
              <th>Куплено</th>
              <th>Выручка</th>
              <th>Последняя покупка</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id">
              <td class="py-2">
                {{ row.title }}
                <div class="text-muted">{{ row.kind === "world" ? "остров" : `${row.animals} зверей` }}</div>
              </td>
              <td>{{ row.price_rub.toLocaleString("ru-RU") }} ₽</td>
              <td>{{ row.sold }}</td>
              <td>{{ row.revenue_rub.toLocaleString("ru-RU") }} ₽</td>
              <td>{{ formatWhen(row.last_bought_at, true) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CrmPanel>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import CrmBusy from "@/components/crm/CrmBusy.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import { crmApi, type PackCatalogRow } from "@/lib/api";
import { formatWhen } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const period = usePeriodStore();
const items = ref<PackCatalogRow[]>([]);
const loading = ref(true);

onMounted(async () => {
  loading.value = true;
  try {
    const body = await crmApi.packs(period.query);
    items.value = body.items;
  } finally {
    loading.value = false;
  }
});
</script>
