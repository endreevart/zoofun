<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Родители"
      subtitle="Семьи: почта, кредиты, звери, письма и вход."
      :count="total"
      help="Список за дни сверху. Нажмите строку — карточка семьи. Письма отсюда не уходят. Кредиты: 3D / картинки."
    >
      <template #actions>
        <button v-if="filtersOn" type="button" class="crm-nav-pill-item" @click="clearFilters">Сбросить</button>
      </template>
    </CrmPageHeader>
    <p v-if="loading" class="text-sm text-muted m-0">Загрузка…</p>
    <CrmPanel
      v-else-if="items.length || filtersOn"
      title="Семьи"
      help="Кредиты — 3D-оживления / гармонизации-открытки. Письма — можно ли писать на почту. Цвет входа — как давно заходили."
    >
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <CrmSortTh label="Почта" :active="sort === 'email'" :dir="order" @sort="toggle('email')" />
              <CrmSortTh label="Кредиты" :active="sort === 'remaining'" :dir="order" @sort="toggle('remaining')" />
              <CrmSortTh label="Звери" :active="sort === 'creatures'" :dir="order" @sort="toggle('creatures')" />
              <th>Штуки</th>
              <CrmSortTh label="Письма" :active="sort === 'consent'" :dir="order" @sort="toggle('consent')" />
              <CrmSortTh label="Последний вход" :active="sort === 'last_login'" :dir="order" @sort="toggle('last_login')" />
              <CrmSortTh label="Создан" :active="sort === 'created'" :dir="order" @sort="toggle('created')" />
            </tr>
            <tr class="parent-filters">
              <th>
                <input
                  v-model="query"
                  class="mail-input"
                  type="search"
                  placeholder="почта"
                  @keydown.enter.prevent="search"
                />
              </th>
              <th>
                <div class="parent-range">
                  <input
                    v-model.number="remainingMin"
                    class="mail-input"
                    type="number"
                    min="0"
                    placeholder="от"
                    @keydown.enter.prevent="search"
                  />
                  <input
                    v-model.number="remainingMax"
                    class="mail-input"
                    type="number"
                    min="0"
                    placeholder="до"
                    @keydown.enter.prevent="search"
                  />
                </div>
              </th>
              <th>
                <div class="parent-range">
                  <input
                    v-model.number="creaturesMin"
                    class="mail-input"
                    type="number"
                    min="0"
                    placeholder="от"
                    @keydown.enter.prevent="search"
                  />
                  <input
                    v-model.number="creaturesMax"
                    class="mail-input"
                    type="number"
                    min="0"
                    placeholder="до"
                    @keydown.enter.prevent="search"
                  />
                </div>
              </th>
              <th></th>
              <th>
                <select v-model="consent" class="mail-input" @change="search">
                  <option value="">все</option>
                  <option value="yes">да</option>
                  <option value="no">нет</option>
                </select>
              </th>
              <th>
                <select v-model="login" class="mail-input" @change="search">
                  <option value="">все</option>
                  <option value="today">сегодня</option>
                  <option value="week">на неделе</option>
                  <option value="old">давно</option>
                  <option value="never">не входил</option>
                </select>
              </th>
              <th>
                <button type="button" class="crm-nav-pill-item is-active" @click="search">Найти</button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in items"
              :key="row.id"
              class="parent-row"
              tabindex="0"
              @click="openParent(row)"
              @keydown.enter.prevent="openParent(row)"
            >
              <td class="py-2">{{ row.email }}</td>
              <td>{{ row.remaining }} / {{ row.still_remaining ?? "—" }}</td>
              <td>{{ row.creatures }}</td>
              <td>{{ row.plaza_toys ?? 0 }}</td>
              <td>{{ row.marketing_consent ? "да" : "нет" }}</td>
              <td>
                <span class="login-flag" :class="'is-' + loginFlag(row.last_login_at)">
                  {{ LOGIN_FLAG_LABEL[loginFlag(row.last_login_at)] }}
                </span>
                <div class="login-when">{{ formatWhen(row.last_login_at, true) }}</div>
              </td>
              <td>{{ formatWhen(row.created_at) }}</td>
            </tr>
            <tr v-if="!items.length">
              <td colspan="7" class="text-muted py-3">Никого не нашли.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CrmPanel>
    <p v-else class="text-sm text-muted m-0">Нет родителей за этот период.</p>
    <CrmPager v-model:offset="offset" :total="total" :rows="PAGE" />

    <Drawer v-model:visible="drawerOpen" :header="card?.parent.email ?? 'Родитель'" position="right" class="!w-full md:!w-[32rem]">
      <div v-if="card" class="flex flex-col gap-4">
        <p class="m-0">
          <span class="parent-field-label">
            Кредиты
            <CrmHelp text="3D — сколько оживлений осталось. Картинки — гармонизации. Удаление зверя ничего не возвращает. Первый 3D бесплатный, с ним 10 картинок." />
          </span>
          <br />{{ card.parent.remaining }} 3D · {{ card.parent.still_remaining ?? "—" }} картинок ·
          {{ card.parent.plaza_toys ?? 0 }} штук
        </p>
        <p class="m-0">
          <span class="parent-field-label">
            Письма
            <CrmHelp text="Можно ли писать на эту почту. Без согласия кнопка «Написать» не отправит." />
          </span>
          <br />{{ card.parent.marketing_consent ? "согласие есть" : "нет согласия" }}
        </p>
        <p class="m-0">
          <span class="parent-field-label">
            Яндекс
            <CrmHelp text="Семья входила через Яндекс. Письма всё равно идут на почту." />
          </span>
          <br />{{ card.parent.yandex ? "да" : "нет" }}
        </p>
        <p class="m-0">
          <span class="parent-field-label">
            Откуда пришёл
            <CrmHelp text="Первый ролик или объявление. Не меняется, если потом открыли другой. До оплаты и после." />
          </span>
          <br />{{ utmLine(card.parent) }}
        </p>
        <p class="m-0">
          <span class="parent-field-label">
            Последний вход
            <CrmHelp text="Когда родитель последний раз заходил в аккаунт. Не заход ребёнка в сад." />
          </span>
          <br />{{ formatWhen(card.parent.last_login_at, true) }}
        </p>
        <p class="m-0">
          <span class="parent-field-label">
            Регистрация
            <CrmHelp text="Когда завели аккаунт. Не первая оплата." />
          </span>
          <br />{{ formatWhen(card.parent.created_at) }}
        </p>
        <button
          type="button"
          class="crm-nav-pill-item is-active"
          :disabled="!card.parent.marketing_consent"
          @click="writeMail(card.parent.email)"
        >
          {{ card.parent.marketing_consent ? "Написать" : "Нет согласия на письма" }}
        </button>
        <div v-if="card.timeline?.length">
          <p class="crm-tile-title parent-section-title m-0 mb-2">
            Лента
            <CrmHelp text="Вход, рисунок, оплата и письма. Без имени ребёнка и без исходного рисунка." />
          </p>
          <p v-for="(event, index) in card.timeline" :key="`${event.kind}-${event.ts}-${index}`" class="m-0 text-sm">
            <span class="text-muted">{{ formatWhen(event.ts, true) }}</span>
            · {{ event.title }}
            <span v-if="event.detail" class="text-muted"> · {{ event.detail }}</span>
          </p>
        </div>
        <div v-if="card.worlds?.length">
          <p class="crm-tile-title parent-section-title m-0 mb-2">
            Миры
            <CrmHelp text="Бесплатный луг и купленные копии. Число — звери на этом лугу, не кусты и дома." />
          </p>
          <p v-for="world in card.worlds" :key="world.id" class="m-0 text-sm">
            {{ world.title }} — {{ world.creatures }} зверей
          </p>
        </div>
        <div v-if="card.payments?.length">
          <p class="crm-tile-title parent-section-title m-0 mb-2">
            Платежи
            <CrmHelp text="Все попытки оплаты. На обзоре в выручку попадают только прошедшие." />
          </p>
          <p v-for="pay in card.payments" :key="pay.id" class="m-0 text-sm">
            {{ pay.title }} · {{ pay.amount_rub }} ₽ · {{ payStatus(pay.status) }}
          </p>
        </div>
        <div>
          <p class="crm-tile-title parent-section-title m-0 mb-3">
            Чудики ({{ card.total }})
            <CrmHelp text="Плитки без исходного рисунка. Если есть 3D-модель — её можно скачать." />
          </p>
          <div v-if="card.items.length" class="parent-creatures">
            <CreatureTile
              v-for="row in card.items"
              :key="creatureKey(row)"
              :row="row"
              :ok="imageOk(row)"
              compact
              @open="openCreature = row"
              @broken="markBroken(row)"
            />
          </div>
          <p v-else class="text-sm text-muted m-0">Пока нет чудиков.</p>
          <CrmPager v-if="card.total > PAGE" v-model:offset="creatureOffset" :total="card.total" :rows="PAGE" />
        </div>
      </div>
    </Drawer>

    <Drawer v-model:visible="creatureDrawerOpen" :header="openCreature?.name ?? 'Зверь'" position="right" class="!w-full md:!w-[28rem]">
      <div v-if="openCreature" class="flex flex-col gap-4">
        <CreatureTile :row="openCreature" :ok="imageOk(openCreature)" large preview @broken="markBroken(openCreature)" />
        <p class="m-0 text-sm text-muted">
          {{ openCreature.painted ? "Картинку чуть подчистили, силуэт ребёнка сохранён." : "Свой рисунок, как нарисовали." }}
        </p>
        <CreatureModelLink :row="openCreature" />
      </div>
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Drawer from "primevue/drawer";
import CreatureTile from "@/components/crm/CreatureTile.vue";
import CrmHelp from "@/components/crm/CrmHelp.vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPager from "@/components/crm/CrmPager.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import CrmSortTh from "@/components/crm/CrmSortTh.vue";
import CreatureModelLink from "@/components/crm/CreatureModelLink.vue";
import { crmApi, type CreatureRow, type ParentCard, type ParentRow } from "@/lib/api";
import { creatureKey } from "@/lib/creatureImage";
import { LOGIN_FLAG_LABEL, formatWhen, loginFlag } from "@/lib/when";
import { usePeriodStore } from "@/stores/period";

