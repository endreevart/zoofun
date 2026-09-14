<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Острова"
      subtitle="Бесплатные луга и купленные копии, где ребёнок строит сам."
      help="Три бесплатных луга всегда есть. Купленные копии — отдельные сады семьи. Цифры за дни, выбранные сверху."
    />
    <CrmBusy :loading="loading && !data" />
    <template v-if="data">
      <div class="crm-grid-charts-2">
        <StatCard
          highlight
          label="Заходы в сад"
          :value="data.island_sessions"
          help="Сколько раз открывали сад за выбранные дни. Страница «играть» на сайте — это другое."
        />
        <StatCard
          label="Новые звери"
          :value="data.creatures_new"
          help="Сколько зверей появилось за эти дни, на любом лугу."
        />
      </div>

      <div class="crm-grid-charts-2">
        <CrmPanel
          v-for="lawn in data.lawns"
          :key="lawn.id"
          :title="lawn.title"
          :help="lawnHelp(lawn.id)"
        >
          <p v-if="lawn.leading" class="crm-tile-kicker m-0 mb-3">сюда заходят чаще</p>
          <div class="crm-grid-bento-3">
            <StatCard
              clickable
              label="Звери"
              :value="lawn.creatures"
              :hint="newHint(lawn.creatures_new)"
              help="Сколько зверей сейчас живёт на этом лугу. Нажмите — список семей."
              @click="openLawn(lawn, 'creatures')"
            />
            <StatCard
              clickable
              label="Визиты"
              :value="lawn.visits"
              help="Сколько раз открывали этот луг. Нажмите — кто заходил."
              @click="openLawn(lawn, 'visits')"
            />
            <StatCard
              clickable
              label="Время"
              :value="formatDuration(lawn.time_sec)"
              help="Сколько примерно провели на лугу. Нажмите — по семьям."
              @click="openLawn(lawn, 'time')"
            />
          </div>
        </CrmPanel>
      </div>

      <div class="crm-grid-bento-3">
        <StatCard
          highlight
          clickable
          label="Купленные копии"
          :value="data.diy.copies"
          help="Сколько платных островов купили. Одна семья может купить несколько. Нажмите — список."
          @click="openDiy('copies')"
        />
        <StatCard
          clickable
          label="Семьи со стройкой"
          :value="data.diy.buyers"
          help="Сколько семей купили хотя бы один остров, чтобы строить самим. Нажмите — кто это."
          @click="openDiy('buyers')"
        />
        <StatCard
          clickable
          label="Звери на стройке"
          :value="data.diy.creatures"
          help="Звери на купленных копиях, не на бесплатном лугу. Нажмите — по семьям."
          @click="openDiy('creatures')"
        />
      </div>
    </template>

    <Drawer
      v-model:visible="drawerOpen"
      :header="peopleTitle"
      position="right"
      class="!w-full md:!w-[48rem] xl:!w-[56rem]"
    >
      <div class="flex flex-col gap-3">
        <input
          v-model="peopleQuery"
          class="parent-search"
          type="search"
          placeholder="почта"
          @keydown.enter.prevent="loadPeople"
        />
        <p v-if="peopleLoading" class="text-sm text-muted m-0">Загрузка…</p>
        <div v-else class="overflow-x-auto">
          <table v-if="people.length" class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-2">Семья</th>
                <th v-if="showCopyCols">Остров</th>
                <th>Звери</th>
                <th v-if="peopleMetric !== 'buyers'">Визиты</th>
                <th v-if="peopleMetric !== 'buyers'">Время</th>
                <th v-if="peopleMetric === 'buyers'">Куплено</th>
                <th v-if="peopleMetric === 'buyers'">Копий</th>
                <th v-if="peopleMetric === 'buyers'">Сумма</th>
                <th v-if="peopleMetric === 'copies'">Декор</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in people"
                :key="row.id || `${row.parent_id}-${row.title || ''}`"
                class="parent-row"
                @click="openParent(row.parent_id, row.email || row.parent_email)"
              >
                <td class="py-2">{{ row.email || row.parent_email }}</td>
                <td v-if="showCopyCols">
                  {{ row.title }}
                  <div class="text-muted">{{ row.kind_title }}</div>
                </td>
                <td>{{ row.creatures ?? "—" }}</td>
                <td v-if="peopleMetric !== 'buyers'">{{ row.visits ?? "—" }}</td>
                <td v-if="peopleMetric !== 'buyers'">{{ formatDuration(row.time_sec ?? 0) }}</td>
                <td v-if="peopleMetric === 'buyers'">{{ row.bought }}</td>
                <td v-if="peopleMetric === 'buyers'">{{ row.copies }}</td>
                <td v-if="peopleMetric === 'buyers'">{{ (row.spent_rub ?? 0).toLocaleString("ru-RU") }} ₽</td>
                <td v-if="peopleMetric === 'copies'">{{ row.props ?? "—" }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-sm text-muted m-0">Пока пусто — либо никто не заходил, либо заход был без входа в аккаунт.</p>
        </div>
        <CrmPager v-model:offset="peopleOffset" :total="peopleTotal" :rows="PAGE" />
      </div>
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Drawer from "primevue/drawer";
import CrmBusy from "@/components/crm/CrmBusy.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPager from "@/components/crm/CrmPager.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type LawnRow, type Usage, type UsagePersonRow } from "@/lib/api";
import { formatDuration } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const PAGE = 50;
const router = useRouter();
const period = usePeriodStore();
const data = ref<Usage | null>(null);
const loading = ref(true);
const people = ref<UsagePersonRow[]>([]);
const peopleTotal = ref(0);
const peopleOffset = ref(0);
const peopleQuery = ref("");
const peopleLoading = ref(false);
const peopleTitle = ref("Семьи");
const peopleMetric = ref("creatures");
const peopleScope = ref("lawn");
const peopleWorld = ref("");
const drawerOpen = ref(false);

