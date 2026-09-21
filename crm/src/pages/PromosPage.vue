<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Промокоды"
      subtitle="Скидка на пакеты, острова и штуки. Пустой список — на всё. PRIVET: 25% без одного зуфика и без штук."
      help="Код снижает цену пакета при оплате. Выручка в списке — сколько реально заплатили с этим кодом."
    >
      <template #actions>
        <button type="button" class="crm-nav-pill-item is-active" @click="openNew">Новый код</button>
      </template>
    </CrmPageHeader>
    <CrmPanel title="Список" help="Нажмите строку, чтобы поправить код. «Выключить» — в магазине его больше не примут.">
      <div class="promo-filters">
        <input v-model="filterQuery" class="mail-input" type="search" placeholder="код" />
        <select v-model="filterStatus" class="mail-input">
          <option value="">любой статус</option>
          <option value="on">активен</option>
          <option value="off">выключен</option>
        </select>
        <select v-model="filterKind" class="mail-input">
          <option value="">любая скидка</option>
          <option value="percent">процент</option>
          <option value="fixed">рубли</option>
        </select>
      </div>
      <p v-if="!rows.length" class="text-sm text-muted m-0">Пока нет кодов.</p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted">
            <CrmSortTh label="Код" :active="sort === 'code'" :dir="order" @sort="toggle('code')" />
            <CrmSortTh label="Скидка" :active="sort === 'value'" :dir="order" @sort="toggle('value')" />
            <th>С — по</th>
            <CrmSortTh label="Использовали" :active="sort === 'redemptions'" :dir="order" @sort="toggle('redemptions')" />
            <th>Пакеты</th>
            <CrmSortTh label="Статус" :active="sort === 'active'" :dir="order" @sort="toggle('active')" />
            <CrmSortTh label="Выручка" :active="sort === 'revenue'" :dir="order" @sort="toggle('revenue')" />
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.code"
            class="promo-row-line"
            :class="{ 'is-editing': editing === row.code }"
            @click="editRow(row)"
          >
            <td class="py-2">{{ row.code }}</td>
            <td>{{ row.kind === "percent" ? `${row.value} %` : `${row.value} ₽` }}</td>
            <td>{{ formatWindow(row) }}</td>
            <td>{{ row.redemptions }}{{ row.max_redemptions ? ` / ${row.max_redemptions}` : " / ∞" }}</td>
            <td>{{ formatPacks(row.pack_ids) }}</td>
            <td>{{ row.active ? "активен" : "выключен" }}</td>
            <td>{{ row.revenue_rub }} ₽</td>
            <td>
              <button
                type="button"
                class="crm-nav-pill-item"
                @click.stop="toggleActive(row)"
              >
                {{ row.active ? "Выключить" : "Включить" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </CrmPanel>

    <Drawer
      v-model:visible="formOpen"
      :header="editing ? `Код ${editing}` : 'Новый код'"
      position="right"
      class="!w-full md:!w-[32rem]"
    >
      <form class="promo-form" @submit.prevent="save">
        <p class="text-sm text-muted m-0">Латиница и цифры, 3–24 знака. Процент меньше 100. Даты — по Москве.</p>
        <label class="promo-field">
          Код
          <input
            v-model="code"
            class="mail-input"
            placeholder="SUMMER10"
            maxlength="24"
            :disabled="Boolean(editing)"
            required
          />
        </label>
        <div class="promo-row">
          <label class="promo-field">
            Скидка
            <select v-model="kind" class="mail-input promo-kind">
              <option value="percent">процент</option>
              <option value="fixed">рубли</option>
            </select>
          </label>
          <label class="promo-field">
            Значение
            <input v-model.number="value" class="mail-input" type="number" min="1" required />
          </label>
        </div>
        <div class="promo-row">
          <label class="promo-field">
            Действует с
            <input v-model="startsOn" class="mail-input" type="date" />
          </label>
          <label class="promo-field">
            по дату
            <input v-model="endsOn" class="mail-input" type="date" />
          </label>
        </div>
        <label class="promo-field">
          Сколько раз можно использовать
          <input v-model.number="maxRedemptions" class="mail-input" type="number" min="0" />
          <span class="promo-hint">0 — без лимита</span>
        </label>
        <label class="promo-check">
          <input v-model="active" type="checkbox" />
          Активен
        </label>
        <fieldset class="promo-packs">
          <legend>На что действует</legend>
          <label class="promo-check">
            <input v-model="packScope" type="radio" value="all" />
            всё в магазине, включая штуки
          </label>
          <label class="promo-check">
            <input v-model="packScope" type="radio" value="some" />
            несколько
          </label>
          <div v-if="packScope === 'some'" class="promo-pack-list">
            <label v-for="pack in PACK_OPTIONS" :key="pack.id" class="promo-check">
              <input v-model="packIds" type="checkbox" :value="pack.id" />
              {{ pack.label }}
            </label>
          </div>
        </fieldset>
        <label class="promo-field">
          Заметка
          <input v-model="note" class="mail-input" placeholder="необязательно" maxlength="200" />
        </label>
        <div class="promo-actions">
          <button type="submit" class="crm-nav-pill-item is-active">
            {{ editing ? "Сохранить" : "Создать" }}
          </button>
          <button type="button" class="crm-nav-pill-item" @click="closeForm">Отмена</button>
        </div>
      </form>
      <p v-if="error" class="text-sm m-0" style="color:#b42318">{{ error }}</p>
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Drawer from "primevue/drawer";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import CrmSortTh from "@/components/crm/CrmSortTh.vue";
import { crmApi, type PromoRow, type PromoWrite } from "@/lib/api";

const PACK_OPTIONS = [
  { id: "pack_1", label: "1 зверь" },
  { id: "pack_5", label: "5 зверей" },
  { id: "pack_10", label: "10 зверей" },
  { id: "pack_15", label: "15 зверей" },
  { id: "pack_20", label: "20 зверей" },
  { id: "world_diy_garden", label: "Собери сам" },
  { id: "world_diy_meadow", label: "Собери луг" },
  { id: "world_diy_grove", label: "Собери куболесье" },
  { id: "plaza_toy_1", label: "Штука для поляны" },
] as const;

const items = ref<PromoRow[]>([]);
const editing = ref("");
const formOpen = ref(false);
const filterQuery = ref("");
const filterStatus = ref("");
const filterKind = ref("");
const sort = ref("code");
const order = ref<"asc" | "desc">("asc");
const code = ref("");
const kind = ref("percent");
const value = ref(10);
const maxRedemptions = ref(0);
const startsOn = ref("");
const endsOn = ref("");
const note = ref("");
const active = ref(true);
const packScope = ref<"all" | "some">("all");
const packIds = ref<string[]>([]);
const error = ref("");

function moscowEnd(iso: string) {
  const ms = Date.parse(`${iso}T23:59:59+03:00`);
  return Number.isFinite(ms) ? ms / 1000 : null;
}

function moscowStart(iso: string) {
  const ms = Date.parse(`${iso}T00:00:00+03:00`);
  return Number.isFinite(ms) ? ms / 1000 : null;
}

function moscowDay(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

function formatDay(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
}

function formatWindow(row: PromoRow) {
  if (!row.starts_at && !row.ends_at) return "без срока";
  const from = row.starts_at ? formatDay(row.starts_at) : "…";
  const to = row.ends_at ? formatDay(row.ends_at) : "…";
  return `${from} — ${to}`;
}

function formatPacks(ids: string[]) {
  if (!ids.length) return "все";
  const labels = Object.fromEntries(PACK_OPTIONS.map((item) => [item.id, item.label]));
  return ids.map((id) => labels[id] ?? id).join(", ");
}

const rows = computed(() => {
  const needle = filterQuery.value.trim().toLowerCase();
  const next = items.value.filter((row) => {
    if (needle && !row.code.toLowerCase().includes(needle)) return false;
    if (filterStatus.value === "on" && !row.active) return false;
    if (filterStatus.value === "off" && row.active) return false;
    if (filterKind.value && row.kind !== filterKind.value) return false;
    return true;
  });
  const dir = order.value === "asc" ? 1 : -1;
  next.sort((a, b) => {
    const pair =
      sort.value === "value"
        ? [a.value, b.value]
        : sort.value === "redemptions"
          ? [a.redemptions, b.redemptions]
          : sort.value === "revenue"
            ? [a.revenue_rub, b.revenue_rub]
            : sort.value === "active"
              ? [Number(a.active), Number(b.active)]
              : [a.code, b.code];
    if (pair[0] < pair[1]) return -1 * dir;
    if (pair[0] > pair[1]) return 1 * dir;
    return 0;
  });
  return next;
});

function toggle(key: string) {
  if (sort.value === key) order.value = order.value === "asc" ? "desc" : "asc";
  else {
    sort.value = key;
    order.value = key === "code" ? "asc" : "desc";
  }
}

function payload(): PromoWrite {
  return {
    kind: kind.value,
    value: value.value,
    max_redemptions: maxRedemptions.value,
    starts_at: startsOn.value ? moscowStart(startsOn.value) : null,
    ends_at: endsOn.value ? moscowEnd(endsOn.value) : null,
    note: note.value,
    active: active.value,
    pack_ids: packScope.value === "all" ? [] : packIds.value,
  };
}

function resetForm() {
  editing.value = "";
  code.value = "";
  kind.value = "percent";
  value.value = 10;
  maxRedemptions.value = 0;
  startsOn.value = "";
  endsOn.value = "";
  note.value = "";
  active.value = true;
  packScope.value = "all";
  packIds.value = [];
  error.value = "";
}

function openNew() {
  resetForm();
  formOpen.value = true;
}

function closeForm() {
  resetForm();
  formOpen.value = false;
}

function editRow(row: PromoRow) {
  editing.value = row.code;
  code.value = row.code;
  kind.value = row.kind;
  value.value = row.value;
  maxRedemptions.value = row.max_redemptions;
  startsOn.value = row.starts_at ? moscowDay(row.starts_at) : "";
  endsOn.value = row.ends_at ? moscowDay(row.ends_at) : "";
  note.value = row.note;
  active.value = row.active;
  packScope.value = row.pack_ids.length ? "some" : "all";
  packIds.value = [...row.pack_ids];
  error.value = "";
  formOpen.value = true;
}

async function load() {
  items.value = (await crmApi.promos()).items;
}

async function save() {
  error.value = "";
  if (packScope.value === "some" && !packIds.value.length) {
    error.value = "Выберите хотя бы один пакет или поставьте «все».";
    return;
  }
  try {
    const body = payload();
    if (editing.value) {
      await crmApi.promoUpdate(editing.value, body);
    } else {
      await crmApi.promoCreate({ ...body, code: code.value });
    }
    resetForm();
    formOpen.value = false;
    await load();
  } catch {
    error.value = "Код не сохранился. Латиница, цифры, 3–24 знака. Процент меньше 100. Только пакеты 1/5/10/15/20.";
  }
}

async function toggleActive(row: PromoRow) {
  if (row.active) await crmApi.promoDeactivate(row.code);
  else await crmApi.promoActivate(row.code);
  if (editing.value === row.code) active.value = !row.active;
  await load();
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.promo-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.promo-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 36rem;
}

.promo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.promo-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
  min-width: 10rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--crm-muted, #8a8a8a);
}

.promo-hint {
  font-weight: 500;
  font-size: 0.75rem;
}

.promo-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.promo-packs {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px dashed var(--crm-line, #ebebeb);
  border-radius: 1rem;
}

.promo-packs legend {
  padding: 0 0.35rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--crm-muted, #8a8a8a);
}

.promo-pack-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin-top: 0.5rem;
}

.promo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.mail-input {
  padding: 0.4rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--crm-line, #ebebeb);
  background: #fafafa;
  font: inherit;
  font-weight: 500;
  color: inherit;
}

.promo-kind {
  min-width: 10rem;
  padding-right: 2.25rem;
}

.promo-row-line {
  cursor: pointer;
}

.promo-row-line.is-editing {
  background: #f7f7f7;
}
</style>
