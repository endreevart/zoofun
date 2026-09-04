import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/pages/LoginPage.vue"),
      meta: { guest: true },
    },
    {
      path: "/",
      component: () => import("@/layouts/CrmLayout.vue"),
      meta: { requiresStaff: true },
      children: [
        { path: "", name: "dashboard", component: () => import("@/pages/DashboardPage.vue") },
        { path: "funnels", name: "funnels", component: () => import("@/pages/FunnelsHubPage.vue") },
        { path: "funnels/:key", name: "funnel-detail", component: () => import("@/pages/FunnelDetailPage.vue") },
        { path: "traffic", name: "traffic", component: () => import("@/pages/TrafficPage.vue") },
        { path: "usage", name: "usage", component: () => import("@/pages/UsagePage.vue") },
        { path: "parents", name: "parents", component: () => import("@/pages/ParentsPage.vue") },
        { path: "creatures", name: "creatures", component: () => import("@/pages/CreaturesPage.vue") },
        { path: "payments", name: "payments", component: () => import("@/pages/PaymentsPage.vue") },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.initialized) await auth.initialize();
  if (to.meta.requiresStaff && !auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.guest && auth.isAuthenticated) return { name: "dashboard" };
});

export default router;
