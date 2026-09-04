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
        <div class="crm-topbar-nav">
          <nav v-if="sectionTabs.length" class="crm-nav-pill">
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
            <component :is="Component" :key="route.fullPath + viewKey" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import { FUNNEL_NAV_TABS } from "@/lib/funnel-nav";
import { useAuthStore } from "@/stores/auth";

type SectionTab = {
  name: string;
  label: string;
  params?: { key: string };
};

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const viewKey = ref(0);

const primaryNav = [
  { key: "funnels", label: "Воронки", icon: "pi pi-filter", routes: ["funnels", "funnel-detail"] },
  { key: "traffic", label: "Посещаемость", icon: "pi pi-globe", routes: ["traffic"] },
  { key: "usage", label: "Остров", icon: "pi pi-chart-bar", routes: ["usage"] },
  { key: "parents", label: "Родители", icon: "pi pi-users", routes: ["parents"] },
  { key: "creatures", label: "Звери", icon: "pi pi-star", routes: ["creatures"] },
  { key: "payments", label: "Платежи", icon: "pi pi-money-bill", routes: ["payments"] },
];

const sectionTabs = computed((): SectionTab[] => {
  if (["funnels", "funnel-detail"].includes(String(route.name))) {
    return FUNNEL_NAV_TABS;
  }
  return [];
});

function tabKey(tab: SectionTab) {
  return tab.params?.key ? `${tab.name}:${tab.params.key}` : tab.name;
}

function isTabActive(tab: SectionTab) {
  if (route.name !== tab.name) return false;
  if (tab.params?.key) return route.params.key === tab.params.key;
  return true;
}

function goTab(tab: SectionTab) {
  void router.push(tab.params ? { name: tab.name, params: tab.params } : { name: tab.name });
}

function refreshPage() {
  viewKey.value += 1;
}

function onLogout() {
  auth.logout();
  router.push({ name: "login" });
}
</script>
