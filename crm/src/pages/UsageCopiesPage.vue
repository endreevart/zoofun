<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Купленные острова"
      subtitle="Каждая копия — отдельный сад семьи."
      :count="total"
      help="Платные острова, которые семьи купили, чтобы строить самим. Декор — штампы, не звери."
    >
      <template #actions>
        <input
          v-model="query"
          class="parent-search"
          type="search"
          placeholder="почта или название"
          @keydown.enter.prevent="search"
        />
        <button type="button" class="crm-nav-pill-item is-active" @click="search">Найти</button>
      </template>
    </CrmPageHeader>
    <p v-if="loading" class="text-sm text-muted m-0">Загрузка…</p>
    <CrmPanel v-else-if="items.length" title="Копии">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <CrmSortTh label="Остров" :active="sort === 'title'" :dir="order" @sort="toggle('title')" />
              <CrmSortTh label="Семья" :active="sort === 'email'" :dir="order" @sort="toggle('email')" />
              <CrmSortTh label="Звери" :active="sort === 'creatures'" :dir="order" @sort="toggle('creatures')" />
              <CrmSortTh label="Декор" :active="sort === 'props'" :dir="order" @sort="toggle('props')" />
              <CrmSortTh label="Визиты" :active="sort === 'visits'" :dir="order" @sort="toggle('visits')" />
              <CrmSortTh label="Время" :active="sort === 'time'" :dir="order" @sort="toggle('time')" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in items"
              :key="row.id"
              class="parent-row"
              @click="openParent(row.parent_email)"
            >
              <td class="py-2">
                {{ row.title }}
                <div class="text-muted">{{ row.kind_title }}</div>
              </td>
              <td>{{ row.parent_email }}</td>
              <td>{{ row.creatures }}</td>
              <td>{{ row.props }}</td>
              <td>{{ row.visits }}</td>
              <td>{{ formatDuration(row.time_sec) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CrmPanel>
    <p v-else class="text-sm text-muted m-0">Пока никто не купил остров для строительства.</p>
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
import { crmApi, type DiyWorldRow } from "@/lib/api";
import { formatDuration } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const PAGE = 50;
const router = useRouter();
const period = usePeriodStore();
const items = ref<DiyWorldRow[]>([]);
const total = ref(0);
const offset = ref(0);
const query = ref("");
const applied = ref("");
const sort = ref("creatures");
const order = ref<"asc" | "desc">("desc");
const loading = ref(true);

function toggle(key: string) {
  if (sort.value === key) order.value = order.value === "asc" ? "desc" : "asc";
  else {
    sort.value = key;
    order.value = key === "email" || key === "title" ? "asc" : "desc";
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
    const body = await crmApi.usageCopies(period.query, {
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
