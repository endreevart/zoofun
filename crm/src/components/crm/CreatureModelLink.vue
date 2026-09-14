<template>
  <div class="creature-model">
    <span class="text-muted">3D-модель</span>
    <a
      v-if="row.has_model"
      class="crm-nav-pill-item is-active"
      :href="creatureModelUrl(row)"
    >Скачать GLB</a>
    <p v-else class="m-0 text-sm text-muted">Ещё нет.</p>
  </div>
</template>

<script setup lang="ts">
import type { CreatureRow } from "@/lib/api";
import { creatureModelUrl } from "@/lib/creatureImage";

defineProps<{ row: CreatureRow }>();
</script>

<style scoped>
.creature-model {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
}
</style>
