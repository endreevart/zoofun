<template>
  <CrmPanel :title="title" :help="help">
    <p v-if="!people.length" class="text-sm text-muted m-0">{{ empty }}</p>
    <table v-else class="w-full text-sm">
      <thead>
        <tr class="text-left text-muted">
          <th class="py-2">Почта</th>
          <th>Когда</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in people"
          :key="row.parent_id"
          class="parent-row"
          @click="openParent(row.email)"
        >
          <td class="py-2">{{ row.email || "—" }}</td>
          <td>{{ formatWhen(row.last_at, true) }}</td>
        </tr>
      </tbody>
    </table>
  </CrmPanel>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import CrmPanel from "@/components/crm/CrmPanel.vue";
import type { LivePerson } from "@/lib/api";
import { formatWhen } from "@/lib/when";

withDefaults(
  defineProps<{
    title: string;
    help: string;
    people: LivePerson[];
    empty?: string;
  }>(),
  { empty: "Сейчас никого нет." },
);

const router = useRouter();

function openParent(email: string | null) {
  if (!email) return;
  void router.push({ name: "parents", query: { q: email } });
}
</script>

<style scoped>
.parent-row {
  cursor: pointer;
}

.parent-row:hover {
  background: #fafafa;
}
</style>
