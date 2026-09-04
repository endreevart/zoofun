<template>
  <div class="flex flex-col gap-6">
    <CrmPageHeader title="Остров" subtitle="События детского экрана" />
    <div v-if="data" class="crm-grid-charts-2">
      <StatCard highlight label="Сессии острова" :value="data.island_sessions" />
      <StatCard label="Новые звери" :value="data.creatures_new" />
    </div>
    <CrmPanel v-if="data" title="События">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted">
            <th class="py-2">Событие</th>
            <th>Число</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in data.events" :key="item.event">
            <td class="py-2">{{ item.event }}</td>
            <td>{{ item.count }}</td>
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
import StatCard from "@/components/dashboard/StatCard.vue";
import { crmApi, type Usage } from "@/lib/api";

const data = ref<Usage | null>(null);

onMounted(async () => {
  data.value = await crmApi.usage(30);
});
</script>
