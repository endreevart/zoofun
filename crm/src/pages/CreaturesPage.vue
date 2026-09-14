<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Звери"
      subtitle="По дате появления. Луг на плитке."
      :count="total"
      help="Плитки без исходного рисунка. Фильтры — картинка, нейросеть, 3D, луг. Зависшие яйца сверху."
    >
      <template #actions>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="item in filters"
            :key="item.key"
            type="button"
            class="crm-nav-pill-item"
            :class="{ 'is-active': filter === item.key }"
            @click="setFilter(item.key)"
          >
            {{ item.label }}
          </button>
        </div>
      </template>
    </CrmPageHeader>

    <CrmPanel
      v-if="stuck.length"
      title="Яйца без 3D-модели"
      subtitle="Картинка есть, модель зависла или упала. Не рисунок ребёнка."
      help="Больше 10 минут без модели. В сад такая не попадает. Нажмите — родитель."
    >
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted">
            <th class="py-2">Родитель</th>
            <th>Задача</th>
            <th>Сетка</th>
            <th>Обновлено</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in stuck"
            :key="row.id"
            class="parent-row"
            @click="openParent(row.parent_email)"
          >
            <td class="py-2">{{ row.parent_email || "—" }}</td>
            <td>{{ row.id }}</td>
            <td>{{ row.mesh_status }} · {{ row.status }}</td>
            <td>{{ formatWhen(row.updated_at, true) }}</td>
          </tr>
        </tbody>
      </table>
    </CrmPanel>

    <p v-if="loading" class="text-sm text-muted m-0">Загрузка…</p>
    <div v-else-if="items.length" class="crm-grid-bento-4">
      <CreatureTile
        v-for="row in items"
        :key="creatureKey(row)"
        :row="row"
        :ok="imageOk(row)"
        @open="open = row"
        @broken="markBroken(row)"
      />
    </div>
    <p v-else class="text-sm text-muted m-0">Пока нет зверей за этот период с таким фильтром.</p>
    <CrmPager v-model:offset="offset" :total="total" :rows="PAGE" />

    <Drawer v-model:visible="drawerOpen" :header="open?.name ?? 'Зверь'" position="right" class="!w-full md:!w-[28rem]">
      <div v-if="open" class="flex flex-col gap-4">
        <CreatureTile :row="open" :ok="imageOk(open)" large preview @broken="markBroken(open)" />
        <p class="m-0"><span class="text-muted">Родитель</span><br />{{ open.parent_email }}</p>
        <p class="m-0"><span class="text-muted">Профиль</span><br />{{ open.child_nickname || "—" }}</p>
        <p class="m-0"><span class="text-muted">Когда</span><br />{{ formatWhen(open.created_at) }}</p>
        <p class="m-0"><span class="text-muted">Луг</span><br />{{ open.lawn_title || "—" }}</p>
        <p class="m-0 text-sm text-muted">
          {{ open.painted ? "Картинку чуть подчистили, силуэт ребёнка сохранён." : "Свой рисунок, как нарисовали." }}
        </p>
        <CreatureModelLink :row="open" />
      </div>
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Drawer from "primevue/drawer";
import CreatureTile from "@/components/crm/CreatureTile.vue";
import CreatureModelLink from "@/components/crm/CreatureModelLink.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPager from "@/components/crm/CrmPager.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import { crmApi, type CreatureKind, type CreatureRow, type StuckJob } from "@/lib/api";
import { creatureKey } from "@/lib/creatureImage";
import { formatWhen } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const PAGE = 24;
const period = usePeriodStore();
const router = useRouter();
const items = ref<CreatureRow[]>([]);
const stuck = ref<StuckJob[]>([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(true);
const filter = ref<CreatureKind>("all");
const open = ref<CreatureRow | null>(null);
const broken = ref(new Set<string>());

const filters = [
  { key: "all" as const, label: "Все" },
  { key: "image" as const, label: "С картинкой" },
  { key: "painted" as const, label: "Нейросеть" },
  { key: "model" as const, label: "3D" },
  { key: "garden" as const, label: "Остров" },
  { key: "meadow" as const, label: "Луг" },
  { key: "grove" as const, label: "Куболесье" },
  { key: "diy" as const, label: "Сборка" },
];

const drawerOpen = computed({
  get: () => open.value != null,
  set: (value: boolean) => {
    if (!value) open.value = null;
  },
});

function imageOk(row: CreatureRow) {
  return row.has_image && !broken.value.has(creatureKey(row));
}

function markBroken(row: CreatureRow) {
  const key = creatureKey(row);
  if (broken.value.has(key)) return;
  const next = new Set(broken.value);
  next.add(key);
  broken.value = next;
}

function setFilter(next: CreatureKind) {
  if (filter.value === next) return;
  filter.value = next;
  if (offset.value === 0) {
    void load();
    return;
  }
  offset.value = 0;
}

function openParent(email: string | null) {
  if (!email) return;
  void router.push({ name: "parents", query: { q: email } });
}

async function load() {
  loading.value = true;
  try {
    const [body, queue] = await Promise.all([
      crmApi.creatures(period.query, {
        limit: PAGE,
        offset: offset.value,
        kind: filter.value,
      }),
      crmApi.stuck({ limit: 20, offset: 0 }),
    ]);
    items.value = body.items;
    total.value = body.total;
    stuck.value = queue.items;
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
