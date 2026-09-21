<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader
      title="Письма"
      :subtitle="tabMeta.subtitle"
      :help="tabMeta.help"
      :count="tab === 'sent' ? campaigns.length : null"
    />

    <div v-show="tab === 'sent'" class="flex flex-col gap-6">
      <CrmPanel
        title="История"
        subtitle="Зашли, нарисовали, заплатили или кликнули ссылку за двое суток. Открытие письма мы не видим."
        help="Смотрим вход, рисунок, оплату и клик по персональной ссылке. Если в теме есть пометка правила — это авторассылка."
      >
        <p v-if="!campaigns.length" class="text-sm text-muted m-0">Пока нет рассылок.</p>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2">Тема</th>
              <th>Статус</th>
              <th>Отправлено</th>
              <th>Пропуск</th>
              <th>Клики</th>
              <th>Вход 48ч</th>
              <th>Рисунок 48ч</th>
              <th>Оплата 48ч</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in campaigns"
              :key="row.id"
              class="parent-row"
              :class="{ 'is-active': selectedCampaign === row.id }"
              @click="openDeliveries(row.id)"
            >
              <td class="py-2">{{ row.subject }}<span v-if="row.rule_id" class="text-muted"> · правило</span></td>
              <td>{{ row.status }}</td>
              <td>{{ row.sent_count }}</td>
              <td>{{ row.skipped_count }}</td>
              <td>{{ row.effect?.clicked ?? "—" }}</td>
              <td>{{ row.effect?.returned ?? "—" }}</td>
              <td>{{ row.effect?.drew ?? "—" }}</td>
              <td>{{ row.effect?.paid ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="deliveries.length" class="mt-4">
          <p class="text-sm m-0 mb-2">
            Получатели: {{ deliveryTotal }} · кликнули ссылку: {{ deliveryClicked }}
          </p>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="py-2">Почта</th>
                <th>Статус</th>
                <th>Клики</th>
                <th>Ссылка</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in deliveries" :key="row.parent_id + row.created_at">
                <td class="py-2">{{ row.email }}</td>
                <td>{{ row.status }}{{ row.reason ? ` · ${row.reason}` : "" }}</td>
                <td>{{ row.click_count || "—" }}</td>
                <td>
                  <button
                    v-if="row.hop_url"
                    type="button"
                    class="crm-nav-pill-item"
                    @click.stop="copyHop(row.hop_url)"
                  >
                    Скопировать
                  </button>
                  <span v-else class="text-muted">нет</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CrmPanel>
    </div>

    <div v-show="tab === 'write'" class="flex flex-col gap-6">
    <CrmPanel
      title="Кому писать, чтобы вернулись"
      help="Черновик. Само не уходит. В шаблонах уже код PRIVET: 25% на пакеты из нескольких зуфиков и на острова. На одного зуфика и на штуки для общего зоопарка — нет."
    >
      <p v-if="offerNote" class="text-sm text-muted m-0 mb-3">{{ offerNote }}</p>
      <p v-if="!offers.length" class="text-sm text-muted m-0">Пока нет подсказок.</p>
      <div v-else class="flex flex-col gap-3">
        <div v-for="item in offers" :key="item.id" class="mail-group">
          <div class="mail-group-head">
            <p class="m-0 font-semibold">{{ item.title }}</p>
            <span class="text-sm text-muted">подошло {{ item.matching }} · отправим {{ item.sendable }}</span>
          </div>
          <p class="text-sm m-0">{{ item.why }}</p>
          <p class="text-sm text-muted m-0">{{ item.promo_hint }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="crm-nav-pill-item is-active" @click="useOffer(item)">Подставить</button>
            <button type="button" class="crm-nav-pill-item" :disabled="drafting === item.id" @click="draftOffer(item)">
              Черновик
            </button>
          </div>
        </div>
      </div>
    </CrmPanel>

    </div>

    <div v-show="tab === 'sets'" class="flex flex-col gap-6">
      <CrmPanel
        title="Наборы"
        help="Свои наборы. Готовые нельзя стереть — только взять в письмо или скопировать. «Все сразу» — каждая группа; «любой» — достаточно одной."
      >
        <template #header>
          <button type="button" class="crm-nav-pill-item is-active" @click="newSet">Новый набор</button>
        </template>
        <div class="flex flex-col gap-3">
          <p v-if="!customSets.length" class="text-sm text-muted m-0">Своих наборов пока нет.</p>
          <div
            v-for="item in customSets"
            :key="item.id"
            class="set-row"
            :class="{ 'is-active': editing?.id === item.id }"
          >
            <button type="button" class="set-row-main" @click="editSet(item)">
              {{ item.name }}
            </button>
            <button type="button" class="mail-remove" @click="removeSetById(item.id)">Удалить</button>
          </div>
          <details class="mail-hint">
            <summary>Готовые наборы — подсказка</summary>
            <p class="text-sm text-muted m-0">
              Их нельзя стереть. Можно взять в письмо на вкладке «Написать» или скопировать в свой набор.
            </p>
            <div v-for="item in systemSets" :key="item.id" class="mail-hint-row">
              <span>{{ item.name }}</span>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="crm-nav-pill-item mail-add" @click="useInCampaign(item)">
                  в кампанию
                </button>
                <button type="button" class="crm-nav-pill-item mail-add" @click="copySystemSet(item)">
                  скопировать
                </button>
              </div>
            </div>
          </details>
        </div>
        <form v-if="editing" class="flex flex-col gap-3 mt-4" @submit.prevent="saveSet">
          <label class="text-sm font-semibold text-muted">
            Название
            <input v-model="editing.name" class="mail-input w-full" />
          </label>
          <label class="text-sm font-semibold text-muted">
            Между блоками
            <select v-model="editing.combinator" class="mail-input w-full">
              <option value="and">все блоки сразу (И)</option>
              <option value="or">любой блок (ИЛИ)</option>
            </select>
          </label>
          <div v-for="(group, gIndex) in editing.groups" :key="gIndex" class="mail-group">
            <div class="mail-group-head">
              <select v-model="group.combinator" class="mail-input mail-select-combinator">
                <option value="and">все условия (И)</option>
                <option value="or">любое условие (ИЛИ)</option>
              </select>
              <button type="button" class="mail-remove" @click="removeGroup(gIndex)">Удалить блок</button>
            </div>
            <div v-for="(cond, index) in group.conditions" :key="index" class="mail-cond">
              <select v-model="cond.field" class="mail-input mail-select-field" @change="resetOp(cond)">
                <option v-for="field in fields" :key="field.key" :value="field.key">{{ field.label }}</option>
              </select>
              <select v-if="opsFor(cond.field).length > 1" v-model="cond.op" class="mail-input mail-select-op">
                <option v-for="op in opsFor(cond.field)" :key="op" :value="op">{{ opLabel(op) }}</option>
              </select>
              <select v-if="fieldType(cond.field) === 'bool'" v-model="cond.value" class="mail-input">
                <option :value="true">да</option>
                <option :value="false">нет</option>
              </select>
              <input
                v-else-if="fieldType(cond.field) === 'str'"
                v-model="cond.value"
                class="mail-input"
                type="text"
              />
              <input v-else v-model.number="cond.value" class="mail-input" type="number" min="0" />
              <button type="button" class="mail-remove" @click="removeCondition(gIndex, index)">Удалить</button>
            </div>
            <button type="button" class="crm-nav-pill-item mail-add" @click="addCondition(gIndex)">Условие</button>
          </div>
          <button type="button" class="crm-nav-pill-item mail-add" @click="addGroup">Ещё блок</button>
          <div class="flex flex-wrap gap-2">
            <button type="submit" class="crm-nav-pill-item is-active">Сохранить набор</button>
            <button type="button" class="crm-nav-pill-item" @click="previewEditing">Посчитать</button>
            <button v-if="editing.isNew || !editing.id" type="button" class="crm-nav-pill-item" @click="cancelEdit">
              Отмена
            </button>
            <button
              v-else-if="!editing.is_system"
              type="button"
              class="mail-remove"
              @click="removeSet"
            >
              Удалить набор
            </button>
          </div>
          <p v-if="setStats" class="text-sm m-0">
            В наборе: {{ setStats.matching }} · отправим: {{ setStats.sendable }}
          </p>
          <p v-if="error" class="text-sm m-0" style="color:#b42318">{{ error }}</p>
        </form>
      </CrmPanel>
    </div>

    <div v-show="tab === 'write'" class="flex flex-col gap-6">
      <CrmPanel
        title="Кампания"
        help="Тема и тело уходят только тем, у кого согласие и нормальная почта. Имя ребёнка в шаблон не подставляется."
      >
        <form class="flex flex-col gap-3" @submit.prevent="preview">
          <label class="text-sm font-semibold text-muted">
            Тема
            <input v-model="subject" class="mail-input w-full" maxlength="120" />
          </label>
          <label class="text-sm font-semibold text-muted">
            Письмо
            <MailComposer v-model="body" :subject="subject" />
          </label>
          <p class="text-sm text-muted m-0">Состав: наборы и почта слева направо, между ними И или ИЛИ.</p>
          <div v-for="(part, index) in parts" :key="index" class="mail-cond">
            <select v-if="index > 0" v-model="part.join" class="mail-input">
              <option value="and">И</option>
              <option value="or">ИЛИ</option>
            </select>
            <select v-if="!part.email" v-model="part.set_id" class="mail-input">
              <option value="">набор…</option>
              <optgroup v-if="customSets.length" label="Свои">
                <option v-for="item in customSets" :key="item.id" :value="item.id">{{ item.name }}</option>
              </optgroup>
              <optgroup label="Готовые">
                <option v-for="item in systemSets" :key="item.id" :value="item.id">{{ item.name }}</option>
              </optgroup>
            </select>
            <input
              v-else
              v-model="part.email"
              class="mail-input"
              type="email"
              placeholder="почта семьи"
            />
            <button type="button" class="mail-remove" @click="parts.splice(index, 1)">Удалить</button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="crm-nav-pill-item" @click="parts.push({ set_id: '', join: 'and' })">
              Добавить набор
            </button>
            <button type="button" class="crm-nav-pill-item" @click="parts.push({ set_id: '', join: 'and', email: '' })">
              Почта семьи
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="submit" class="crm-nav-pill-item is-active">Посчитать</button>
            <button type="button" class="crm-nav-pill-item" :disabled="sending" @click="send">Отправить</button>
          </div>
          <p v-if="error" class="text-sm m-0" style="color:#b42318">{{ error }}</p>
          <div v-if="stats" class="text-sm">
            <p class="m-0">
              Подошло: {{ stats.matching }} · отправим: {{ stats.sendable }} · без согласия:
              {{ stats.skipped.no_consent }} · плохая почта: {{ stats.skipped.bad_email }}
            </p>
            <p v-if="stats.sample_emails.length" class="m-0 text-muted">{{ stats.sample_emails.join(", ") }}</p>
          </div>
        </form>
      </CrmPanel>
    </div>

    <div v-show="tab === 'rules'" class="flex flex-col gap-6">
    <CrmPanel
      title="Правила"
      help="Выключенное само не пишет. «Запустить» — один раз сейчас, даже если выкл. Между письмами пауза не меньше суток."
    >
      <template #header>
        <button type="button" class="crm-nav-pill-item is-active" @click="newRule">Новое правило</button>
      </template>
      <p class="text-sm text-muted m-0 mb-3">
        Выключенное само не пишет. «Запустить» — один раз сейчас. Между письмами пауза не меньше суток, не каждый день.
      </p>
      <p v-if="!rules.length" class="text-sm text-muted m-0">Пока нет правил.</p>
      <div v-else class="flex flex-col gap-2 mb-3">
        <div
          v-for="item in rules"
          :key="item.id"
          class="set-row"
          :class="{ 'is-active': editingRule?.id === item.id }"
        >
          <button type="button" class="set-row-main" @click="editRule(item)">
            {{ item.name }} · {{ item.set_name || item.set_id }} · пауза {{ item.cooldown_hours }} ч
          </button>
          <button
            type="button"
            class="crm-nav-pill-item"
            :class="{ 'is-active': item.enabled }"
            :disabled="togglingRule === item.id"
            @click="toggleRule(item)"
          >
            {{ item.enabled ? "Вкл" : "Выкл" }}
          </button>
          <button type="button" class="crm-nav-pill-item" :disabled="runningRule" @click="runRule(item.id)">
            Запустить
          </button>
          <button type="button" class="mail-remove" @click="removeRule(item.id)">Удалить</button>
        </div>
      </div>
      <p v-if="error" class="text-sm m-0 mb-3" style="color:#b42318">{{ error }}</p>
      <form v-if="editingRule" class="flex flex-col gap-3" @submit.prevent="saveRule">
        <label class="text-sm font-semibold text-muted">
          Название
          <input v-model="editingRule.name" class="mail-input w-full" maxlength="80" />
        </label>
        <label class="text-sm font-semibold text-muted">
          Набор
          <select v-model="editingRule.set_id" class="mail-input w-full">
            <option value="">набор…</option>
            <option v-for="item in sets" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label class="text-sm font-semibold text-muted">
          Тема
          <input v-model="editingRule.subject" class="mail-input w-full" maxlength="120" />
        </label>
        <label class="text-sm font-semibold text-muted">
          Письмо
          <MailComposer v-model="editingRule.body" :subject="editingRule.subject" />
        </label>
        <label class="text-sm font-semibold text-muted">
          Пауза, часов
          <input v-model.number="editingRule.cooldown_hours" class="mail-input" type="number" min="24" max="720" />
        </label>
        <label class="text-sm">
          <input v-model="editingRule.enabled" type="checkbox" />
          Само шлёт
        </label>
        <p class="text-sm text-muted m-0">Выключенное само не пишет. «Запустить» в списке — один раз вручную.</p>
        <div class="flex flex-wrap gap-2">
          <button type="submit" class="crm-nav-pill-item is-active">Сохранить</button>
          <button type="button" class="crm-nav-pill-item" @click="previewRule">Посчитать</button>
          <button type="button" class="crm-nav-pill-item" @click="cancelRule">Отмена</button>
        </div>
        <p v-if="ruleStats" class="text-sm m-0">
          Подошло: {{ ruleStats.matching }} · отправим: {{ ruleStats.sendable }}
          <span v-if="ruleStats.skipped.cooldown"> · пауза правила: {{ ruleStats.skipped.cooldown }}</span>
          <span v-if="ruleStats.skipped.recent_mail"> · уже писали сегодня: {{ ruleStats.skipped.recent_mail }}</span>
        </p>
      </form>
    </CrmPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import MailComposer from "@/components/crm/MailComposer.vue";
import {
  crmApi,
  type MailCampaign,
  type MailCondition,
  type MailDelivery,
  type MailGroup,
  type MailMeta,
  type MailOffer,
  type MailPreview,
  type MailRecipe,
  type MailRule,
  type MailSet,
} from "@/lib/api";
import { mailTabFromQuery, type MailTabId } from "@/lib/mail-nav";

type CampaignPart = { set_id: string; join: string; email?: string };

const route = useRoute();
const router = useRouter();
const tab = computed(() => mailTabFromQuery(route.query.tab));
const tabMeta = computed(() => {
  if (tab.value === "write") {
    return {
      subtitle: "Тема и тело только тем, у кого согласие. Имя ребёнка в письмо не попадает.",
      help: "Подставить шаблон или написать своё. Отправка руками. Черновик сам не уходит.",
    };
  }
  if (tab.value === "sets") {
    return {
      subtitle: "Набор — кого выбрать. Кампания потом складывает наборы И / ИЛИ.",
      help: "Готовые нельзя стереть. Свои можно править. «Все сразу» — каждая группа; «любой» — достаточно одной.",
    };
  }
  if (tab.value === "rules") {
    return {
      subtitle: "Выключенное само не пишет. Между письмами пауза не меньше суток.",
      help: "«Запустить» — один раз сейчас, даже если выкл. Не чаще раза в сутки на семью.",
    };
  }
  return {
    subtitle: "Что уже ушло. Клик по ссылке видно, открытие письма — нет.",
    help: "Смотрим вход, рисунок, оплату и клик по персональной ссылке. Если в теме есть пометка правила — это авторассылка.",
  };
});

function goMailTab(id: MailTabId) {
  void router.replace({ query: { ...route.query, tab: id } });
}
const sets = ref<MailSet[]>([]);
const rules = ref<MailRule[]>([]);
const campaigns = ref<MailCampaign[]>([]);
const offers = ref<MailOffer[]>([]);
const offerNote = ref("");
const deliveries = ref<MailDelivery[]>([]);
const deliveryTotal = ref(0);
const deliveryClicked = ref(0);
const selectedCampaign = ref("");
const drafting = ref("");
const fields = ref<MailMeta["fields"]>([]);
const opLabels = ref<Record<string, string>>({});
const editing = ref<(MailSet & { isNew?: boolean; groups: MailGroup[] }) | null>(null);
const subject = ref("");
const body = ref("");
const parts = ref<CampaignPart[]>([{ set_id: "", join: "and" }]);
const stats = ref<MailPreview | null>(null);
const setStats = ref<MailPreview | null>(null);
const error = ref("");
const sending = ref(false);
const runningRule = ref(false);
const togglingRule = ref("");
const editingRule = ref<(MailRule & { isNew?: boolean }) | null>(null);
const ruleStats = ref<MailPreview | null>(null);

const customSets = computed(() => sets.value.filter((item) => !item.is_system));
const systemSets = computed(() => sets.value.filter((item) => item.is_system));

function opLabel(op: string) {
  return opLabels.value[op] || op;
}

function fieldType(key: string) {
  return fields.value.find((item) => item.key === key)?.type ?? "bool";
}

function opsFor(key: string) {
  return fields.value.find((item) => item.key === key)?.ops ?? ["eq"];
}

function blankCondition(): MailCondition {
  return { field: "marketing_consent", op: "eq", value: true };
}

function blankGroup(): MailGroup {
  return { combinator: "and", conditions: [blankCondition()] };
}

function resetOp(cond: MailCondition) {
  const ops = opsFor(cond.field);
  if (!ops.includes(cond.op)) cond.op = ops[0] ?? "eq";
  const kind = fieldType(cond.field);
  if (kind === "bool") cond.value = true;
  else if (kind === "str") cond.value = "";
  else cond.value = 1;
}

function copySystemSet(item: MailSet) {
  const groups = (item.groups?.length ? item.groups : [{ combinator: item.combinator, conditions: item.conditions }]).map(
    (group) => ({
      combinator: group.combinator,
      conditions: group.conditions.map((cond) => ({ ...cond })),
    }),
  );
  editing.value = {
    id: "",
    name: `Копия: ${item.name}`,
    combinator: item.combinator,
    conditions: [],
    groups,
    is_system: false,
    created_at: 0,
    isNew: true,
  };
  setStats.value = null;
}

function useInCampaign(item: MailSet) {
  if (!parts.value.some((part) => part.set_id === item.id && !part.email)) {
    const empty = parts.value.find((part) => !part.set_id && !part.email);
    if (empty) empty.set_id = item.id;
    else parts.value.push({ set_id: item.id, join: "and" });
  }
  goMailTab("write");
}

function newSet() {
  editing.value = {
    id: "",
    name: "",
    combinator: "and",
    conditions: [],
    groups: [blankGroup()],
    is_system: false,
    created_at: 0,
    isNew: true,
  };
  setStats.value = null;
}

function editSet(item: MailSet) {
  const groups = (item.groups?.length ? item.groups : [{ combinator: item.combinator, conditions: item.conditions }]).map(
    (group) => ({
      combinator: group.combinator,
      conditions: group.conditions.map((cond) => ({ ...cond })),
    }),
  );
  editing.value = {
    ...item,
    groups,
    conditions: groups[0]?.conditions ?? [],
  };
  setStats.value = null;
}

function addCondition(index: number) {
  editing.value?.groups[index]?.conditions.push(blankCondition());
}

function addGroup() {
  editing.value?.groups.push(blankGroup());
}

function removeCondition(gIndex: number, index: number) {
  const group = editing.value?.groups[gIndex];
  if (!group) return;
  group.conditions.splice(index, 1);
  if (!group.conditions.length) group.conditions.push(blankCondition());
}

function removeGroup(index: number) {
  if (!editing.value) return;
  if (editing.value.groups.length <= 1) {
    editing.value.groups = [blankGroup()];
    return;
  }
  editing.value.groups.splice(index, 1);
}

function cancelEdit() {
  editing.value = null;
  setStats.value = null;
}

function blankRule(): MailRule & { isNew: boolean } {
  return {
    id: "",
    name: "",
    set_id: "",
    set_name: "",
    subject: "",
    body: "",
    enabled: false,
    cooldown_hours: 72,
    created_at: 0,
    last_run_at: null,
    isNew: true,
  };
}

function newRule() {
  editingRule.value = blankRule();
  ruleStats.value = null;
}

function editRule(item: MailRule) {
  editingRule.value = { ...item };
  ruleStats.value = null;
}

function cancelRule() {
  editingRule.value = null;
  ruleStats.value = null;
}

function rulePayload() {
  const row = editingRule.value;
  if (!row) return null;
  return {
    name: row.name,
    set_id: row.set_id,
    subject: row.subject,
    body: row.body,
    enabled: row.enabled,
    cooldown_hours: row.cooldown_hours,
  };
}

async function saveRule() {
  const payload = rulePayload();
  if (!payload || !editingRule.value) return;
  error.value = "";
  try {
    if (editingRule.value.isNew || !editingRule.value.id) {
      editingRule.value = await crmApi.mailRuleCreate(payload);
    } else {
      editingRule.value = await crmApi.mailRuleUpdate(editingRule.value.id, payload);
    }
    await load();
  } catch {
    error.value = "Правило не сохранилось. Нужны название, набор и текст.";
  }
}

async function previewRule() {
  if (!editingRule.value?.id || editingRule.value.isNew) {
    error.value = "Сначала сохраните правило.";
    return;
  }
  error.value = "";
  try {
    ruleStats.value = await crmApi.mailRulePreview(editingRule.value.id);
  } catch {
    error.value = "Набор не собрался.";
  }
}

async function toggleRule(item: MailRule) {
  error.value = "";
  togglingRule.value = item.id;
  try {
    const next = await crmApi.mailRuleUpdate(item.id, {
      name: item.name,
      set_id: item.set_id,
      subject: item.subject,
      body: item.body,
      enabled: !item.enabled,
      cooldown_hours: item.cooldown_hours,
    });
    if (editingRule.value?.id === item.id) {
      editingRule.value = { ...editingRule.value, enabled: next.enabled };
    }
    await load();
  } catch {
    error.value = "Не переключилось.";
  } finally {
    togglingRule.value = "";
  }
}

async function runRule(id: string) {
  error.value = "";
  runningRule.value = true;
  try {
    const result = await crmApi.mailRuleRun(id);
    if (result.skipped === "too_soon") {
      error.value = "Это правило уже запускали меньше часа назад.";
    } else if (result.skipped === "empty") {
      error.value = "Некого слать: нет согласия, пауза или уже писали.";
    } else {
      goMailTab("sent");
    }
    await load();
  } catch {
    error.value = "Не отправили.";
  } finally {
    runningRule.value = false;
  }
}

async function removeRule(id: string) {
  try {
    await crmApi.mailRuleDelete(id);
    if (editingRule.value?.id === id) {
      editingRule.value = null;
      ruleStats.value = null;
    }
    await load();
  } catch {
    error.value = "Правило не удалилось.";
  }
}

function recipe(): MailRecipe {
  return {
    parts: parts.value
      .filter((part) => part.set_id || (part.email || "").trim())
      .map((part, index) => {
        const join = index === 0 ? "and" : part.join;
        const email = (part.email || "").trim();
        if (email) {
          return {
            join,
            combinator: "and",
            groups: [
              {
                combinator: "and",
                conditions: [{ field: "email", op: "eq", value: email }],
              },
            ],
          };
        }
        return { set_id: part.set_id, join };
      }),
  };
}

async function load() {
  const [meta, setBody, history, ruleBody, offerBody] = await Promise.all([
    crmApi.mailMeta(),
    crmApi.mailSets(),
    crmApi.mailCampaigns({ limit: 50, offset: 0 }),
    crmApi.mailRules(),
    crmApi.mailOffers(),
  ]);
  fields.value = meta.fields;
  opLabels.value = meta.op_labels ?? {};
  sets.value = setBody.items;
  campaigns.value = history.items;
  rules.value = ruleBody.items;
  offers.value = offerBody.items;
  offerNote.value = offerBody.note ?? "";
}

function useOffer(item: MailOffer) {
  subject.value = item.subject;
  body.value = item.body;
  const empty = parts.value.find((part) => !part.set_id && !part.email);
  if (empty) empty.set_id = item.set_id;
  else if (!parts.value.some((part) => part.set_id === item.set_id)) {
    parts.value.push({ set_id: item.set_id, join: "and" });
  }
  stats.value = null;
  goMailTab("write");
}

async function draftOffer(item: MailOffer) {
  error.value = "";
  drafting.value = item.id;
  try {
    const created = await crmApi.mailOfferDraft(item.id);
    await load();
    goMailTab("sent");
    await openDeliveries(created.id);
  } catch {
    error.value = "Черновик не создался.";
  } finally {
    drafting.value = "";
  }
}

async function openDeliveries(campaignId: string) {
  selectedCampaign.value = campaignId;
  try {
    const body = await crmApi.mailDeliveries(campaignId, { limit: 50, offset: 0 });
    deliveries.value = body.items;
    deliveryTotal.value = body.total;
    deliveryClicked.value = body.clicked;
  } catch {
    deliveries.value = [];
    deliveryTotal.value = 0;
    deliveryClicked.value = 0;
  }
}

async function copyHop(url: string) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    error.value = "Ссылку не скопировали. Скопируйте вручную из адреса письма.";
  }
}

async function saveSet() {
  if (!editing.value) return;
  error.value = "";
  const payload = {
    name: editing.value.name,
    combinator: editing.value.combinator,
    groups: editing.value.groups,
  };
  try {
    if (editing.value.isNew || !editing.value.id) {
      await crmApi.mailSetCreate(payload);
    } else {
      await crmApi.mailSetUpdate(editing.value.id, payload);
    }
    editing.value = null;
    setStats.value = null;
    await load();
  } catch {
    error.value = "Набор не сохранился. Проверьте блоки.";
  }
}

async function removeSet() {
  if (!editing.value?.id) return;
  await removeSetById(editing.value.id);
}

async function removeSetById(id: string) {
  try {
    await crmApi.mailSetDelete(id);
    if (editing.value?.id === id) {
      editing.value = null;
      setStats.value = null;
    }
    await load();
  } catch {
    error.value = "Системный набор удалить нельзя.";
  }
}

async function previewEditing() {
  if (!editing.value) return;
  error.value = "";
  try {
    setStats.value = await crmApi.mailSetPreview({
      combinator: editing.value.combinator,
      groups: editing.value.groups,
    });
  } catch {
    error.value = "Набор не собрался. Проверьте блоки.";
  }
}

async function preview() {
  error.value = "";
  try {
    stats.value = await crmApi.mailPreview(recipe());
  } catch {
    error.value = "Набор не собрался. Проверьте части.";
  }
}

async function send() {
  error.value = "";
  sending.value = true;
  try {
    const created = await crmApi.mailCampaignCreate({
      subject: subject.value,
      body: body.value,
      recipe: recipe(),
    });
    await crmApi.mailSend(created.id);
    subject.value = "";
    body.value = "";
    await load();
    await preview();
    goMailTab("sent");
  } catch {
    error.value = "Не отправили. Нужно согласие, и набор не должен быть пустым.";
  } finally {
    sending.value = false;
  }
}

onMounted(async () => {
  await load();
  const email = String(route.query.email || "").trim();
  if (email) {
    parts.value = [{ set_id: "", join: "and", email }];
    goMailTab("write");
  }
});
</script>

<style scoped>
.mail-split {
  align-items: start;
}

.set-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  border: 1px solid var(--crm-line, #ebebeb);
  border-radius: 9999px;
  padding: 0.25rem 0.35rem 0.25rem 0.9rem;
  background: #fff;
}

.set-row.is-active {
  border-color: var(--crm-accent);
}

.set-row-main {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  padding: 0.35rem 0;
}

.mail-input {
  display: block;
  margin-top: 0.25rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--crm-line, #ebebeb);
  background: #fafafa;
  font: inherit;
}

.mail-select-combinator {
  min-width: 14rem;
  padding-right: 2.25rem;
}

.mail-select-field {
  min-width: 16rem;
  padding-right: 2.25rem;
}

.mail-select-op {
  min-width: 8.5rem;
  padding-right: 1.75rem;
}

.mail-remove {
  flex-shrink: 0;
  padding: 0.4rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid #f0b4b4;
  background: #fff;
  color: #b42318;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

.mail-add {
  align-self: flex-start;
  width: auto;
}

.mail-body {
  min-height: 10rem;
  border-radius: 1rem;
}

.mail-cond {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.mail-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px dashed var(--crm-line, #ebebeb);
  border-radius: 1rem;
}

.mail-group-head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
}

.mail-hint {
  border: 1px dashed var(--crm-line, #ebebeb);
  border-radius: 1rem;
  padding: 0.75rem 1rem;
}

.mail-hint summary {
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
}

.mail-hint-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding-top: 0.5rem;
}

.parent-row {
  cursor: pointer;
}

.parent-row:hover,
.parent-row.is-active {
  background: #fafafa;
}
</style>
