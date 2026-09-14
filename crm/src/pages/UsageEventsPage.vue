<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="События"
      subtitle="Что нажимали в саду и на сайте."
      :count="total"
      help="Это клики и заходы, не имена и не рисунки. «Открыл магазин» и «открыл рисовалку» помогают понять, где бросили."
    >
      <template #actions>
        <input
          v-model="query"
          class="parent-search"
          type="search"
          placeholder="название"
          @keydown.enter.prevent="search"
        />
        <button type="button" class="crm-nav-pill-item is-active" @click="search">Найти</button>
      </template>
    </CrmPageHeader>
    <p v-if="loading" class="text-sm text-muted m-0">Загрузка…</p>
    <CrmPanel v-else-if="items.length" title="Счётчик">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <CrmSortTh label="Что случилось" :active="sort === 'event'" :dir="order" @sort="toggle('event')" />
              <CrmSortTh label="Сколько раз" :active="sort === 'count'" :dir="order" @sort="toggle('count')" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.event">
              <td class="py-2">{{ eventLabel(row.event) }}</td>
              <td>{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CrmPanel>
    <p v-else class="text-sm text-muted m-0">За эти дни событий нет.</p>
    <CrmPager v-model:offset="offset" :total="total" :rows="PAGE" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPager from "@/components/crm/CrmPager.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import CrmSortTh from "@/components/crm/CrmSortTh.vue";
import { crmApi } from "@/lib/api";
import { eventLabel } from "@/lib/islandEvents";
import { usePeriodStore } from "@/stores/period";

const PAGE = 50;
const period = usePeriodStore();
const items = ref<{ event: string; count: number }[]>([]);
const total = ref(0);
const offset = ref(0);
const query = ref("");
const applied = ref("");
const sort = ref("count");
const order = ref<"asc" | "desc">("desc");
const loading = ref(true);

function toggle(key: string) {
  if (sort.value === key) order.value = order.value === "asc" ? "desc" : "asc";
  else {
    sort.value = key;
    order.value = key === "event" ? "asc" : "desc";
  }
  offset.value = 0;
  void load();
}

function search() {
  applied.value = query.value.trim();
  offset.value = 0;
  void load();
}

async function load() {
  loading.value = true;
  try {
    const body = await crmApi.usageEvents(period.query, {
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
.parent-search {
  min-width: 12rem;
  padding: 0.4rem 0.9rem;
  border-radius: 9999px;
  border: 1px solid var(--crm-line, #ebebeb);
  background: #fafafa;
  font-size: 0.875rem;
}
</style>
