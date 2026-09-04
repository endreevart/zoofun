<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader title="Родители" :count="items.length" />
    <CrmPanel>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted">
            <th class="py-2">Почта</th>
            <th>Кредиты</th>
            <th>Звери</th>
            <th>Создан</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.id">
            <td class="py-2">{{ row.email }}</td>
            <td>{{ row.remaining }}</td>
            <td>{{ row.creatures }}</td>
            <td>{{ formatDay(row.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </CrmPanel>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import CrmPageHeader from "@/components/crm/CrmPageHeader.vue";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import { crmApi, type ParentRow } from "@/lib/api";

const items = ref<ParentRow[]>([]);

function formatDay(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("ru-RU");
}

onMounted(async () => {
  items.value = (await crmApi.parents()).items;
});
</script>
