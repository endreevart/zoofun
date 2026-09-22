<template>
  <div class="flex flex-col gap-4">
    <CrmPageHeader title="Открытия ЗУФАН" :count="total || null" :subtitle="pageSubtitle">
      <template #actions>
        <Tag v-if="statusCounts.needs_review > 0" :value="`${statusCounts.needs_review} на проверке`" severity="warn" />
        <Select
          v-model="status"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          placeholder="Статус"
          show-clear
          class="w-48"
        />
        <Select
          v-model="provider"
          :options="providerOptions"
          option-label="label"
          option-value="value"
          placeholder="Источник"
          show-clear
          class="w-44"
        />
        <Select
          v-model="suggestedType"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          placeholder="Тип открытия"
          show-clear
          class="w-44"
        />
        <Select
          v-model="suggestedCategory"
          :options="categoryOptions"
          option-label="label"
          option-value="value"
          placeholder="Категория открытия"
          show-clear
          class="w-48"
        />
        <InputText v-model="search" placeholder="Поиск…" @keyup.enter="reload" />
        <Button icon="pi pi-search" rounded severity="contrast" @click="reload" />
        <Button icon="pi pi-plus" label="Новое" rounded severity="contrast" @click="openNew" />
      </template>
    </CrmPageHeader>

    <CrmPanel :delay="80">
      <Message v-if="!loading" severity="info" :closable="false" class="mb-0">
        Сундук на острове берёт только опубликованные факты. Викторины, миссии и картинки Wikipedia здесь не нужны.
      </Message>
      <CrmTableSkeleton v-if="loading && rows.length === 0" />
      <CrmEmptyState
        v-else-if="!loading && rows.length === 0"
        icon="pi pi-compass"
        title="Черновиков нет"
        description="Смените фильтры или добавьте факт."
        action-label="Новое открытие"
        @action="openNew"
      />
      <DataTable
        v-else
        :value="rows"
        :loading="loading"
        paginator
        lazy
        :rows="25"
        :first="(page - 1) * 25"
        :total-records="total"
        data-key="id"
        @page="onPage"
      >
        <Column header="" style="width: 4.5rem">
          <template #body>
            <div class="w-10 h-10 rounded-xl bg-canvas" />
          </template>
        </Column>
        <Column field="title_ru">
          <template #header>
            <span>{{ colHeader("Заголовок", total) }}</span>
          </template>
          <template #body="{ data }">
            <button type="button" class="crm-link text-left" @click="openReview(data.id)">
              {{ data.title_ru || data.title || data.id }}
            </button>
          </template>
        </Column>
        <Column field="provider" style="width: 7rem">
          <template #header>
            <span>{{ colHeader("Источник", total) }}</span>
          </template>
          <template #body="{ data }">{{ providerLabel(data.provider) }}</template>
        </Column>
        <Column field="suggested_type" style="width: 8rem">
          <template #header>
            <span>{{ colHeader("Тип", total) }}</span>
          </template>
          <template #body="{ data }">{{ typeLabel(data.suggested_type || data.kind) }}</template>
        </Column>
        <Column field="suggested_category" style="width: 8rem">
          <template #header>
            <span>{{ colHeader("Категория", total) }}</span>
          </template>
          <template #body="{ data }">{{ categoryLabel(data.suggested_category || data.category) }}</template>
        </Column>
        <Column field="status" style="width: 8rem">
          <template #header>
            <span>{{ colHeader("Статус", total) }}</span>
          </template>
          <template #body="{ data }">
            <Tag :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" />
          </template>
        </Column>
        <Column field="created_at" style="width: 9rem">
          <template #header>
            <span>{{ colHeader("Создан", total) }}</span>
          </template>
          <template #body="{ data }">{{ formatWhen(data.created_at, true) }}</template>
        </Column>
        <Column style="width: 10rem">
          <template #header>
            <span>{{ colHeader("Действия", total) }}</span>
          </template>
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button
                v-if="canPublishStatus(data.status)"
                icon="pi pi-check"
                rounded
                text
                severity="success"
                v-tooltip="'Опубликовать'"
                :loading="actionId === data.id && actionKind === 'publish'"
                @click="quickPublish(data)"
              />
              <Button
                v-if="canRejectStatus(data.status)"
                icon="pi pi-times"
                rounded
                text
                severity="danger"
                v-tooltip="'Отклонить'"
                :loading="actionId === data.id && actionKind === 'reject'"
                @click="quickReject(data)"
              />
              <Button icon="pi pi-pencil" rounded text v-tooltip="'Править'" @click="openReview(data.id)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </CrmPanel>

    <CrmDrawer
      v-model:visible="drawerVisible"
      :title="drawerTitle"
      :saving="saving"
      save-label="Сохранить"
      :show-footer="!!detail"
      :deletable="detail?.status === 'rejected'"
      @save="saveDraft"
      @delete="deleteDraft"
      @cancel="drawerVisible = false"
    >
      <div v-if="detailLoading" class="text-sm text-muted">Загрузка…</div>
      <div v-else-if="detail" class="flex flex-col gap-4">
        <div v-if="detail.status === 'approved'" class="flex items-center gap-2">
          <Tag value="Опубликовано" severity="success" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CrmFormField label="Тип">
            <Select
              v-model="form.kind"
              :options="typeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
          </CrmFormField>
          <CrmFormField label="Категория">
            <Select
              v-model="form.category"
              :options="categoryOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
          </CrmFormField>
          <CrmFormField label="Возраст">
            <Select
              v-model="form.age"
              :options="ageOptions"
              option-label="label"
              option-value="value"
              class="w-full"
            />
          </CrmFormField>
        </div>

        <CrmFormField label="Заголовок RU">
          <InputText v-model="form.title" class="w-full" />
        </CrmFormField>
        <CrmFormField label="Текст RU">
          <Textarea v-model="form.body" rows="4" auto-resize class="w-full" />
        </CrmFormField>

        <Accordion>
          <AccordionPanel value="meta">
            <AccordionHeader>Источник и мета</AccordionHeader>
            <AccordionContent>
              <div class="flex flex-col gap-2 text-sm">
                <div>
                  <span class="text-muted">Источник:</span>
                  {{ providerLabel(detail.provider) }} / {{ detail.id }}
                </div>
                <div>
                  <span class="text-muted">Тип:</span> {{ typeLabel(form.kind) }},
                  {{ categoryLabel(form.category) }},
                  {{ ageLabel(form.age) }}
                </div>
                <div v-if="detail.rejection_reason" class="text-danger">
                  Причина отклонения: {{ detail.rejection_reason }}
                </div>
              </div>
            </AccordionContent>
          </AccordionPanel>
        </Accordion>

        <div v-if="detail.status !== 'approved' || canRejectStatus(detail.status)" class="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button
            v-if="canPublishStatus(detail.status)"
            icon="pi pi-check"
            label="Опубликовать"
            rounded
            severity="success"
            :loading="actionKind === 'publish'"
            @click="publishCurrent"
          />
          <Button
            v-if="canRejectStatus(detail.status)"
            icon="pi pi-times"
            label="Отклонить"
            rounded
            severity="danger"
            outlined
            :loading="actionKind === 'reject'"
            @click="rejectCurrent"
          />
          <Button
            v-if="hasNext"
            icon="pi pi-arrow-right"
            label="Следующий"
            rounded
            text
            @click="openNext"
          />
        </div>
      </div>
    </CrmDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Select from "primevue/select";
