<template>
  <Drawer
    v-model:visible="open"
    :header="title"
    position="right"
    class="crm-drawer !w-full md:!w-[32rem] lg:!w-[40rem]"
    :dismissable="!saving"
  >
    <div class="flex flex-col gap-4 pb-24 crm-drawer-body">
      <slot />
    </div>
    <template v-if="showFooter" #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <Button :label="cancelLabel" rounded text severity="secondary" :disabled="saving" @click="onCancel" />
        <Button
          v-if="deletable"
          icon="pi pi-trash"
          label="Удалить"
          rounded
          severity="danger"
          outlined
          :disabled="saving"
          @click="$emit('delete')"
        />
        <Button
          :label="saveLabel"
          icon="pi pi-check"
          rounded
          severity="contrast"
          :loading="saving"
          @click="$emit('save')"
        />
      </div>
    </template>
  </Drawer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Drawer from "primevue/drawer";
import Button from "primevue/button";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    saving?: boolean;
    saveLabel?: string;
    cancelLabel?: string;
    showFooter?: boolean;
    deletable?: boolean;
  }>(),
  {
    saving: false,
    saveLabel: "Сохранить",
    cancelLabel: "Отмена",
    showFooter: true,
    deletable: false,
  },
);

const emit = defineEmits<{
  "update:visible": [value: boolean];
  save: [];
  cancel: [];
  delete: [];
}>();

const open = computed({
  get: () => props.visible,
  set: (v: boolean) => emit("update:visible", v),
});

function onCancel() {
  emit("cancel");
  open.value = false;
}
</script>

<style>
.crm-drawer .p-drawer-content {
  padding-bottom: 0;
}

.crm-drawer-body {
  animation: crm-drawer-in 0.35s ease-out both;
}

@keyframes crm-drawer-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