const PAGE = 50;
const router = useRouter();
const route = useRoute();
const period = usePeriodStore();
const items = ref<ParentRow[]>([]);
const total = ref(0);
const offset = ref(0);
const query = ref("");
const appliedQuery = ref("");
const consent = ref("");
const login = ref("");
const remainingMin = ref<number | "">("");
const remainingMax = ref<number | "">("");
const creaturesMin = ref<number | "">("");
const creaturesMax = ref<number | "">("");
const sort = ref("created");
const order = ref<"asc" | "desc">("desc");
const creatureOffset = ref(0);
const openParentId = ref<string | null>(null);
const loading = ref(true);
const card = ref<ParentCard | null>(null);
const openCreature = ref<CreatureRow | null>(null);
const broken = ref(new Set<string>());

const filtersOn = computed(
  () =>
    Boolean(
      query.value.trim() ||
        consent.value ||
        login.value ||
        remainingMin.value !== "" ||
        remainingMax.value !== "" ||
        creaturesMin.value !== "" ||
        creaturesMax.value !== "",
    ),
);

function bound(value: number | "" | undefined) {
  if (value === "" || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function payStatus(status: string) {
  const labels: Record<string, string> = {
    created: "создан",
    pending: "ждёт",
    confirmed: "оплачен",
    failed: "не прошёл",
    refunded: "возврат",
  };
  return labels[status] || status;
}

function utmLine(parent: ParentRow) {
  const bits = [parent.utm_source, parent.utm_campaign, parent.utm_content].filter(Boolean);
  return bits.length ? bits.join(" · ") : "без метки";
}

const drawerOpen = computed({
  get: () => card.value != null,
  set: (value: boolean) => {
    if (!value) {
      card.value = null;
      openCreature.value = null;
    }
  },
});

const creatureDrawerOpen = computed({
  get: () => openCreature.value != null,
  set: (value: boolean) => {
    if (!value) openCreature.value = null;
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

async function load() {
  loading.value = true;
  try {
    const body = await crmApi.parents(period.query, {
      limit: PAGE,
      offset: offset.value,
      q: appliedQuery.value || undefined,
      consent: consent.value || undefined,
      login: login.value || undefined,
      remaining_min: bound(remainingMin.value),
      remaining_max: bound(remainingMax.value),
      creatures_min: bound(creaturesMin.value),
      creatures_max: bound(creaturesMax.value),
      sort: sort.value,
      order: order.value,
    });
    items.value = body.items;
    total.value = body.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  appliedQuery.value = query.value.trim();
  if (offset.value === 0) {
    void load();
    return;
  }
  offset.value = 0;
}

function toggle(key: string) {
  if (sort.value === key) order.value = order.value === "asc" ? "desc" : "asc";
  else {
    sort.value = key;
    order.value = key === "email" ? "asc" : "desc";
  }
  if (offset.value === 0) {
    void load();
    return;
  }
  offset.value = 0;
}

function clearFilters() {
  query.value = "";
  appliedQuery.value = "";
  consent.value = "";
  login.value = "";
  remainingMin.value = "";
  remainingMax.value = "";
  creaturesMin.value = "";
  creaturesMax.value = "";
  if (offset.value === 0) {
    void load();
    return;
  }
  offset.value = 0;
}

function writeMail(email: string) {
  void router.push({ name: "mail", query: { email } });
}

async function openParent(row: ParentRow) {
  openParentId.value = row.id;
  creatureOffset.value = 0;
  card.value = await crmApi.parent(row.id, { limit: PAGE, offset: 0 });
}

async function loadCardCreatures() {
  if (!openParentId.value) return;
  card.value = await crmApi.parent(openParentId.value, { limit: PAGE, offset: creatureOffset.value });
}

onMounted(() => {
  const q = String(route.query.q || "").trim();
  if (q) {
    query.value = q;
    appliedQuery.value = q;
  }
  void load();
});

watch(offset, () => {
  void load();
});

watch(creatureOffset, () => {
  void loadCardCreatures();
});
</script>

<style scoped>
.parent-row {
  cursor: pointer;
}

.parent-row:hover {
  background: #fafafa;
}

.login-flag {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.login-flag.is-today {
  background: #e8f7ee;
  color: #157347;
}

.login-flag.is-week {
  background: var(--crm-accent-soft);
  color: var(--crm-accent);
}

.login-flag.is-old {
  background: #f3f3f3;
  color: #666;
}

.login-flag.is-never {
  background: #fde8e8;
  color: #b42318;
}

.login-when {
  margin-top: 0.2rem;
  font-size: 0.6875rem;
  color: var(--crm-muted);
}

.parent-creatures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.parent-filters th {
  padding-bottom: 0.75rem;
  vertical-align: top;
  font-weight: 400;
}

.parent-range {
  display: flex;
  gap: 0.25rem;
}

.parent-range .mail-input {
  width: 4.5rem;
}

.mail-input {
  display: block;
  padding: 0.4rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--crm-line, #ebebeb);
  background: #fafafa;
  font: inherit;
}

.parent-field-label,
.parent-section-title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.parent-field-label {
  color: var(--crm-text-muted, #667085);
}


</style>
