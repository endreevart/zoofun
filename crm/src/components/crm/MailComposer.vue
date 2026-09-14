<template>
  <div class="composer">
    <div class="composer-toolbar">
      <button type="button" class="crm-nav-pill-item mail-add" @click="addText">Абзац</button>
      <button type="button" class="crm-nav-pill-item mail-add" :disabled="uploading" @click="pickImage">
        Фото
      </button>
      <input ref="fileInput" class="sr-only" type="file" accept="image/jpeg,image/png,image/gif,image/webp" @change="onFile" />
    </div>
    <p v-if="uploadError" class="composer-error">{{ uploadError }}</p>
    <div v-for="(block, index) in blocks" :key="block.id" class="composer-block">
      <textarea
        v-if="block.type === 'text'"
        v-model="block.text"
        class="mail-input mail-body"
        rows="4"
        placeholder="Текст письма для родителя. Имя ребёнка сюда не пишем."
        @input="emitHtml"
      />
      <div v-else class="composer-image">
        <img :src="block.src" alt="" />
      </div>
      <button type="button" class="mail-remove" @click="removeBlock(index)">Удалить</button>
    </div>
    <p class="composer-label">Как увидит родитель</p>
    <iframe
      class="composer-preview"
      title="Превью письма"
      sandbox="allow-same-origin"
      :srcdoc="previewHtml"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { crmApi } from "@/lib/api";

type Block =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; src: string };

const props = defineProps<{
  modelValue: string;
  subject: string;
}>();

const emit = defineEmits<{ "update:modelValue": [string] }>();

const blocks = ref<Block[]>([{ id: uid(), type: "text", text: "" }]);
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadError = ref("");
const previewHtml = ref("");
let timer = 0;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtml() {
  return blocks.value
    .map((block) => {
      if (block.type === "image") {
        return `<p><img src="${escapeHtml(block.src)}" alt=""></p>`;
      }
      const text = escapeHtml(block.text).replace(/\n/g, "<br>");
      return `<p>${text}</p>`;
    })
    .join("");
}

function emitHtml() {
  emit("update:modelValue", toHtml());
}

function addText() {
  blocks.value.push({ id: uid(), type: "text", text: "" });
  emitHtml();
}

function removeBlock(index: number) {
  blocks.value.splice(index, 1);
  if (!blocks.value.length) blocks.value.push({ id: uid(), type: "text", text: "" });
  emitHtml();
}

function pickImage() {
  fileInput.value?.click();
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  uploadError.value = "";
  uploading.value = true;
  try {
    const stored = await crmApi.mailImage(file);
    blocks.value.push({ id: uid(), type: "image", src: stored.url });
    emitHtml();
  } catch {
    uploadError.value = "Фото не загрузилось. JPEG, PNG, GIF или WebP, до 1.5 МБ.";
  } finally {
    uploading.value = false;
  }
}

async function refreshPreview() {
  try {
    const rendered = await crmApi.mailRender(props.subject, props.modelValue || toHtml());
    previewHtml.value = rendered.html;
  } catch {
    previewHtml.value = "";
  }
}

function schedulePreview() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void refreshPreview();
  }, 350);
}

watch(() => [props.subject, props.modelValue], schedulePreview);
watch(
  () => props.modelValue,
  (next) => {
    if (!next) {
      blocks.value = [{ id: uid(), type: "text", text: "" }];
    }
  },
);

onMounted(() => {
  emitHtml();
  void refreshPreview();
});
</script>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.composer-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.composer-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  width: 100%;
}

.composer-image {
  width: 100%;
  border-radius: 1rem;
  overflow: hidden;
  background: #fafafa;
}

.composer-image img {
  display: block;
  width: 100%;
  max-height: 16rem;
  object-fit: contain;
}

.composer-label {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--crm-muted, #8a8a8a);
}

.composer-preview {
  width: 100%;
  min-height: 28rem;
  border: 1px solid var(--crm-line, #ebebeb);
  border-radius: 1.25rem;
  background: #f2eee3;
}

.composer-error {
  margin: 0;
  font-size: 0.8125rem;
  color: #b42318;
}

.mail-input {
  display: block;
  width: 100%;
  padding: 0.4rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--crm-line, #ebebeb);
  background: #fafafa;
  font: inherit;
}

.mail-body {
  min-height: 7rem;
  border-radius: 1rem;
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
}
</style>
