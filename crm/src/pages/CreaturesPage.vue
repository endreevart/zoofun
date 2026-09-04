<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader title="Звери" subtitle="Картинки из рисунка. Письма родителям — позже" :count="visible.length">
      <template #actions>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="item in filters"
            :key="item.key"
            type="button"
            class="crm-nav-pill-item"
            :class="{ 'is-active': filter === item.key }"
            @click="filter = item.key"
          >
            {{ item.label }}
          </button>
        </div>
      </template>
    </CrmPageHeader>

    <div v-if="visible.length" class="crm-grid-bento-4">
      <button
        v-for="row in visible"
        :key="`${row.child_id}:${row.spec_id}`"
        type="button"
        class="crm-tile creature-card"
        @click="open = row"
      >
        <div class="creature-card-image">
          <img v-if="row.has_image" :src="imageUrl(row)" :alt="row.name" />
          <span v-else class="creature-card-empty">Нет картинки</span>
        </div>
        <div class="flex items-start justify-between gap-2">
          <p class="crm-tile-title">{{ row.name }}</p>
          <span v-if="row.painted" class="crm-tile-kicker">нейросеть</span>
          <span v-else-if="row.has_model" class="crm-tile-kicker">3D</span>
        </div>
        <p class="crm-tile-meta">{{ row.parent_email }}</p>
        <p class="crm-tile-meta">{{ formatDay(row.created_at) }}</p>
      </button>
    </div>
    <p v-else class="text-sm text-muted m-0">Пока нет зверей с таким фильтром.</p>

    <Drawer v-model:visible="drawerOpen" :header="open?.name ?? 'Зверь'" position="right" class="!w-full md:!w-[28rem]">
      <div v-if="open" class="flex flex-col gap-4">
        <div class="creature-card-image is-large">
          <img v-if="open.has_image" :src="imageUrl(open)" :alt="open.name" />
          <span v-else class="creature-card-empty">Нет картинки</span>
        </div>
        <p class="m-0"><span class="text-muted">Родитель</span><br />{{ open.parent_email }}</p>
        <p class="m-0"><span class="text-muted">Профиль</span><br />{{ open.child_nickname || "—" }}</p>
        <p class="m-0"><span class="text-muted">Когда</span><br />{{ formatDay(open.created_at) }}</p>
        <p class="m-0 text-sm text-muted">
          {{ open.painted ? "Картинка после OpenRouter." : "Свой рисунок, без нейросети." }}
          {{ open.has_model ? " Есть 3D-модель." : "" }}
        </p>
      </div>
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Drawer from "primevue/drawer";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import { crmApi, readToken, type CreatureRow } from "@/lib/api";

const items = ref<CreatureRow[]>([]);
const filter = ref<"all" | "image" | "painted" | "model">("all");
const open = ref<CreatureRow | null>(null);

const filters = [
  { key: "all" as const, label: "Все" },
  { key: "image" as const, label: "С картинкой" },
  { key: "painted" as const, label: "Нейросеть" },
  { key: "model" as const, label: "3D" },
];

const visible = computed(() => {
  if (filter.value === "image") return items.value.filter((row) => row.has_image);
  if (filter.value === "painted") return items.value.filter((row) => row.painted);
  if (filter.value === "model") return items.value.filter((row) => row.has_model);
  return items.value;
});

const drawerOpen = computed({
  get: () => open.value != null,
  set: (value: boolean) => {
    if (!value) open.value = null;
  },
});

function imageUrl(row: CreatureRow) {
  const token = readToken() ?? "";
  return `/v1/crm/creatures/${encodeURIComponent(row.child_id)}/${encodeURIComponent(row.spec_id)}/image?access_token=${encodeURIComponent(token)}`;
}

function formatDay(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("ru-RU");
}

onMounted(async () => {
  items.value = (await crmApi.creatures()).items;
});
</script>

<style scoped>
.creature-card {
  text-align: left;
  cursor: pointer;
  border: none;
}

.creature-card-image {
  aspect-ratio: 1;
  border-radius: 1rem;
  background: #f6f4f1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.creature-card-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.creature-card-image.is-large {
  aspect-ratio: 1;
  width: 100%;
}

.creature-card-empty {
  font-size: 0.75rem;
  color: var(--crm-muted);
}
</style>
