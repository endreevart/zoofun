<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader title="Платежи" subtitle="Только чтение. Запись — в /staff" :count="items.length" />
    <StatCard v-if="revenue != null" highlight label="Выручка, ₽" :value="revenue.toLocaleString('ru-RU')" />
    <CrmPanel>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted">
            <th class="py-2">Родитель</th>
            <th>Пакет</th>
            <th>Сумма</th>
            <th>Статус</th>
            <th>Дата</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.id">
            <td class="py-2">{{ row.parent_email || "—" }}</td>
            <td>{{ row.animals }} зверей</td>
            <td>{{ row.amount_rub }} ₽</td>
            <td>{{ statusLabel(row.status) }}</td>
            <td>{{ formatDay(row.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </CrmPanel>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type PaymentRow } from "@/lib/api";

const items = ref<PaymentRow[]>([]);
const revenue = ref<number | null>(null);

const STATUS: Record<string, string> = {
  created: "Создан",
  pending: "Ждёт оплату",
  confirmed: "Оплачен",
  failed: "Не прошёл",
  refunded: "Возврат",
};

function statusLabel(status: string) {
  return STATUS[status] ?? status;
}

function formatDay(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("ru-RU");
}

onMounted(async () => {
  const body = await crmApi.payments();
  items.value = body.items;
  revenue.value = body.revenue_rub;
});
</script>
