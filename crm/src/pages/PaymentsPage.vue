<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Платежи"
      subtitle="Выручка — только прошедшие оплаты. Фильтр статусов сумму сверху не меняет."
      :count="total"
      help="Список можно сузить по статусу. Сумма сверху — всегда прошедшие оплаты за дни сверху."
    />
    <p v-if="loading" class="text-sm text-muted m-0">Загрузка…</p>
    <template v-else>
      <StatCard
        v-if="revenue != null"
        highlight
        label="Выручка, ₽"
        :value="revenue.toLocaleString('ru-RU')"
        help="Сколько заплатили за эти дни. Фильтр ниже на сумму не влияет. Возвраты отдельно."
      />
      <CrmPanel
        v-if="abandoned.length"
        title="Бросили оплату"
        subtitle="Начали платить и не закончили, или открыли магазин и не пошли в банк"
        help="Платёж висит больше 20 минут или открыли магазин и не начали. Нажмите строку — карточка семьи."
      >
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Родитель</th>
              <th>Что</th>
              <th>Сумма</th>
              <th>Когда</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in abandoned"
              :key="row.id"
              class="parent-row"
              @click="openParent(row.parent_email)"
            >
              <td class="py-2">{{ row.parent_email || "—" }}</td>
              <td>{{ row.title }}</td>
              <td>{{ row.amount_rub ? `${row.amount_rub} ₽` : "—" }}</td>
              <td>{{ formatWhen(row.created_at, true) }}</td>
            </tr>
          </tbody>
        </table>
      </CrmPanel>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="item in statuses"
          :key="item.key"
          type="button"
          class="crm-nav-pill-item"
          :class="{ 'is-active': status === item.key }"
          @click="setStatus(item.key)"
        >
          {{ item.label }}
        </button>
      </div>
      <CrmPanel
        v-if="items.length"
        title="Платежи"
        help="Если гасили промокодом — он в строке. Брошенные оплаты — таблица выше."
      >
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Родитель</th>
              <th>Пакет</th>
              <th>Сумма</th>
              <th>Статус</th>
              <th>Когда</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id">
              <td class="py-2">{{ row.parent_email || "—" }}</td>
              <td>{{ row.title || `${row.animals} зверей` }}</td>
              <td>{{ row.amount_rub }} ₽<span v-if="row.promo_code" class="text-muted"> · {{ row.promo_code }}</span></td>
              <td>{{ statusLabel(row.status) }}</td>
              <td>{{ formatWhen(row.created_at, true) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CrmPanel>
      <p v-else class="text-sm text-muted m-0">Нет платежей за этот период.</p>
    </template>
    <CrmPager v-model:offset="offset" :total="total" :rows="PAGE" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPager from "@/components/crm/CrmPager.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type AbandonedRow, type PaymentRow } from "@/lib/api";
import { formatWhen } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const PAGE = 50;
const period = usePeriodStore();
const router = useRouter();
const items = ref<PaymentRow[]>([]);
const abandoned = ref<AbandonedRow[]>([]);
const total = ref(0);
const offset = ref(0);
const revenue = ref<number | null>(null);
const loading = ref(true);
const status = ref("");

const statuses = [
  { key: "", label: "Все" },
  { key: "created", label: "Создан" },
  { key: "pending", label: "Ждёт" },
  { key: "confirmed", label: "Оплачен" },
  { key: "failed", label: "Не прошёл" },
  { key: "refunded", label: "Возврат" },
];

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

function openParent(email: string | null) {
  if (!email) return;
  void router.push({ name: "parents", query: { q: email } });
}

function setStatus(next: string) {
  if (status.value === next) return;
  status.value = next;
  if (offset.value === 0) {
    void load();
    return;
  }
  offset.value = 0;
}

async function load() {
  loading.value = true;
  try {
    const [body, queue] = await Promise.all([
      crmApi.payments(period.query, {
        limit: PAGE,
        offset: offset.value,
        status: status.value || undefined,
      }),
      crmApi.abandoned(period.query, { limit: 20, offset: 0 }),
    ]);
    items.value = body.items;
    total.value = body.total;
    revenue.value = body.revenue_rub;
    abandoned.value = queue.items;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(offset, () => {
  void load();
});
</script>

<style scoped>
.parent-row {
  cursor: pointer;
}

.parent-row:hover {
  background: #fafafa;
}
</style>
