<template>
  <div class="crm-period">
    <nav class="crm-period-pills" aria-label="Период">
      <button
        v-for="item in PERIOD_PRESETS"
        :key="item.key"
        type="button"
        class="crm-nav-pill-item"
        :class="{ 'is-active': period.range === item.key }"
        @click="period.setRange(item.key)"
      >
        {{ item.label }}
      </button>
      <button
        type="button"
        class="crm-nav-pill-item"
        :class="{ 'is-active': period.range === 'custom' }"
        @click="period.setRange('custom')"
      >
        Свой
      </button>
      <CrmHelp text="Календарь Москвы. Карточки и воронки считаются в этом окне. «Месяц» — последние 30 дней, не календарный месяц." />
    </nav>
    <div v-if="period.range === 'custom'" class="crm-period-custom">
      <label class="crm-period-date">
        <span>с</span>
        <input
          type="date"
          :value="period.from"
          :max="today"
          @change="onFrom(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="crm-period-date">
        <span>по</span>
        <input
          type="date"
          :value="period.to"
          :max="today"
          @change="onTo(($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PERIOD_PRESETS, moscowYmd } from "@/lib/period";
import { usePeriodStore } from "@/stores/period";
import CrmHelp from "@/components/crm/CrmHelp.vue";

const period = usePeriodStore();
const today = moscowYmd();

function onFrom(value: string) {
  period.setCustomDates(value, period.to);
}

function onTo(value: string) {
  period.setCustomDates(period.from, value);
}
</script>
