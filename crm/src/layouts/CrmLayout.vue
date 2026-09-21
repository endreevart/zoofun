<template>
  <div class="crm-shell">
    <aside class="crm-sidebar">
      <RouterLink
        :to="{ name: 'dashboard' }"
        class="crm-sidebar-btn mb-4"
        :class="{ 'is-active': route.name === 'dashboard' }"
        v-tooltip.right="'Дашборд'"
      >
        <i class="pi pi-th-large text-lg" />
      </RouterLink>
      <button
        v-for="item in primaryNav"
        :key="item.key"
        type="button"
        class="crm-sidebar-btn"
        :class="{ 'is-active': item.routes.includes(String(route.name)) }"
        v-tooltip.right="item.label"
        @click="router.push({ name: item.routes[0] })"
      >
        <i :class="item.icon" class="text-lg" />
      </button>
      <div class="mt-auto flex flex-col gap-2">
        <button type="button" class="crm-sidebar-btn" v-tooltip.right="'Выйти'" @click="onLogout">
          <i class="pi pi-sign-out text-lg" />
        </button>
      </div>
    </aside>

    <div class="crm-main">
      <header class="crm-topbar">
        <div class="crm-topbar-brand">
          <div class="w-9 h-9 rounded-2xl bg-accent text-white flex items-center justify-center font-bold text-sm shrink-0">
            Z
          </div>
          <span class="font-bold text-lg hidden sm:block">ZOOFUN CRM</span>
        </div>
        <div v-if="sectionTabs.length" class="crm-topbar-nav">
          <nav class="crm-nav-pill">
            <button
              v-for="tab in sectionTabs"
              :key="tabKey(tab)"
              type="button"
              class="crm-nav-pill-item"
              :class="{ 'is-active': isTabActive(tab) }"
              @click="goTab(tab)"
            >
              {{ tab.label }}
            </button>
          </nav>
        </div>
        <PeriodPicker />
        <div class="crm-topbar-actions">
          <Button icon="pi pi-refresh" rounded text severity="secondary" @click="refreshPage" />
          <div class="crm-user-chip">
            <div class="crm-user-avatar">O</div>
            <div class="hidden sm:block min-w-0">
              <div class="text-sm font-semibold truncate max-w-[140px]">{{ auth.displayName }}</div>
              <div class="text-xs text-muted truncate max-w-[140px]">staff</div>
            </div>
          </div>
        </div>
      </header>
      <main class="crm-content">
        <RouterView v-slot="{ Component }">
          <Transition name="crm-page" mode="out-in">
            <component :is="Component" :key="pageKey" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import PeriodPicker from "@/components/crm/PeriodPicker.vue";
import { FUNNEL_NAV_TABS } from "@/lib/funnel-nav";
import { MAIL_NAV_TABS } from "@/lib/mail-nav";
import { USAGE_NAV_TABS } from "@/lib/usage-nav";
import { useAuthStore } from "@/stores/auth";
import { usePeriodStore } from "@/stores/period";

type SectionTab = {
  name: string;
  label: string;
  params?: { key: string };
  query?: Record<string, string>;
};

const auth = useAuthStore();
const period = usePeriodStore();
const router = useRouter();
const route = useRoute();
const viewKey = ref(0);

const primaryNav = [
  { key: "funnels", label: "Воронки", icon: "pi pi-filter", routes: ["funnels", "funnel-detail"] },
  { key: "growth", label: "Рост", icon: "pi pi-bolt", routes: ["growth"] },
  { key: "traffic", label: "Посещаемость", icon: "pi pi-globe", routes: ["traffic"] },
  { key: "usage", label: "Острова", icon: "pi pi-chart-bar", routes: ["usage", "usage-copies", "usage-buyers", "usage-events"] },
  { key: "features", label: "Поляна", icon: "pi pi-sun", routes: ["features"] },
  { key: "parents", label: "Родители", icon: "pi pi-users", routes: ["parents"] },
  { key: "creatures", label: "Звери", icon: "pi pi-star", routes: ["creatures"] },
  { key: "mail", label: "Письма", icon: "pi pi-envelope", routes: ["mail"] },
  { key: "packs", label: "Пакеты", icon: "pi pi-box", routes: ["packs"] },
  { key: "promos", label: "Промокоды", icon: "pi pi-percentage", routes: ["promos"] },
  { key: "payments", label: "Платежи", icon: "pi pi-money-bill", routes: ["payments"] },
];

const pageKey = computed(() => {
  if (route.name === "mail") return `mail-${viewKey.value}`;
  return `${route.fullPath}-${viewKey.value}`;
});

const sectionTabs = computed((): SectionTab[] => {
  if (["funnels", "funnel-detail"].includes(String(route.name))) {
    return FUNNEL_NAV_TABS;
  }
  if (["usage", "usage-copies", "usage-buyers", "usage-events"].includes(String(route.name))) {
    return USAGE_NAV_TABS;
  }
  if (route.name === "mail") return MAIL_NAV_TABS;
  return [];
});

function tabKey(tab: SectionTab) {
  const base = tab.params?.key ? `${tab.name}:${tab.params.key}` : tab.name;
  const query = tab.query ? new URLSearchParams(tab.query).toString() : "";
  return query ? `${base}?${query}` : base;
}

function isTabActive(tab: SectionTab) {
  if (route.name !== tab.name) return false;
  if (tab.params?.key) return route.params.key === tab.params.key;
  if (tab.query?.tab) {
    const current = String(route.query.tab || "sent");
    return current === tab.query.tab;
  }
  return true;
}

function goTab(tab: SectionTab) {
  void router.push({
    name: tab.name,
    params: tab.params,
    query: tab.query ? { ...route.query, ...tab.query } : tab.query,
  });
}

function refreshPage() {
  viewKey.value += 1;
}

watch(
  () => period.stamp,
  () => {
    viewKey.value += 1;
  },
);

function onLogout() {
  auth.logout();
  router.push({ name: "login" });
}
</script>
