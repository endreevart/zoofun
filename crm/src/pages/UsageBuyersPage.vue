<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Кто покупает стройку"
      subtitle="Семьи, которые платили за остров."
      :count="total"
      help="Сумма — только прошедшие оплаты за выбранные дни. «Всего копий» — сколько островов у семьи сейчас, не только за эти дни."
    >
      <template #actions>
        <input
          v-model="query"
          class="parent-search"
          type="search"
          placeholder="почта"
          @keydown.enter.prevent="search"
        />
        <button type="button" class="crm-nav-pill-item is-active" @click="search">Найти</button>
      </template>
    </CrmPageHeader>
    <p v-if="loading" class="text-sm text-muted m-0">Загрузка…</p>
    <CrmPanel v-else-if="items.length" title="Семьи">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <CrmSortTh label="Семья" :active="sort === 'email'" :dir="order" @sort="toggle('email')" />
              <CrmSortTh label="Куплено за период" :active="sort === 'bought'" :dir="order" @sort="toggle('bought')" />
              <CrmSortTh label="Всего копий" :active="sort === 'copies'" :dir="order" @sort="toggle('copies')" />
              <CrmSortTh label="Сумма" :active="sort === 'spent'" :dir="order" @sort="toggle('spent')" />
              <CrmSortTh label="Последняя покупка" :active="sort === 'last_bought'" :dir="order" @sort="toggle('last_bought')" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in items"
              :key="row.parent_id"
              class="parent-row"
              @click="openParent(row.email)"
            >
              <td class="py-2">{{ row.email }}</td>
              <td>{{ row.bought }}</td>
              <td>{{ row.copies }}</td>
              <td>{{ row.spent_rub.toLocaleString("ru-RU") }} ₽</td>
              <td>{{ formatWhen(row.last_bought_at, true) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CrmPanel>
    <p v-else class="text-sm text-muted m-0">За эти дни покупок островов не было.</p>
    <CrmPager v-model:offset="offset" :total="total" :rows="PAGE" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPager from "@/components/crm/CrmPager.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import CrmSortTh from "@/components/crm/CrmSortTh.vue";
import { crmApi, type WorldBuyerRow } from "@/lib/api";
import { formatWhen } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const PAGE = 50;
const router = useRouter();
const period = usePeriodStore();
const items = ref<WorldBuyerRow[]>([]);
const total = ref(0);
const offset = ref(0);
const query = ref("");
const applied = ref("");
const sort = ref("last_bought");
const order = ref<"asc" | "desc">("desc");
const loading = ref(true);

function toggle(key: string) {
  if (sort.value === key) order.value = order.value === "asc" ? "desc" : "asc";
  else {
    sort.value = key;
    order.value = key === "email" ? "asc" : "desc";
  }
  offset.value = 0;
  void load();
}

function search() {
  applied.value = query.value.trim();
  offset.value = 0;
  void load();
}

function openParent(email: string) {
  void router.push({ name: "parents", query: { q: email } });
}

async function load() {
  loading.value = true;
  try {
    const body = await crmApi.usageBuyers(period.query, {
      limit: PAGE,
      offset: offset.value,
      q: applied.value || undefined,
      sort: sort.value,
      order: order.value,
    });
    items.value = body.items;
    total.value = body.total;
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

.parent-search {
  min-width: 12rem;
  padding: 0.4rem 0.9rem;
  border-radius: 9999px;
  border: 1px solid var(--crm-line, #ebebeb);
  background: #fafafa;
  font-size: 0.875rem;
}
</style>
