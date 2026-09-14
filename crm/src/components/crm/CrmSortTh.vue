<template>
  <th class="crm-sort-th" :class="{ 'is-active': active }" @click="$emit('sort')">
    <span>{{ label }}</span>
    <span v-if="active" class="crm-sort-dir">{{ dir === "asc" ? "↑" : "↓" }}</span>
  </th>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
  dir?: "asc" | "desc"
}>()

defineEmits<{ sort: [] }>()
</script>

<style scoped>
.crm-sort-th {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.crm-sort-th.is-active {
  color: inherit;
}

.crm-sort-dir {
  margin-left: 0.25rem;
  font-size: 0.75rem;
}
</style>
