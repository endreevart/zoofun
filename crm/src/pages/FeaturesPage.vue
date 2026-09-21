<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Поляна и штуки"
      subtitle="Семьи на общем зоопарке, заходы отдельно, игрушки и открытки без 3D."
      help="Цифры семей — разные аккаунты. Заходы — отдельные сессии. Штука — 59 ₽, не кредит на зуфика. Имя ребёнка и исходный рисунок сюда не попадают."
    >
      <template #actions>
        <Button icon="pi pi-envelope" label="Письма" rounded severity="secondary" outlined @click="goMail" />
      </template>
    </CrmPageHeader>

    <CrmBusy :loading="loading && !data" />

    <template v-if="data">
      <div class="crm-grid-kpi crm-stagger">
        <StatCard
          highlight
          icon="pi pi-users"
          label="Семьи на поляне"
          :value="data.plaza.parents"
          :hint="`${data.plaza.visits} заходов`"
          help="Сколько разных семей открывали общий зоопарк. Одна семья может зайти много раз."
          :delay="0"
          clickable
          @click="goFunnel"
        />
        <StatCard
          icon="pi pi-sign-in"
          label="Заходы"
          :value="data.plaza.visits"
          help="Сессии: сколько раз открывали поляну. Не число деревьев и не число семей."
          :delay="40"
        />
        <StatCard
          icon="pi pi-circle-fill"
          label="Сейчас на поляне"
          :value="data.live?.plaza.count ?? 0"
          help="Кто сидит в общем зоопарке прямо сейчас."
          :delay="80"
        />
        <StatCard
          icon="pi pi-map"
          label="Сейчас в саду"
          :value="data.live?.island.count ?? 0"
          help="Семьи в саду, но не на поляне. Сердцебиение сессии, не Метрика."
          :delay="120"
        />
        <StatCard
          icon="pi pi-eye"
          label="Открыли / зашли"
          :value="`${data.plaza.opens} / ${data.plaza.enters}`"
          help="Открыли экран поляны и реально зашли погулять."
          :delay="160"
        />
        <StatCard
          icon="pi pi-face-smile"
          label="Смайлики"
          :value="data.plaza.emotes"
          help="Сколько раз отправили пиктограмму. Не чат."
          :delay="200"
        />
        <StatCard
          icon="pi pi-sparkles"
          label="Штуки"
          :value="data.toys.new"
          :hint="`всего ${data.toys.total}`"
          help="Новые штуки за выбранные дни. Всего — за всё время."
          :delay="240"
        />
        <StatCard
          icon="pi pi-wallet"
          label="Штуки, ₽"
          :value="data.toys.revenue_rub.toLocaleString('ru-RU')"
          :hint="`${data.toys.paid_orders} оплат`"
          help="Только plaza_toy_1. Не пакет зверей и не остров."
          :delay="280"
        />
        <StatCard
          icon="pi pi-image"
          label="Открытки без 3D"
          :value="data.stills.deferred"
          :hint="`${data.stills.deferred_parents} семей`"
          help="Нарисовали картинку и не оживили. Это не зависшая сетка."
          :delay="320"
          clickable
          @click="goCreatures"
        />
        <StatCard
          icon="pi pi-gift"
          label="Только бесплатный зуфик"
          :value="data.stills.only_free_parents"
          help="Использовали первого зуфика и ни разу не платили. Им можно напомнить про десять картинок."
          :delay="360"
          clickable
          @click="goMail"
        />
      </div>

      <div class="crm-grid-charts-2">
        <LineChart
          title="Семьи на поляне"
          help="Сколько разных семей заходили в каждый день Москвы. Одна семья — один раз за день, даже если открывала поляну несколько раз."
          :points="data.charts.plaza_parents ?? []"
        />
        <LineChart
          title="Заходы на поляну"
          help="Сколько разных сессий открыли общий зоопарк в каждый день Москвы. Не число семей."
          :points="data.charts.plaza_visits"
        />
      </div>

      <div class="crm-grid-charts-2">
        <LivePeople
          title="Сейчас на поляне"
          help="Кто сидит в общем зоопарке прямо сейчас. Места из Redis, не заходы за день."
          :people="data.live?.plaza.people ?? []"
        />
        <LivePeople
          title="Сейчас в саду"
          help="Семьи с открытым садом, но не на поляне. Сердцебиение сессии за последние полторы минуты."
          :people="data.live?.island.people ?? []"
        />
      </div>

      <CrmPanel
        title="Поляна сейчас"
        help="Каталог — общие деревья и дома. Штуки — личные игрушки семей. Лимит каталога 400."
      >
        <p class="m-0 text-sm">Каталог: {{ data.plaza.catalog_stamps }} · штуки на поляне: {{ data.plaza.toy_stamps }}</p>
        <p class="m-0 text-sm text-muted">Копали: {{ data.plaza.digs }} · начали рисовать штуку: {{ data.toys.draws }}</p>
        <p class="m-0 text-sm text-muted">Превью без оплаты: {{ data.toys.preview_unpaid }} · готовые сетки: {{ data.toys.ready }}</p>
      </CrmPanel>

      <CrmPanel
        title="Штуки"
        help="Игрушки, которые дети рисуют на общей поляне. Исходный рисунок не показываем."
      >
        <p v-if="!data.toys.items.length" class="text-sm text-muted m-0">За эти дни штук нет.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Почта</th>
              <th>Сетка</th>
              <th>На поляне</th>
              <th>Когда</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.toys.items"
              :key="row.id"
              class="parent-row"
              @click="openParent(row.email)"
            >
              <td class="py-2">{{ row.email || "—" }}</td>
              <td>{{ meshLabel(row) }}</td>
              <td>{{ row.placed ? "стоит" : "ещё нет" }}</td>
              <td>{{ formatWhen(row.created_at, true) }}</td>
            </tr>
          </tbody>
        </table>
      </CrmPanel>

      <CrmPanel
        title="Открытки без 3D"
        help="Родитель нарисовал, картинка в саду, объёмную игрушку ещё не заказал. Не путать с яйцом, у которого сетка зависла."
      >
        <p v-if="!data.stills.items.length" class="text-sm text-muted m-0">За эти дни таких открыток нет.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Почта</th>
              <th>Задача</th>
              <th>Когда</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.stills.items"
              :key="row.id"
              class="parent-row"
              @click="openParent(row.email)"
            >
              <td class="py-2">{{ row.email || "—" }}</td>
              <td>{{ row.id }}</td>
              <td>{{ formatWhen(row.created_at, true) }}</td>
            </tr>
          </tbody>
        </table>
      </CrmPanel>

      <CrmPanel
        title="Кто ходил на поляну"
        help="Семьи и сколько раз каждая открывала общий зоопарк. Нажмите — карточка родителя."
      >
        <p v-if="!data.plaza.visitors.length" class="text-sm text-muted m-0">За эти дни никого не было.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Почта</th>
              <th>Заходы</th>
              <th>Последний</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.plaza.visitors"
              :key="row.parent_id"
              class="parent-row"
              @click="openParent(row.email)"
            >
              <td class="py-2">{{ row.email || "—" }}</td>
              <td>{{ row.visits }}</td>
              <td>{{ formatWhen(row.last_at, true) }}</td>
            </tr>
          </tbody>
        </table>
      </CrmPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import CrmBusy from "@/components/crm/CrmBusy.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import LivePeople from "@/components/crm/LivePeople.vue";
import LineChart from "@/components/dashboard/LineChart.vue";
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type FeatureSnapshot, type FeatureToy } from "@/lib/api";
import { formatWhen } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const router = useRouter();
const period = usePeriodStore();
const loading = ref(false);
const data = ref<FeatureSnapshot | null>(null);

function meshLabel(row: FeatureToy) {
  if (row.has_mesh) return "есть 3D";
  return row.mesh_status || "ждёт";
}

function openParent(email: string | null) {
  if (!email) return;
  void router.push({ name: "parents", query: { q: email } });
}

function goMail() {
  void router.push({ name: "mail" });
}

function goFunnel() {
  void router.push({ name: "funnel-detail", params: { key: "plaza" } });
}

function goCreatures() {
  void router.push({ name: "creatures", query: { kind: "postcard" } });
}

async function load() {
  loading.value = true;
  try {
    data.value = await crmApi.features(period.query);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
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