const showCopyCols = computed(() => peopleMetric.value === "copies");

function newHint(count: number) {
  return count ? `+${count} за эти дни` : "";
}

function lawnHelp(id: string) {
  if (id === "meadow") return "Висячий луг. Бесплатный. Нажмите цифру — кто там бывает.";
  if (id === "grove") return "Куболесье. Бесплатный. Нажмите цифру — кто там бывает.";
  return "Волшебный остров. Бесплатный. Нажмите цифру — кто там бывает.";
}

function openParent(id: string, email?: string | null) {
  if (email) {
    void router.push({ name: "parents", query: { q: email } });
    return;
  }
  if (id) void router.push({ name: "parents" });
}

async function loadPeople() {
  peopleLoading.value = true;
  try {
    const body = await crmApi.usagePeople(period.query, {
      scope: peopleScope.value,
      world: peopleWorld.value || undefined,
      metric: peopleMetric.value,
      q: peopleQuery.value || undefined,
      limit: PAGE,
      offset: peopleOffset.value,
    });
    people.value = body.items;
    peopleTotal.value = body.total;
    if (body.title) peopleTitle.value = body.title;
  } finally {
    peopleLoading.value = false;
  }
}

function openLawn(lawn: LawnRow, metric: string) {
  peopleScope.value = "lawn";
  peopleWorld.value = lawn.id;
  peopleMetric.value = metric;
  peopleTitle.value = lawn.title;
  peopleQuery.value = "";
  peopleOffset.value = 0;
  drawerOpen.value = true;
  void loadPeople();
}

function openDiy(metric: string) {
  peopleScope.value = "diy";
  peopleWorld.value = "";
  peopleMetric.value = metric;
  peopleTitle.value =
    metric === "buyers" ? "Семьи со стройкой" : metric === "creatures" ? "Звери на стройке" : "Купленные копии";
  peopleQuery.value = "";
  peopleOffset.value = 0;
  drawerOpen.value = true;
  void loadPeople();
}

onMounted(async () => {
  loading.value = true;
  try {
    data.value = await crmApi.usage(period.query);
  } finally {
    loading.value = false;
  }
});

watch(peopleOffset, () => {
  if (drawerOpen.value) void loadPeople();
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
