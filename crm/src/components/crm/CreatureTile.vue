<template>
  <component
    :is="preview ? 'div' : 'button'"
    :type="preview ? undefined : 'button'"
    class="crm-tile creature-card"
    :class="{ 'is-compact': compact, 'is-preview': preview }"
    @click="preview ? undefined : $emit('open')"
  >
    <div class="creature-pair" :class="{ 'is-stack': preview || !showPostcard }">
      <figure class="creature-photo">
        <div class="creature-card-image" :class="{ 'is-large': large }">
          <img v-if="ok" :src="src" :alt="row.name" loading="lazy" decoding="async" @error="$emit('broken')" />
          <span v-else class="creature-card-empty">Нет картинки</span>
        </div>
        <figcaption v-if="preview && ok">Игрушка</figcaption>
      </figure>
      <figure v-if="showPostcard" class="creature-photo">
        <div class="creature-card-image" :class="{ 'is-large': large }">
          <img :src="postcardSrc" alt="" loading="lazy" decoding="async" @error="postcardBroken = true" />
        </div>
        <figcaption>Открытка</figcaption>
      </figure>
    </div>
    <template v-if="!preview">
      <div class="flex items-start justify-between gap-2">
        <p class="crm-tile-title">{{ row.name }}</p>
        <span v-if="row.painted" class="crm-tile-kicker">нейросеть</span>
        <span v-else-if="row.has_model" class="crm-tile-kicker">3D</span>
      </div>
      <p class="crm-tile-meta">{{ row.lawn_title || row.parent_email }}</p>
      <p v-if="!compact" class="crm-tile-meta">{{ row.parent_email }}</p>
      <p class="crm-tile-meta">{{ formatWhen(row.created_at, true) }}</p>
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { CreatureRow } from "@/lib/api";
import { creatureImageUrl, creaturePostcardSrc } from "@/lib/creatureImage";
import { formatWhen } from "@/lib/when";

const props = defineProps<{
  row: CreatureRow;
  ok: boolean;
  compact?: boolean;
  large?: boolean;
  preview?: boolean;
}>();

defineEmits<{ open: []; broken: [] }>();

const src = computed(() => creatureImageUrl(props.row));
const postcardSrc = computed(() => creaturePostcardSrc(props.row));
const postcardBroken = ref(false);
const showPostcard = computed(
  () =>
    !postcardBroken.value &&
    (props.preview || Boolean(props.row.has_postcard || props.row.postcard_url)),
);
</script>

<style scoped>
.creature-card {
  text-align: left;
  cursor: pointer;
  border: none;
}

.creature-card.is-preview {
  cursor: default;
  box-shadow: none;
  padding: 0;
  background: transparent;
}

.creature-card.is-compact {
  padding: 0.75rem;
}

.creature-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.creature-pair.is-stack {
  grid-template-columns: 1fr;
}

.creature-photo {
  margin: 0;
}

.creature-photo figcaption {
  margin-top: 0.35rem;
  color: var(--crm-muted);
  font-size: 0.75rem;
}

.creature-card-image {
  aspect-ratio: 1;
  border-radius: 1rem;
  background: #f6f4f1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.creature-card-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.creature-card-image.is-large {
  width: 100%;
}

.creature-card-empty {
  font-size: 0.75rem;
  color: var(--crm-muted);
}
</style>