import Button from "primevue/button";
import Tag from "primevue/tag";
import Message from "primevue/message";
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionHeader from "primevue/accordionheader";
import AccordionContent from "primevue/accordioncontent";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import CrmDrawer from "@/components/crm/CrmDrawer.vue";
import CrmFormField from "@/components/crm/CrmFormField.vue";
import CrmTableSkeleton from "@/components/crm/CrmTableSkeleton.vue";
import CrmEmptyState from "@/components/crm/CrmEmptyState.vue";
import { crmApi, type DiscoveryRow } from "@/lib/api";
import { colHeader, statusSeverity } from "@/lib/col-header";
import { formatWhen } from "@/lib/when";

const confirm = useConfirm();
const toast = useToast();

const rows = ref<DiscoveryRow[]>([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const search = ref("");
const status = ref<string | null>("approved");
const provider = ref<string | null>(null);
const suggestedType = ref<string | null>(null);
const suggestedCategory = ref<string | null>(null);
const statusCounts = ref({
  needs_review: 0,
  approved: 0,
  rejected: 0,
  fetched: 0,
  all: 0,
});

const drawerVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<DiscoveryRow | null>(null);
const currentId = ref<string | null>(null);
const saving = ref(false);
const actionId = ref<string | null>(null);
const actionKind = ref<"publish" | "reject" | null>(null);

const statusOptions = [
  { label: "На проверке", value: "needs_review" },
  { label: "Загружено", value: "fetched" },
  { label: "Одобрено", value: "approved" },
  { label: "Отклонено", value: "rejected" },
];

const providerOptions = [
  { label: "Сид", value: "seed" },
  { label: "Вручную", value: "manual" },
];

const typeOptions = [
  { label: "Факт", value: "fact" },
  { label: "Викторина", value: "quiz" },
  { label: "Викторина с картинками", value: "image_quiz" },
  { label: "Выбор", value: "choice" },
  { label: "Миссия", value: "mission" },
  { label: "История", value: "story" },
];

const categoryOptions = [
  { label: "Животные", value: "animals" },
  { label: "Природа", value: "nature" },
  { label: "Космос", value: "space" },
  { label: "Эмоции", value: "emotions" },
  { label: "Тело", value: "body" },
  { label: "Безопасность", value: "safety" },
  { label: "Технологии", value: "technology" },
  { label: "Деньги", value: "money" },
  { label: "Отношения", value: "relationships" },
];

const ageOptions = [
  { label: "4–6 лет", value: "preschool" },
  { label: "7–9 лет", value: "junior" },
  { label: "10+ лет", value: "teen" },
];

const form = reactive({
  kind: "fact",
  category: "animals",
  age: "preschool",
  title: "",
  body: "",
});

const pageSubtitle = computed(() => {
  const parts = [
    `Всего в базе: ${statusCounts.value.all}`,
    `на проверке: ${statusCounts.value.needs_review}`,
    `одобрено: ${statusCounts.value.approved}`,
    `отклонено: ${statusCounts.value.rejected}`,
  ];
  if (status.value) {
    parts.unshift(`Фильтр «${statusLabel(status.value)}»: ${total.value}`);
  } else {
    parts.unshift(`Показано: ${rows.value.length} из ${total.value}`);
  }
  return parts.join(" · ");
});

const drawerTitle = computed(() => {
  if (!detail.value) return "Открытие";
  return detail.value.title_ru || detail.value.title || "Черновик";
});

const queueIds = computed(() =>
  rows.value.filter((row) => canPublishStatus(row.status) || canRejectStatus(row.status)).map((row) => row.id),
);

const hasNext = computed(() => {
  if (!currentId.value) return false;
  const idx = queueIds.value.indexOf(currentId.value);
  return idx >= 0 && idx < queueIds.value.length - 1;
});

function statusLabel(value: string) {
  return statusOptions.find((item) => item.value === value)?.label ?? value;
}

function typeLabel(value: string) {
  return typeOptions.find((item) => item.value === value)?.label ?? value;
}

function categoryLabel(value: string) {
  return categoryOptions.find((item) => item.value === value)?.label ?? value;
}

function ageLabel(value: string) {
  return ageOptions.find((item) => item.value === value)?.label ?? value;
}

function providerLabel(value: string) {
  return providerOptions.find((item) => item.value === value)?.label ?? value;
}

function canPublishStatus(value: string) {
  return value !== "approved";
}

function canRejectStatus(value: string) {
  return value !== "rejected";
}

function fillForm(data: DiscoveryRow) {
  form.kind = data.kind || data.suggested_type || "fact";
  form.category = data.category || data.suggested_category || "animals";
  form.age = data.age || data.suggested_age_group || "preschool";
  form.title = data.title_ru || data.title || "";
  form.body = data.body || "";
}

function writeBody() {
  return {
    title: form.title,
    body: form.body,
    kind: form.kind,
    age: form.age,
    category: form.category,
    sort_order: detail.value?.sort_order ?? 0,
  };
}

async function load() {
  loading.value = true;
  try {
    const resp = await crmApi.discoveries({
      limit: 25,
      offset: (page.value - 1) * 25,
      status: status.value || "",
      provider: provider.value || "",
      kind: suggestedType.value || "",
      category: suggestedCategory.value || "",
      q: search.value,
    });
    rows.value = resp.items;
    total.value = resp.total;
    statusCounts.value = {
      all: resp.status_counts.all,
      needs_review: resp.status_counts.needs_review,
      approved: resp.status_counts.approved,
      rejected: resp.status_counts.rejected,
      fetched: resp.status_counts.fetched,
    };
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  void load();
}

function onPage(event: { page: number }) {
  page.value = event.page + 1;
  void load();
}

async function openReview(id: string) {
  currentId.value = id;
  drawerVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await crmApi.discovery(id);
    fillForm(detail.value);
  } catch (err) {
    toast.add({ severity: "error", summary: err instanceof Error ? err.message : "Ошибка", life: 4000 });
    drawerVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function openNew() {
  currentId.value = null;
  detail.value = {
    id: "",
    title: "",
    title_ru: "",
    title_en: "",
    body: "",
    kind: "fact",
    suggested_type: "fact",
    age: "preschool",
    suggested_age_group: "preschool",
    category: "animals",
    suggested_category: "animals",
    status: "needs_review",
    is_active: false,
    provider: "manual",
    sort_order: 0,
    rejection_reason: "",
    created_at: 0,
    updated_at: 0,
  };
  fillForm(detail.value);
  drawerVisible.value = true;
}

async function saveDraft() {
  saving.value = true;
  try {
    if (!currentId.value) {
      detail.value = await crmApi.discoveryCreate(writeBody());
      currentId.value = detail.value.id;
    } else {
      detail.value = await crmApi.discoveryUpdate(currentId.value, writeBody());
    }
    fillForm(detail.value);
    toast.add({ severity: "success", summary: "Сохранено", life: 2000 });
    await load();
  } catch (err) {
    toast.add({ severity: "error", summary: err instanceof Error ? err.message : "Ошибка", life: 4000 });
  } finally {
    saving.value = false;
  }
}

async function publishDraft(id: string, opts?: { openNext?: boolean }) {
  actionId.value = id;
  actionKind.value = "publish";
  try {
    if (currentId.value === id) {
      await crmApi.discoveryUpdate(id, writeBody());
    }
    const result = await crmApi.discoveryPublish(id);
    toast.add({
      severity: "success",
      summary: "Опубликовано",
      detail: result.discovery.title,
      life: 3000,
    });
    await load();
    if (opts?.openNext) {
      openNextAfter(id);
    } else {
      drawerVisible.value = false;
    }
  } catch (err) {
    toast.add({ severity: "error", summary: err instanceof Error ? err.message : "Ошибка", life: 5000 });
  } finally {
    actionId.value = null;
    actionKind.value = null;
  }
}

async function rejectDraft(id: string, reason = "", opts?: { openNext?: boolean }) {
  actionId.value = id;
  actionKind.value = "reject";
  try {
    await crmApi.discoveryReject(id, { reason });
    toast.add({ severity: "info", summary: "Отклонено", life: 2000 });
    await load();
    if (opts?.openNext) {
      openNextAfter(id);
    } else {
      drawerVisible.value = false;
    }
  } catch (err) {
    toast.add({ severity: "error", summary: err instanceof Error ? err.message : "Ошибка", life: 4000 });
  } finally {
    actionId.value = null;
    actionKind.value = null;
  }
}

function openNextAfter(id: string) {
  const ids = queueIds.value;
  const idx = ids.indexOf(id);
  const nextId = idx >= 0 ? ids[idx + 1] : ids[0];
  if (nextId && nextId !== id) {
    void openReview(nextId);
  } else {
    drawerVisible.value = false;
  }
}

function openNext() {
  if (!currentId.value) return;
  openNextAfter(currentId.value);
}

function quickPublish(row: DiscoveryRow) {
  confirm.require({
    message: `Опубликовать «${row.title_ru || row.title}»?`,
    header: "Подтвердите",
    accept: () => publishDraft(row.id),
  });
}

function quickReject(row: DiscoveryRow) {
  confirm.require({
    message: `Отклонить «${row.title_ru || row.title}»?`,
    header: "Подтвердите",
    accept: () => rejectDraft(row.id, "Rejected in CRM"),
  });
}

function publishCurrent() {
  if (!currentId.value) {
    void saveDraft().then(() => {
      if (currentId.value) publishCurrent();
    });
    return;
  }
  confirm.require({
    message: "Опубликовать это открытие в каталог?",
    header: "Подтвердите",
    accept: () => publishDraft(currentId.value!, { openNext: true }),
  });
}

function rejectCurrent() {
  if (!currentId.value) return;
  confirm.require({
    message: "Отклонить черновик?",
    header: "Подтвердите",
    accept: () => rejectDraft(currentId.value!, "Rejected in CRM", { openNext: true }),
  });
}

function deleteDraft() {
  if (!currentId.value) return;
  confirm.require({
    message: "Удалить черновик навсегда?",
    header: "Подтвердите",
    accept: async () => {
      await crmApi.discoveryDelete(currentId.value!);
      drawerVisible.value = false;
      await load();
    },
  });
}

watch([status, provider, suggestedType, suggestedCategory], reload);

onMounted(load);
</script>

<style scoped>
.text-muted {
  color: var(--p-text-muted-color);
}
.text-danger {
  color: var(--p-red-500);
}
.border-border {
  border-color: var(--p-content-border-color);
}
:deep(.p-button.p-button-contrast) {
  background: #141414 !important;
  border-color: #141414 !important;
}
</style>
